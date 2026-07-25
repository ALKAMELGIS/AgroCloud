"""Sentinel-2 spectral indices (safe divide)."""

from __future__ import annotations

import numpy as np
import xarray as xr


def _safe_div(a: xr.DataArray | np.ndarray, b: xr.DataArray | np.ndarray) -> xr.DataArray | np.ndarray:
    return a / (b + 1e-6)


def ndvi(nir, red):
    return _safe_div(nir - red, nir + red)


def ndmi(nir, swir):
    return _safe_div(nir - swir, nir + swir)


def ndwi(green, nir):
    return _safe_div(green - nir, green + nir)


def evi(nir, red, blue, G: float = 2.5, C1: float = 6.0, C2: float = 7.5, L: float = 1.0):
    return G * _safe_div(nir - red, nir + C1 * red - C2 * blue + L)


def savi(nir, red, L: float = 0.5):
    return _safe_div(nir - red, nir + red + L) * (1.0 + L)


def ndre(nir, red_edge):
    return _safe_div(nir - red_edge, nir + red_edge)


def msavi(nir, red):
    # Qi et al. MSAVI2
    return 0.5 * (2 * nir + 1 - np.sqrt((2 * nir + 1) ** 2 - 8 * (nir - red) + 1e-6))


def gci(nir, green):
    return _safe_div(nir, green) - 1.0


def osavi(nir, red, Y: float = 0.16):
    return _safe_div(nir - red, nir + red + Y)


def compute_index_stack(bands: dict[str, xr.DataArray]) -> dict[str, xr.DataArray]:
    """
    bands keys: B02,B03,B04,B05,B08,B11 (Sentinel-2 L2A asset names).
    Missing optional bands fall back gracefully.
    """
    b02 = bands.get("B02")
    b03 = bands["B03"]
    b04 = bands["B04"]
    b05 = bands.get("B05", b04)
    b08 = bands["B08"]
    b11 = bands.get("B11", b08)

    out = {
        "NDVI": ndvi(b08, b04),
        "NDMI": ndmi(b08, b11),
        "NDWI": ndwi(b03, b08),
        "SAVI": savi(b08, b04),
        "NDRE": ndre(b08, b05),
        "MSAVI": msavi(b08, b04),
        "GCI": gci(b08, b03),
        "OSAVI": osavi(b08, b04),
    }
    if b02 is not None:
        out["EVI"] = evi(b08, b04, b02)
    else:
        out["EVI"] = evi(b08, b04, b04 * 0.5)
    return out
