"""
Field-boundary validation metrics: BASELINE vs IMPROVED comparison.

Metrics:
  - IoU (rasterized / pairwise max matching)
  - Precision, Recall, F1 (instance-matched)
  - Boundary F1 (buffer-based boundary overlap)
  - Instance F1 (matches at IoU >= threshold)
  - Field area error (% absolute relative error, matched pairs)
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any


def _load_features(path: str | Path) -> list[dict[str, Any]]:
    p = Path(path)
    raw = json.loads(p.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and raw.get("type") == "FeatureCollection":
        return [f for f in (raw.get("features") or []) if isinstance(f, dict) and f.get("geometry")]
    if isinstance(raw, dict) and raw.get("type") == "Feature":
        return [raw]
    if isinstance(raw, list):
        return [f for f in raw if isinstance(f, dict) and f.get("geometry")]
    raise ValueError(f"Unsupported GeoJSON in {path}")


def _to_polys(features: list[dict[str, Any]]) -> list[Any]:
    from shapely.geometry import shape
    from shapely.validation import make_valid

    out = []
    for f in features:
        try:
            g = make_valid(shape(f["geometry"]))
        except Exception:  # noqa: BLE001
            continue
        if g is None or g.is_empty:
            continue
        if g.geom_type == "Polygon":
            out.append(g)
        elif g.geom_type == "MultiPolygon":
            out.extend([p for p in g.geoms if not p.is_empty])
    return out


def _area_m2(geom: Any, mid_lat: float) -> float:
    m = 111_320.0
    lon_m = max(m * math.cos(math.radians(mid_lat)), 1.0)
    scale = ((m + lon_m) * 0.5) ** 2
    return float(geom.area) * scale


def _match_instances(
    pred: list[Any],
    gt: list[Any],
    *,
    iou_thr: float = 0.5,
) -> tuple[list[tuple[int, int, float]], set[int], set[int]]:
    """Greedy max-IoU matching. Returns matches, unmatched_pred, unmatched_gt."""
    scores: list[tuple[float, int, int]] = []
    for i, p in enumerate(pred):
        for j, g in enumerate(gt):
            inter = p.intersection(g).area
            union = p.union(g).area
            if union <= 0:
                continue
            iou = inter / union
            if iou >= iou_thr:
                scores.append((iou, i, j))
    scores.sort(reverse=True)
    used_p: set[int] = set()
    used_g: set[int] = set()
    matches: list[tuple[int, int, float]] = []
    for iou, i, j in scores:
        if i in used_p or j in used_g:
            continue
        used_p.add(i)
        used_g.add(j)
        matches.append((i, j, iou))
    unmatched_p = set(range(len(pred))) - used_p
    unmatched_g = set(range(len(gt))) - used_g
    return matches, unmatched_p, unmatched_g


def _boundary_f1(pred: list[Any], gt: list[Any], buffer_deg: float) -> float:
    from shapely.ops import unary_union

    if not pred or not gt:
        return 0.0
    try:
        pb = unary_union([p.boundary.buffer(buffer_deg) for p in pred])
        gb = unary_union([g.boundary.buffer(buffer_deg) for g in gt])
        inter = pb.intersection(gb).area
        if pb.area <= 0 or gb.area <= 0:
            return 0.0
        prec = inter / pb.area
        rec = inter / gb.area
        if prec + rec <= 0:
            return 0.0
        return float(2 * prec * rec / (prec + rec))
    except Exception:  # noqa: BLE001
        return 0.0


def evaluate_field_boundaries(
    pred_geojson: str | Path,
    gt_geojson: str | Path,
    *,
    iou_thr: float = 0.5,
    boundary_buffer_m: float = 5.0,
) -> dict[str, Any]:
    """Compute comparison metrics for predicted vs ground-truth field polygons."""
    pred_f = _load_features(pred_geojson)
    gt_f = _load_features(gt_geojson)
    pred = _to_polys(pred_f)
    gt = _to_polys(gt_f)

    if not gt:
        raise ValueError("Ground-truth has no valid polygons.")

    # Mid-lat from GT bounds
    minx = min(g.bounds[0] for g in gt)
    maxx = max(g.bounds[2] for g in gt)
    miny = min(g.bounds[1] for g in gt)
    maxy = max(g.bounds[3] for g in gt)
    mid_lat = (miny + maxy) / 2.0
    buf_deg = boundary_buffer_m / max(111_320.0 * math.cos(math.radians(mid_lat)), 1.0)

    matches, unmatched_p, unmatched_g = _match_instances(pred, gt, iou_thr=iou_thr)
    tp = len(matches)
    fp = len(unmatched_p)
    fn = len(unmatched_g)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
    instance_f1 = f1

    mean_iou = float(sum(m[2] for m in matches) / tp) if tp else 0.0

    # Global union IoU
    from shapely.ops import unary_union

    try:
        pu = unary_union(pred) if pred else None
        gu = unary_union(gt)
        if pu is None or pu.is_empty:
            global_iou = 0.0
        else:
            inter = pu.intersection(gu).area
            union = pu.union(gu).area
            global_iou = float(inter / union) if union > 0 else 0.0
    except Exception:  # noqa: BLE001
        global_iou = 0.0

    boundary_f1 = _boundary_f1(pred, gt, buf_deg)

    area_errs: list[float] = []
    for i, j, _ in matches:
        pa = _area_m2(pred[i], mid_lat)
        ga = _area_m2(gt[j], mid_lat)
        if ga > 0:
            area_errs.append(abs(pa - ga) / ga * 100.0)
    area_err = float(sum(area_errs) / len(area_errs)) if area_errs else None

    return {
        "counts": {
            "pred": len(pred),
            "gt": len(gt),
            "tp": tp,
            "fp": fp,
            "fn": fn,
        },
        "iou": round(global_iou, 4),
        "mean_matched_iou": round(mean_iou, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "boundary_f1": round(boundary_f1, 4),
        "instance_f1": round(instance_f1, 4),
        "field_area_error_pct": None if area_err is None else round(area_err, 2),
        "iou_match_threshold": iou_thr,
        "boundary_buffer_m": boundary_buffer_m,
        "bbox": [minx, miny, maxx, maxy],
    }


def format_metrics_table(baseline: dict[str, Any], improved: dict[str, Any] | None = None) -> str:
    keys = [
        ("iou", "IoU"),
        ("precision", "Precision"),
        ("recall", "Recall"),
        ("f1", "F1"),
        ("boundary_f1", "Boundary F1"),
        ("instance_f1", "Instance F1"),
        ("field_area_error_pct", "Area err %"),
    ]
    lines = ["metric,baseline" + (",improved,delta" if improved else "")]
    for key, label in keys:
        b = baseline.get(key)
        if improved is None:
            lines.append(f"{label},{b}")
            continue
        i = improved.get(key)
        delta = ""
        if isinstance(b, (int, float)) and isinstance(i, (int, float)):
            # Lower is better for area error.
            d = (b - i) if key == "field_area_error_pct" else (i - b)
            delta = f"{d:+.4f}" if key != "field_area_error_pct" else f"{d:+.2f}"
        lines.append(f"{label},{b},{i},{delta}")
    return "\n".join(lines)
