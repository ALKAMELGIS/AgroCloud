"""Tests for full Remote Sensing Layer catalog parity."""

from __future__ import annotations

import numpy as np
import xarray as xr

from eo_enrichment.rs_catalog import COMPOSITE_EXPRS, CORE_INTERPRETATION, RS_MEAN_LAYER_IDS
from eo_enrichment.composites import compute_full_index_stack
from eo_enrichment.schema import CORE_FIELDS, INDEX_NAMES


def _band(v: float) -> xr.DataArray:
    y = np.linspace(25.1, 25.0, 4)
    x = np.linspace(55.1, 55.2, 4)
    return xr.DataArray(np.full((4, 4), v, dtype=float), dims=("y", "x"), coords={"y": y, "x": x})


def test_core_interpretation_in_catalog():
    for lid in CORE_INTERPRETATION:
        assert lid in RS_MEAN_LAYER_IDS
        assert lid in CORE_FIELDS
        assert lid in INDEX_NAMES


def test_composites_include_chas_cvhi_adi():
    for lid in ("CHAS", "CVHI", "ADI", "CHS", "SMI"):
        assert lid in COMPOSITE_EXPRS
        assert lid in RS_MEAN_LAYER_IDS


def test_full_stack_has_layer_select_indices():
    bands = {
        "B02": _band(0.1),
        "B03": _band(0.12),
        "B04": _band(0.15),
        "B05": _band(0.2),
        "B08": _band(0.45),
        "B11": _band(0.25),
    }
    stack = compute_full_index_stack(bands)
    for lid in ("NDVI", "NDMI", "NDWI", "SAVI", "ET", "LST", "CHAS", "CVHI", "ADI", "NDSI", "SSI"):
        assert lid in stack, lid
        assert np.isfinite(float(stack[lid].mean()))
