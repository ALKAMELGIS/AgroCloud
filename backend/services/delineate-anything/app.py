"""
Delineate Anything — field-boundary instance segmentation microservice.

Wraps Ultralytics YOLO weights from Hugging Face (MykolaL/DelineateAnything):
  - DelineateAnything.pt     → trained on FBIS-22M lineage (v1)
  - DelineateAnythingv2.pt   → trained on FBIS-73M (v2, default for accuracy)

AgroCloud Training & AI Infer posts an RGB mosaic + WGS84 bbox; this service
returns georeferenced field polygons as GeoJSON.

Default listen: http://127.0.0.1:8096
"""

from __future__ import annotations

import io
import math
import os
import threading
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

DEFAULT_IMGSZ = int(os.environ.get("DELINEATE_IMG_SIZE", "1024"))
DEFAULT_CONF = float(os.environ.get("DELINEATE_CONF", "0.25"))
DEFAULT_IOU = float(os.environ.get("DELINEATE_IOU", "0.45"))
# large = DelineateAnything.pt (FBIS-22M), large_v2 = DelineateAnythingv2.pt (FBIS-73M)
DEFAULT_MODEL = os.environ.get("DELINEATE_MODEL", "v2").strip().lower()
HF_REPO = os.environ.get("DELINEATE_HF_REPO", "MykolaL/DelineateAnything")
MIN_AREA_PX = int(os.environ.get("DELINEATE_MIN_AREA_PX", "80"))
SIMPLIFY_EPS = float(os.environ.get("DELINEATE_SIMPLIFY_EPS", "1.5"))

MODELS = {
    "small": "DelineateAnything-S.pt",
    "large": "DelineateAnything.pt",  # FBIS-22M foundation model
    "large_v2": "DelineateAnythingv2.pt",  # FBIS-73M / v2
    "fbis22m": "DelineateAnything.pt",
    "fbis73m": "DelineateAnythingv2.pt",
    "v1": "DelineateAnything.pt",
    "v2": "DelineateAnythingv2.pt",
}

app = FastAPI(title="Delineate Anything Field Boundaries", version="1.0.0")

_model_lock = threading.Lock()
_model_cache: dict[str, Any] = {}


def _resolve_weights(model_key: str) -> tuple[str, str]:
    key = (model_key or DEFAULT_MODEL).strip().lower()
    if key not in MODELS:
        if os.path.isfile(model_key):
            return model_key, os.path.basename(model_key)
        key = DEFAULT_MODEL if DEFAULT_MODEL in MODELS else "large"
    filename = MODELS[key]
    override = os.environ.get("DELINEATE_MODEL_PATH", "").strip()
    if override and os.path.isfile(override):
        return override, os.path.basename(override)
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(repo_id=HF_REPO, filename=filename)
    return path, filename


def _get_model(model_key: str):
    key = (model_key or DEFAULT_MODEL).strip().lower()
    with _model_lock:
        if key in _model_cache:
            return _model_cache[key]
        from ultralytics import YOLO

        path, filename = _resolve_weights(key)
        model = YOLO(path)
        _model_cache[key] = {
            "model": model,
            "path": path,
            "filename": filename,
            "key": key,
        }
        return _model_cache[key]


def _px_to_lonlat(
    x: float,
    y: float,
    width: int,
    height: int,
    west: float,
    south: float,
    east: float,
    north: float,
) -> list[float]:
    lon = west + (x / max(width - 1, 1)) * (east - west)
    lat = north - (y / max(height - 1, 1)) * (north - south)
    return [lon, lat]


def _mask_to_polygons(mask: np.ndarray, simplify_eps: float) -> list[np.ndarray]:
    """Binary mask (H,W) uint8 0/255 → list of exterior rings as Nx2 float arrays (x,y)."""
    if mask.dtype != np.uint8:
        mask_u8 = (mask > 0).astype(np.uint8) * 255
    else:
        mask_u8 = mask
    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    rings: list[np.ndarray] = []
    for cnt in contours:
        area = float(cv2.contourArea(cnt))
        if area < MIN_AREA_PX:
            continue
        if simplify_eps > 0:
            cnt = cv2.approxPolyDP(cnt, simplify_eps, True)
        if cnt is None or len(cnt) < 3:
            continue
        pts = cnt.reshape(-1, 2).astype(np.float64)
        # Close ring
        if not np.allclose(pts[0], pts[-1]):
            pts = np.vstack([pts, pts[0]])
        rings.append(pts)
    return rings


def _ring_area_m2(coords: list[list[float]]) -> float:
    """Shoelace on lon/lat approximating m² near mid-latitude."""
    if len(coords) < 4:
        return 0.0
    mid_lat = sum(c[1] for c in coords[:-1]) / max(len(coords) - 1, 1)
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * max(math.cos(math.radians(mid_lat)), 1e-6)
    xs = [(c[0] - coords[0][0]) * m_per_deg_lon for c in coords]
    ys = [(c[1] - coords[0][1]) * m_per_deg_lat for c in coords]
    area = 0.0
    for i in range(len(xs) - 1):
        area += xs[i] * ys[i + 1] - xs[i + 1] * ys[i]
    return abs(area) * 0.5


def _predict_geojson(
    image: Image.Image,
    *,
    model_key: str,
    conf: float,
    imgsz: int,
    iou: float,
    bbox: tuple[float, float, float, float] | None,
    min_area_m2: float,
) -> dict[str, Any]:
    packed = _get_model(model_key)
    model = packed["model"]
    width, height = image.size
    conf_use = float(max(0.08, min(0.9, conf)))
    imgsz_use = int(imgsz) if imgsz else DEFAULT_IMGSZ
    imgsz_use = max(640, min(1280, imgsz_use))

    results = model.predict(
        source=image,
        conf=conf_use,
        imgsz=imgsz_use,
        iou=float(iou),
        verbose=False,
        retina_masks=True,
        max_det=300,
    )
    # Some Ultralytics builds return empty with retina_masks on CPU — retry once.
    empty = True
    for result in results:
        if getattr(result, "masks", None) is not None and getattr(result.masks, "data", None) is not None:
            if len(result.masks) > 0:
                empty = False
                break
        if getattr(result, "boxes", None) is not None and len(result.boxes) > 0:
            empty = False
            break
    if empty:
        results = model.predict(
            source=image,
            conf=conf_use,
            imgsz=imgsz_use,
            iou=float(iou),
            verbose=False,
            retina_masks=False,
            max_det=300,
        )

    features: list[dict[str, Any]] = []
    field_id = 0
    for result in results:
        masks = getattr(result, "masks", None)
        boxes = getattr(result, "boxes", None)

        # Prefer vector polygons from Ultralytics (xy) — denser / less filter loss.
        xy_list = getattr(masks, "xy", None) if masks is not None else None
        if xy_list is not None and len(xy_list) > 0:
            for i, poly in enumerate(xy_list):
                if poly is None or len(poly) < 3:
                    continue
                conf_v = float(conf_use)
                if boxes is not None and i < len(boxes):
                    try:
                        conf_v = float(boxes.conf[i].item())
                    except Exception:  # noqa: BLE001
                        pass
                pts = np.asarray(poly, dtype=np.float64)
                if pts.ndim != 2 or pts.shape[0] < 3:
                    continue
                if not np.allclose(pts[0], pts[-1]):
                    pts = np.vstack([pts, pts[0]])
                feats = _feature_from_ring(
                    pts, width, height, bbox, conf_v, min_area_m2, field_id + 1
                )
                if feats:
                    features.extend(feats)
                    field_id = len(features)
            if features:
                continue

        if masks is None or getattr(masks, "data", None) is None:
            # Detection-only fallback: axis-aligned boxes as rectangles
            if boxes is None:
                continue
            for box in boxes:
                conf_v = float(box.conf[0].item()) if box.conf is not None else float(conf_use)
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
                ring_px = np.array(
                    [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]], dtype=np.float64
                )
                features.extend(
                    _feature_from_ring(
                        ring_px,
                        width,
                        height,
                        bbox,
                        conf_v,
                        min_area_m2,
                        field_id + 1,
                    )
                )
                field_id = len(features)
            continue

        mask_data = masks.data.cpu().numpy()  # (N, Hm, Wm)
        for i in range(mask_data.shape[0]):
            m = mask_data[i]
            if m.shape[0] != height or m.shape[1] != width:
                m = cv2.resize(m.astype(np.float32), (width, height), interpolation=cv2.INTER_LINEAR)
            conf_v = float(conf_use)
            if boxes is not None and i < len(boxes):
                try:
                    conf_v = float(boxes.conf[i].item())
                except Exception:  # noqa: BLE001
                    pass
            for ring_px in _mask_to_polygons((m > 0.45).astype(np.uint8) * 255, SIMPLIFY_EPS):
                feats = _feature_from_ring(
                    ring_px, width, height, bbox, conf_v, min_area_m2, field_id + 1
                )
                if feats:
                    features.extend(feats)
                    field_id = len(features)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def _predict_with_fallbacks(
    image: Image.Image,
    *,
    model_key: str,
    conf: float,
    imgsz: int,
    iou: float,
    bbox: tuple[float, float, float, float] | None,
    min_area_m2: float,
) -> tuple[dict[str, Any], str, Any]:
    """
    Run prediction with model / confidence fallbacks.
    DelineateAnything.pt (v1 large) often yields 0 detections under current Ultralytics;
    S and v2 are reliable — cascade when empty.
    """
    primary = (model_key or DEFAULT_MODEL).strip().lower()
    # Cascade order depends on requested lineage.
    if primary in ("fbis22m", "large", "v1"):
        chain = [primary, "small", "v2"]
    elif primary in ("fbis73m", "large_v2", "v2"):
        chain = [primary, "small", "large"]
    elif primary == "small":
        chain = ["small", "v2", "large"]
    else:
        chain = [primary, "v2", "small"]

    # Deduplicate while preserving order
    seen: set[str] = set()
    models: list[str] = []
    for m in chain:
        if m not in seen:
            seen.add(m)
            models.append(m)

    confs = [float(conf), min(float(conf), 0.2), 0.12, 0.08]
    conf_seen: set[float] = set()
    conf_list: list[float] = []
    for c in confs:
        c2 = round(max(0.08, min(0.9, c)), 3)
        if c2 not in conf_seen:
            conf_seen.add(c2)
            conf_list.append(c2)

    last_fc: dict[str, Any] = {"type": "FeatureCollection", "features": []}
    last_packed: Any = None
    last_key = models[0]
    area_floors = [float(min_area_m2), min(float(min_area_m2), 25.0), 10.0, 0.0]
    area_seen: set[float] = set()
    area_list: list[float] = []
    for a in area_floors:
        a2 = max(0.0, float(a))
        if a2 not in area_seen:
            area_seen.add(a2)
            area_list.append(a2)

    for mk in models:
        packed = _get_model(mk)
        last_packed = packed
        last_key = mk
        for c in conf_list:
            for area_floor in area_list:
                fc = _predict_geojson(
                    image,
                    model_key=mk,
                    conf=c,
                    imgsz=imgsz,
                    iou=iou,
                    bbox=bbox,
                    min_area_m2=area_floor,
                )
                last_fc = fc
                if len(fc.get("features") or []) > 0:
                    return fc, mk, packed
    return last_fc, last_key, last_packed or _get_model(last_key)


def _feature_from_ring(
    ring_px: np.ndarray,
    width: int,
    height: int,
    bbox: tuple[float, float, float, float] | None,
    conf: float,
    min_area_m2: float,
    field_id: int,
) -> list[dict[str, Any]]:
    if bbox is None:
        # Return pixel-space polygon (rarely used by UI)
        coords = [[float(x), float(y)] for x, y in ring_px]
        geom = {"type": "Polygon", "coordinates": [coords]}
        return [
            {
                "type": "Feature",
                "properties": {
                    "field_id": field_id,
                    "class_name": "Field",
                    "confidence": conf,
                    "source": "delineate-anything",
                    "crs": "pixel",
                },
                "geometry": geom,
            }
        ]

    west, south, east, north = bbox
    coords = [_px_to_lonlat(float(x), float(y), width, height, west, south, east, north) for x, y in ring_px]
    if len(coords) < 4:
        return []
    area = _ring_area_m2(coords)
    if min_area_m2 > 0 and area < min_area_m2:
        return []
    return [
        {
            "type": "Feature",
            "properties": {
                "field_id": field_id,
                "class_name": "Field",
                "label": "Agricultural field",
                "confidence": round(conf, 4),
                "area_m2": round(area, 2),
                "area_ha": round(area / 10_000.0, 4),
                "fill_color": "#eab308",
                "color": "#eab308",
                "stroke_color": "#0a0a0a",
                "source": "delineate-anything",
                "output_type": "fields_fbis",
            },
            "geometry": {"type": "Polygon", "coordinates": [coords]},
        }
    ]


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "delineate-anything",
        "default_model": DEFAULT_MODEL,
        "models": list(MODELS.keys()),
        "loaded": list(_model_cache.keys()),
    }


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    conf: float = Form(DEFAULT_CONF),
    imgsz: int = Form(DEFAULT_IMGSZ),
    iou: float = Form(DEFAULT_IOU),
    model: str = Form(DEFAULT_MODEL),
    west: float | None = Form(None),
    south: float | None = Form(None),
    east: float | None = Form(None),
    north: float | None = Form(None),
    min_area_m2: float = Form(80.0),
):
    try:
        raw = await file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": f"Could not decode image: {exc}"})

    bbox = None
    if None not in (west, south, east, north):
        bbox = (float(west), float(south), float(east), float(north))

    try:
        geojson, used_key, packed = _predict_with_fallbacks(
            image,
            model_key=model,
            conf=float(conf),
            imgsz=int(imgsz) if imgsz else DEFAULT_IMGSZ,
            iou=float(iou),
            bbox=bbox,
            min_area_m2=float(min_area_m2 or 0),
        )
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=500,
            content={"error": f"Delineate Anything inference failed: {exc}"},
        )

    count = len(geojson.get("features") or [])
    return {
        "geojson": geojson,
        "count": count,
        "engine": "delineate-anything",
        "model": packed.get("filename") or used_key,
        "model_key": used_key,
        "requested_model": model,
        "device": "cuda" if _cuda_available() else "cpu",
        "stats": {"field": count},
        "aoiApplied": False,
        "score": float(conf),
    }


def _cuda_available() -> bool:
    try:
        import torch

        return bool(torch.cuda.is_available())
    except Exception:  # noqa: BLE001
        return False


@app.on_event("startup")
def _warmup() -> None:
    """Optionally preload weights (skip when DELINEATE_SKIP_WARMUP=1)."""
    if os.environ.get("DELINEATE_SKIP_WARMUP", "").strip() in ("1", "true", "yes"):
        return
    try:
        _get_model(DEFAULT_MODEL)
    except Exception as exc:  # noqa: BLE001
        # Keep service up — first /predict will surface a clear error.
        print(f"[delineate-anything] warmup skipped: {exc}")
