"""Resolve active layer and index statistics from client context."""

from __future__ import annotations

from typing import Any


def get_active_layer(context: dict[str, Any]) -> dict[str, Any] | None:
    layer = context.get("activeLayer")
    if isinstance(layer, dict):
        return layer
    analysis = context.get("activeAnalysis")
    if isinstance(analysis, dict):
        return {
            "id": analysis.get("label"),
            "name": analysis.get("label"),
            "type": "index",
            "sceneDate": analysis.get("acquisitionDate"),
            "meanValue": analysis.get("meanValue"),
        }
    return None


def get_index_stats_from_context(context: dict[str, Any], layer_id: str | None = None) -> dict[str, Any]:
    """Use zonal stats passed from the React map (Sentinel Statistical API)."""
    lid = (layer_id or "").strip().upper()
    active = get_active_layer(context) or {}
    if not lid:
        lid = str(active.get("id") or active.get("name") or "").strip().upper()

    zonal = context.get("zonalStats") or {}
    if isinstance(zonal, dict) and lid in zonal:
        return {"layerId": lid, **zonal[lid]}

    analysis = context.get("activeAnalysis") or {}
    if lid and str(analysis.get("label", "")).upper() == lid:
        mean = analysis.get("meanValue")
        if mean is not None:
            return {"layerId": lid, "mean": mean, "min": mean, "max": mean, "source": "live-map"}

    return {"layerId": lid or None, "mean": None, "min": None, "max": None}
