"""
SAM2 boundary refinement — Meta Segment Anything 2 microservice.

Refines SegFormer-B5 field instances with box (+ optional centroid) prompts.
Contract matches frontend sam2RefineClient + Node /api/sam2-refinement proxy:

  POST /refine  application/json
    {
      "image" | "imageDataUrl": "<data:image/png;base64,...>",
      "bbox": [west, south, east, north],
      "instances": [
        { "feature_id", "bbox_xyxy": [x0,y0,x1,y1], "centroid_xy": [cx,cy], "score"?: float }
      ],
      "coarse_geojson"?: FeatureCollection,
      "aoi"?: GeoJSON,
      "minConfidence"?: 0..1,
      "date"?: str, "provider"?: str
    }
  Response 200:
    {
      "geojson": FeatureCollection,
      "mask_png": "data:image/png;base64,...",
      "width", "height", "score", "count",
      "engine": "sam2", "model": "<id>", "device": "cuda"|"cpu"
    }
  GET /health → { status, engine, model, device, model_ready }
"""

from __future__ import annotations

import base64
import io
import math
import os
import threading
from datetime import datetime, timezone
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field

_DEFAULT_MODEL = "facebook/sam2-hiera-large"
MODEL_ID = os.environ.get("SAM2_MODEL_ID", _DEFAULT_MODEL).strip() or _DEFAULT_MODEL
# Smaller default for RAM-constrained hosts: facebook/sam2-hiera-base-plus
MAX_EDGE = int(os.environ.get("SAM2_MAX_EDGE", "1536"))
DEFAULT_MIN_CONFIDENCE = float(os.environ.get("SAM2_MIN_CONFIDENCE", "0.35"))
MIN_COMPONENT_PX = int(os.environ.get("SAM2_MIN_COMPONENT_PX", "48"))
MASK_RGB = (56, 189, 248)
USE_FP16 = os.environ.get("SAM2_USE_FP16", "1").strip() not in ("0", "false", "False")

app = FastAPI(title="SAM2 Boundary Refinement")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RefineInstance(BaseModel):
    feature_id: str | None = None
    featureId: str | None = None
    bbox_xyxy: list[float] | None = None
    bboxXyxy: list[float] | None = None
    centroid_xy: list[float] | None = None
    centroidXy: list[float] | None = None
    score: float | None = None
    coarse_mask_png: str | None = None
    coarseMaskPng: str | None = None

    def resolved_id(self, index: int) -> str:
        return (self.feature_id or self.featureId or "").strip() or f"SF-{index + 1:05d}"

    def resolved_box(self) -> list[float] | None:
        box = self.bbox_xyxy if self.bbox_xyxy is not None else self.bboxXyxy
        if not box or len(box) != 4:
            return None
        return [float(v) for v in box]

    def resolved_centroid(self) -> list[float] | None:
        c = self.centroid_xy if self.centroid_xy is not None else self.centroidXy
        if not c or len(c) != 2:
            return None
        return [float(c[0]), float(c[1])]


class RefineRequest(BaseModel):
    image: str | None = None
    imageDataUrl: str | None = None
    bbox: list[float]
    instances: list[RefineInstance] = Field(default_factory=list)
    coarse_geojson: dict | None = None
    coarseGeojson: dict | None = None
    aoi: dict | None = None
    minConfidence: float | None = None
    min_confidence: float | None = None
    date: str | None = None
    Date: str | None = None
    provider: str | None = None
    Provider: str | None = None
    simplify: float | None = None

    def resolved_image(self) -> str:
        raw = self.imageDataUrl or self.image
        if not raw or not str(raw).strip():
            raise ValueError("image (or imageDataUrl) is required.")
        return str(raw)

    def resolved_min_confidence(self) -> float:
        v = self.minConfidence if self.minConfidence is not None else self.min_confidence
        if v is None:
            return DEFAULT_MIN_CONFIDENCE
        return max(0.0, min(1.0, float(v)))

    def resolved_date(self) -> str:
        raw = (self.date or self.Date or "").strip()
        return raw or datetime.now(timezone.utc).isoformat()

    def resolved_provider(self) -> str:
        raw = (self.provider or self.Provider or "").strip()
        return raw or "sam2-refinement"

    def resolved_coarse_geojson(self) -> dict | None:
        return self.coarse_geojson if self.coarse_geojson is not None else self.coarseGeojson


class Sam2Engine:
    name = "sam2"

    def __init__(self) -> None:
        import torch

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.use_fp16 = bool(self.device == "cuda" and USE_FP16)
        self.predictor = None
        self.backend = "none"
        print(f"[sam2] loading {MODEL_ID} on {self.device}…", flush=True)

        # Prefer official sam2 package; fall back to transformers SAM2.
        try:
            self._init_sam2_package()
        except Exception as primary_exc:  # noqa: BLE001
            print(f"[sam2] sam2 package load failed ({primary_exc}); trying transformers…", flush=True)
            self._init_transformers()

        print(f"[sam2] ready (backend={self.backend}).", flush=True)

    def _init_sam2_package(self) -> None:
        import torch
        from sam2.build_sam import build_sam2
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        # Map HF id → local config / checkpoint names when using the sam2 repo.
        ckpt_map = {
            "facebook/sam2-hiera-large": ("configs/sam2/sam2_hiera_l.yaml", "sam2_hiera_large.pt"),
            "facebook/sam2-hiera-base-plus": (
                "configs/sam2/sam2_hiera_b+.yaml",
                "sam2_hiera_base_plus.pt",
            ),
            "facebook/sam2-hiera-small": ("configs/sam2/sam2_hiera_s.yaml", "sam2_hiera_small.pt"),
            "facebook/sam2-hiera-tiny": ("configs/sam2/sam2_hiera_t.yaml", "sam2_hiera_tiny.pt"),
        }
        # HuggingFace hub download via torch.hub / huggingface_hub when available.
        try:
            from huggingface_hub import hf_hub_download

            repo = MODEL_ID
            cfg, ckpt_name = ckpt_map.get(MODEL_ID, ckpt_map["facebook/sam2-hiera-large"])
            ckpt_path = hf_hub_download(repo_id=repo, filename=ckpt_name)
            model = build_sam2(cfg, ckpt_path, device=self.device)
            self.predictor = SAM2ImagePredictor(model)
            self.backend = "sam2"
            return
        except Exception:
            # Last resort: transformers path
            raise

    def _init_transformers(self) -> None:
        import torch
        from transformers import Sam2Model, Sam2Processor

        self.processor = Sam2Processor.from_pretrained(MODEL_ID)
        self.model = Sam2Model.from_pretrained(MODEL_ID)
        self.model.to(self.device)
        self.model.eval()
        self.backend = "transformers"
        self.predictor = "transformers"

    def set_image(self, rgb: np.ndarray) -> None:
        if self.backend == "sam2":
            self.predictor.set_image(rgb)
            self._rgb = rgb
        else:
            self._rgb = rgb

    def predict_box(
        self, box_xyxy: list[float], point_xy: list[float] | None = None
    ) -> tuple[np.ndarray, float]:
        import torch

        box = np.array(box_xyxy, dtype=np.float32)
        if self.backend == "sam2":
            with torch.inference_mode():
                kwargs: dict[str, Any] = {
                    "box": box[None, :],
                    "multimask_output": False,
                }
                if point_xy is not None:
                    kwargs["point_coords"] = np.array([[point_xy]], dtype=np.float32)
                    kwargs["point_labels"] = np.array([[1]], dtype=np.int32)
                if self.use_fp16 and self.device == "cuda":
                    with torch.cuda.amp.autocast():
                        masks, scores, _ = self.predictor.predict(**kwargs)
                else:
                    masks, scores, _ = self.predictor.predict(**kwargs)
            return masks[0].astype(bool), float(scores[0])

        # Transformers path
        pil = Image.fromarray(self._rgb)
        input_boxes = [[[float(box[0]), float(box[1]), float(box[2]), float(box[3])]]]
        inputs = self.processor(images=pil, input_boxes=input_boxes, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.inference_mode():
            outputs = self.model(**inputs)
        masks = self.processor.image_processor.post_process_masks(
            outputs.pred_masks.cpu(),
            inputs["original_sizes"].cpu(),
            inputs["reshaped_input_sizes"].cpu(),
        )[0]
        scores = outputs.iou_scores.cpu().numpy()[0]
        best = int(np.argmax(scores))
        mask = masks[0, best].numpy().astype(bool)
        return mask, float(scores[0, best] if scores.ndim > 1 else scores[best])


_engine: Sam2Engine | None = None
_engine_lock = threading.Lock()
_engine_error: str | None = None


def _get_engine() -> Sam2Engine:
    global _engine, _engine_error
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is not None:
            return _engine
        try:
            _engine = Sam2Engine()
            _engine_error = None
        except Exception as exc:  # noqa: BLE001
            _engine_error = str(exc)
            print(f"[sam2] failed to load model: {exc}", flush=True)
            raise
        return _engine


def _decode_image(data_url: str) -> Image.Image:
    raw = data_url.split(",", 1)[1] if "," in data_url and data_url.strip().startswith("data:") else data_url
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


def _meters_per_deg(lat: float) -> tuple[float, float]:
    lat_r = math.radians(lat)
    m_lat = 111_132.92 - 559.82 * math.cos(2 * lat_r) + 1.175 * math.cos(4 * lat_r)
    m_lon = 111_412.84 * math.cos(lat_r) - 93.5 * math.cos(3 * lat_r)
    return max(m_lon, 1.0), max(m_lat, 1.0)


def _pixel_to_lonlat(col: float, row: float, bbox, width: int, height: int) -> tuple[float, float]:
    west, south, east, north = (float(v) for v in bbox)
    lon = west + (col / max(width - 1, 1)) * (east - west)
    lat = north - (row / max(height - 1, 1)) * (north - south)
    return lon, lat


def _parse_aoi_geometry(aoi: dict | None):
    if not aoi or not isinstance(aoi, dict):
        return None
    from shapely.geometry import shape
    from shapely.ops import unary_union

    t = aoi.get("type")
    try:
        if t == "FeatureCollection":
            geoms = [shape(f.get("geometry")) for f in (aoi.get("features") or []) if isinstance(f, dict) and f.get("geometry")]
            return unary_union(geoms) if geoms else None
        if t == "Feature":
            g = aoi.get("geometry")
            return shape(g) if g else None
        if t in ("Polygon", "MultiPolygon", "GeometryCollection"):
            return shape(aoi)
    except Exception:  # noqa: BLE001
        return None
    return None


def _clean_mask_light(mask: np.ndarray) -> np.ndarray:
    """Light open only — preserve parcel edges for SAM2 refine (no heavy close / hull)."""
    u8 = (mask.astype(np.uint8) * 255)
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    u8 = cv2.morphologyEx(u8, cv2.MORPH_OPEN, k3, iterations=1)
    n, labels, stats, _ = cv2.connectedComponentsWithStats((u8 > 0).astype(np.uint8), connectivity=8)
    cleaned = np.zeros_like(u8)
    best_i, best_a = 0, 0
    for i in range(1, n):
        a = int(stats[i, cv2.CC_STAT_AREA])
        if a >= MIN_COMPONENT_PX and a > best_a:
            best_a = a
            best_i = i
    if best_i > 0:
        cleaned[labels == best_i] = 255
    return cleaned > 0


def _contour_to_polygon(contour: np.ndarray, bbox, width: int, height: int, simplify_deg: float | None):
    from shapely.geometry import Polygon
    from shapely.validation import make_valid

    if contour is None or len(contour) < 3:
        return None
    epsilon = max(0.8, 0.0015 * cv2.arcLength(contour, True))
    approx = cv2.approxPolyDP(contour, epsilon, True)
    if len(approx) < 3:
        return None
    coords = []
    for pt in approx.reshape(-1, 2):
        lon, lat = _pixel_to_lonlat(float(pt[0]), float(pt[1]), bbox, width, height)
        coords.append((lon, lat))
    if coords[0] != coords[-1]:
        coords.append(coords[0])
    try:
        poly = Polygon(coords)
    except Exception:  # noqa: BLE001
        return None
    poly = make_valid(poly)
    if poly.is_empty:
        return None
    if poly.geom_type == "MultiPolygon":
        poly = max(poly.geoms, key=lambda g: g.area)
    if poly.geom_type != "Polygon" or poly.area <= 0:
        return None
    west, south, east, north = (float(v) for v in bbox)
    if simplify_deg is None:
        diag = math.hypot(east - west, north - south)
        simplify_deg = max(diag * 0.001, 1e-7)
    poly = poly.simplify(float(simplify_deg), preserve_topology=True)
    if poly.is_empty or poly.area <= 0:
        return None
    return poly.buffer(0) if not poly.is_valid else poly


def _shape_metrics(poly, lat0: float) -> dict[str, float]:
    from shapely.geometry import Polygon

    m_lon, m_lat = _meters_per_deg(lat0)

    def to_m(x: float, y: float) -> tuple[float, float]:
        return (x * m_lon, y * m_lat)

    coords_m = [to_m(x, y) for x, y in poly.exterior.coords]
    poly_m = Polygon(coords_m)
    return {"area_m2": float(poly_m.area), "perimeter_m": float(poly_m.length)}


def _mask_to_png(mask: np.ndarray) -> str:
    h, w = mask.shape[:2]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[..., 0] = MASK_RGB[0]
    rgba[..., 1] = MASK_RGB[1]
    rgba[..., 2] = MASK_RGB[2]
    rgba[..., 3] = np.where(mask, 170, 0).astype(np.uint8)
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def _instances_from_coarse_geojson(fc: dict | None, bbox, width: int, height: int) -> list[RefineInstance]:
    """Derive pixel boxes from coarse B5 polygons when instances[] is empty."""
    if not fc or not isinstance(fc, dict):
        return []
    features = fc.get("features") or []
    west, south, east, north = (float(v) for v in bbox)
    out: list[RefineInstance] = []
    for i, f in enumerate(features):
        if not isinstance(f, dict):
            continue
        geom = f.get("geometry") or {}
        props = f.get("properties") or {}
        if geom.get("type") != "Polygon":
            continue
        rings = geom.get("coordinates") or []
        if not rings:
            continue
        xs, ys = [], []
        for lon, lat in rings[0]:
            col = (float(lon) - west) / max(east - west, 1e-12) * (width - 1)
            row = (north - float(lat)) / max(north - south, 1e-12) * (height - 1)
            xs.append(col)
            ys.append(row)
        if not xs:
            continue
        box = [min(xs), min(ys), max(xs), max(ys)]
        fid = str(props.get("Feature_ID") or props.get("objectId") or f.get("id") or f"SF-{i + 1:05d}")
        out.append(
            RefineInstance(
                feature_id=fid,
                bbox_xyxy=box,
                centroid_xy=[float(np.mean(xs)), float(np.mean(ys))],
                score=float(props.get("Confidence") or props.get("confidence") or 0.5),
            )
        )
    return out


def _scale_box(box: list[float], sx: float, sy: float) -> list[float]:
    return [box[0] * sx, box[1] * sy, box[2] * sx, box[3] * sy]


def _execute_refine(req: RefineRequest) -> dict:
    if len(req.bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north].")

    try:
        image = _decode_image(req.resolved_image())
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Could not decode image: {exc}") from exc

    orig_w, orig_h = image.size
    scale = min(1.0, MAX_EDGE / max(orig_w, orig_h))
    if scale < 1.0:
        work = image.resize(
            (max(1, round(orig_w * scale)), max(1, round(orig_h * scale))),
            Image.BILINEAR,
        )
    else:
        work = image
    rgb = np.asarray(work).copy()
    work_h, work_w = rgb.shape[:2]
    sx = work_w / max(orig_w, 1)
    sy = work_h / max(orig_h, 1)

    instances = list(req.instances or [])
    if not instances:
        instances = _instances_from_coarse_geojson(
            req.resolved_coarse_geojson(), req.bbox, orig_w, orig_h
        )
    if not instances:
        raise ValueError("Provide instances[] with bbox_xyxy, or coarse_geojson features.")

    min_conf = req.resolved_min_confidence()
    date_value = req.resolved_date()
    provider_value = req.resolved_provider()
    aoi_geom = _parse_aoi_geometry(req.aoi)
    lat0 = (float(req.bbox[1]) + float(req.bbox[3])) / 2.0

    engine = _get_engine()
    engine.set_image(rgb)

    from shapely.geometry import mapping
    from shapely.validation import make_valid

    combined = np.zeros((orig_h, orig_w), dtype=bool)
    features: list[dict[str, Any]] = []
    scores: list[float] = []

    for idx, inst in enumerate(instances):
        box = inst.resolved_box()
        if not box:
            continue
        work_box = _scale_box(box, sx, sy)
        # Clamp to work canvas.
        work_box = [
            max(0, min(work_w - 1, work_box[0])),
            max(0, min(work_h - 1, work_box[1])),
            max(0, min(work_w - 1, work_box[2])),
            max(0, min(work_h - 1, work_box[3])),
        ]
        if work_box[2] <= work_box[0] or work_box[3] <= work_box[1]:
            continue
        centroid = inst.resolved_centroid()
        work_pt = None
        if centroid:
            work_pt = [centroid[0] * sx, centroid[1] * sy]

        try:
            mask_work, score = engine.predict_box(work_box, work_pt)
        except Exception as exc:  # noqa: BLE001
            print(f"[sam2] instance {idx} failed: {exc}", flush=True)
            continue

        if score < min_conf:
            continue

        # Upscale mask to original capture.
        if scale < 1.0:
            mask_img = Image.fromarray((mask_work.astype(np.uint8) * 255)).resize(
                (orig_w, orig_h), Image.NEAREST
            )
            mask = np.asarray(mask_img) > 127
        else:
            mask = mask_work.astype(bool)

        mask = _clean_mask_light(mask)
        if not mask.any():
            continue

        u8 = (mask.astype(np.uint8) * 255)
        found = cv2.findContours(u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = found[0] if len(found) == 2 else found[1]
        if not contours:
            continue
        contour = max(contours, key=cv2.contourArea)
        poly = _contour_to_polygon(contour, req.bbox, orig_w, orig_h, req.simplify)
        if poly is None:
            continue
        if aoi_geom is not None:
            try:
                aoi = make_valid(aoi_geom)
                if poly.intersects(aoi):
                    inter = poly.intersection(aoi)
                    if not inter.is_empty:
                        if inter.geom_type == "MultiPolygon":
                            inter = max(inter.geoms, key=lambda g: g.area)
                        if inter.geom_type == "Polygon" and inter.area > 0:
                            poly = inter
            except Exception:  # noqa: BLE001
                pass

        metrics = _shape_metrics(poly, lat0)
        if metrics["area_m2"] <= 0:
            continue

        object_id = inst.resolved_id(idx)
        props = {
            "Feature_ID": object_id,
            "Class_Name": "Agricultural Field",
            "Confidence": round(float(score), 4),
            "Area_m2": round(metrics["area_m2"], 2),
            "Area_Hectare": round(metrics["area_m2"] / 10_000.0, 6),
            "Perimeter": round(metrics["perimeter_m"], 2),
            "Date": date_value,
            "Provider": provider_value,
            "objectId": object_id,
            "object_id": object_id,
            "className": "Agricultural Field",
            "class_name": "Agricultural Field",
            "classId": 1,
            "class_id": 1,
            "confidence": round(float(score), 4),
            "areaM2": round(metrics["area_m2"], 2),
            "area_m2": round(metrics["area_m2"], 2),
            "areaHa": round(metrics["area_m2"] / 10_000.0, 6),
            "area_ha": round(metrics["area_m2"] / 10_000.0, 6),
            "perimeterM": round(metrics["perimeter_m"], 2),
            "perimeter_m": round(metrics["perimeter_m"], 2),
            "date": date_value,
            "provider": provider_value,
            "source": "sam2-refinement",
            "crs": "EPSG:4326",
        }
        features.append(
            {
                "type": "Feature",
                "id": object_id,
                "geometry": mapping(poly),
                "properties": props,
            }
        )
        scores.append(float(score))
        combined = np.logical_or(combined, mask)

    mean_score = float(np.mean(scores)) if scores else 0.0
    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "mask_png": _mask_to_png(combined),
        "width": orig_w,
        "height": orig_h,
        "score": mean_score,
        "count": len(features),
        "engine": "sam2",
        "model": MODEL_ID,
        "device": engine.device,
        "backend": engine.backend,
        "aoi_applied": aoi_geom is not None,
        "aoiApplied": aoi_geom is not None,
    }


def _probe_device() -> str:
    if _engine is not None:
        return _engine.device
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:  # noqa: BLE001
        return "unknown"


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if _engine_error is None else "degraded",
        "engine": "sam2",
        "model": MODEL_ID,
        "device": _probe_device(),
        "model_ready": _engine is not None,
        "error": _engine_error,
        "port_default": 8096,
    }


@app.on_event("startup")
def _warm_model() -> None:
    def _load() -> None:
        try:
            _get_engine()
        except Exception:  # noqa: BLE001
            pass

    threading.Thread(target=_load, name="sam2-warmup", daemon=True).start()


@app.post("/refine")
def refine(req: RefineRequest):
    try:
        return _execute_refine(req)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc), "detail": str(exc)})
    except Exception as exc:  # noqa: BLE001
        print(f"[sam2] refine failed: {exc}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(exc), "detail": str(exc)})
