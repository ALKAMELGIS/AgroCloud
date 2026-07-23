"""
Supervised / unsupervised pixel classification (Steps 4-5 of the wizard).

Train:
  * rasterize training-sample polygons (WGS84) onto a decimated raster grid,
  * collect per-pixel band-value feature vectors under each class,
  * fit a scikit-learn classifier (Random Forest / KNN / SVM-RBF / Gaussian NB),
    or KMeans for the unsupervised path,
  * persist the fitted model (joblib) keyed by a model id.

Classify:
  * apply the model to a decimated read of the whole raster,
  * colorize the label map with the class palette → RGBA PNG (base64) for a map
    overlay (Mapbox image source), returned with WGS84 bounds,
  * write a labelled GeoTIFF for the later accuracy-assessment step.

Band values are used raw (no stretch); tree models are scale-invariant and the
KNN/SVM/NB pipelines embed a StandardScaler so train/classify stay consistent.
"""
from __future__ import annotations

import base64
import io
import os
import uuid
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import rasterio
from affine import Affine
from PIL import Image
from rasterio.features import rasterize
from rasterio.warp import transform_bounds, transform_geom
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import KMeans
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

from app.segmentation import _decimation_out_shape, _resolve_raster_path

DEFAULT_MAX_TRAIN_DIM = 1024
DEFAULT_MAX_CLASSIFY_DIM = 1024
# Fallback palette for cluster / unlabelled ids (KMeans, or values missing a color).
FALLBACK_PALETTE = [
    "#2b6cb0", "#38a169", "#d69e2e", "#e53e3e", "#805ad5",
    "#dd6b20", "#319795", "#ed64a6", "#4a5568", "#00b5d8",
    "#9f7aea", "#f56565", "#48bb78", "#ecc94b", "#4299e1",
]

SUPERVISED_CLASSIFIERS = {"random_forest", "knn", "svm_rbf", "gaussian_nb"}


def _model_path(output_dir: str, raster_id: str, model_id: str) -> str:
    dest_dir = os.path.join(output_dir, raster_id)
    os.makedirs(dest_dir, exist_ok=True)
    return os.path.join(dest_dir, f"model_{model_id}.joblib")


def _hex_to_rgb(color: Optional[str], fallback_index: int = 0) -> Tuple[int, int, int]:
    value = (color or "").lstrip("#")
    if len(value) == 6:
        try:
            return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
        except ValueError:
            pass
    fb = FALLBACK_PALETTE[fallback_index % len(FALLBACK_PALETTE)].lstrip("#")
    return int(fb[0:2], 16), int(fb[2:4], 16), int(fb[4:6], 16)


def _render_label_overlay(
    labels: np.ndarray, class_defs: List[Dict[str, Any]]
) -> Tuple[str, List[Dict[str, Any]]]:
    """Colorize an int label map (0 = nodata) → (base64 RGBA PNG, class distribution)."""
    out_h, out_w = labels.shape
    color_by_value: Dict[int, Tuple[int, int, int]] = {}
    name_by_value: Dict[int, str] = {}
    for i, cls in enumerate(class_defs):
        value = int(cls.get("class_value", i + 1))
        color_by_value[value] = _hex_to_rgb(cls.get("color"), i)
        name_by_value[value] = str(cls.get("class_name", f"Class {value}"))

    present_values = [int(v) for v in np.unique(labels) if v != 0]
    rgba = np.zeros((out_h, out_w, 4), dtype="uint8")
    for i, value in enumerate(present_values):
        rgb = color_by_value.get(value) or _hex_to_rgb(None, value + i)
        sel = labels == value
        rgba[sel, 0] = rgb[0]
        rgba[sel, 1] = rgb[1]
        rgba[sel, 2] = rgb[2]
        rgba[sel, 3] = 255

    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, format="PNG")
    image_base64 = base64.b64encode(buf.getvalue()).decode("ascii")

    total = int(np.count_nonzero(labels))
    distribution = []
    for value in present_values:
        count = int(np.count_nonzero(labels == value))
        rgb = color_by_value.get(value) or _hex_to_rgb(None, value)
        distribution.append(
            {
                "value": value,
                "name": name_by_value.get(value, f"Class {value}"),
                "color": "#%02x%02x%02x" % rgb,
                "count": count,
                "pct": round((count / total) * 100.0, 2) if total else 0.0,
            }
        )
    return image_base64, distribution


def _read_stack(dataset, out_h: int, out_w: int) -> Tuple[np.ndarray, np.ndarray]:
    """Read every band decimated to (out_h,out_w). Returns (bands,H,W) float32 + nodata mask (H,W)."""
    count = dataset.count
    arr = dataset.read(out_shape=(count, out_h, out_w), masked=True)
    data = np.ma.filled(arr.astype("float32"), 0.0)
    mask = np.ma.getmaskarray(arr).any(axis=0)
    # Also treat all-zero pixels as nodata (common for padded exports).
    mask = mask | (np.abs(data).sum(axis=0) == 0)
    return data, mask


def _decimated_transform(dataset, out_w: int, out_h: int) -> Affine:
    scale_x = dataset.width / float(out_w)
    scale_y = dataset.height / float(out_h)
    return dataset.transform * Affine.scale(scale_x, scale_y)


def _wgs84_bounds(dataset) -> List[float]:
    try:
        if dataset.crs:
            w, s, e, n = transform_bounds(dataset.crs, "EPSG:4326", *dataset.bounds)
            return [w, s, e, n]
    except Exception:
        pass
    b = dataset.bounds
    return [b.left, b.bottom, b.right, b.top]


def _build_model(classifier: str, n_estimators: int):
    if classifier == "random_forest":
        return RandomForestClassifier(
            n_estimators=max(10, int(n_estimators)), n_jobs=-1, random_state=42
        )
    if classifier == "knn":
        return Pipeline([("scale", StandardScaler()), ("clf", KNeighborsClassifier(n_neighbors=5))])
    if classifier == "svm_rbf":
        return Pipeline([("scale", StandardScaler()), ("clf", SVC(kernel="rbf", C=10.0, gamma="scale"))])
    if classifier == "gaussian_nb":
        return Pipeline([("scale", StandardScaler()), ("clf", GaussianNB())])
    raise ValueError(f"Unsupported supervised classifier: {classifier}")


def train_classifier(
    *,
    raster_id: str,
    path_candidates: List[Optional[str]],
    classifier: str = "random_forest",
    samples: Optional[List[Dict[str, Any]]] = None,
    classes: Optional[List[Dict[str, Any]]] = None,
    n_estimators: int = 200,
    n_clusters: int = 8,
    max_samples_per_class: int = 5000,
    max_train_dim: int = DEFAULT_MAX_TRAIN_DIM,
    output_dir: str = "/tmp/ic-segments",
) -> Dict[str, Any]:
    classifier = (classifier or "random_forest").lower()
    samples = samples or []
    classes = classes or []

    src_path = _resolve_raster_path(path_candidates)
    with rasterio.open(src_path) as dataset:
        out_h, out_w = _decimation_out_shape(dataset.width, dataset.height, max_train_dim)
        data, mask = _read_stack(dataset, out_h, out_w)  # (bands,H,W)
        band_count = data.shape[0]
        transform = _decimated_transform(dataset, out_w, out_h)

        if classifier == "kmeans":
            # Unsupervised: cluster valid pixels, no training samples required.
            valid = ~mask
            feats = data.reshape(band_count, -1).T[valid.reshape(-1)]
            if feats.shape[0] == 0:
                raise ValueError("No valid pixels to cluster.")
            cap = max_samples_per_class * max(2, int(n_clusters))
            if feats.shape[0] > cap:
                idx = np.random.default_rng(42).choice(feats.shape[0], cap, replace=False)
                feats = feats[idx]
            k = max(2, int(n_clusters))
            model = Pipeline([("scale", StandardScaler()), ("clf", KMeans(n_clusters=k, n_init=10, random_state=42))])
            model.fit(feats)
            labels = model.named_steps["clf"].labels_
            unique, counts = np.unique(labels, return_counts=True)
            class_counts = {int(u) + 1: int(c) for u, c in zip(unique, counts)}
            train_accuracy = None
            feature_importances = None
            n_training_pixels = int(feats.shape[0])
            class_value_offset = 1  # KMeans labels 0-based → shift to 1-based class values
        else:
            if classifier not in SUPERVISED_CLASSIFIERS:
                raise ValueError(f"Unknown classifier '{classifier}'.")
            if not samples:
                raise ValueError("Supervised training needs at least one training sample polygon.")

            shapes = []
            for sample in samples:
                geom = sample.get("geometry")
                value = int(sample.get("class_value", 0))
                if not geom or value <= 0:
                    continue
                if dataset.crs and str(dataset.crs).upper() not in ("EPSG:4326",):
                    try:
                        geom = transform_geom("EPSG:4326", dataset.crs, geom)
                    except Exception:
                        pass
                shapes.append((geom, value))
            if not shapes:
                raise ValueError("Training samples produced no usable geometry.")

            label_img = rasterize(
                shapes, out_shape=(out_h, out_w), transform=transform, fill=0, dtype="int32", all_touched=True
            )
            label_img[mask] = 0
            sample_mask = label_img > 0
            if not np.any(sample_mask):
                raise ValueError(
                    "Training polygons did not overlap the raster. Draw samples inside the image extent."
                )

            features = data.reshape(band_count, -1).T
            flat_labels = label_img.reshape(-1)
            pixel_index = np.where(flat_labels > 0)[0]

            # Balance / cap samples per class for tractable KNN/SVM fits.
            rng = np.random.default_rng(42)
            kept: List[int] = []
            for value in np.unique(flat_labels[pixel_index]):
                members = pixel_index[flat_labels[pixel_index] == value]
                if members.size > max_samples_per_class:
                    members = rng.choice(members, max_samples_per_class, replace=False)
                kept.extend(members.tolist())
            kept_arr = np.array(sorted(kept))
            X = features[kept_arr]
            y = flat_labels[kept_arr]

            if np.unique(y).size < 2:
                raise ValueError("Need training samples for at least two different classes.")

            model = _build_model(classifier, n_estimators)
            model.fit(X, y)
            try:
                train_accuracy = float(model.score(X, y))
            except Exception:
                train_accuracy = None

            unique, counts = np.unique(y, return_counts=True)
            class_counts = {int(u): int(c) for u, c in zip(unique, counts)}
            n_training_pixels = int(y.size)
            class_value_offset = 0

            feature_importances = None
            if classifier == "random_forest" and hasattr(model, "feature_importances_"):
                feature_importances = [round(float(v), 4) for v in model.feature_importances_]

        model_id = uuid.uuid4().hex
        bundle = {
            "model": model,
            "classifier": classifier,
            "band_count": band_count,
            "classes": classes,
            "class_value_offset": class_value_offset,
        }
        joblib.dump(bundle, _model_path(output_dir, raster_id, model_id))

    return {
        "model_id": model_id,
        "classifier": classifier,
        "band_count": band_count,
        "n_training_pixels": n_training_pixels,
        "class_counts": class_counts,
        "train_accuracy": train_accuracy,
        "feature_importances": feature_importances,
    }


def classify_raster(
    *,
    raster_id: str,
    path_candidates: List[Optional[str]],
    model_id: str,
    classes: Optional[List[Dict[str, Any]]] = None,
    max_preview_dim: int = DEFAULT_MAX_CLASSIFY_DIM,
    output_dir: str = "/tmp/ic-segments",
) -> Dict[str, Any]:
    model_file = _model_path(output_dir, raster_id, model_id)
    if not os.path.isfile(model_file):
        raise FileNotFoundError(f"Trained model {model_id} not found. Train a model first.")
    bundle = joblib.load(model_file)
    model = bundle["model"]
    band_count = int(bundle["band_count"])
    offset = int(bundle.get("class_value_offset", 0))
    class_defs = classes or bundle.get("classes") or []

    src_path = _resolve_raster_path(path_candidates)
    with rasterio.open(src_path) as dataset:
        out_h, out_w = _decimation_out_shape(dataset.width, dataset.height, max_preview_dim)
        data, mask = _read_stack(dataset, out_h, out_w)
        if data.shape[0] != band_count:
            raise ValueError(
                f"Raster band count ({data.shape[0]}) does not match the trained model ({band_count})."
            )
        transform = _decimated_transform(dataset, out_w, out_h)
        bounds = _wgs84_bounds(dataset)

        features = data.reshape(band_count, -1).T
        predicted = model.predict(features)
        labels = (predicted.astype("int32") + offset).reshape(out_h, out_w)
        labels[mask] = 0

        image_base64, distribution = _render_label_overlay(labels, class_defs)

        labeled_path = None
        try:
            dest_dir = os.path.join(output_dir, raster_id)
            os.makedirs(dest_dir, exist_ok=True)
            labeled_path = os.path.join(dest_dir, f"classified_{model_id}.tif")
            profile = {
                "driver": "GTiff",
                "height": out_h,
                "width": out_w,
                "count": 1,
                "dtype": "uint8",
                "crs": dataset.crs,
                "transform": transform,
                "compress": "deflate",
                "nodata": 0,
            }
            with rasterio.open(labeled_path, "w", **profile) as dst:
                dst.write(labels.astype("uint8"), 1)
        except Exception:
            labeled_path = None

    return {
        "model_id": model_id,
        "image_base64": image_base64,
        "bounds": bounds,
        "width": out_w,
        "height": out_h,
        "class_distribution": distribution,
        "labeled_raster_path": labeled_path,
    }


def assign_classes(
    *,
    raster_id: str,
    model_id: str,
    assignments: List[Dict[str, Any]],
    output_dir: str = "/tmp/ic-segments",
) -> Dict[str, Any]:
    """Remap classified (cluster) values to target classes and rewrite the labelled raster.

    ``assignments`` is a list of ``{"from": int, "to": int, "name": str, "color": str}``.
    Several ``from`` values pointing at the same ``to`` merges those clusters into one class.
    """
    labeled_path = os.path.join(output_dir, raster_id, f"classified_{model_id}.tif")
    if not os.path.isfile(labeled_path):
        raise FileNotFoundError("Run classification (Step 5) before assigning classes.")
    if not assignments:
        raise ValueError("No cluster assignments were provided.")

    remap: Dict[int, int] = {}
    target_defs: Dict[int, Dict[str, Any]] = {}
    for a in assignments:
        frm = int(a["from"])
        to = int(a["to"])
        remap[frm] = to
        target_defs[to] = {
            "class_value": to,
            "class_name": str(a.get("name") or f"Class {to}"),
            "color": a.get("color"),
        }

    with rasterio.open(labeled_path) as dataset:
        arr = dataset.read(1)
        profile = dataset.profile.copy()
        bounds = _wgs84_bounds(dataset)

    max_v = int(arr.max()) if arr.size else 0
    lut = np.arange(max_v + 1, dtype="int32")
    for frm, to in remap.items():
        if 0 <= frm <= max_v:
            lut[frm] = to
    remapped = lut[np.clip(arr, 0, max_v)].astype("int32")
    remapped[arr == 0] = 0

    profile.update(dtype="uint8", count=1, nodata=0, compress="deflate")
    with rasterio.open(labeled_path, "w", **profile) as dst:
        dst.write(remapped.astype("uint8"), 1)

    class_defs = list(target_defs.values())
    image_base64, distribution = _render_label_overlay(remapped, class_defs)
    height, width = remapped.shape

    return {
        "model_id": model_id,
        "image_base64": image_base64,
        "bounds": bounds,
        "width": width,
        "height": height,
        "class_distribution": distribution,
        "labeled_raster_path": labeled_path,
    }
