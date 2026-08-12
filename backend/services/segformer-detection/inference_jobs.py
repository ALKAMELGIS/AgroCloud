"""Async inference jobs for fine-tuned SegFormer checkpoints (PyTorch + ONNX hook)."""

from __future__ import annotations

import base64
import io
import json
import re
import threading
import time
import uuid
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from finetune_segformer import MODEL_DIR, _decode_image, training_deps_status

_JOBS: dict[str, dict[str, Any]] = {}
_LOCK = threading.Lock()

SUPPORTED_OUTPUT_TYPES = {"segmentation", "classification", "object_detection"}


def _set(job_id: str, **fields: Any) -> None:
    with _LOCK:
        cur = _JOBS.get(job_id) or {}
        cur.update(fields)
        cur["updated_at"] = time.time()
        _JOBS[job_id] = cur


def get_job(job_id: str) -> dict[str, Any] | None:
    with _LOCK:
        j = _JOBS.get(job_id)
        return dict(j) if j else None


def onnx_available() -> bool:
    try:
        import onnxruntime  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False


def _px_to_lonlat(
    x: float,
    y: float,
    bbox: list[float],
    width: int,
    height: int,
) -> list[float]:
    west, south, east, north = bbox
    lon = west + (x / max(width - 1, 1)) * (east - west)
    lat = north - (y / max(height - 1, 1)) * (north - south)
    return [lon, lat]


def _extent_polygon(bbox: list[float]) -> dict[str, Any]:
    west, south, east, north = bbox
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
            ]
        ],
    }


def _mask_png(
    pred: np.ndarray,
    class_names: list[str],
    colors: dict[int, str] | None = None,
) -> str:
    h, w = pred.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    palette = [
        (13, 148, 136),
        (37, 99, 235),
        (180, 83, 9),
        (22, 163, 74),
        (202, 138, 4),
        (100, 116, 139),
        (147, 51, 234),
    ]

    def _parse_hex(c: str, fallback: tuple[int, int, int]) -> tuple[int, int, int]:
        s = (c or "").strip().lstrip("#")
        if len(s) == 6:
            try:
                return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
            except Exception:  # noqa: BLE001
                return fallback
        return fallback

    for cls_idx in range(len(class_names)):
        fallback = palette[cls_idx % len(palette)]
        color = _parse_hex((colors or {}).get(cls_idx, ""), fallback)
        m = pred == cls_idx
        rgba[m, 0] = color[0]
        rgba[m, 1] = color[1]
        rgba[m, 2] = color[2]
        rgba[m, 3] = 160
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _contour_features(
    pred: np.ndarray,
    conf_map: np.ndarray | None,
    bbox: list[float],
    class_names: list[str],
    confidence: float,
    colors: dict[int, str] | None,
    *,
    as_instances: bool,
    min_area_px: float = 20.0,
) -> tuple[list[dict[str, Any]], str]:
    """Build polygon features from class contours (segmentation / object detection)."""
    h, w = pred.shape
    features: list[dict[str, Any]] = []
    primary = class_names[0] if class_names else "Result"
    max_count = 0
    instance_id = 0

    for cls_idx, name in enumerate(class_names):
        binary = (pred == cls_idx).astype(np.uint8) * 255
        if not np.any(binary):
            continue
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        count = 0
        for cnt in contours:
            area = float(cv2.contourArea(cnt))
            if area < min_area_px:
                continue
            ring = []
            for pt in cnt.reshape(-1, 2):
                ring.append(_px_to_lonlat(float(pt[0]), float(pt[1]), bbox, w, h))
            if len(ring) < 3:
                continue
            if ring[0] != ring[-1]:
                ring.append(ring[0])

            # Mean confidence inside contour bbox (fast approx)
            feat_conf = confidence
            if conf_map is not None:
                x, y, bw, bh = cv2.boundingRect(cnt)
                patch = conf_map[y : y + bh, x : x + bw]
                mask = binary[y : y + bh, x : x + bw] > 0
                if np.any(mask):
                    feat_conf = float(np.mean(patch[mask]))

            instance_id += 1
            props: dict[str, Any] = {
                "class_id": cls_idx + 1,
                "class_name": name,
                "confidence": round(feat_conf, 4),
                "color": (colors or {}).get(cls_idx, "#22c55e"),
                "area_px": round(area, 1),
                "output_type": "object_detection" if as_instances else "segmentation",
            }
            if as_instances:
                props["instance_id"] = instance_id
                x, y, bw, bh = cv2.boundingRect(cnt)
                props["bbox_px"] = [int(x), int(y), int(bw), int(bh)]

            features.append(
                {
                    "type": "Feature",
                    "properties": props,
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                }
            )
            count += 1
        if count > max_count:
            max_count = count
            primary = name

    return features, primary


def _classification_features(
    pred: np.ndarray,
    conf_map: np.ndarray | None,
    bbox: list[float],
    class_names: list[str],
    confidence: float,
    colors: dict[int, str] | None,
) -> tuple[list[dict[str, Any]], str]:
    """Scene-level classification: one extent polygon labeled with majority class."""
    valid = pred >= 0
    if not np.any(valid):
        return [], class_names[0] if class_names else "Result"

    counts: dict[int, int] = {}
    for cls_idx in range(len(class_names)):
        counts[cls_idx] = int(np.sum(pred == cls_idx))
    total = int(sum(counts.values())) or 1
    winner = max(counts.items(), key=lambda kv: kv[1])[0]
    mean_conf = float(np.mean(conf_map[valid])) if conf_map is not None else confidence

    breakdown = [
        {
            "class_id": i + 1,
            "class_name": class_names[i],
            "pixel_count": counts.get(i, 0),
            "coverage_pct": round(100.0 * counts.get(i, 0) / total, 2),
        }
        for i in range(len(class_names))
        if counts.get(i, 0) > 0
    ]
    breakdown.sort(key=lambda r: r["coverage_pct"], reverse=True)

    primary = class_names[winner] if winner < len(class_names) else "Result"
    feature = {
        "type": "Feature",
        "properties": {
            "class_id": winner + 1,
            "class_name": primary,
            "confidence": round(mean_conf, 4),
            "color": (colors or {}).get(winner, "#22c55e"),
            "output_type": "classification",
            "coverage_pct": round(100.0 * counts.get(winner, 0) / total, 2),
            "class_breakdown": breakdown,
            "label": f"{primary} ({round(100.0 * counts.get(winner, 0) / total, 1)}%)",
        },
        "geometry": _extent_polygon(bbox),
    }
    return [feature], primary


def _vectorize(
    pred: np.ndarray,
    conf_map: np.ndarray | None,
    bbox: list[float],
    class_names: list[str],
    confidence: float,
    colors: dict[int, str] | None,
    output_type: str,
) -> tuple[dict[str, Any], str, str]:
    mode = (output_type or "segmentation").strip().lower()
    if mode == "classification":
        features, primary = _classification_features(
            pred, conf_map, bbox, class_names, confidence, colors
        )
    elif mode == "object_detection":
        # Trees from point samples are small; keep a low area filter for OD instances.
        features, primary = _contour_features(
            pred,
            conf_map,
            bbox,
            class_names,
            confidence,
            colors,
            as_instances=True,
            min_area_px=8.0,
        )
        # Prefer Tree / Field-like blobs in naming when present.
        treeish = [
            f
            for f in features
            if re.search(r"tree|crown|vegetation", str((f.get("properties") or {}).get("class_name") or ""), re.I)
        ]
        if treeish:
            primary = str((treeish[0].get("properties") or {}).get("class_name") or primary)
    else:
        features, primary = _contour_features(
            pred,
            conf_map,
            bbox,
            class_names,
            confidence,
            colors,
            as_instances=False,
        )

    return (
        {"type": "FeatureCollection", "features": features},
        _mask_png(pred, class_names, colors),
        primary,
    )


def _run_inference(payload: dict[str, Any], progress: callable) -> dict[str, Any]:
    ok, err = training_deps_status()
    if not ok:
        raise RuntimeError(err or "Inference dependencies unavailable")

    import torch
    from transformers import SegformerForSemanticSegmentation, SegformerImageProcessor

    model_id = str(payload.get("model_id") or "").strip()
    if not model_id:
        raise ValueError("model_id is required")
    model_dir = MODEL_DIR / model_id
    if not model_dir.is_dir():
        raise FileNotFoundError(f"Trained model not found: {model_id}")

    meta_path = model_dir / "training_meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.is_file() else {}
    class_names = list(meta.get("class_names") or ["class_0"])
    output_type = str(payload.get("output_type") or "segmentation").strip().lower()
    if output_type not in SUPPORTED_OUTPUT_TYPES:
        raise ValueError(
            f"Unsupported output_type '{output_type}'. Use one of: {', '.join(sorted(SUPPORTED_OUTPUT_TYPES))}."
        )

    image = str(payload.get("imageDataUrl") or payload.get("image_data_url") or "")
    bbox = [float(x) for x in (payload.get("bbox") or [])]
    if len(bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north]")
    confidence = float(payload.get("confidence") or 0.7)

    progress(status="running", stage="loading_model", progress=10.0)
    rgb = _decode_image(image)
    h, w = rgb.shape[:2]

    onnx_file = model_dir / "model.onnx"
    use_onnx = onnx_file.is_file() and onnx_available() and os_flag_use_onnx()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if use_onnx:
        progress(status="running", stage="onnx_infer", progress=40.0)
        import onnxruntime as ort

        sess = ort.InferenceSession(str(onnx_file), providers=["CPUExecutionProvider"])
        processor = SegformerImageProcessor.from_pretrained(str(model_dir))
        enc = processor(images=rgb, return_tensors="np")
        logits = sess.run(None, {"pixel_values": enc["pixel_values"]})[0]
        logits_t = torch.from_numpy(logits)
    else:
        progress(status="running", stage="pytorch_infer", progress=40.0)
        processor = SegformerImageProcessor.from_pretrained(str(model_dir))
        model = SegformerForSemanticSegmentation.from_pretrained(str(model_dir))
        model.to(device)
        model.eval()
        enc = processor(images=rgb, return_tensors="pt")
        with torch.no_grad():
            out = model(pixel_values=enc["pixel_values"].to(device))
            logits_t = out.logits.cpu()

    up = torch.nn.functional.interpolate(
        logits_t,
        size=(h, w),
        mode="bilinear",
        align_corners=False,
    )
    probs = torch.softmax(up, dim=1)[0]
    conf_t, pred_t = probs.max(dim=0)
    conf_map = conf_t.numpy().astype(np.float32)
    pred_np = pred_t.numpy().astype(np.int32)
    pred_np[conf_map < confidence] = -1

    progress(status="running", stage="vectorize", progress=75.0)
    colors: dict[int, str] = {}
    for i, c in enumerate(payload.get("classes") or meta.get("classes") or []):
        try:
            colors[i] = str(c.get("color") or "#22c55e")
        except Exception:  # noqa: BLE001
            pass

    vector_mask = np.where(pred_np < 0, -1, pred_np).astype(np.int32)
    geojson, mask_png, primary = _vectorize(
        vector_mask,
        conf_map,
        bbox,
        class_names,
        confidence,
        colors,
        output_type,
    )

    res_x = (bbox[2] - bbox[0]) / max(w, 1)
    res_y = (bbox[3] - bbox[1]) / max(h, 1)
    transform = [bbox[0], res_x, 0, bbox[3], 0, -res_y]

    return {
        "status": "done",
        "progress": 100.0,
        "stage": "done",
        "error": None,
        "result": {
            "geojson": geojson,
            "mask_png": mask_png,
            "crs": "EPSG:4326",
            "bounds": bbox,
            "transform": transform,
            "resolution": [res_x, res_y],
            "model_id": model_id,
            "class_names": class_names,
            "primary_class": primary,
            "output_type": output_type,
            "count": len(geojson.get("features") or []),
        },
    }


def os_flag_use_onnx() -> bool:
    return str(__import__("os").environ.get("SEGFORMER_INFER_ONNX", "0")).strip() in (
        "1",
        "true",
        "yes",
    )


def start_inference_job(payload: dict[str, Any]) -> str:
    job_id = uuid.uuid4().hex
    _set(job_id, status="queued", progress=0.0, stage="queued", error=None, result=None)

    def runner() -> None:
        def progress(**fields: Any) -> None:
            _set(job_id, **fields)

        try:
            result = _run_inference(payload, progress)
            _set(job_id, **result)
        except Exception as exc:  # noqa: BLE001
            _set(
                job_id,
                status="error",
                progress=100.0,
                stage="error",
                error=f"{type(exc).__name__}: {exc}",
                result=None,
            )

    threading.Thread(target=runner, name=f"tai-infer-{job_id[:8]}", daemon=True).start()
    return job_id
