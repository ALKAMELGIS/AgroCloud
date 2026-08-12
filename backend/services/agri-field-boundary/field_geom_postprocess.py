"""
Post-polygonize geometry cleaning for FTW field boundaries.

Goals (phase 1):
  - reduce stair-step edges (meter-aware simplify)
  - separate adjacent fields (controlled erosion / re-expand)
  - light morphological opening without merging neighbours
  - keep real small fields; drop only needle/sliver artifacts
  - optional oriented-rectangle snap when fill ratio is high
"""

from __future__ import annotations

import math
import os
from typing import Any

# Soft defaults — override via env without code changes.
# Tuned for smoother, farm-aligned parcel edges (less stair-step raster look).
FTW_GEOM_SIMPLIFY_M = float(os.environ.get("FTW_GEOM_SIMPLIFY_M", "2.5"))
FTW_GEOM_OPEN_M = float(os.environ.get("FTW_GEOM_OPEN_M", "1.0"))
# Keep parcels flush (cadastral mosaic) — large sep left visible gaps between fields.
FTW_GEOM_SEP_M = float(os.environ.get("FTW_GEOM_SEP_M", "0.35"))
FTW_GEOM_SEP_EXPAND_FRAC = float(os.environ.get("FTW_GEOM_SEP_EXPAND_FRAC", "0.95"))
FTW_GEOM_RECT_FILL_MIN = float(os.environ.get("FTW_GEOM_RECT_FILL_MIN", "0.68"))
FTW_GEOM_RECT_MAX_INFLATION = float(os.environ.get("FTW_GEOM_RECT_MAX_INFLATION", "1.4"))
# Polsby-Popper is 1.0 for a circle and at most pi/4 ~= 0.785 for any rectangle,
# so shapes above this guard are centre pivots / round parcels — never rect-snap them.
FTW_GEOM_ROUND_GUARD = float(os.environ.get("FTW_GEOM_ROUND_GUARD", "0.82"))
# Jitter-proof pivot test: overlap with the fitted equal-area circle.
FTW_GEOM_CIRCLE_IOU_MIN = float(os.environ.get("FTW_GEOM_CIRCLE_IOU_MIN", "0.9"))
# Pivots fused to a strip: accept when the circle beats the rectangle by this margin.
FTW_GEOM_CIRCLE_IOU_SOFT = float(os.environ.get("FTW_GEOM_CIRCLE_IOU_SOFT", "0.65"))
FTW_GEOM_CIRCLE_WIN_MARGIN = float(os.environ.get("FTW_GEOM_CIRCLE_WIN_MARGIN", "0.02"))
# Last-resort pivot test: a disc fills pi/4 ~= 0.785 of a *square* rectangle while a
# cadastral square fills ~1.0 of its own, so this band survives the raster stairs,
# centre holes and clipped edges that push compactness and circle IoU below their gates.
FTW_GEOM_DISC_FILL_MIN = float(os.environ.get("FTW_GEOM_DISC_FILL_MIN", "0.68"))
FTW_GEOM_DISC_FILL_MAX = float(os.environ.get("FTW_GEOM_DISC_FILL_MAX", "0.88"))
FTW_GEOM_DISC_SQUARENESS_MIN = float(os.environ.get("FTW_GEOM_DISC_SQUARENESS_MIN", "0.86"))
FTW_GEOM_SMOOTH_M = float(os.environ.get("FTW_GEOM_SMOOTH_M", "1.8"))
FTW_GEOM_SLIVER_COMPACTNESS = float(os.environ.get("FTW_GEOM_SLIVER_COMPACTNESS", "0.045"))
# Absolute floor for true fields; slivers use compactness+area combo below.
FTW_GEOM_MIN_FIELD_M2 = float(os.environ.get("FTW_GEOM_MIN_FIELD_M2", "25"))


def _deg_per_m(mid_lat: float) -> float:
    # Approximate metres→degrees at mid latitude (lon and lat averaged).
    lat_m = 111_320.0
    lon_m = max(111_320.0 * math.cos(math.radians(mid_lat)), 1.0)
    return 1.0 / ((lat_m + lon_m) * 0.5)


def _as_polygon_list(geom: Any) -> list[Any]:
    from shapely.geometry import MultiPolygon, Polygon

    if geom is None or geom.is_empty:
        return []
    g = geom
    if not g.is_valid:
        from shapely.validation import make_valid

        g = make_valid(g)
    if isinstance(g, Polygon):
        return [g] if not g.is_empty else []
    if isinstance(g, MultiPolygon):
        return [p for p in g.geoms if p is not None and not p.is_empty]
    # GeometryCollection / others
    out: list[Any] = []
    try:
        for part in getattr(g, "geoms", []):
            out.extend(_as_polygon_list(part))
    except Exception:  # noqa: BLE001
        pass
    return out


def _area_m2(geom: Any, mid_lat: float) -> float:
    # Local equirectangular approx (matches fow helpers closely enough for filters).
    m_per_deg = 1.0 / _deg_per_m(mid_lat)
    return float(geom.area) * (m_per_deg**2)


def _peri_m(geom: Any, mid_lat: float) -> float:
    m_per_deg = 1.0 / _deg_per_m(mid_lat)
    return float(geom.length) * m_per_deg


def _compactness(area_m2: float, peri_m: float) -> float:
    if area_m2 <= 0 or peri_m <= 0:
        return 0.0
    return (4.0 * math.pi * area_m2) / max(peri_m * peri_m, 1e-9)


def _is_sliver(geom: Any, mid_lat: float, min_keep_m2: float) -> bool:
    area = _area_m2(geom, mid_lat)
    peri = _peri_m(geom, mid_lat)
    if area < FTW_GEOM_MIN_FIELD_M2:
        return True
    c = _compactness(area, peri)
    # Only drop poor-compactness shapes when also small — preserves real small parcels.
    if c < FTW_GEOM_SLIVER_COMPACTNESS and area < max(min_keep_m2 * 4.0, 200.0):
        return True
    return False


def _morph_open(geom: Any, open_m: float, mid_lat: float) -> Any:
    if open_m <= 0:
        return geom
    d = open_m * _deg_per_m(mid_lat)
    try:
        opened = geom.buffer(-d).buffer(d)
        if opened is None or opened.is_empty:
            return geom
        return opened
    except Exception:  # noqa: BLE001
        return geom


def _simplify_m(geom: Any, simplify_m: float, mid_lat: float) -> Any:
    if simplify_m <= 0:
        return geom
    tol = simplify_m * _deg_per_m(mid_lat)
    try:
        s = geom.simplify(tol, preserve_topology=True)
        return s if s is not None and not s.is_empty else geom
    except Exception:  # noqa: BLE001
        return geom


def _fill_ratio_vs_mrr(geom: Any) -> float:
    try:
        mrr = geom.minimum_rotated_rectangle
        if mrr is None or mrr.is_empty or mrr.area <= 0:
            return 0.0
        return float(geom.area) / float(mrr.area)
    except Exception:  # noqa: BLE001
        return 0.0


def _smooth_stair_edges(geom: Any, smooth_m: float, mid_lat: float) -> Any:
    """Chaikin-like rounding of stair-step raster edges via buffer/unbuffer."""
    if smooth_m <= 0:
        return geom
    d = smooth_m * _deg_per_m(mid_lat)
    try:
        rounded = geom.buffer(d * 0.45).buffer(-d * 0.45)
        if rounded is None or rounded.is_empty:
            return geom
        return rounded
    except Exception:  # noqa: BLE001
        return geom


def _circle_fit_iou(geom: Any, mid_lat: float) -> float:
    """
    Overlap with the fitted equal-area circle, measured in locally isotropic space.
    Unlike compactness this survives raster jitter: jagged pivots stay ~0.94 while a
    square only reaches ~0.83.
    """
    try:
        from shapely import affinity

        k = max(math.cos(math.radians(mid_lat)), 1e-6)
        iso = affinity.scale(geom, xfact=k, yfact=1.0, origin=(0.0, 0.0))
        if iso is None or iso.is_empty or iso.area <= 0:
            return 0.0
        radius = math.sqrt(iso.area / math.pi)
        if radius <= 0:
            return 0.0
        circle = iso.centroid.buffer(radius, quad_segs=48)
        inter = float(iso.intersection(circle).area)
        union = float(iso.area) + float(circle.area) - inter
        return inter / union if union > 0 else 0.0
    except Exception:  # noqa: BLE001
        return 0.0


def _fills_square_box_like_disc(geom: Any, mid_lat: float) -> bool:
    """
    Disc test from area ratios alone: pi/4 of a *square* rectangle. Immune to the
    raster stairs, centre holes and clipped edges that drag compactness and the
    circle IoU under their gates, and unreachable for a cadastral square (which
    fills ~1.0 of its own rectangle).
    """
    fill = _fill_ratio_vs_mrr(geom)
    if not FTW_GEOM_DISC_FILL_MIN <= fill <= FTW_GEOM_DISC_FILL_MAX:
        return False
    try:
        from shapely import affinity

        k = max(math.cos(math.radians(mid_lat)), 1e-6)
        iso = affinity.scale(geom, xfact=k, yfact=1.0, origin=(0.0, 0.0))
        pts = list(iso.minimum_rotated_rectangle.exterior.coords)
        if len(pts) < 4:
            return False
        a = math.dist(pts[0], pts[1])
        b = math.dist(pts[1], pts[2])
        if a <= 0 or b <= 0:
            return False
        return min(a, b) / max(a, b) >= FTW_GEOM_DISC_SQUARENESS_MIN
    except Exception:  # noqa: BLE001
        return False


def _is_round(geom: Any, mid_lat: float) -> bool:
    """Centre pivots pass the fill-ratio gate (pi/4 = 0.785) — detect them first."""
    if _compactness(_area_m2(geom, mid_lat), _peri_m(geom, mid_lat)) >= FTW_GEOM_ROUND_GUARD:
        return True
    circle_iou = _circle_fit_iou(geom, mid_lat)
    if circle_iou >= FTW_GEOM_CIRCLE_IOU_MIN:
        return True
    # A pivot fused to a corner strip drops below the strict IoU gate, yet the
    # circle still fits it better than any rectangle can (a square scores 1.0
    # against its own rectangle and only 0.83 against a circle).
    if (
        circle_iou >= FTW_GEOM_CIRCLE_IOU_SOFT
        and circle_iou > _fill_ratio_vs_mrr(geom) + FTW_GEOM_CIRCLE_WIN_MARGIN
    ):
        return True
    return _fills_square_box_like_disc(geom, mid_lat)


def _maybe_rect_snap(geom: Any, mid_lat: float) -> Any:
    """Snap near-rectangular fields to oriented rectangle (farm-like edges)."""
    if _is_round(geom, mid_lat):
        return geom
    fill = _fill_ratio_vs_mrr(geom)
    if fill < FTW_GEOM_RECT_FILL_MIN:
        return geom
    try:
        mrr = geom.minimum_rotated_rectangle
        if mrr is None or mrr.is_empty:
            return geom
        # Reject huge inflation relative to original.
        if mrr.area > geom.area * FTW_GEOM_RECT_MAX_INFLATION:
            return geom
        return mrr
    except Exception:  # noqa: BLE001
        return geom


def _separate_neighbours(geoms: list[Any], sep_m: float, mid_lat: float) -> list[Any]:
    """
    Prevent merged-looking adjacent fields by eroding then partially re-expanding.
    Leaves a thin gap without destroying interior area of isolated fields.
    """
    if sep_m <= 0 or len(geoms) < 2:
        return geoms
    d = sep_m * _deg_per_m(mid_lat)
    expand = d * max(0.0, min(1.0, FTW_GEOM_SEP_EXPAND_FRAC))
    out: list[Any] = []
    for g in geoms:
        try:
            eroded = g.buffer(-d)
            if eroded is None or eroded.is_empty:
                # Tiny field — keep original (small-field friendly).
                out.append(g)
                continue
            rebuilt = eroded.buffer(expand)
            if rebuilt is None or rebuilt.is_empty:
                out.append(g)
                continue
            out.append(rebuilt)
        except Exception:  # noqa: BLE001
            out.append(g)
    return out


def improve_field_geometries(
    geoms: list[Any],
    *,
    mid_lat: float,
    min_area_m2: float = 50.0,
    simplify_m: float | None = None,
    open_m: float | None = None,
    sep_m: float | None = None,
    smooth_m: float | None = None,
    rect_snap: bool = True,
) -> list[Any]:
    """
    Run the phase-1 geometry pipeline on Shapely geometries (EPSG:4326).

    Returns cleaned Polygon geometries (MultiPolygons explode to parts).
    """
    from shapely.validation import make_valid

    simp = FTW_GEOM_SIMPLIFY_M if simplify_m is None else float(simplify_m)
    open_v = FTW_GEOM_OPEN_M if open_m is None else float(open_m)
    sep_v = FTW_GEOM_SEP_M if sep_m is None else float(sep_m)
    smooth_v = FTW_GEOM_SMOOTH_M if smooth_m is None else float(smooth_m)
    min_keep = max(FTW_GEOM_MIN_FIELD_M2, float(min_area_m2) * 0.25)

    polys: list[Any] = []
    for g in geoms or []:
        if g is None:
            continue
        try:
            vg = make_valid(g)
        except Exception:  # noqa: BLE001
            continue
        for p in _as_polygon_list(vg):
            polys.append(p)

    cleaned: list[Any] = []
    for p in polys:
        p = _morph_open(p, open_v, mid_lat)
        for part in _as_polygon_list(p):
            # Round staircase edges first, then simplify + optional OBB snap.
            part = _smooth_stair_edges(part, smooth_v, mid_lat)
            part = _simplify_m(part, simp, mid_lat)
            if rect_snap:
                part = _maybe_rect_snap(part, mid_lat)
            for final in _as_polygon_list(part):
                if _is_sliver(final, mid_lat, min_keep):
                    continue
                cleaned.append(final)

    cleaned = _separate_neighbours(cleaned, sep_v, mid_lat)

    # Final pass after separation (re-validate + light simplify + optional re-snap).
    out: list[Any] = []
    for g in cleaned:
        try:
            vg = make_valid(g)
        except Exception:  # noqa: BLE001
            continue
        for p in _as_polygon_list(vg):
            p = _smooth_stair_edges(p, max(smooth_v * 0.45, 0.6), mid_lat)
            p = _simplify_m(p, max(simp * 0.55, 1.0), mid_lat)
            if rect_snap:
                p = _maybe_rect_snap(p, mid_lat)
            for final in _as_polygon_list(p):
                if _is_sliver(final, mid_lat, min_keep):
                    continue
                if _area_m2(final, mid_lat) < min_keep:
                    continue
                out.append(final)
    return out
