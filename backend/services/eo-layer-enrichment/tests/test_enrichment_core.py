"""Unit tests for indices, schema, and enrichment heuristics (no network)."""

from __future__ import annotations

import numpy as np
import pytest

from eo_enrichment.enrich import (
    classify_crop,
    crop_health,
    growth_stage,
    water_stress,
    enrich_feature_row,
)
from eo_enrichment.indices import ndvi, compute_index_stack
from eo_enrichment.schema import CORE_FIELDS
from eo_enrichment.vector_io import ensure_attribute_fields, detect_format
import geopandas as gpd
from shapely.geometry import Polygon
import xarray as xr


def test_detect_format():
    assert detect_format("a.kmz") == "kmz"
    assert detect_format("a.geojson") == "geojson"
    assert detect_format("a.json") == "geojson"


def test_ndvi_range():
    nir = np.array([0.8, 0.2])
    red = np.array([0.2, 0.2])
    v = ndvi(nir, red)
    assert v[0] > 0.5
    assert abs(v[1]) < 0.05


def test_index_stack_keys():
    y = np.linspace(25.1, 25.0, 4)
    x = np.linspace(55.1, 55.2, 4)
    def band(v):
        return xr.DataArray(
            np.full((4, 4), v, dtype=float),
            dims=("y", "x"),
            coords={"y": y, "x": x},
        )
    bands = {
        "B02": band(0.1),
        "B03": band(0.12),
        "B04": band(0.15),
        "B05": band(0.2),
        "B08": band(0.45),
        "B11": band(0.25),
    }
    stack = compute_index_stack(bands)
    for k in ("NDVI", "NDMI", "NDWI", "EVI", "SAVI", "NDRE", "MSAVI", "GCI", "OSAVI"):
        assert k in stack
        assert float(stack[k].mean()) == float(stack[k].mean())


def test_classify_and_health():
    crop, conf = classify_crop(0.7, 0.3, -0.1)
    assert crop in {"Alfalfa", "Rhodes Grass"}
    assert conf > 50
    assert crop_health(0.9, 0.5, 0.6) == "Excellent"
    assert growth_stage(0.25) == "Emergence"
    assert water_stress(0.05, -0.1) in {"High", "Extreme"}


def test_ensure_fields():
    gdf = gpd.GeoDataFrame(
        {"geometry": [Polygon([(55, 25), (55.01, 25), (55.01, 25.01), (55, 25)])]},
        crs="EPSG:4326",
    )
    out = ensure_attribute_fields(gdf)
    for col in CORE_FIELDS:
        assert col in out.columns


def test_enrich_feature_row():
    stats = {
        "NDVI": {"mean": 0.55, "min": 0.4, "max": 0.7, "count": 40},
        "NDMI": {"mean": 0.2},
        "NDWI": {"mean": -0.1},
        "EVI": {"mean": 0.4},
        "SAVI": {"mean": 0.45},
        "NDRE": {"mean": 0.35},
        "MSAVI": {"mean": 0.5},
        "GCI": {"mean": 1.2},
        "OSAVI": {"mean": 0.48},
    }
    row = enrich_feature_row(
        stats=stats,
        veg_pct=62.5,
        area_ha=12.3,
        scene={
            "scene_id": "S2A_TEST",
            "acquisition_date": "2026-07-01",
            "cloud_cover": 5.0,
            "satellite_name": "sentinel-2a",
            "source": "Microsoft Planetary Computer",
            "resolution": 20,
        },
        prev_ndvi=0.4,
    )
    assert row["Crop_Type"]
    assert row["NDVI"] == 0.55
    assert row["Scene_ID"] == "S2A_TEST"
    assert row["Change_Previous_Period"] in {"Expansion", "No Change", "Reduction"}
