"""
FTW AOI raster mosaic → single-pass vectorize (OpenCV contours).

Input: binary mask PNG + georeferenced bbox from client-side PMTiles union raster.
When reference field boundaries are supplied, output those geometries unchanged and
only validate presence against the raster mask (no dissolve / simplify / resample).
"""

from __future__ import annotations

import base64
import io
from typing import Any

import cv2
import numpy as np
from PIL import Image

from field_mask_refine import refine_binary_mask, ftw_min_px_from_area


def _decode_mask_png(data_url_or_b64: str) -> np.ndarray:
    raw = str(data_url_or_b64 or "").strip()
    if not raw:
        raise ValueError("mask is required.")
    if raw.startswith("data:"):
        comma = raw.find(",")
        if comma < 0:
            raise ValueError("Invalid mask data URL.")
        raw = raw[comma + 1 :]
    buf = base64.b64decode(raw)
    img = Image.open(io.BytesIO(buf)).convert("L")
    arr = np.array(img, dtype=np.uint8)
    return (arr > 127).astype(np.uint8)


def _meters_per_deg(lat: float) -> tuple[float, float]:
    import math

    r = math.radians(lat)
    m_lat = 111132.92 - 559.82 * math.cos(2 * r) + 1.175 * math.cos(4 * r)
    m_lon = 111412.84 * math.cos(r) - 93.5 * math.cos(3 * r)
    return max(m_lon, 1.0), max(m_lat, 1.0)


def _pixel_to_lonlat(
    col: float,
    row: float,
    bbox: tuple[float, float, float, float],
    w: int,
    h: int,
) -> tuple[float, float]:
    west, south, east, north = bbox
    lon = west + (col / max(w - 1, 1)) * (east - west)
    lat = north - (row / max(h - 1, 1)) * (north - south)
    return lon, lat


def _lonlat_to_pixel(
    lon: float,
    lat: float,
    bbox: tuple[float, float, float, float],
    w: int,
    h: int,
) -> tuple[int, int]:
    west, south, east, north = bbox
    col = int(round(((lon - west) / max(east - west, 1e-12)) * max(w - 1, 1)))
    row = int(round(((north - lat) / max(north - south, 1e-12)) * max(h - 1, 1)))
    return max(0, min(w - 1, col)), max(0, min(h - 1, row))


def _ring_area_m2(ring: list[list[float]]) -> float:
    if len(ring) < 3:
        return 0.0
    lat_mid = sum(p[1] for p in ring) / len(ring)
    m_lon, m_lat = _meters_per_deg(lat_mid)
    m_coords = [(p[0] * m_lon, p[1] * m_lat) for p in ring]
    area = 0.0
    for i in range(len(m_coords) - 1):
        area += m_coords[i][0] * m_coords[i + 1][1]
        area -= m_coords[i + 1][0] * m_coords[i][1]
    return abs(area) / 2.0


def _simplify_ring(ring: list[list[float]], epsilon: float) -> list[list[float]]:
    if len(ring) <= 3:
        return ring
    arr = np.array(ring, dtype=np.float64)
    approx = cv2.approxPolyDP(arr.reshape(-1, 1, 2), epsilon, True)
    out = approx.reshape(-1, 2).tolist()
    if len(out) < 3:
        return ring
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def _extract_rings(geometry: dict[str, Any]) -> list[list[list[float]]]:
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Polygon" and isinstance(coords, list) and coords:
        return [coords[0]]
    if gtype == "MultiPolygon" and isinstance(coords, list):
        rings: list[list[list[float]]] = []
        for poly in coords:
            if isinstance(poly, list) and poly:
                rings.append(poly[0])
        return rings
    return []


def _reference_overlaps_mask(
    feature: dict[str, Any],
    mask: np.ndarray,
    bbox: tuple[float, float, float, float],
) -> bool:
    h, w = mask.shape[:2]
    geometry = feature.get("geometry") or {}
    rings = _extract_rings(geometry)
    if not rings:
        return False
    for ring in rings:
        if len(ring) < 3:
            continue
        lons = [float(p[0]) for p in ring]
        lats = [float(p[1]) for p in ring]
        lon_mid = sum(lons) / len(lons)
        lat_mid = sum(lats) / len(lats)
        cx, cy = _lonlat_to_pixel(lon_mid, lat_mid, bbox, w, h)
        if mask[cy, cx]:
            return True
        step = max(1, len(ring) // 8)
        for i in range(0, len(ring), step):
            px, py = _lonlat_to_pixel(float(ring[i][0]), float(ring[i][1]), bbox, w, h)
            if mask[py, px]:
                return True
    return False


def vectorize_with_reference_field_boundaries(
    mask_u8: np.ndarray,
    bbox: list[float],
    reference_features: list[dict[str, Any]],
    *,
    min_area_m2: float = 500.0,
) -> dict[str, Any]:
    """Return reference field polygons unchanged when raster mask confirms presence."""
    west, south, east, north = (float(v) for v in bbox)
    bb = (west, south, east, north)
    features: list[dict[str, Any]] = []
    score_sum = 0.0
    for ref in reference_features:
        if not _reference_overlaps_mask(ref, mask_u8, bb):
            continue
        geometry = ref.get("geometry")
        if not geometry:
            continue
        rings = _extract_rings(geometry)
        if not rings:
            continue
        area_m2 = _ring_area_m2(rings[0])
        if area_m2 < min_area_m2:
            continue
        props = dict(ref.get("properties") or {})
        conf = float(props.get("confidence_mean") or props.get("confidence") or 0.55)
        score_sum += conf
        out_props = {
            **props,
            "confidence": conf,
            "confidence_mean": conf,
            "area_m2": round(area_m2, 2),
            "area_ha": round(area_m2 / 10000.0, 4),
            "source": "ftw-field-boundary-mask",
        }
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": out_props,
            }
        )
    count = len(features)
    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "count": count,
        "score": round(score_sum / count, 4) if count else 0.0,
        "engine": "ftw-field-boundary-mask",
        "device": "cpu",
        "stats": {"field": count},
        "aoi_applied": False,
        "width": int(mask_u8.shape[1]),
        "height": int(mask_u8.shape[0]),
    }


def vectorize_ftw_binary_mask(
    mask_u8: np.ndarray,
    bbox: list[float],
    *,
    min_area_m2: float = 500.0,
    default_confidence: float = 0.55,
    preserve_geometry: bool = False,
    reference_features: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if reference_features:
        return vectorize_with_reference_field_boundaries(
            mask_u8,
            bbox,
            reference_features,
            min_area_m2=min_area_m2,
        )

    if mask_u8.ndim != 2:
        raise ValueError("mask must be 2-D.")
    h, w = mask_u8.shape[:2]
    if w < 2 or h < 2:
        raise ValueError("mask too small.")
    west, south, east, north = (float(v) for v in bbox)
    if not (east > west and north > south):
        raise ValueError("bbox must be [west, south, east, north].")

    lat_mid = (south + north) / 2.0
    m_lon, m_lat = _meters_per_deg(lat_mid)
    px_area_m2 = abs((east - west) * m_lon * (north - south) * m_lat) / max(w * h, 1)
    min_px = ftw_min_px_from_area(min_area_m2, resolution_m=max(1.0, px_area_m2**0.5))

    if preserve_geometry:
        binary = (mask_u8 > 0).astype(np.uint8)
        contours_mode = cv2.RETR_EXTERNAL
        chain_mode = cv2.CHAIN_APPROX_NONE
        simp_eps = 0.0
    else:
        refined = refine_binary_mask(mask_u8 > 0, min_px=min_px)
        binary = refined.astype(np.uint8)
        contours_mode = cv2.RETR_EXTERNAL
        chain_mode = cv2.CHAIN_APPROX_SIMPLE
        diag_deg = ((east - west) ** 2 + (north - south) ** 2) ** 0.5
        simp_eps = max(diag_deg * 0.00015, 1e-7)

    u8 = binary * 255
    contours, _ = cv2.findContours(u8, contours_mode, chain_mode)

    features: list[dict[str, Any]] = []
    score_sum = 0.0
    idx = 0
    for cnt in contours:
        if cnt is None or len(cnt) < 3:
            continue
        ring = []
        for pt in cnt.reshape(-1, 2):
            lon, lat = _pixel_to_lonlat(float(pt[0]), float(pt[1]), (west, south, east, north), w, h)
            ring.append([lon, lat])
        if len(ring) < 3:
            continue
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        if not preserve_geometry and simp_eps > 0:
            ring = _simplify_ring(ring, simp_eps)
        if len(ring) < 4:
            continue
        area_m2 = _ring_area_m2(ring)
        if area_m2 < min_area_m2:
            continue
        if preserve_geometry and min_px > 1:
            lat_mid_ring = sum(p[1] for p in ring) / len(ring)
            _, m_lat = _meters_per_deg(lat_mid_ring)
            px_area_ring = abs((east - west) * m_lon * (north - south) * m_lat) / max(w * h, 1)
            if area_m2 / max(px_area_ring, 1e-9) < min_px * 0.85:
                continue
        idx += 1
        conf = default_confidence
        score_sum += conf
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {
                    "field_id": f"FTW-{idx:04d}",
                    "confidence": conf,
                    "confidence_mean": conf,
                    "area_m2": round(area_m2, 2),
                    "area_ha": round(area_m2 / 10000.0, 4),
                    "source": "ftw-raster-mosaic",
                },
            }
        )

    count = len(features)
    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "count": count,
        "score": round(score_sum / count, 4) if count else 0.0,
        "engine": "ftw-raster-mosaic-seamless" if preserve_geometry else "ftw-raster-mosaic",
        "device": "cpu",
        "stats": {"field": count},
        "aoi_applied": False,
        "width": w,
        "height": h,
    }
