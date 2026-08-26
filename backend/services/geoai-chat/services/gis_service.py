"""Orchestrate GIS tools for GeoAI Chat responses."""

from __future__ import annotations

import re
from typing import Any

from tools import layer_tools, place_tools, spatial_tools

INDEX_ALIASES = {
    "NDVI": ["ndvi", "vegetation", "vigor", "greenness"],
    "NDMI": ["ndmi", "moisture", "vegetation moisture"],
    "NDWI": ["ndwi", "water", "surface water"],
    "SAVI": ["savi"],
    "ET": ["et", "evapotranspiration", "water loss"],
}


def _aoi_geometry(context: dict[str, Any]) -> dict[str, Any] | None:
    aoi = context.get("selectedAOI")
    if isinstance(aoi, dict) and aoi.get("geometry"):
        return aoi["geometry"]
    return None


def _detect_layer(message: str, context: dict[str, Any]) -> str | None:
    lower = message.lower()
    for layer_id, aliases in INDEX_ALIASES.items():
        if layer_id.lower() in lower:
            return layer_id
        for alias in aliases:
            if alias in lower:
                return layer_id
    active = layer_tools.get_active_layer(context)
    if active:
        return str(active.get("id") or active.get("name") or "").strip().upper() or None
    return None


def execute(message: str, context: dict[str, Any]) -> dict[str, Any]:
    """Run deterministic GIS analysis from user message + map context."""
    msg = message.strip()
    lower = msg.lower()
    aoi_geom = _aoi_geometry(context)
    statistics: dict[str, Any] = {}
    geojson: dict[str, Any] | None = None
    action: dict[str, Any] | None = None
    answer_parts: list[str] = []

    # Place search
    place_match = re.search(r"(?:where is|find|locate|search for|go to)\s+(.+)", lower)
    if place_match and not aoi_geom:
        place = place_tools.search_place(place_match.group(1).strip())
        if place:
            statistics["place"] = place
            answer_parts.append(
                f"**{place['name']}** is at {place['lat']:.5f}, {place['lng']:.5f}."
            )
            action = {"type": "FLY_TO", "lng": place["lng"], "lat": place["lat"], "zoom": 12}
            return _pack(answer_parts, context, statistics, action, geojson)

    # AOI area
    if aoi_geom and any(k in lower for k in ("area", "hectare", "size", "how big")):
        area = spatial_tools.calculate_area(aoi_geom)
        aoi = context.get("selectedAOI") or {}
        name = aoi.get("name") or "AOI"
        statistics["area"] = area
        answer_parts.append(f"**{name}** covers **{area['areaHa']:.2f} ha** ({area['areaM2']:,.0f} m²).")

    # Index stats
    layer_id = _detect_layer(msg, context)
    if layer_id and aoi_geom:
        stats = layer_tools.get_index_stats_from_context(context, layer_id)
        statistics["index"] = stats
        mean = stats.get("mean")
        min_v = stats.get("min")
        max_v = stats.get("max")
        if mean is not None:
            answer_parts.append(
                f"**{layer_id}** in the selected AOI — mean **{mean:.4f}**, "
                f"min **{min_v:.4f}**, max **{max_v:.4f}**."
            )
        else:
            answer_parts.append(
                f"No live **{layer_id}** statistics in context. Select a layer and AOI on the map, then retry."
            )

    # Buffer
    buffer_match = re.search(r"buffer\s+(\d+(?:\.\d+)?)\s*m", lower)
    if buffer_match and aoi_geom:
        dist = float(buffer_match.group(1))
        geojson = spatial_tools.buffer_geometry(aoi_geom, dist)
        statistics["bufferM"] = dist
        action = {"type": "ADD_GEOJSON_LAYER", "layerId": "geoai-buffer"}
        answer_parts.append(f"Created a **{dist:.0f} m** buffer around the AOI.")

    if not answer_parts:
        aoi_name = (context.get("selectedAOI") or {}).get("name") or "none"
        active = layer_tools.get_active_layer(context)
        layer_label = (active or {}).get("name") or (active or {}).get("id") or "none"
        answer_parts.append(
            f"GeoAI received your question. Active layer: **{layer_label}**, AOI: **{aoi_name}**. "
            "Try: average NDVI in AOI, AOI area, buffer 500m, or search for a city."
        )

    return _pack(answer_parts, context, statistics, action, geojson)


def _pack(
    parts: list[str],
    context: dict[str, Any],
    statistics: dict[str, Any],
    action: dict[str, Any] | None,
    geojson: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "answer": "\n\n".join(parts),
        "context": context,
        "action": action,
        "statistics": statistics,
        "geojson": geojson,
    }
