"""
Sentinel-2 L2A 12-band stack for Agricultural Field Delineation.

Uses Microsoft Planetary Computer STAC (signed) with Copernicus STAC fallback.
Bands are stacked in EMD channel order at 10 m, then EMD preprocessing is applied.

Single-day UI picks expand to a lookback window — L2A products lag real-time
by 1–3 days and S2 revisit is ~5 days, so "today" often has zero scenes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable

import numpy as np

from afd_emd import EMD_BAND_TO_S2, AfdEmd, apply_emd_preprocessing, load_emd

MPC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
CDSE_STAC = "https://stac.dataspace.copernicus.eu/v1"
# Element84 Earth Search (AWS Open Data) — same collection id as MPC.
EARTH_SEARCH_STAC = "https://earth-search.aws.element84.com/v1"

ProgressCb = Callable[[float, str], None] | None


@dataclass
class S2StackResult:
    """CHW float32 stack in EMD-preprocessed space + georeference for polygonization."""

    data: np.ndarray  # (12, H, W) float32
    bbox: list[float]  # west, south, east, north (EPSG:4326) — request AOI
    width: int
    height: int
    scene_id: str
    acquisition_date: str
    cloud_cover: float
    source: str
    resolution_m: float
    # GDAL-style affine (a, b, c, d, e, f) in `epsg` units: x=a*col+b*row+c
    transform: tuple[float, float, float, float, float, float] | None = None
    epsg: int | None = None


def _affine_from_dataarray(da: Any, resolution: float) -> tuple[tuple[float, float, float, float, float, float], int]:
    """Build pixel→map affine from stackstac coords (top-left convention)."""
    xs = np.asarray(getattr(da, "x").values, dtype=np.float64)
    ys = np.asarray(getattr(da, "y").values, dtype=np.float64)
    if xs.size < 1 or ys.size < 1:
        raise RuntimeError("stackstac DataArray missing x/y coordinates")
    dx = float(xs[1] - xs[0]) if xs.size > 1 else float(resolution)
    dy = float(ys[1] - ys[0]) if ys.size > 1 else -float(abs(resolution))
    # Prefer documented CRS; stackstac uses epsg=… kwarg.
    epsg = 3857
    try:
        crs = getattr(da, "rio", None)
        if crs is not None and getattr(crs, "crs", None) is not None:
            epsg = int(crs.crs.to_epsg() or epsg)
        elif hasattr(da, "attrs") and da.attrs.get("epsg"):
            epsg = int(da.attrs["epsg"])
        elif abs(float(xs[0])) <= 180 and abs(float(ys[0])) <= 90:
            epsg = 4326
    except Exception:  # noqa: BLE001
        pass
    transform = (dx, 0.0, float(xs[0]), 0.0, dy, float(ys[0]))
    return transform, epsg


def _affine_wgs84_bbox(bbox: list[float], width: int, height: int) -> tuple[float, float, float, float, float, float]:
    west, south, east, north = (float(v) for v in bbox)
    dx = (east - west) / max(width, 1)
    dy = (south - north) / max(height, 1)  # negative when north > south
    return (dx, 0.0, west, 0.0, dy, north)


def _progress(cb: ProgressCb, pct: float, stage: str) -> None:
    if cb:
        cb(pct, stage)


def _parse_iso_day(value: str | None) -> date | None:
    raw = str(value or "").strip()[:10]
    if not raw or len(raw) < 10:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _parse_date_window(
    scene_date: str | None,
    start_date: str | None,
    end_date: str | None,
    lookback_days: int = 60,
) -> tuple[str, date]:
    """
    Return (STAC datetime range, preferred target day).

    A single calendar day (common UI default = today) expands to
    [target - lookback, min(target + 3, today)] so L2A lag / revisit still hits.
    """
    today = datetime.now(timezone.utc).date()
    lookback_days = max(7, int(lookback_days))

    start = _parse_iso_day(start_date)
    end = _parse_iso_day(end_date)
    anchor = _parse_iso_day(scene_date)

    if start and end:
        if start > end:
            start, end = end, start
        target = end
        # Narrow / single-day windows are almost always empty for "today".
        span = (end - start).days
        if span < 7:
            target = end if end <= today else today
            start = target - timedelta(days=lookback_days)
            end = min(target + timedelta(days=3), today)
        else:
            end = min(end, today)
        return f"{start.isoformat()}/{end.isoformat()}", target

    if anchor:
        target = min(anchor, today)
        start = target - timedelta(days=lookback_days)
        end = min(target + timedelta(days=3), today)
        return f"{start.isoformat()}/{end.isoformat()}", target

    end = today
    start = end - timedelta(days=lookback_days)
    return f"{start.isoformat()}/{end.isoformat()}", end


def _item_day(item: Any) -> date:
    dt = getattr(item, "datetime", None)
    if dt is None:
        return date.min
    if isinstance(dt, datetime):
        return dt.astimezone(timezone.utc).date() if dt.tzinfo else dt.date()
    return date.min


def _pick_best_item(items: list[Any], target: date) -> Any:
    """Prefer closest acquisition to the requested day, then lower cloud cover."""

    def key(it: Any) -> tuple[int, float]:
        cloud = float(it.properties.get("eo:cloud_cover", 100) or 100)
        day = _item_day(it)
        dist = abs((day - target).days) if day != date.min else 9999
        return (dist, cloud)

    return sorted(items, key=key)[0]


def _open_catalog(url: str, sign: bool):
    import pystac_client

    if sign:
        import planetary_computer as pc

        return pystac_client.Client.open(url, modifier=pc.sign_inplace)
    return pystac_client.Client.open(url)


def _search_items(bbox: list[float], datetime_range: str, target: date, max_cloud: float = 40.0):
    custom = os.environ.get("AFD_STAC_URL", "").strip()
    catalogs: list[tuple[str, bool, str, list[str]]] = []
    if custom:
        catalogs.append((custom, "planetarycomputer" in custom.lower(), "Custom STAC", ["sentinel-2-l2a"]))
    catalogs.extend(
        [
            (MPC_STAC, True, "Microsoft Planetary Computer", ["sentinel-2-l2a"]),
            (EARTH_SEARCH_STAC, False, "Element84 Earth Search", ["sentinel-2-l2a", "sentinel-2-c1-l2a"]),
            (CDSE_STAC, False, "Copernicus STAC", ["sentinel-2-l2a", "sentinel2-l2a"]),
        ]
    )
    last_err: Exception | None = None
    empty_tried = 0
    for url, sign, label, collections in catalogs:
        for collection in collections:
            try:
                catalog = _open_catalog(url, sign)
                items: list[Any] = []
                for cloud in (max_cloud, 60.0, 80.0, 100.0):
                    kwargs: dict[str, Any] = {
                        "collections": [collection],
                        "bbox": bbox,
                        "datetime": datetime_range,
                        "max_items": 40,
                    }
                    if cloud < 100.0:
                        kwargs["query"] = {"eo:cloud_cover": {"lt": cloud}}
                    search = catalog.search(**kwargs)
                    items = list(search.items())
                    if items:
                        break
                if not items:
                    empty_tried += 1
                    continue
                return _pick_best_item(items, target), label
            except Exception as exc:  # noqa: BLE001
                last_err = exc
                continue
    detail = ""
    if last_err:
        detail = f" ({type(last_err).__name__}: {last_err})"
    elif empty_tried:
        detail = f" (searched {datetime_range}; try another scene date or a larger AOI)"
    raise RuntimeError(f"No Sentinel-2 L2A imagery for AOI.{detail}".strip())


def _stack_item(
    item: Any, bbox: list[float], assets: list[str], resolution: float
) -> tuple[np.ndarray, tuple[float, float, float, float, float, float], int]:
    """Return ((C,H,W) float32, affine, epsg)."""
    import stackstac

    signed = item
    try:
        import planetary_computer as pc

        signed = pc.sign(item)
    except Exception:  # noqa: BLE001
        pass

    da = stackstac.stack(
        [signed],
        assets=assets,
        bounds_latlon=tuple(bbox),
        epsg=4326,
        resolution=resolution,
        chunksize=1024,
        rescale=False,
        dtype="float64",
        fill_value=0.0,
    )
    da2 = da.squeeze("time", drop=True)
    arr = da2.compute().values.astype(np.float32)
    if arr.ndim != 3:
        raise RuntimeError(f"Unexpected stack shape {arr.shape}")
    transform, epsg = _affine_from_dataarray(da2, resolution)
    finite = arr[np.isfinite(arr)]
    if finite.size and float(np.nanmax(finite)) <= 2.0:
        arr = arr * 10000.0
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    return arr, transform, epsg


def fetch_sentinel2_l2a_stack(
    bbox: list[float],
    *,
    emd: AfdEmd | None = None,
    scene_date: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    max_cloud: float = 40.0,
    progress: ProgressCb = None,
) -> S2StackResult:
    if len(bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north]")
    west, south, east, north = (float(v) for v in bbox)
    if east <= west or north <= south:
        raise ValueError("Invalid bbox extent")

    emd = emd or load_emd()
    assets = list(EMD_BAND_TO_S2)
    if len(assets) != 12:
        raise RuntimeError("EMD band map must have 12 entries")

    _progress(progress, 0.05, "scene_selection")
    datetime_range, target = _parse_date_window(scene_date, start_date, end_date)
    item, source = _search_items([west, south, east, north], datetime_range, target, max_cloud=max_cloud)
    acq = _item_day(item)
    acq_iso = acq.isoformat() if acq != date.min else datetime.now(timezone.utc).date().isoformat()
    cloud = float(item.properties.get("eo:cloud_cover", 0) or 0)

    _progress(progress, 0.2, "download")
    resolution = float(emd.cell_size_m or 10.0)
    transform: tuple[float, float, float, float, float, float] | None = None
    epsg: int | None = None
    # Prefer Web Mercator meters for exact 10 m cells matching EMD MinCellSize.
    try:
        import planetary_computer as pc
        import stackstac

        signed = pc.sign(item)
        da = stackstac.stack(
            [signed],
            assets=assets,
            bounds_latlon=(west, south, east, north),
            epsg=3857,
            resolution=resolution,
            chunksize=1024,
            rescale=False,
            dtype="float64",
            fill_value=0.0,
        )
        da2 = da.squeeze("time", drop=True)
        arr = da2.compute().values.astype(np.float32)
        transform, epsg = _affine_from_dataarray(da2, resolution)
        epsg = 3857
    except Exception:
        arr, transform, epsg = _stack_item(
            item, [west, south, east, north], assets, resolution=resolution / 111_320.0
        )

    if arr.ndim != 3 or arr.shape[0] != 12:
        raise RuntimeError(f"Expected 12-band stack, got shape {arr.shape}")

    finite = arr[np.isfinite(arr)]
    if finite.size and float(np.nanmax(finite)) <= 2.0:
        arr = arr * 10000.0
    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)

    _progress(progress, 0.45, "preparing")
    prepared = apply_emd_preprocessing(arr, emd)
    _, h, w = prepared.shape
    if h < 8 or w < 8:
        raise RuntimeError("AOI too small after resampling — enlarge the study area.")

    if transform is None:
        transform = _affine_wgs84_bbox([west, south, east, north], w, h)
        epsg = 4326

    return S2StackResult(
        data=prepared,
        bbox=[west, south, east, north],
        width=int(w),
        height=int(h),
        scene_id=str(item.id),
        acquisition_date=acq_iso,
        cloud_cover=cloud,
        source=source,
        resolution_m=resolution,
        transform=transform,
        epsg=epsg,
    )
