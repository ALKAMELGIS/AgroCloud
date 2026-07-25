"""Compute all AgroCloud Remote Sensing indices (core + composites + ET/LST)."""

from __future__ import annotations

import numpy as np
import xarray as xr

from .indices import evi, gci, msavi, ndmi, ndre, ndvi, ndwi, osavi, savi
from .rs_catalog import COMPOSITE_EXPRS


def _wrap(v, template: xr.DataArray) -> xr.DataArray:
    if isinstance(v, xr.DataArray):
        return v
    return xr.DataArray(np.asarray(v, dtype=float), coords=template.coords, dims=template.dims)


def estimate_et_mm_day(ndvi_a, ndmi_a, ndwi_a, season: float = 0.85):
    """Match frontend etIndex (ET_REF=10 mm/day)."""
    demand = np.clip(1.0 - (0.6 * ndmi_a + 0.4 * ndwi_a), 0.0, 1.0)
    kc = np.clip(0.15 + 1.25 * ndvi_a, 0.15, 1.25)
    return np.clip(demand * season * kc * 10.0, 0.0, 15.0)


def estimate_lst_celsius(ndvi_a, ndmi_a, season: float = 0.85):
    """Match frontend lstIndex.estimateLstCelsius."""
    base = 18.0 + 24.0 * season
    veg = np.clip(ndvi_a, -0.2, 1.0)
    dryness = np.clip(0.5 - 0.5 * np.clip(ndmi_a, -1.0, 1.0), 0.0, 1.0)
    return np.clip(base - 12.0 * veg + 8.0 * dryness, 5.0, 55.0)


def compute_full_index_stack(
    bands: dict[str, xr.DataArray],
    *,
    season: float = 0.85,
) -> dict[str, xr.DataArray]:
    """All optical/derived Layer-select indices from one Sentinel-2 L2A scene."""
    b02 = bands.get("B02")
    b03 = bands["B03"]
    b04 = bands["B04"]
    b05 = bands.get("B05", b04)
    b08 = bands["B08"]
    b11 = bands.get("B11", b08)

    ndvi_a = ndvi(b08, b04)
    ndmi_a = ndmi(b08, b11)
    ndwi_a = ndwi(b03, b08)
    savi_a = savi(b08, b04)
    ndre_a = ndre(b08, b05)
    evi_a = evi(b08, b04, b02 if b02 is not None else b04 * 0.5)
    msavi_a = msavi(b08, b04)
    gci_a = gci(b08, b03)
    osavi_a = osavi(b08, b04)
    ndsi_a = (b11 - b08) / (b11 + b08 + 1e-6)
    si_a = np.sqrt(np.maximum(0.0, b03 * b04))
    ssi_a = ndsi_a + si_a

    out: dict[str, xr.DataArray] = {
        "NDVI": _wrap(ndvi_a, b08),
        "NDMI": _wrap(ndmi_a, b08),
        "NDWI": _wrap(ndwi_a, b08),
        "SAVI": _wrap(savi_a, b08),
        "EVI": _wrap(evi_a, b08),
        "NDRE": _wrap(ndre_a, b08),
        "MSAVI": _wrap(msavi_a, b08),
        "GCI": _wrap(gci_a, b08),
        "OSAVI": _wrap(osavi_a, b08),
        "NDSI": _wrap(ndsi_a, b08),
        "SI": _wrap(si_a, b08),
        "SSI": _wrap(ssi_a, b08),
        "ET": _wrap(estimate_et_mm_day(ndvi_a, ndmi_a, ndwi_a, season), b08),
        "LST": _wrap(estimate_lst_celsius(ndvi_a, ndmi_a, season), b08),
    }

    env = {
        "ndvi": out["NDVI"],
        "ndmi": out["NDMI"],
        "ndwi": out["NDWI"],
        "savi": out["SAVI"],
        "evi": out["EVI"],
        "ndre": out["NDRE"],
        "ndsi": out["NDSI"],
        "si": out["SI"],
        "ssi": out["SSI"],
        "abs": np.abs,
    }
    for name, expr in COMPOSITE_EXPRS.items():
        try:
            out[name] = _wrap(eval(expr, {"__builtins__": {}}, env), b08)  # noqa: S307
        except Exception:
            continue
    return out


def compute_delta_stack(
    current: dict[str, xr.DataArray],
    previous: dict[str, xr.DataArray],
) -> dict[str, xr.DataArray]:
    """Δ layers + NCADI from previous scene."""
    from .rs_catalog import DELTA_PAIRS

    out: dict[str, xr.DataArray] = {}
    for delta_id, base_id in DELTA_PAIRS.items():
        if base_id in current and base_id in previous:
            out[delta_id] = current[base_id] - previous[base_id]
    if all(k in current and k in previous for k in ("NDVI", "NDMI")):
        out["NCADI"] = 0.7 * (current["NDVI"] - previous["NDVI"]) + 0.3 * (
            current["NDMI"] - previous["NDMI"]
        )
    return out
