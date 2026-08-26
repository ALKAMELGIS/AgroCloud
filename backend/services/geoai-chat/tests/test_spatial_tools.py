"""Unit tests for spatial_tools."""

from __future__ import annotations

from tools.spatial_tools import buffer_geometry, calculate_area, intersect, within

AOI_SQUARE = {
    "type": "Polygon",
    "coordinates": [[[0.0, 0.0], [0.0, 0.01], [0.01, 0.01], [0.01, 0.0], [0.0, 0.0]]],
}

INNER_SQUARE = {
    "type": "Polygon",
    "coordinates": [[[0.002, 0.002], [0.002, 0.008], [0.008, 0.008], [0.008, 0.002], [0.002, 0.002]]],
}


def test_calculate_area_positive():
    stats = calculate_area(AOI_SQUARE)
    assert stats["areaM2"] > 0
    assert stats["areaHa"] > 0


def test_within_true():
    result = within(INNER_SQUARE, AOI_SQUARE)
    assert result["within"] is True


def test_intersect_nonempty():
    fc = intersect(AOI_SQUARE, INNER_SQUARE)
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 1


def test_buffer_returns_feature_collection():
    fc = buffer_geometry(AOI_SQUARE, 100.0)
    assert fc["type"] == "FeatureCollection"
    assert len(fc["features"]) == 1
    assert fc["features"][0]["properties"]["bufferM"] == 100.0
