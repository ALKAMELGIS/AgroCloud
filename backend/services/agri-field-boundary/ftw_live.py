"""
FTW live field-boundary inference on Sentinel-2 (MPC + odc.stac + ftw_tools).

Additive engine for ``source=ftw-live`` / ``sentinel2-live``:
  crop-calendar scene pick → signed MPC stack → baseline≥4 offset →
  ``ftw_tools`` inference + polygonize → FoW-compatible GeoJSON.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import ftw_cache
from fow_aoi import _clip_features, _feature_from_geom, _instance_color

ProgressCb = Callable[[float, str], None]

ENGINE = "ftw-live"

MPC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1"
S2_COLLECTION = "sentinel-2-l2a"
S2_BANDS = ["B04", "B03", "B02", "B08"]

FTW_LIVE_ENABLED = os.environ.get("FTW_LIVE_ENABLED", "1").strip() not in (
    "0",
    "false",
    "False",
    "",
)
FTW_LIVE_MODEL = os.environ.get(
    "FTW_LIVE_MODEL",
    "FTW_PRUE_EFNET_B5",
).strip() or "FTW_PRUE_EFNET_B5"
FTW_LIVE_MAX_SPAN_DEG = float(os.environ.get("FTW_LIVE_MAX_SPAN_DEG", "0.35"))
_FTW_LIVE_GPU_ENV = os.environ.get("FTW_LIVE_GPU", os.environ.get("FTW_INFER_GPU", "")).strip()
FTW_LIVE_GPU = int(_FTW_LIVE_GPU_ENV) if _FTW_LIVE_GPU_ENV else -1
FTW_LIVE_CLOUD_COVER_MAX = int(os.environ.get("FTW_LIVE_CLOUD_COVER_MAX", "20"))
FTW_LIVE_BUFFER_DAYS = int(os.environ.get("FTW_LIVE_BUFFER_DAYS", "14"))
# ftw_tools upsamples every patch by this factor before the model, so it costs
# f^2 compute — 1 keeps the native 10 m grid and is the fast setting.
FTW_LIVE_RESIZE_FACTOR = int(os.environ.get("FTW_LIVE_RESIZE_FACTOR", "1"))
# Pixel ceiling for one model pass. Beyond it the stack is downsampled (coarser
# than 10 m) instead of spending minutes on CPU: half the grid is a 4x shorter run.
FTW_LIVE_PIXEL_BUDGET = int(float(os.environ.get("FTW_LIVE_PIXEL_BUDGET_MPX", "6")) * 1_000_000)
FTW_LIVE_BATCH_SIZE = max(1, int(os.environ.get("FTW_LIVE_BATCH_SIZE", "4")))
# Each DataLoader worker is a fresh process with its own OpenBLAS thread arena;
# on CPU-only hosts more than one starves the box of memory and the workers die.
FTW_LIVE_NUM_WORKERS = max(
    1,
    int(os.environ.get("FTW_LIVE_NUM_WORKERS", "").strip() or (1 if FTW_LIVE_GPU < 0 else 2)),
)
FTW_LIVE_STAC_HOST = os.environ.get("FTW_LIVE_STAC_HOST", "mspc").strip() or "mspc"
# Polygonize Douglas-Peucker (ftw_tools units). Lower → more vertices; meter-aware
# cleanup happens in field_geom_postprocess after load.
FTW_LIVE_SIMPLIFY = float(os.environ.get("FTW_LIVE_SIMPLIFY", "2.5"))
# Drop tiny polygonize artifacts (slivers / triangle noise), square meters.
FTW_LIVE_MIN_KEEP_M2 = float(os.environ.get("FTW_LIVE_MIN_KEEP_M2", "25"))
# ftw_tools refuses rasters with min(H,W) < 128 ("Input image is too small").
FTW_LIVE_MIN_PATCH_PX = int(os.environ.get("FTW_LIVE_MIN_PATCH_PX", "128"))
# Expand tiny AOIs before S2 stack so 10 m pixels can reach the patch floor.
FTW_LIVE_MIN_BBOX_M = float(os.environ.get("FTW_LIVE_MIN_BBOX_M", "1400"))
# DataLoader workers are spawned processes that inherit this environment. Without
# a cap each reserves an OpenBLAS thread arena per core and the pass dies with
# "Memory allocation still failed". torch.set_num_threads still governs the main
# process intra-op pool, so throughput is unaffected.
_FTW_LIVE_BLAS_THREADS = os.environ.get("FTW_LIVE_BLAS_THREADS", "").strip() or "1"
for _blas_var in (
    "OMP_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "MKL_NUM_THREADS",
    "NUMEXPR_NUM_THREADS",
):
    os.environ.setdefault(_blas_var, _FTW_LIVE_BLAS_THREADS)


def _max_safe_year() -> int:
    """Crop-calendar scene pick rejects harvest dates in the future — never use the current year."""
    return max(2017, datetime.now(timezone.utc).year - 1)


def _default_year() -> int:
    raw = os.environ.get("FTW_LIVE_YEAR", "").strip()
    if raw:
        return max(2017, min(int(raw), _max_safe_year()))
    return _max_safe_year()


def _clamp_year(year: int | None) -> int:
    y = int(year) if year is not None else _default_year()
    return max(2017, min(y, _max_safe_year()))


def ftw_live_available() -> bool:
    """True when the engine is enabled and required packages are importable."""
    if not FTW_LIVE_ENABLED:
        return False
    try:
        import ftw_tools  # noqa: F401
        import odc.stac  # noqa: F401
        import planetary_computer  # noqa: F401
        import pystac_client  # noqa: F401

        return True
    except ImportError:
        return False


def _emit(progress: ProgressCb | None, pct: float, stage: str) -> None:
    if progress:
        progress(pct, stage)


def _validate_bbox(bbox: list[float]) -> tuple[float, float, float, float]:
    if len(bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north].")
    west, south, east, north = (float(v) for v in bbox)
    if east <= west or north <= south:
        raise ValueError("Invalid bbox.")
    span_x = east - west
    span_y = north - south
    if span_x > FTW_LIVE_MAX_SPAN_DEG or span_y > FTW_LIVE_MAX_SPAN_DEG:
        raise ValueError(
            f"AOI too large for FTW live inference — zoom in "
            f"(max ~{FTW_LIVE_MAX_SPAN_DEG}° span; got {span_x:.3f}°×{span_y:.3f}°)."
        )
    return west, south, east, north


def _item_id(href_or_id: str) -> str:
    text = (href_or_id or "").strip()
    if not text:
        raise ValueError("Empty STAC item identifier from scene_selection.")
    if "/" not in text:
        return text
    return text.rstrip("/").split("/")[-1]


def _processing_version(item: Any) -> float:
    raw = item.properties.get(
        "processing:version", item.properties.get("s2:processing_baseline", 0)
    )
    try:
        return float(raw)
    except (TypeError, ValueError):
        return 0.0


def _mpc_catalog():
    import planetary_computer as pc
    import pystac_client

    return pystac_client.Client.open(MPC_STAC_URL, modifier=pc.sign_inplace)


def _fetch_signed_item(catalog, item_id: str):
    collection = catalog.get_collection(S2_COLLECTION)
    item = collection.get_item(item_id)
    if item is None:
        raise RuntimeError(
            f"STAC item not found on MPC: collection={S2_COLLECTION} id={item_id}"
        )
    return item


def _iso_day(value: Any) -> str:
    text = str(value or "").strip()[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        raise ValueError(f"Expected a YYYY-MM-DD date, got {value!r}.")
    return text


def _shift_day(iso: str, days: int) -> str:
    return (datetime.strptime(iso, "%Y-%m-%d") + timedelta(days=days)).strftime("%Y-%m-%d")


def _item_datetime(item: Any) -> str:
    props = getattr(item, "properties", {}) or {}
    return str(props.get("datetime") or props.get("start_datetime") or "")


def _item_cloud(item: Any) -> float:
    props = getattr(item, "properties", {}) or {}
    try:
        return float(props.get("eo:cloud_cover", 100.0))
    except (TypeError, ValueError):
        return 100.0


def resolve_scene_window(
    date_from: str | None,
    date_to: str | None,
) -> tuple[str, str] | None:
    """
    Normalize a user-picked date window, or ``None`` to keep scene choice automatic.

    A whole calendar year is the panel's "All dates" default and means "let the
    FTW crop calendar pick the season", so it is not treated as a pinned window.
    Supplying only one endpoint pins that single day.
    """
    raw_from = str(date_from or "").strip()[:10]
    raw_to = str(date_to or "").strip()[:10]
    if not raw_from and not raw_to:
        return None
    try:
        start = _iso_day(raw_from or raw_to)
        end = _iso_day(raw_to or raw_from)
    except ValueError:
        return None
    if end < start:
        start, end = end, start
    if start[:4] == end[:4] and start[5:] == "01-01" and end[5:] == "12-31":
        return None
    return start, end


def select_scenes_in_window(
    bbox: tuple[float, float, float, float] | list[float],
    *,
    date_from: str,
    date_to: str,
    cloud_cover_max: int = FTW_LIVE_CLOUD_COVER_MAX,
) -> tuple[str, str]:
    """
    Pick the two Sentinel-2 scenes FTW needs from a user-chosen date window.

    FTW consumes an 8-band early/late pair, so the window is split in half and
    the least cloudy scene is taken from each side. A window too narrow to hold
    two acquisitions is widened by ``FTW_LIVE_BUFFER_DAYS`` before giving up —
    Sentinel-2 revisits every ~5 days, and any single day may be cloudy.
    """
    start = _iso_day(date_from)
    end = _iso_day(date_to)
    if end < start:
        start, end = end, start

    catalog = _mpc_catalog()
    west, south, east, north = (float(v) for v in bbox)
    widen = max(1, int(FTW_LIVE_BUFFER_DAYS))

    for attempt in range(4):
        pad = widen * attempt
        lo = _shift_day(start, -pad)
        hi = _shift_day(end, pad)
        search = catalog.search(
            collections=[S2_COLLECTION],
            bbox=[west, south, east, north],
            datetime=f"{lo}T00:00:00Z/{hi}T23:59:59Z",
            query={"eo:cloud_cover": {"lt": max(1, int(cloud_cover_max))}},
        )
        items = sorted(search.items(), key=_item_datetime)
        if len(items) < 2:
            continue

        mid = len(items) // 2
        early = min(items[:mid] or items[:1], key=_item_cloud)
        late = min(items[mid:] or items[-1:], key=_item_cloud)
        if early.id == late.id:
            early, late = items[0], items[-1]
        if early.id != late.id:
            return _item_id(str(early.id)), _item_id(str(late.id))

    raise RuntimeError(
        f"No Sentinel-2 pair under {cloud_cover_max}% cloud between {start} and {end} "
        "for this AOI — widen the date range or raise the cloud limit."
    )


def _apply_baseline_offset(arr, version: float):
    """Sentinel-2 processing baseline ≥4 stores reflectance +1000."""
    if version >= 4:
        return (arr.astype("int32") - 1000).clip(min=0).astype("uint16")
    return arr.astype("uint16")


def _expand_bbox_to_min_meters(
    bbox: tuple[float, float, float, float],
    min_m: float = FTW_LIVE_MIN_BBOX_M,
) -> tuple[float, float, float, float]:
    """Pad a tiny AOI so Sentinel-2 @10 m yields enough pixels for FTW patches."""
    import math

    west, south, east, north = bbox
    mid_lat = (south + north) / 2.0
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * max(0.2, math.cos(math.radians(mid_lat)))
    width_m = max(0.0, (east - west) * m_per_deg_lon)
    height_m = max(0.0, (north - south) * m_per_deg_lat)
    pad_lon = max(0.0, (min_m - width_m) / 2.0) / m_per_deg_lon
    pad_lat = max(0.0, (min_m - height_m) / 2.0) / m_per_deg_lat
    if pad_lon <= 0 and pad_lat <= 0:
        return bbox
    return (
        west - pad_lon,
        south - pad_lat,
        east + pad_lon,
        north + pad_lat,
    )


def _write_stacked_geotiff(stacked, out_path: Path) -> None:
    import rioxarray  # noqa: F401

    if "band" in stacked.dims:
        stacked = stacked.rename({"band": "bands"})
    elif "bands" not in stacked.dims and stacked.ndim == 3:
        stacked = stacked.rename({stacked.dims[0]: "bands"})
    stacked.rio.to_raster(
        str(out_path),
        driver="GTiff",
        compress="deflate",
        dtype="uint16",
        tiled=True,
        blockxsize=256,
        blockysize=256,
    )


def _geotiff_hw(path: Path) -> tuple[int, int]:
    import rasterio

    with rasterio.open(path) as src:
        return int(src.height), int(src.width)


def _ensure_geotiff_min_side(path: Path, min_side: int = FTW_LIVE_MIN_PATCH_PX) -> tuple[int, int]:
    """Upsample a too-small GeoTIFF in place so ftw_tools can pick a patch size."""
    import math

    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import Affine

    height, width = _geotiff_hw(path)
    side = min(height, width)
    if side >= min_side:
        return height, width

    scale = float(min_side) / float(max(side, 1))
    new_h = max(min_side, int(math.ceil(height * scale)))
    new_w = max(min_side, int(math.ceil(width * scale)))

    with rasterio.open(path) as src:
        data = src.read(
            out_shape=(src.count, new_h, new_w),
            resampling=Resampling.bilinear,
        )
        transform = src.transform * Affine.scale(width / new_w, height / new_h)
        profile = src.profile.copy()
        profile.update(
            height=new_h,
            width=new_w,
            transform=transform,
            compress="deflate",
            tiled=True,
            blockxsize=min(256, new_w),
            blockysize=min(256, new_h),
        )

    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data)
    return new_h, new_w


def _pick_patch_size(height: int, width: int) -> int:
    side = min(height, width)
    for step in (1024, 512, 256, 128):
        if step <= side:
            return step
    return max(16, side)


def _gpu_index() -> int:
    """Explicit env wins; otherwise use CUDA when the box actually has it."""
    if _FTW_LIVE_GPU_ENV:
        return FTW_LIVE_GPU
    try:
        import torch

        return 0 if torch.cuda.is_available() else -1
    except Exception:  # noqa: BLE001
        return -1


def prefetch_model_checkpoint(model_name: str | None = None) -> bool:
    """
    Pull the FTW checkpoint into the torch hub cache ahead of the first request.

    ftw_tools downloads it lazily inside ``run``, which otherwise charges the
    first user of the day a multi-minute download on top of their detection.
    """
    try:
        import torch
        from ftw_tools.inference.model_registry import MODEL_REGISTRY

        from ftw_infer import _resolve_infer_model

        model = _resolve_infer_model(model_name or FTW_LIVE_MODEL)
        entry = MODEL_REGISTRY.get(model)
        if entry is None:
            return False
        cache_dir = Path(torch.hub.get_dir()) / "checkpoints"
        cache_dir.mkdir(parents=True, exist_ok=True)
        dest = cache_dir / f"{model}.ckpt"
        if dest.is_file() and dest.stat().st_size > 0:
            return True
        torch.hub.download_url_to_file(entry.url, str(dest), progress=False)
        return dest.is_file()
    except Exception:  # noqa: BLE001
        return False


def _tune_cpu_threads() -> None:
    """Give the model pass every core but one, so the API loop stays responsive."""
    raw = os.environ.get("FTW_LIVE_THREADS", "").strip()
    try:
        import torch

        cores = os.cpu_count() or 1
        current = torch.get_num_threads()
        want = int(raw) if raw else max(current, cores - 1)
        if want >= 1 and want != current:
            torch.set_num_threads(want)
    except Exception:  # noqa: BLE001
        pass


def _pixel_budget(gpu: int) -> int:
    if FTW_LIVE_PIXEL_BUDGET <= 0:
        return 0
    return FTW_LIVE_PIXEL_BUDGET * (4 if gpu >= 0 else 1)


def _cap_geotiff_pixels(path: Path, budget: int, min_side: int = FTW_LIVE_MIN_PATCH_PX) -> int:
    """
    Downsample a stack that is too large for one model pass, in place.

    Inference cost scales with pixel count, so a wide AOI is bounded by trading
    ground resolution for runtime. Returns the divisor applied (1 = untouched).
    """
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import Affine

    height, width = _geotiff_hw(path)
    pixels = max(1, height * width)
    if budget <= 0 or pixels <= budget:
        return 1

    factor = 1
    while (
        pixels // ((factor + 1) ** 2) > budget
        and factor < 8
        and min(height, width) // (factor + 1) >= min_side
    ):
        factor += 1
    if factor <= 1:
        return 1

    new_h = max(min_side, height // factor)
    new_w = max(min_side, width // factor)
    with rasterio.open(path) as src:
        data = src.read(
            out_shape=(src.count, new_h, new_w),
            resampling=Resampling.average,
        )
        transform = src.transform * Affine.scale(width / new_w, height / new_h)
        profile = src.profile.copy()
        profile.update(
            height=new_h,
            width=new_w,
            transform=transform,
            compress="deflate",
            tiled=True,
            blockxsize=min(256, new_w),
            blockysize=min(256, new_h),
        )

    with rasterio.open(path, "w", **profile) as dst:
        dst.write(data)
    return factor


def _plan_load_resolution(bbox: tuple[float, float, float, float], budget: int) -> float:
    """
    Ground resolution to request from STAC, in metres.

    Loading at 10 m and averaging afterwards downloads pixels we then throw away,
    so an AOI over the budget is fetched straight from coarser overviews.
    """
    import math

    if budget <= 0:
        return 10.0
    west, south, east, north = bbox
    mid_lat = (south + north) / 2.0
    m_per_deg_lon = 111_320.0 * max(0.2, math.cos(math.radians(mid_lat)))
    width_px = max(1.0, (east - west) * m_per_deg_lon / 10.0)
    height_px = max(1.0, (north - south) * 111_320.0 / 10.0)
    pixels = width_px * height_px
    if pixels <= budget:
        return 10.0
    factor = math.sqrt(pixels / float(budget))
    # Keep both sides above the FTW patch floor at the coarser grid.
    max_factor = max(1.0, min(width_px, height_px) / float(FTW_LIVE_MIN_PATCH_PX))
    factor = min(factor, max_factor, 8.0)
    return 10.0 * max(1.0, round(factor, 2))


def _build_dual_window_stack(
    item_a,
    item_b,
    bbox: tuple[float, float, float, float],
    resolution_m: float = 10.0,
) -> Any:
    """Load B04/B03/B02/B08 per early/late window on a shared grid, then 8-band stack."""
    import odc.stac
    import xarray as xr

    west, south, east, north = bbox
    load_kwargs: dict[str, Any] = {}
    if resolution_m > 10.5:
        load_kwargs["resolution"] = float(resolution_m)
    ds = odc.stac.load(
        [item_a, item_b],
        bands=S2_BANDS,
        dtype="uint16",
        resampling="bilinear",
        bbox=(west, south, east, north),
        chunks={"x": "auto", "y": "auto"},
        **load_kwargs,
    )
    # (time, band, y, x) — time order follows [item_a, item_b]
    arr = ds.to_array(dim="band").transpose("time", "band", "y", "x").compute()
    if int(arr.sizes.get("time", 0)) < 2:
        raise RuntimeError(
            "odc.stac.load returned fewer than two time slices for early/late windows."
        )
    a = _apply_baseline_offset(arr.isel(time=0), _processing_version(item_a))
    b = _apply_baseline_offset(arr.isel(time=1), _processing_version(item_b))
    return xr.concat([a, b], dim="band")

def _load_geoms_from_vector(path: Path) -> list[Any]:
    from shapely.geometry import shape
    from shapely.validation import make_valid

    suffix = path.suffix.lower()
    if suffix in (".geojson", ".json", ".ndjson"):
        raw = json.loads(path.read_text(encoding="utf-8"))
        feats = raw.get("features") if isinstance(raw, dict) else None
        if feats is None and isinstance(raw, dict) and raw.get("type") in (
            "Polygon",
            "MultiPolygon",
        ):
            feats = [{"geometry": raw}]
        if not isinstance(feats, list):
            geoms: list[Any] = []
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                g = obj.get("geometry") if isinstance(obj, dict) else None
                if g:
                    try:
                        geoms.append(make_valid(shape(g)))
                    except Exception:  # noqa: BLE001
                        continue
            return geoms
        geoms = []
        for f in feats:
            if not isinstance(f, dict) or not f.get("geometry"):
                continue
            try:
                geoms.append(make_valid(shape(f["geometry"])))
            except Exception:  # noqa: BLE001
                continue
        return geoms

    import geopandas as gpd

    gdf = gpd.read_file(path)
    if gdf.crs is not None and str(gdf.crs).upper() not in (
        "EPSG:4326",
        "WGS84",
        "OGC:CRS84",
    ):
        gdf = gdf.to_crs(4326)
    geoms = []
    for g in gdf.geometry:
        if g is None or g.is_empty:
            continue
        try:
            geoms.append(make_valid(g))
        except Exception:  # noqa: BLE001
            continue
    return geoms


def _normalize_features(
    geoms: list[Any],
    *,
    mid_lat: float,
    aoi_geom,
    min_area_m2: float,
    model_name: str,
) -> list[dict]:
    import math

    from field_geom_postprocess import improve_field_geometries

    # Morph open + neighbour separation + meter simplify + rect snap when fit.
    geoms = improve_field_geometries(
        geoms,
        mid_lat=mid_lat,
        min_area_m2=min_area_m2,
    )

    features: list[dict] = []
    min_keep = max(float(FTW_LIVE_MIN_KEEP_M2), float(min_area_m2) * 0.22)
    for i, g in enumerate(geoms, start=1):
        # Near-zero simplify_frac → edges already cleaned upstream; only fix topology.
        feat = _feature_from_geom(g, i, ENGINE, mid_lat, simplify_frac=0.0001)
        if not feat:
            continue
        props = dict(feat.get("properties") or {})
        area = float(props.get("area_m2") or 0)
        peri = float(props.get("perimeter_m") or 0)
        if area < min_keep:
            continue
        # Drop needle/triangle slivers (high perimeter for tiny area).
        if area > 0 and peri > 0:
            compactness = (4.0 * math.pi * area) / max(peri * peri, 1e-6)
            if compactness < 0.04 and area < max(min_keep * 4.0, 200.0):
                continue
        props["detection_engine"] = ENGINE
        props["source_image"] = "FTW live (Sentinel-2)"
        props["model"] = model_name
        props["geom_postprocess"] = "field_geom_v1"
        feat["properties"] = props
        features.append(feat)

    features = _clip_features(features, aoi_geom)
    for i, f in enumerate(features, start=1):
        props = dict(f.get("properties") or {})
        props["field_id"] = f"FTW-{i:05d}"
        props["fill_color"] = _instance_color(i)
        props["stroke_color"] = "#ffffff"
        props["detection_engine"] = ENGINE
        props["source_image"] = "FTW live (Sentinel-2)"
        props["model"] = model_name
        f["id"] = props["field_id"]
        f["properties"] = props
    return features


def run_ftw_live(
    bbox: list[float],
    year: int | None = None,
    model_name: str | None = None,
    min_area_m2: float = 50.0,
    progress: ProgressCb | None = None,
    aoi_geom=None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict:
    """
    Run FTW live inference for ``bbox`` = [west, south, east, north].

    ``date_from`` / ``date_to`` (YYYY-MM-DD) pin the imagery to a window the user
    picked; without them scenes come from the FTW crop calendar for ``year``.

    Returns the same result dict shape as ``query_fow_fields`` / ``/detect``.
    """
    west, south, east, north = _validate_bbox(bbox)
    user_bbox = (west, south, east, north)
    # Tiny AOIs under-fill the 128px FTW patch floor at 10 m — pad stack, clip later.
    stack_bbox = _expand_bbox_to_min_meters(user_bbox)
    mid_lat = (south + north) / 2.0
    year_v = _clamp_year(year)
    # Resolve aliases / registry keys (legacy FTW_3_Class_* → FTW_v2_* / package default).
    from ftw_infer import _resolve_infer_model

    model = _resolve_infer_model(model_name or FTW_LIVE_MODEL)

    if not FTW_LIVE_ENABLED:
        raise RuntimeError(
            "FTW live inference is disabled (set FTW_LIVE_ENABLED=1 to enable)."
        )
    if not ftw_live_available():
        raise RuntimeError(
            "ftw-live dependencies unavailable — needs Python 3.12+ with ftw-tools "
            "(torchgeo>=0.9), plus pystac-client/planetary-computer/odc-stac/xarray."
        )

    window = resolve_scene_window(date_from, date_to)

    _emit(progress, 0.05, "preparing")
    workdir = Path(tempfile.mkdtemp(prefix="ftw-live-"))
    poly_out = workdir / "polygons.geojson"
    bbox_key = [round(v, 5) for v in stack_bbox]
    cache_hits = {"scenes": False, "stack": False, "prediction": False}

    try:
        _emit(progress, 0.15, "scene_selection")
        scenes_key = ftw_cache.cache_key(
            "scenes", bbox_key, year_v, FTW_LIVE_STAC_HOST, FTW_LIVE_CLOUD_COVER_MAX,
            FTW_LIVE_BUFFER_DAYS, window or "crop-calendar",
        )
        scenes_path = ftw_cache.entry_path("scenes", scenes_key, ".json")
        cached_scenes = ftw_cache.read_json(scenes_path)
        if isinstance(cached_scenes, dict) and cached_scenes.get("a") and cached_scenes.get("b"):
            id_a = str(cached_scenes["a"])
            id_b = str(cached_scenes["b"])
            cache_hits["scenes"] = True
        elif window:
            id_a, id_b = select_scenes_in_window(
                stack_bbox,
                date_from=window[0],
                date_to=window[1],
                cloud_cover_max=FTW_LIVE_CLOUD_COVER_MAX,
            )
            ftw_cache.write_json(scenes_path, {"a": id_a, "b": id_b})
        else:
            from ftw_tools.download.download_img import scene_selection

            win_a, win_b = scene_selection(
                bbox=list(stack_bbox),
                year=year_v,
                stac_host=FTW_LIVE_STAC_HOST,
                cloud_cover_max=FTW_LIVE_CLOUD_COVER_MAX,
                buffer_days=FTW_LIVE_BUFFER_DAYS,
            )
            id_a = _item_id(str(win_a))
            id_b = _item_id(str(win_b))
            ftw_cache.write_json(scenes_path, {"a": id_a, "b": id_b})

        _emit(progress, 0.3, "download")
        gpu = _gpu_index()
        budget = _pixel_budget(gpu)
        stack_downscale = 1
        stack_key = ftw_cache.cache_key(
            "stack", bbox_key, id_a, id_b, S2_BANDS, FTW_LIVE_MIN_PATCH_PX, budget
        )
        cached_stack = ftw_cache.entry_path("stack", stack_key, ".tif")
        cached_stack_meta = ftw_cache.entry_path("stack", stack_key, ".json")
        if ftw_cache.is_fresh(cached_stack):
            stacked_tif = cached_stack  # type: ignore[assignment]
            ftw_cache.touch(stacked_tif)
            height, width = _geotiff_hw(stacked_tif)
            meta = ftw_cache.read_json(cached_stack_meta)
            if isinstance(meta, dict):
                stack_downscale = int(meta.get("downscale") or 1)
            cache_hits["stack"] = True
        else:
            stacked_tif = workdir / "inference_data.tif"
            catalog = _mpc_catalog()
            item_a = _fetch_signed_item(catalog, id_a)
            item_b = _fetch_signed_item(catalog, id_b)

            stacked = _build_dual_window_stack(
                item_a, item_b, stack_bbox, _plan_load_resolution(stack_bbox, budget)
            )
            _write_stacked_geotiff(stacked, stacked_tif)
            if not stacked_tif.is_file() or stacked_tif.stat().st_size <= 0:
                raise RuntimeError("Failed to write FTW live stacked GeoTIFF.")

            _ensure_geotiff_min_side(stacked_tif, FTW_LIVE_MIN_PATCH_PX)
            stack_downscale = _cap_geotiff_pixels(stacked_tif, budget, FTW_LIVE_MIN_PATCH_PX)
            height, width = _geotiff_hw(stacked_tif)
            if cached_stack is not None:
                try:
                    shutil.copy2(stacked_tif, cached_stack)
                    stacked_tif = cached_stack
                    ftw_cache.write_json(
                        cached_stack_meta,
                        {"h": height, "w": width, "downscale": stack_downscale},
                    )
                except Exception:  # noqa: BLE001
                    pass

        patch_size = _pick_patch_size(height, width)
        resize_factor = max(1, FTW_LIVE_RESIZE_FACTOR)

        _emit(progress, 0.55, "run")
        pred_key = ftw_cache.cache_key(
            "pred", stack_key, model, resize_factor, patch_size, gpu >= 0
        )
        cached_pred = ftw_cache.entry_path("pred", pred_key, ".tif")
        if ftw_cache.is_fresh(cached_pred):
            pred_tif = cached_pred  # type: ignore[assignment]
            ftw_cache.touch(pred_tif)
            cache_hits["prediction"] = True
        else:
            pred_tif = workdir / "inference_output.tif"
            from ftw_tools.inference.inference import run as ftw_run

            if gpu < 0:
                _tune_cpu_threads()

            def _pass(batch_size: int, num_workers: int) -> None:
                ftw_run(
                    input=str(stacked_tif),
                    model=model,
                    out=str(pred_tif),
                    resize_factor=resize_factor,
                    gpu=gpu,
                    patch_size=patch_size,
                    batch_size=batch_size,
                    num_workers=num_workers,
                    padding=None,
                    overwrite=True,
                    mps_mode=False,
                    save_scores=False,
                )

            try:
                _pass(FTW_LIVE_BATCH_SIZE, FTW_LIVE_NUM_WORKERS)
            except Exception as exc:  # noqa: BLE001
                from ftw_infer import _is_worker_crash

                if not _is_worker_crash(str(exc)) or (
                    FTW_LIVE_BATCH_SIZE,
                    FTW_LIVE_NUM_WORKERS,
                ) == (1, 1):
                    raise
                _emit(progress, 0.55, "retrying with lower memory settings")
                _pass(1, 1)
            if not pred_tif.is_file():
                raise RuntimeError("FTW live inference produced no raster output.")
            if cached_pred is not None:
                try:
                    shutil.copy2(pred_tif, cached_pred)
                    pred_tif = cached_pred
                    ftw_cache.prune()
                except Exception:  # noqa: BLE001
                    pass

        _emit(progress, 0.8, "polygonize")
        from ftw_tools.postprocess.polygonize import polygonize as ftw_polygonize

        ftw_polygonize(
            input=str(pred_tif),
            out=str(poly_out),
            simplify=FTW_LIVE_SIMPLIFY,
            min_size=max(0.0, float(min_area_m2)),
            overwrite=True,
        )
        if not poly_out.is_file():
            # Fallback parquet path if geojson extension was rewritten
            parquet = workdir / "polygons.parquet"
            if parquet.is_file():
                poly_out = parquet
            else:
                raise RuntimeError("FTW live polygonize produced no vector output.")

        _emit(progress, 0.9, "normalize")
        geoms = _load_geoms_from_vector(poly_out)
        features = _normalize_features(
            geoms,
            mid_lat=mid_lat,
            aoi_geom=aoi_geom,
            min_area_m2=min_area_m2,
            model_name=model,
        )

        _emit(progress, 1.0, "done")
        return {
            "geojson": {"type": "FeatureCollection", "features": features},
            "count": len(features),
            "stats": {"field": len(features)},
            "score": 0.9 if features else 0.0,
            "width": 0,
            "height": 0,
            "engine": ENGINE,
            "device": "cpu" if gpu < 0 else f"cuda:{gpu}",
            "source": ENGINE,
            "model": model,
            "year": year_v,
            "scenes": {"win_a": id_a, "win_b": id_b},
            "scene_window": {"from": window[0], "to": window[1]} if window else None,
            "aoi_applied": aoi_geom is not None,
            "resize_factor": resize_factor,
            "stack_downscale": stack_downscale,
            "cache": cache_hits,
        }
    finally:
        try:
            shutil.rmtree(workdir, ignore_errors=True)
        except Exception:  # noqa: BLE001
            pass
