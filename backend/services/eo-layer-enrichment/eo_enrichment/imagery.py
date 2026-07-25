"""Latest cloud-free Sentinel-2 L2A discovery via Microsoft Planetary Computer STAC."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

import numpy as np
import planetary_computer as pc
import pystac_client
import stackstac
import xarray as xr
from shapely.ops import unary_union

MPC_STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
CDSE_STAC = "https://stac.dataspace.copernicus.eu/v1"

ASSET_BANDS = ["B02", "B03", "B04", "B05", "B08", "B11", "SCL"]


@dataclass
class SceneMeta:
    scene_id: str
    acquisition_date: str
    cloud_cover: float
    satellite_name: str
    source: str
    item: Any


ProgressCb = Callable[[str, float], None] | None


def _progress(cb: ProgressCb, msg: str, pct: float) -> None:
    if cb:
        cb(msg, pct)


def _bbox_from_geoms(geoms) -> list[float]:
    union = unary_union([g for g in geoms if g is not None and not g.is_empty])
    minx, miny, maxx, maxy = union.bounds
    return [minx, miny, maxx, maxy]


def _open_catalog(url: str, sign: bool) -> pystac_client.Client:
    if sign:
        return pystac_client.Client.open(url, modifier=pc.sign_inplace)
    return pystac_client.Client.open(url)


def search_latest_s2(
    bbox: list[float],
    *,
    max_cloud: float = 20.0,
    lookback_days: int = 365,
    catalog_url: str | None = None,
    progress: ProgressCb = None,
) -> SceneMeta:
    """
    Search newest Sentinel-2 L2A scene with cloud cover < max_cloud.
    Priority: Planetary Computer → Copernicus Dataspace STAC.
    """
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=lookback_days)
    datetime_range = f"{start.date().isoformat()}/{end.date().isoformat()}"

    catalogs = [
        (catalog_url or MPC_STAC, True, "Microsoft Planetary Computer"),
        (CDSE_STAC, False, "Copernicus STAC"),
    ]

    last_err: Exception | None = None
    for url, sign, label in catalogs:
        try:
            _progress(progress, f"Searching {label}…", 5)
            catalog = _open_catalog(url, sign)
            search = catalog.search(
                collections=["sentinel-2-l2a"],
                bbox=bbox,
                datetime=datetime_range,
                query={"eo:cloud_cover": {"lt": max_cloud}},
                max_items=50,
            )
            items = list(search.items())
            if not items:
                # Relax cloud threshold gradually.
                for cloud in (30, 40, 60, 100):
                    search = catalog.search(
                        collections=["sentinel-2-l2a"],
                        bbox=bbox,
                        datetime=datetime_range,
                        query={"eo:cloud_cover": {"lt": cloud}},
                        max_items=50,
                    )
                    items = list(search.items())
                    if items:
                        break
            if not items:
                continue
            # Newest first, then lowest cloud.
            items.sort(
                key=lambda it: (
                    it.datetime or datetime.min.replace(tzinfo=timezone.utc),
                    -float(it.properties.get("eo:cloud_cover", 100)),
                ),
                reverse=True,
            )
            best = items[0]
            cloud = float(best.properties.get("eo:cloud_cover", 0))
            acq = (best.datetime or end).date().isoformat()
            return SceneMeta(
                scene_id=best.id,
                acquisition_date=acq,
                cloud_cover=cloud,
                satellite_name=str(best.properties.get("platform", "sentinel-2")),
                source=label,
                item=best,
            )
        except Exception as exc:  # noqa: BLE001 — try next provider
            last_err = exc
            continue

    raise RuntimeError(
        f"No Sentinel-2 L2A scenes found for bbox={bbox}. Last error: {last_err}"
    )


def load_scene_stack(
    item: Any,
    bbox: list[float],
    *,
    resolution: int = 20,
    progress: ProgressCb = None,
) -> xr.DataArray:
    """Load signed Sentinel-2 bands as a stackstac DataArray clipped to bbox."""
    _progress(progress, "Downloading Sentinel-2 bands…", 20)
    signed = pc.sign(item)
    assets = [a for a in ASSET_BANDS if a in signed.assets]
    da = stackstac.stack(
        [signed],
        assets=assets,
        resolution=resolution,
        bounds_latlon=bbox,
        resample="bilinear",
        chunksize=1024,
    )
    # stackstac returns (time, band, y, x) — squeeze time.
    if "time" in da.dims:
        da = da.isel(time=0)
    return da.compute()


def bands_as_dict(da: xr.DataArray) -> dict[str, xr.DataArray]:
    """Map band coordinate labels → DataArrays."""
    out: dict[str, xr.DataArray] = {}
    if "band" not in da.dims:
        raise ValueError("Expected stacked DataArray with a 'band' dimension.")
    for i, name in enumerate(da["band"].values):
        key = str(name)
        out[key] = da.isel(band=i)
    return out


def previous_scene(
    bbox: list[float],
    before_date: str,
    *,
    max_cloud: float = 20.0,
    lookback_days: int = 120,
) -> SceneMeta | None:
    """Find a prior scene for change / time-series comparison."""
    end = datetime.fromisoformat(before_date).replace(tzinfo=timezone.utc) - timedelta(days=1)
    start = end - timedelta(days=lookback_days)
    try:
        catalog = _open_catalog(MPC_STAC, True)
        search = catalog.search(
            collections=["sentinel-2-l2a"],
            bbox=bbox,
            datetime=f"{start.date().isoformat()}/{end.date().isoformat()}",
            query={"eo:cloud_cover": {"lt": max_cloud}},
            max_items=30,
        )
        items = list(search.items())
        if not items:
            return None
        items.sort(key=lambda it: it.datetime or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        best = items[0]
        return SceneMeta(
            scene_id=best.id,
            acquisition_date=(best.datetime or end).date().isoformat(),
            cloud_cover=float(best.properties.get("eo:cloud_cover", 0)),
            satellite_name=str(best.properties.get("platform", "sentinel-2")),
            source="Microsoft Planetary Computer",
            item=best,
        )
    except Exception:
        return None


def aoi_bbox_from_gdf(gdf) -> list[float]:
    return _bbox_from_geoms(list(gdf.geometry))
