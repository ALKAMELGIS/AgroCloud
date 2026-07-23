"""
Accuracy assessment (Step 7 of the wizard).

Given a classified label raster (written by the classify step as
``classified_{model_id}.tif``) and a set of ground-truth reference points, this
module samples the predicted class at each reference location and computes:

  * a confusion matrix (rows = reference / truth, cols = classified / prediction),
  * overall accuracy and Cohen's kappa,
  * per-class user's (precision) and producer's (recall) accuracy.

It also generates stratified- or equalized-random check points over the
classified raster so the analyst can build a verification set on the map.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import rasterio
from rasterio.warp import transform as warp_transform
from sklearn.metrics import accuracy_score, cohen_kappa_score, confusion_matrix

FALLBACK_PALETTE = [
    "#2b6cb0", "#38a169", "#d69e2e", "#e53e3e", "#805ad5",
    "#dd6b20", "#319795", "#ed64a6", "#4a5568", "#00b5d8",
]


def _labeled_raster_path(output_dir: str, raster_id: str, model_id: str) -> str:
    path = os.path.join(output_dir, raster_id, f"classified_{model_id}.tif")
    if not os.path.isfile(path):
        raise FileNotFoundError("Run classification (Step 5) before the accuracy assessment.")
    return path


def _class_lookup(classes: Optional[List[Dict[str, Any]]]) -> Tuple[Dict[int, str], Dict[int, str]]:
    name_by: Dict[int, str] = {}
    color_by: Dict[int, str] = {}
    for i, cls in enumerate(classes or []):
        value = int(cls.get("class_value", i + 1))
        name_by[value] = str(cls.get("class_name", f"Class {value}"))
        color_by[value] = cls.get("color") or FALLBACK_PALETTE[i % len(FALLBACK_PALETTE)]
    return name_by, color_by


def _to_raster_xy(dataset, lon: float, lat: float) -> Tuple[float, float]:
    if dataset.crs and str(dataset.crs).upper() not in ("EPSG:4326",):
        xs, ys = warp_transform("EPSG:4326", dataset.crs, [lon], [lat])
        return xs[0], ys[0]
    return lon, lat


def assess_accuracy(
    *,
    raster_id: str,
    model_id: str,
    reference_points: List[Dict[str, Any]],
    classes: Optional[List[Dict[str, Any]]] = None,
    output_dir: str = "/tmp/ic-segments",
) -> Dict[str, Any]:
    path = _labeled_raster_path(output_dir, raster_id, model_id)
    name_by, color_by = _class_lookup(classes)

    y_true: List[int] = []
    y_pred: List[int] = []
    with rasterio.open(path) as dataset:
        for feature in reference_points or []:
            props = feature.get("properties") or {}
            geom = feature.get("geometry") or {}
            if geom.get("type") != "Point":
                continue
            class_value = props.get("class_value")
            if class_value is None:
                continue
            coords = geom.get("coordinates") or []
            if len(coords) < 2:
                continue
            lon, lat = float(coords[0]), float(coords[1])
            try:
                x, y = _to_raster_xy(dataset, lon, lat)
                sampled = next(iter(dataset.sample([(x, y)])))
                predicted = int(sampled[0])
            except (StopIteration, Exception):  # noqa: BLE001 - skip unsamplable points
                continue
            if predicted == 0:  # nodata / unclassified
                continue
            y_true.append(int(class_value))
            y_pred.append(predicted)

    n_points = len(reference_points or [])
    n_used = len(y_true)
    if n_used == 0:
        raise ValueError(
            "No reference points fell on classified pixels. Check the points' CRS/extent and class field."
        )

    labels = sorted(set(y_true) | set(y_pred))
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    overall = float(accuracy_score(y_true, y_pred))
    try:
        kappa = float(cohen_kappa_score(y_true, y_pred, labels=labels))
    except Exception:  # noqa: BLE001
        kappa = None

    row_totals = cm.sum(axis=1)  # reference totals
    col_totals = cm.sum(axis=0)  # classified totals
    diag = np.diag(cm)

    per_class = []
    for i, value in enumerate(labels):
        producers = float(diag[i] / row_totals[i]) if row_totals[i] else 0.0
        users = float(diag[i] / col_totals[i]) if col_totals[i] else 0.0
        per_class.append(
            {
                "value": int(value),
                "name": name_by.get(int(value), f"Class {value}"),
                "color": color_by.get(int(value), FALLBACK_PALETTE[i % len(FALLBACK_PALETTE)]),
                "reference_total": int(row_totals[i]),
                "classified_total": int(col_totals[i]),
                "correct": int(diag[i]),
                "producers_accuracy": round(producers, 4),
                "users_accuracy": round(users, 4),
            }
        )

    return {
        "labels": [
            {
                "value": int(v),
                "name": name_by.get(int(v), f"Class {v}"),
                "color": color_by.get(int(v), FALLBACK_PALETTE[i % len(FALLBACK_PALETTE)]),
            }
            for i, v in enumerate(labels)
        ],
        "matrix": cm.astype(int).tolist(),
        "overall_accuracy": round(overall, 4),
        "kappa": round(kappa, 4) if kappa is not None else None,
        "n_points": n_points,
        "n_used": n_used,
        "per_class": per_class,
    }


def generate_check_points(
    *,
    raster_id: str,
    model_id: str,
    method: str = "stratified",
    count: int = 100,
    classes: Optional[List[Dict[str, Any]]] = None,
    output_dir: str = "/tmp/ic-segments",
) -> Dict[str, Any]:
    path = _labeled_raster_path(output_dir, raster_id, model_id)
    name_by, color_by = _class_lookup(classes)
    method = (method or "stratified").lower()
    count = max(1, int(count))

    with rasterio.open(path) as dataset:
        arr = dataset.read(1)
        transform = dataset.transform
        present = [int(v) for v in np.unique(arr) if v != 0]
        if not present:
            raise ValueError("The classified raster has no labelled pixels.")

        counts = {c: int(np.count_nonzero(arr == c)) for c in present}
        if method == "equalized":
            per = max(1, count // len(present))
            allocation = {c: per for c in present}
        else:  # stratified: proportional to class area
            total = sum(counts.values())
            allocation = {
                c: max(1, int(round(count * (counts[c] / total)))) for c in present
            } if total else {}

        rng = np.random.default_rng(42)
        features: List[Dict[str, Any]] = []
        for c in present:
            ys, xs = np.where(arr == c)
            take = min(allocation.get(c, 0), len(xs))
            if take <= 0:
                continue
            pick = rng.choice(len(xs), take, replace=False)
            for k in pick:
                col = int(xs[k])
                row = int(ys[k])
                x, y = transform * (col + 0.5, row + 0.5)
                lon, lat = x, y
                if dataset.crs and str(dataset.crs).upper() not in ("EPSG:4326",):
                    lons, lats = warp_transform(dataset.crs, "EPSG:4326", [x], [y])
                    lon, lat = lons[0], lats[0]
                features.append(
                    {
                        "type": "Feature",
                        "properties": {
                            "class_value": c,
                            "class_name": name_by.get(c, f"Class {c}"),
                            "color": color_by.get(c, "#f6ad55"),
                        },
                        "geometry": {"type": "Point", "coordinates": [lon, lat]},
                    }
                )

    return {
        "type": "FeatureCollection",
        "features": features,
        "count": len(features),
        "method": method,
    }
