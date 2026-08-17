"""
SEN2SRLite neural super-resolution for Sentinel-2 L2A GeoTIFFs.

Download-once model lifecycle, tiled ``predict_large`` inference (10 m → 2.5 m),
georeferenced GeoTIFF write, result cache, and optional 1 m display resample.

Import / load failures are retained as status errors — they must not crash the
host FastAPI app (callers catch via ``is_available()`` / ``status_payload()``).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------

_SERVICE_ROOT = Path(__file__).resolve().parent.parent
MODEL_ID = "SEN2SRLite"
MODEL_DIR = Path(
    os.environ.get("SEN2SR_MODEL_DIR", str(_SERVICE_ROOT / "models" / MODEL_ID))
).expanduser()
CACHE_DIR = Path(
    os.environ.get("SEN2SR_CACHE_DIR", str(_SERVICE_ROOT / "cache" / "sen2sr"))
).expanduser()
MODEL_MLM_URL = os.environ.get(
    "SEN2SR_MODEL_URL",
    "https://huggingface.co/tacofoundation/sen2sr/resolve/main/SEN2SRLite/main/mlm.json",
).strip()

# Full SEN2SRLite band stack (10 m + 20 m L2A), when present in the GeoTIFF.
DEFAULT_BANDS = [
    "B02",
    "B03",
    "B04",
    "B05",
    "B06",
    "B07",
    "B08",
    "B8A",
    "B11",
    "B12",
]

SR_FACTOR = 4  # 10 m → 2.5 m
PREDICT_OVERLAP = 32
DISPLAY_1M_LABEL = "AI Enhanced 1m Display"
# 2.5 m pixel → 1.0 m display pixel
DISPLAY_1M_SCALE = 2.5

_BAND_ALIASES: dict[str, str] = {
    "B2": "B02",
    "B02": "B02",
    "BLUE": "B02",
    "B3": "B03",
    "B03": "B03",
    "GREEN": "B03",
    "B4": "B04",
    "B04": "B04",
    "RED": "B04",
    "B5": "B05",
    "B05": "B05",
    "B6": "B06",
    "B06": "B06",
    "B7": "B07",
    "B07": "B07",
    "B8": "B08",
    "B08": "B08",
    "NIR": "B08",
    "B8A": "B8A",
    "B08A": "B8A",
    "B11": "B11",
    "SWIR1": "B11",
    "B12": "B12",
    "SWIR2": "B12",
}

_lock = threading.RLock()
_model: Any = None
_device: str = "cpu"
_available: bool = False
_error: str | None = None
_loaded: bool = False


def _log(msg: str) -> None:
    print(f"[SEN2SR] {msg}", flush=True)


def get_device() -> str:
    return _device


def get_error() -> str | None:
    return _error


def is_available() -> bool:
    return _available and _model is not None


def status_payload() -> dict[str, Any]:
    """Payload for GET /api/sentinel2/super-resolution/status."""
    out: dict[str, Any] = {
        "available": is_available(),
        "model": MODEL_ID,
        "input": "Sentinel-2 L2A",
        "native_resolution": "10m",
        "output_resolution": "2.5m",
        "device": _device,
    }
    if _error:
        out["error"] = _error
    return out


def _resolve_device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _ensure_model_downloaded() -> Path:
    """Download SEN2SRLite once if ``mlm.json`` is missing. Never called per tile."""
    mlm = MODEL_DIR / "mlm.json"
    if mlm.is_file():
        _log(f"model already present at {MODEL_DIR}")
        return MODEL_DIR

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    _log(f"downloading {MODEL_ID} from Hugging Face → {MODEL_DIR}")
    import mlstac

    mlstac.download(file=MODEL_MLM_URL, output_dir=str(MODEL_DIR))
    if not mlm.is_file():
        raise FileNotFoundError(
            f"mlstac.download finished but {mlm} is missing (url={MODEL_MLM_URL})"
        )
    _log(f"model downloaded to {MODEL_DIR}")
    return MODEL_DIR


def load_model() -> bool:
    """
    Download (if needed) and load SEN2SRLite once.

    Safe for FastAPI startup: failures set ``available=false`` and store the
    real error string; they do not raise to the caller.
    """
    global _model, _device, _available, _error, _loaded

    with _lock:
        if _loaded and _available and _model is not None:
            return True
        if _loaded and not _available:
            return False

        _device = _resolve_device()
        _error = None
        _available = False
        _model = None

        try:
            import mlstac
            import torch  # noqa: F401 — required by mlstac compiled_model

            model_dir = _ensure_model_downloaded()
            _log(f"loading compiled model on {_device}")
            compiled = mlstac.load(str(model_dir)).compiled_model(device=_device)
            try:
                compiled = compiled.to(_device)
            except Exception:
                pass
            _model = compiled
            _available = True
            _loaded = True
            _log(f"available=true device={_device} model={MODEL_ID}")
            return True
        except Exception as exc:
            _error = f"{type(exc).__name__}: {exc}"
            _available = False
            _loaded = True
            _model = None
            _log(f"load failed: {_error}")
            return False


def _normalize_band_name(raw: str) -> str | None:
    token = re.sub(r"[^A-Za-z0-9]+", "", str(raw).strip().upper())
    if not token:
        return None
    if token in _BAND_ALIASES:
        return _BAND_ALIASES[token]
    # e.g. BAND02 → B02
    m = re.fullmatch(r"BAND0*([0-9]+A?)", token)
    if m:
        return _normalize_band_name(f"B{m.group(1)}")
    m = re.search(r"B0*([0-9]+A?)\b", str(raw).upper())
    if m:
        return _normalize_band_name(f"B{m.group(1)}")
    return None


def _dataset_band_map(src: Any) -> dict[str, int]:
    """Map canonical band id → 1-based rasterio index from descriptions/tags."""
    found: dict[str, int] = {}
    for i in range(1, int(src.count) + 1):
        candidates = [
            src.descriptions[i - 1] if src.descriptions else None,
            src.tags(i).get("DESCRIPTION"),
            src.tags(i).get("name"),
            src.tags(i).get("BAND_NAME"),
        ]
        for c in candidates:
            if not c:
                continue
            name = _normalize_band_name(str(c))
            if name and name not in found:
                found[name] = i
                break
    return found


def _resolve_band_indexes(
    src: Any, bands: list[str] | None
) -> tuple[list[int], list[str]]:
    band_map = _dataset_band_map(src)
    requested = bands if bands else list(DEFAULT_BANDS)

    if band_map:
        names: list[str] = []
        indexes: list[int] = []
        missing: list[str] = []
        for b in requested:
            canon = _normalize_band_name(b) or b.upper()
            if canon in band_map:
                names.append(canon)
                indexes.append(band_map[canon])
            elif bands is not None:
                missing.append(canon)
            # When using defaults, skip missing bands silently.
        if bands is not None and missing:
            available = ", ".join(sorted(band_map)) or "(none)"
            raise ValueError(
                f"Requested bands not found in GeoTIFF: {missing}. Available: {available}"
            )
        if not indexes:
            raise ValueError(
                "None of the SEN2SR bands were found in the GeoTIFF band descriptions. "
                f"Expected one of {DEFAULT_BANDS}."
            )
        return indexes, names

    # No descriptions: assume standard L2A stack order for count==10, else 1..N.
    count = int(src.count)
    if bands:
        raise ValueError(
            "GeoTIFF has no band descriptions/tags; cannot select named bands. "
            "Write B02… descriptions or omit bands to use sequential indexes."
        )
    if count >= len(DEFAULT_BANDS):
        names = list(DEFAULT_BANDS)
        indexes = list(range(1, len(DEFAULT_BANDS) + 1))
        return indexes, names
    names = [f"B{i}" for i in range(1, count + 1)]
    indexes = list(range(1, count + 1))
    _log(f"no band descriptions; using sequential bands {names}")
    return indexes, names


def _aoi_geometries(aoi: dict | list | None) -> list[dict]:
    if aoi is None:
        return []
    if isinstance(aoi, list):
        return [g for g in aoi if isinstance(g, dict)]
    if not isinstance(aoi, dict):
        raise ValueError("aoi must be a GeoJSON object or geometry list")

    t = aoi.get("type")
    if t == "FeatureCollection":
        return [
            f["geometry"]
            for f in aoi.get("features") or []
            if isinstance(f, dict) and f.get("geometry")
        ]
    if t == "Feature":
        geom = aoi.get("geometry")
        return [geom] if isinstance(geom, dict) else []
    if t in {
        "Polygon",
        "MultiPolygon",
        "GeometryCollection",
        "Point",
        "MultiPoint",
        "LineString",
        "MultiLineString",
    }:
        return [aoi]
    raise ValueError(f"Unsupported GeoJSON type for aoi: {t!r}")


def _canonical_aoi_json(aoi: dict | list | None) -> str:
    if aoi is None:
        return ""
    return json.dumps(aoi, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _file_digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _cache_key(
    input_path: Path,
    aoi: dict | list | None,
    bands: list[str],
) -> str:
    payload = "|".join(
        [
            _file_digest(input_path),
            _canonical_aoi_json(aoi),
            ",".join(bands),
            MODEL_ID,
            f"x{SR_FACTOR}",
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def _read_prepared_array(
    input_path: Path,
    bands: list[str] | None,
    aoi: dict | list | None,
) -> tuple[Any, Any, Any, list[str], dict[str, Any]]:
    """Return (float32 CHW array, transform, CRS, band names, tags)."""
    import numpy as np
    import rasterio
    from rasterio.mask import mask as rio_mask
    from rasterio.warp import transform_geom

    with rasterio.open(input_path) as src:
        indexes, band_names = _resolve_band_indexes(src, bands)
        tags = dict(src.tags())
        crs = src.crs
        geoms = _aoi_geometries(aoi)

        if geoms:
            shapes: list[dict] = []
            for g in geoms:
                if crs is not None:
                    try:
                        shapes.append(transform_geom("EPSG:4326", crs, g))
                    except Exception:
                        # Already in raster CRS (or non-4326 source CRS mismatch).
                        shapes.append(g)
                else:
                    shapes.append(g)
            data, transform = rio_mask(
                src,
                shapes,
                crop=True,
                indexes=indexes,
                filled=True,
                nodata=0,
            )
        else:
            data = src.read(indexes)
            transform = src.transform

        if data.size == 0 or data.shape[-2] < 1 or data.shape[-1] < 1:
            raise ValueError("Empty raster after AOI clip / band selection.")

        arr = data.astype("float32", copy=False)
        finite_max = float(np.nanmax(arr)) if np.isfinite(arr).any() else 0.0
        if finite_max > 1.5:
            _log(f"normalizing DN-like reflectance /10000 (max={finite_max:.1f})")
            arr = arr / 10_000.0
        arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)

        meta = {
            "tags": tags,
            "count": len(band_names),
            "dtype": "float32",
            "nodata": None,
            "compress": "deflate",
            "tiled": True,
            "blockxsize": 256,
            "blockysize": 256,
        }
        return arr, transform, crs, band_names, meta


def _write_geotiff(
    path: Path,
    data: Any,
    *,
    transform: Any,
    crs: Any,
    band_names: list[str],
    tags: dict[str, str] | None = None,
    descriptions: list[str] | None = None,
) -> dict[str, Any]:
    import numpy as np
    import rasterio

    path.parent.mkdir(parents=True, exist_ok=True)
    if data.ndim != 3:
        raise ValueError(f"Expected CHW array, got shape {getattr(data, 'shape', None)}")

    count, height, width = (int(v) for v in data.shape)
    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": count,
        "dtype": "float32",
        "crs": crs,
        "transform": transform,
        "compress": "deflate",
        "tiled": True,
        "blockxsize": min(256, width),
        "blockysize": min(256, height),
    }

    with rasterio.open(path, "w", **profile) as dst:
        dst.write(np.asarray(data, dtype="float32"))
        for i, name in enumerate(band_names[:count], start=1):
            desc = (descriptions[i - 1] if descriptions and i - 1 < len(descriptions) else name)
            dst.set_band_description(i, desc)
        if tags:
            dst.update_tags(**{k: str(v) for k, v in tags.items()})

    bounds = rasterio.transform.array_bounds(height, width, transform)
    return {
        "path": str(path.resolve()),
        "crs": crs.to_string() if crs is not None else None,
        "bounds": [float(bounds[0]), float(bounds[1]), float(bounds[2]), float(bounds[3])],
        "width": width,
        "height": height,
    }


def _sr_transform(src_transform: Any):
    from rasterio.transform import Affine

    return src_transform * Affine.scale(1.0 / SR_FACTOR, 1.0 / SR_FACTOR)


def _run_predict_large(arr_chw: Any) -> Any:
    import numpy as np
    import sen2sr
    import torch

    if _model is None:
        raise RuntimeError(_error or "SEN2SRLite model is not loaded")

    device = _device
    X = torch.from_numpy(np.asarray(arr_chw, dtype="float32")).float().to(device)
    X = torch.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    _log(
        f"running predict_large shape={tuple(X.shape)} overlap={PREDICT_OVERLAP} device={device}"
    )
    with torch.inference_mode():
        super_x = sen2sr.predict_large(model=_model, X=X, overlap=PREDICT_OVERLAP)
    if hasattr(super_x, "detach"):
        out = super_x.detach().float().cpu().numpy()
    else:
        out = np.asarray(super_x, dtype="float32")
    if out.ndim == 4:
        out = out[0]
    return out


def _write_display_1m(src_25m: Path, dest: Path, band_names: list[str]) -> dict[str, Any]:
    """Resample neural 2.5 m product → 1 m display GeoTIFF (not native S2)."""
    import math

    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.transform import Affine

    with rasterio.open(src_25m) as src:
        height, width = int(src.height), int(src.width)
        new_h = max(1, int(math.ceil(height * DISPLAY_1M_SCALE)))
        new_w = max(1, int(math.ceil(width * DISPLAY_1M_SCALE)))
        data = src.read(
            out_shape=(src.count, new_h, new_w),
            resampling=Resampling.bilinear,
        )
        transform = src.transform * Affine.scale(width / new_w, height / new_h)
        crs = src.crs
        tags = dict(src.tags())
        names = list(band_names) or [
            (src.descriptions[i] or f"B{i + 1}") for i in range(src.count)
        ]

    tags.update(
        {
            "SEN2SR_PRODUCT": DISPLAY_1M_LABEL,
            "SEN2SR_MODEL": MODEL_ID,
            "SEN2SR_RESOLUTION": "1m",
            "SEN2SR_NOTE": "Display resample from neural 2.5m — not native Sentinel-2 1m",
            "TIFFTAG_IMAGEDESCRIPTION": DISPLAY_1M_LABEL,
        }
    )
    descriptions = [DISPLAY_1M_LABEL] * int(data.shape[0])
    meta = _write_geotiff(
        dest,
        np.asarray(data, dtype="float32"),
        transform=transform,
        crs=crs,
        band_names=names,
        tags=tags,
        descriptions=descriptions,
    )
    _log(f"wrote {DISPLAY_1M_LABEL} → {dest}")
    return meta


def super_resolve(
    input_path: str | Path,
    *,
    aoi: dict | list | None = None,
    bands: list[str] | None = None,
    output_path: str | Path | None = None,
    display_1m: bool = False,
) -> dict[str, Any]:
    """
    Run SEN2SRLite on a local Sentinel-2 L2A GeoTIFF.

    Returns:
      output_path, resolution, crs, bounds, cached, and optionally
      display_1m_path / display_label.
    """
    if not is_available():
        # One retry in case startup load was deferred / failed transiently.
        load_model()
    if not is_available():
        raise RuntimeError(_error or "SEN2SRLite is not available")

    src_path = Path(input_path).expanduser().resolve()
    if not src_path.is_file():
        raise FileNotFoundError(f"Input GeoTIFF not found: {src_path}")

    requested_bands = (
        [_normalize_band_name(b) or b.upper() for b in bands] if bands else None
    )

    with _lock:
        arr, src_transform, crs, band_names, _meta = _read_prepared_array(
            src_path, requested_bands, aoi
        )
        key = _cache_key(src_path, aoi, band_names)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

        out_25 = Path(output_path).expanduser() if output_path else CACHE_DIR / f"{key}_2.5m.tif"
        out_25 = out_25.resolve()
        out_1m = out_25.with_name(out_25.stem.replace("_2.5m", "") + "_1m_display.tif")
        if out_1m == out_25:
            out_1m = out_25.with_name(out_25.stem + "_1m_display.tif")

        cached = out_25.is_file()
        if cached:
            _log(f"cache hit key={key} path={out_25}")
            import rasterio

            with rasterio.open(out_25) as ds:
                bounds = [float(v) for v in ds.bounds]
                crs_str = ds.crs.to_string() if ds.crs else None
            result: dict[str, Any] = {
                "output_path": str(out_25),
                "resolution": "2.5m",
                "crs": crs_str,
                "bounds": bounds,
                "cached": True,
                "bands": band_names,
            }
        else:
            _log(
                f"infer input={src_path.name} bands={band_names} "
                f"shape={tuple(arr.shape)} aoi={'yes' if aoi else 'no'}"
            )
            sr = _run_predict_large(arr)
            transform = _sr_transform(src_transform)
            tags = {
                "SEN2SR_PRODUCT": "2.5m",
                "SEN2SR_MODEL": MODEL_ID,
                "SEN2SR_RESOLUTION": "2.5m",
                "SEN2SR_INPUT": str(src_path.name),
                "SEN2SR_BANDS": ",".join(band_names),
            }
            meta = _write_geotiff(
                out_25,
                sr,
                transform=transform,
                crs=crs,
                band_names=band_names,
                tags=tags,
            )
            _log(f"wrote 2.5m GeoTIFF → {out_25}")
            result = {
                "output_path": meta["path"],
                "resolution": "2.5m",
                "crs": meta["crs"],
                "bounds": meta["bounds"],
                "cached": False,
                "bands": band_names,
            }

        if display_1m:
            if out_1m.is_file() and cached:
                _log(f"cache hit display_1m path={out_1m}")
            else:
                _write_display_1m(out_25, out_1m, band_names)
            result["display_1m_path"] = str(out_1m.resolve())
            result["display_label"] = DISPLAY_1M_LABEL

        return result
