"""Per-polygon zonal statistics over index rasters."""

from __future__ import annotations

from typing import Any

import numpy as np
import xarray as xr
from rasterio.transform import from_bounds
from rasterstats import zonal_stats


def _dataarray_to_affine_array(da: xr.DataArray) -> tuple[np.ndarray, Any]:
    """Convert a 2D DataArray (y, x) with geospatial coords to numpy + affine."""
    arr = np.asarray(da.values, dtype=np.float64)
    if hasattr(da, "rio") and getattr(da, "rio", None) is not None:
        try:
            if da.rio.crs is not None:
                return arr, da.rio.transform()
        except Exception:
            pass

    if "x" in da.coords and "y" in da.coords:
        xs = np.asarray(da["x"].values)
        ys = np.asarray(da["y"].values)
        west, east = float(np.nanmin(xs)), float(np.nanmax(xs))
        south, north = float(np.nanmin(ys)), float(np.nanmax(ys))
        h, w = arr.shape[-2], arr.shape[-1]
        if arr.ndim > 2:
            arr = arr.reshape(h, w)
        transform = from_bounds(west, south, east, north, w, h)
        return arr, transform

    raise ValueError("Index DataArray is missing geospatial coordinates.")


def zonal_index_stats(geoms, index_da: xr.DataArray) -> list[dict[str, float | None]]:
    """Compute mean/median/max/min/std/count for each geometry (EPSG:4326)."""
    arr, transform = _dataarray_to_affine_array(index_da)
    stats = zonal_stats(
        list(geoms),
        arr,
        affine=transform,
        stats=["mean", "median", "max", "min", "std", "count"],
        nodata=np.nan,
        all_touched=True,
    )
    out: list[dict[str, float | None]] = []
    for s in stats:
        out.append(
            {
                "mean": _f(s.get("mean")),
                "median": _f(s.get("median")),
                "max": _f(s.get("max")),
                "min": _f(s.get("min")),
                "std": _f(s.get("std")),
                "count": float(s.get("count") or 0),
            }
        )
    return out


def vegetation_cover_percent(
    ndvi_da: xr.DataArray,
    geom,
    threshold: float = 0.3,
) -> float | None:
    """Share of valid pixels with NDVI >= threshold inside polygon."""

    def veg_count(x):
        data = np.ma.compressed(x)
        if data.size == 0:
            return 0
        return int(np.sum(np.asarray(data, dtype=float) >= threshold))

    arr, transform = _dataarray_to_affine_array(ndvi_da)
    stats = zonal_stats(
        [geom],
        arr,
        affine=transform,
        stats=["count"],
        add_stats={"veg": veg_count},
        nodata=np.nan,
        all_touched=True,
    )
    if not stats:
        return None
    s0 = stats[0]
    count = float(s0.get("count") or 0)
    veg = float(s0.get("veg") or 0)
    if count <= 0:
        return None
    return round(100.0 * veg / count, 2)


def _f(v) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if np.isnan(f):
        return None
    return f
