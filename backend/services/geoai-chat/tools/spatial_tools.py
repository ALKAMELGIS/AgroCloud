"""Vector spatial analysis tools (Shapely / GeoPandas)."""

from __future__ import annotations

from typing import Any

from shapely.geometry import mapping, shape
from shapely.ops import transform
import pyproj


def _geom(geojson: dict[str, Any]):
    return shape(geojson)


def calculate_area(geojson: dict[str, Any]) -> dict[str, float]:
    """Geodesic area in m² and hectares for a GeoJSON geometry."""
    geom = _geom(geojson)
    if geom.is_empty:
        return {"areaM2": 0.0, "areaHa": 0.0}
    geod = pyproj.Geod(ellps="WGS84")
    area_m2, _ = geod.geometry_area_perimeter(geom)
    area_m2 = abs(float(area_m2))
    return {"areaM2": area_m2, "areaHa": round(area_m2 / 10_000, 4)}


def intersect(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    geom_a = _geom(a)
    geom_b = _geom(b)
    result = geom_a.intersection(geom_b)
    if result.is_empty:
        return {"type": "FeatureCollection", "features": []}
    return {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {}, "geometry": mapping(result)}],
    }


def buffer_geometry(geojson: dict[str, Any], distance_m: float) -> dict[str, Any]:
    """Buffer geometry in meters (WGS84 → azimuthal equidistant → back)."""
    geom = _geom(geojson)
    if geom.is_empty:
        return {"type": "FeatureCollection", "features": []}
    centroid = geom.centroid
    lon, lat = centroid.x, centroid.y
    proj = pyproj.Transformer.from_crs(
        "EPSG:4326",
        f"+proj=aeqd +lat_0={lat} +lon_0={lon} +ellps=WGS84 +units=m +no_defs",
        always_xy=True,
    )
    inv = pyproj.Transformer.from_crs(
        f"+proj=aeqd +lat_0={lat} +lon_0={lon} +ellps=WGS84 +units=m +no_defs",
        "EPSG:4326",
        always_xy=True,
    )
    local = transform(proj.transform, geom)
    buffered = local.buffer(float(distance_m))
    result = transform(inv.transform, buffered)
    return {
        "type": "FeatureCollection",
        "features": [{"type": "Feature", "properties": {"bufferM": distance_m}, "geometry": mapping(result)}],
    }


def within(inner: dict[str, Any], outer: dict[str, Any]) -> dict[str, bool]:
    return {"within": bool(_geom(inner).within(_geom(outer)))}


def distance_between(a: dict[str, Any], b: dict[str, Any]) -> dict[str, float]:
    geod = pyproj.Geod(ellps="WGS84")
    ga = _geom(a)
    gb = _geom(b)
    ca = ga.centroid
    cb = gb.centroid
    _, _, dist_m = geod.inv(ca.x, ca.y, cb.x, cb.y)
    return {"distanceM": abs(float(dist_m))}
