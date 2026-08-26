"""Raster zonal statistics via Rasterio."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from shapely.geometry import mapping, shape

try:
    import rasterio
    from rasterio.mask import mask
except ImportError:  # pragma: no cover
    rasterio = None
    mask = None

DATA_RASTER = Path(__file__).resolve().parents[1] / "data" / "raster"


def analyze_raster(raster_path: str, aoi: dict[str, Any]) -> dict[str, float | int]:
    if rasterio is None:
        raise RuntimeError("rasterio is not installed")
    path = Path(raster_path)
    if not path.is_absolute():
        path = DATA_RASTER / path
    if not path.exists():
        raise FileNotFoundError(f"Raster not found: {path}")

    geom = shape(aoi)
    with rasterio.open(path) as src:
        data, _ = mask(src, [mapping(geom)], crop=True)
        values = data[0]
        nodata = src.nodata
        if nodata is not None:
            values = values[values != nodata]
        values = values[np.isfinite(values)]
        if values.size == 0:
            return {"min": 0.0, "max": 0.0, "avg": 0.0, "pixelCount": 0}
        return {
            "min": float(np.min(values)),
            "max": float(np.max(values)),
            "avg": float(np.mean(values)),
            "pixelCount": int(values.size),
        }
