"""Geometry postprocess tests: fragment merge + gated rect-snap."""

from __future__ import annotations

import math

from shapely.geometry import Polygon, box

from field_geom_postprocess import (
    FTW_GEOM_RECT_MIN_AREA_M2,
    _maybe_rect_snap,
    _merge_touching_fragments,
    improve_field_geometries,
)


def _rect_m(
    x0: float,
    y0: float,
    w: float,
    h: float,
    *,
    mid_lat: float = 24.0,
    lon0: float = 55.0,
) -> Polygon:
    m_lat = 111_320.0
    m_lon = 111_320.0 * math.cos(math.radians(mid_lat))
    return box(
        lon0 + x0 / m_lon,
        mid_lat + y0 / m_lat,
        lon0 + (x0 + w) / m_lon,
        mid_lat + (y0 + h) / m_lat,
    )


def test_merge_touching_fragments_of_one_field():
    mid_lat = 24.0
    a = _rect_m(0, 0, 81, 100, mid_lat=mid_lat)
    b = _rect_m(80, 0, 80, 100, mid_lat=mid_lat)
    merged = _merge_touching_fragments([a, b], mid_lat, gap_m=15, contact_frac=0.22)
    assert len(merged) == 1


def test_gap_keeps_two_neighbours():
    mid_lat = 24.0
    # 20 m road gap — wider than merge gap of 15 m.
    a = _rect_m(0, 0, 80, 100, mid_lat=mid_lat)
    b = _rect_m(100, 0, 80, 100, mid_lat=mid_lat)
    merged = _merge_touching_fragments([a, b], mid_lat, gap_m=15, contact_frac=0.22)
    assert len(merged) == 2


def test_tiny_noisy_polygon_not_obb_snapped():
    """Noise under RECT_MIN_AREA must not become a neat OBB square."""
    mid_lat = 24.0
    m_lat = 111_320.0
    m_lon = 111_320.0 * math.cos(math.radians(mid_lat))
    lon0, lat0 = 55.0, mid_lat
    # Stair-step square ~20x20 m (~400 m²), well below 2000 m² gate.
    coords = []
    for i in range(5):
        coords.append((lon0 + (i * 4) / m_lon, lat0))
    for i in range(5):
        coords.append((lon0 + 20 / m_lon, lat0 + (i * 4) / m_lat))
    for i in range(5):
        coords.append((lon0 + (20 - i * 4) / m_lon, lat0 + 20 / m_lat))
    for i in range(5):
        coords.append((lon0, lat0 + (20 - i * 4) / m_lat))
    coords.append(coords[0])
    noisy = Polygon(coords)
    assert noisy.area > 0
    snapped = _maybe_rect_snap(noisy, mid_lat)
    assert snapped.equals(noisy)
    assert FTW_GEOM_RECT_MIN_AREA_M2 >= 2000


def test_improve_drops_pinhead_before_rect_snap():
    mid_lat = 24.0
    tiny = _rect_m(0, 0, 10, 10, mid_lat=mid_lat)  # ~100 m²
    out = improve_field_geometries([tiny], mid_lat=mid_lat, min_area_m2=1.0, rect_snap=True)
    assert out == []
