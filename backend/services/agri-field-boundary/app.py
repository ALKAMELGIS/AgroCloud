"""
Agri Field Boundary Detection — Mask R-CNN instance segmentation microservice.

Inspired by OpenGeoAI field boundary delineation
(https://opengeoai.org/examples/field_boundary_detection.ipynb):

  POST /detect       sync inference
  POST /detect-job   async job → poll GET /detect-job/{id}
  GET  /health
  GET  /health/live
  GET  /health/ready
  GET  /api/sentinel2/super-resolution/status
  POST /api/sentinel2/super-resolution

Input (JSON):
  {
    "image": "<data URL or base64>",
    "bbox": [west, south, east, north],
    "aoi": <GeoJSON optional>,
    "min_confidence": 0.45,
    "min_area_m2": 200,
    "source": "sentinel2" | "landsat" | "planet" | "airbus" | "drone" | "geotiff" | "png" | "jpeg"
             | "basemap" | "delineate-fbis" | "agricultural-field-delineation",
    "high_res": true
  }

Response:
  GeoJSON FeatureCollection of field polygons with field_id, confidence,
  area_m2, perimeter_m, fill_color — ready for MapLibre / QGIS / ArcGIS.
"""

from __future__ import annotations

import base64
import colorsys
import io
import json
import math
import os
import re
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field

MAX_EDGE = int(os.environ.get("FIELD_BOUNDARY_MAX_EDGE", "4096"))
DEFAULT_MIN_CONF = float(os.environ.get("FIELD_BOUNDARY_MIN_CONF", "0.35"))
DEFAULT_MIN_AREA_M2 = float(os.environ.get("FIELD_BOUNDARY_MIN_AREA_M2", "150"))
MODEL_PATH = Path(os.environ.get("FIELD_BOUNDARY_MODEL_PATH", "")).expanduser() if os.environ.get("FIELD_BOUNDARY_MODEL_PATH") else None
TILE_SIZE = int(os.environ.get("FIELD_BOUNDARY_TILE_SIZE", "512"))
TILE_OVERLAP = int(os.environ.get("FIELD_BOUNDARY_TILE_OVERLAP", "64"))
NUM_CLASSES = int(os.environ.get("FIELD_BOUNDARY_NUM_CLASSES", "2"))  # bg + field
USE_FP16 = os.environ.get("FIELD_BOUNDARY_USE_FP16", "1").strip() not in ("0", "false", "False")
SAM_FALLBACK_URL = os.environ.get("FIELD_BOUNDARY_SAM_URL", "http://127.0.0.1:8090/segment").strip()
DEFAULT_SIMPLIFY = float(os.environ.get("FIELD_BOUNDARY_SIMPLIFY", "0.00002"))

app = FastAPI(title="Agri Field Boundary Detection (Mask R-CNN)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup_sen2sr() -> None:
    """Load SEN2SRLite in the background so /health/live stays instant for deploy probes."""
    if os.environ.get("SEN2SR_SKIP_STARTUP", "").strip().lower() in ("1", "true", "yes"):
        return

    def _warm() -> None:
        try:
            from services import super_resolution as sen2sr_svc

            sen2sr_svc.load_model()
        except Exception as exc:  # noqa: BLE001
            print(f"[SEN2SR] startup load failed: {type(exc).__name__}: {exc}", flush=True)

    threading.Thread(target=_warm, name="sen2sr-prefetch", daemon=True).start()


class DetectRequest(BaseModel):
    image: str = ""
    bbox: list[float]
    aoi: dict | None = None
    min_confidence: float = Field(default=DEFAULT_MIN_CONF, ge=0.0, le=1.0)
    min_area_m2: float = Field(default=DEFAULT_MIN_AREA_M2, ge=0.0)
    source: str = "basemap"
    high_res: bool = True
    simplify: float | None = None
    # Optional Sentinel-2 acquisition window (Agricultural Field Delineation)
    scene_date: str | None = None
    start_date: str | None = None
    end_date: str | None = None


ProgressCb = Callable[[float, str], None]


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


def _pixel_to_lonlat_affine(
    col: float,
    row: float,
    transform: tuple[float, float, float, float, float, float],
    to_wgs84,
) -> tuple[float, float]:
    """Map pixel centre through GDAL affine then optional CRS→WGS84."""
    a, b, c, d, e, f = transform
    # Pixel centres align better with ArcGIS-style raster polygons.
    x = a * (col + 0.5) + b * (row + 0.5) + c
    y = d * (col + 0.5) + e * (row + 0.5) + f
    if to_wgs84 is None:
        return float(x), float(y)
    lon, lat = to_wgs84.transform(x, y)
    return float(lon), float(lat)


def _instance_color(idx: int) -> str:
    """Distinct pastel fill colors (reference-style multi-instance overlay)."""
    h = (idx * 0.61803398875) % 1.0
    r, g, b = colorsys.hsv_to_rgb(h, 0.62, 0.92)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def _parse_aoi(aoi: dict | None):
    if not aoi or not isinstance(aoi, dict):
        return None
    from shapely.geometry import shape
    from shapely.ops import unary_union

    t = aoi.get("type")
    try:
        if t == "FeatureCollection":
            geoms = [shape(f["geometry"]) for f in (aoi.get("features") or []) if f.get("geometry")]
            return unary_union(geoms) if geoms else None
        if t == "Feature":
            g = aoi.get("geometry")
            return shape(g) if g else None
        if t in ("Polygon", "MultiPolygon"):
            return shape(aoi)
    except Exception:  # noqa: BLE001
        return None
    return None


def _rasterize_aoi(aoi_geom, bbox, width: int, height: int) -> np.ndarray | None:
    if aoi_geom is None or aoi_geom.is_empty:
        return None
    west, south, east, north = (float(v) for v in bbox)
    try:
        from rasterio.features import rasterize
        from rasterio.transform import from_bounds
        from shapely.geometry import mapping

        transform = from_bounds(west, south, east, north, width, height)
        mask = rasterize(
            [(mapping(aoi_geom), 1)],
            out_shape=(height, width),
            transform=transform,
            fill=0,
            dtype=np.uint8,
            all_touched=True,
        )
        return mask.astype(bool)
    except Exception as exc:  # noqa: BLE001
        print(f"[field-boundary] rasterio AOI rasterize failed ({exc}); using shapely fallback", flush=True)

    # Shapely point-in-polygon fallback (coarser but never all-black for valid AOIs)
    try:
        from shapely.geometry import Point

        ys, xs = np.mgrid[0:height, 0:width]
        # Sample every 2nd pixel then dilate for speed
        step = 2 if max(width, height) > 800 else 1
        mask = np.zeros((height, width), dtype=bool)
        for y in range(0, height, step):
            lat = north - (y / max(height - 1, 1)) * (north - south)
            for x in range(0, width, step):
                lon = west + (x / max(width - 1, 1)) * (east - west)
                if aoi_geom.contains(Point(lon, lat)) or aoi_geom.touches(Point(lon, lat)):
                    mask[y : y + step, x : x + step] = True
        if mask.any() and step > 1:
            mask = cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1).astype(bool)
        return mask if mask.any() else None
    except Exception as exc:  # noqa: BLE001
        print(f"[field-boundary] AOI fallback failed: {exc}", flush=True)
        return None


def _clean_binary(mask: np.ndarray, min_px: int = 40) -> np.ndarray:
    """Boundary refine + CC + controlled close before contours (see field_mask_refine)."""
    from field_mask_refine import refine_binary_mask

    return refine_binary_mask(mask, min_px=min_px, close_ksize=3, close_iterations=1)


def _smooth_polygon(poly, simplify: float | None):
    """Chaikin-like smoothing via buffer/unbuffer + simplify for sharp white outlines."""
    from shapely.validation import make_valid

    p = make_valid(poly)
    if p.is_empty:
        return p
    try:
        # Tiny positive/negative buffer rounds jagged contour steps
        tol = float(simplify) if simplify and simplify > 0 else DEFAULT_SIMPLIFY
        p2 = p.buffer(tol * 0.35).buffer(-tol * 0.35)
        if not p2.is_empty:
            p = p2
        p = p.simplify(max(tol, 1e-9), preserve_topology=True)
    except Exception:  # noqa: BLE001
        pass
    return make_valid(p)


class MaskRCNNEngine:
    """Torchvision Mask R-CNN (ResNet-50 FPN) — OpenGeoAI-compatible when weights provided."""

    def __init__(self) -> None:
        import torch
        from torchvision.models.detection import maskrcnn_resnet50_fpn
        from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
        from torchvision.models.detection.mask_rcnn import MaskRCNNPredictor

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.use_fp16 = bool(self.device == "cuda" and USE_FP16)
        self.available = False
        self.model = None
        self.name = "mask-rcnn-resnet50-fpn"

        if MODEL_PATH and MODEL_PATH.exists():
            try:
                model = maskrcnn_resnet50_fpn(weights=None)
                in_features = model.roi_heads.box_predictor.cls_score.in_features
                model.roi_heads.box_predictor = FastRCNNPredictor(in_features, NUM_CLASSES)
                in_features_mask = model.roi_heads.mask_predictor.conv5_mask.in_channels
                model.roi_heads.mask_predictor = MaskRCNNPredictor(in_features_mask, 256, NUM_CLASSES)
                state = torch.load(str(MODEL_PATH), map_location=self.device)
                if isinstance(state, dict) and "model" in state:
                    state = state["model"]
                model.load_state_dict(state, strict=False)
                model.to(self.device)
                model.eval()
                self.model = model
                self.available = True
                print(f"[field-boundary] Mask R-CNN loaded from {MODEL_PATH} on {self.device}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"[field-boundary] Mask R-CNN load failed: {exc}", flush=True)
        else:
            print(
                "[field-boundary] No FIELD_BOUNDARY_MODEL_PATH — Mask R-CNN idle; "
                "will use Delineate-Anything / SAM when available.",
                flush=True,
            )

    def predict(self, rgb: np.ndarray, min_confidence: float) -> list[tuple[np.ndarray, float]]:
        if not self.available or self.model is None:
            return []
        import torch
        from torchvision.transforms.functional import to_tensor

        h, w = rgb.shape[:2]
        step = max(32, TILE_SIZE - TILE_OVERLAP)
        tiles: list[tuple[int, int, int, int]] = []
        if h <= TILE_SIZE and w <= TILE_SIZE:
            tiles.append((0, 0, w, h))
        else:
            for y0 in range(0, h, step):
                for x0 in range(0, w, step):
                    x1 = min(w, x0 + TILE_SIZE)
                    y1 = min(h, y0 + TILE_SIZE)
                    # Grow tile to TILE_SIZE when near edge
                    if x1 - x0 < TILE_SIZE and x0 > 0:
                        x0 = max(0, x1 - TILE_SIZE)
                    if y1 - y0 < TILE_SIZE and y0 > 0:
                        y0 = max(0, y1 - TILE_SIZE)
                    tiles.append((x0, y0, x1, y1))

        components: list[tuple[np.ndarray, float]] = []
        for x0, y0, x1, y1 in tiles:
            crop = rgb[y0:y1, x0:x1]
            if crop.size == 0:
                continue
            img = to_tensor(Image.fromarray(crop)).to(self.device)
            with torch.inference_mode():
                if self.use_fp16:
                    with torch.cuda.amp.autocast():
                        out = self.model([img])[0]
                else:
                    out = self.model([img])[0]
            masks = out.get("masks")
            scores = out.get("scores")
            labels = out.get("labels")
            if masks is None or scores is None:
                continue
            for i in range(int(masks.shape[0])):
                score = float(scores[i].item())
                if score < min_confidence:
                    continue
                if labels is not None and int(labels[i].item()) == 0:
                    continue
                m_small = masks[i, 0].detach().cpu().numpy() > 0.5
                full = np.zeros((h, w), dtype=bool)
                full[y0:y1, x0:x1] = m_small[: y1 - y0, : x1 - x0]
                if int(full.sum()) < 40:
                    continue
                components.append((_clean_binary(full), score))
        return _nms_mask_components(components, iou_thresh=0.45)


_engine = MaskRCNNEngine()

try:
    from delineate_anything import DelineateAnythingEngine

    _da_engine = DelineateAnythingEngine()
except Exception as _da_exc:  # noqa: BLE001
    print(f"[field-boundary] Delineate-Anything import failed: {_da_exc}", flush=True)

    class _DaStub:
        available = False
        device = "cpu"
        name = "delineate-anything"

        def predict(self, *_a, **_k):
            return []

    _da_engine = _DaStub()


def _nms_mask_components(
    components: list[tuple[np.ndarray, float]],
    iou_thresh: float = 0.45,
) -> list[tuple[np.ndarray, float]]:
    if not components:
        return []
    ordered = sorted(components, key=lambda t: t[1], reverse=True)
    kept: list[tuple[np.ndarray, float]] = []
    for mask, score in ordered:
        drop = False
        for km, _ in kept:
            inter = np.logical_and(mask, km).sum()
            if inter == 0:
                continue
            union = np.logical_or(mask, km).sum()
            if float(inter) / float(max(union, 1)) >= iou_thresh:
                drop = True
                break
        if not drop:
            kept.append((mask, score))
    return kept


def _try_sam_amg(rgb: np.ndarray, bbox, aoi, min_confidence: float) -> list[tuple[np.ndarray, float]]:
    """Optional: reuse local SAM full-AOI AMG if running (high-quality instances)."""
    if not SAM_FALLBACK_URL:
        return []
    try:
        import json
        import urllib.request

        buf = io.BytesIO()
        Image.fromarray(rgb).save(buf, format="PNG")
        data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
        # Lower confidence + polygon mode for denser agricultural parcels
        payload = {
            "image": data_url,
            "bbox": list(bbox),
            "points": [],
            "aoi": aoi,
            "full_aoi": True,
            "feature_mode": "polygon",
            "object_type": "fields",
            "min_confidence": float(max(0.25, min(min_confidence, 0.4))),
            "high_res": True,
            "instance_segmentation": False,
        }
        req = urllib.request.Request(
            SAM_FALLBACK_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        # Keep SAM optional and short.
        with urllib.request.urlopen(req, timeout=45) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        feats = (body.get("geojson") or {}).get("features") or []
        if not feats:
            return []
        _try_sam_amg.last_geojson = body.get("geojson")  # type: ignore[attr-defined]
        _try_sam_amg.last_score = float(body.get("score") or 0.7)  # type: ignore[attr-defined]
        return [("__sam_geojson__", float(body.get("score") or 0.7))]  # type: ignore[list-item]
    except Exception as exc:  # noqa: BLE001
        print(f"[field-boundary] SAM fallback unavailable: {exc}", flush=True)
        return []


_try_sam_amg.last_geojson = None  # type: ignore[attr-defined]
_try_sam_amg.last_score = 0.0  # type: ignore[attr-defined]


def _mask_to_polygon_features(
    components: list[tuple[np.ndarray, float]],
    bbox,
    min_area_m2: float,
    simplify: float | None,
    *,
    transform: tuple[float, float, float, float, float, float] | None = None,
    epsg: int | None = None,
    light_simplify: bool = False,
) -> tuple[list[dict], dict]:
    from shapely.geometry import mapping, Polygon
    from shapely.validation import make_valid

    west, south, east, north = (float(v) for v in bbox)
    mid_lat = (south + north) / 2.0
    m_lon, m_lat = _meters_per_deg(mid_lat)
    features: list[dict] = []
    stats = {"field": 0}

    to_wgs84 = None
    use_affine = transform is not None and len(transform) == 6
    if use_affine and epsg and int(epsg) != 4326:
        try:
            from pyproj import Transformer

            to_wgs84 = Transformer.from_crs(f"EPSG:{int(epsg)}", "EPSG:4326", always_xy=True)
        except Exception as exc:  # noqa: BLE001
            print(
                f"[field-boundary] affine CRS transform unavailable ({exc}); using bbox stretch",
                flush=True,
            )
            use_affine = False
    elif use_affine and (not epsg or int(epsg) == 4326):
        to_wgs84 = None  # affine already in lon/lat

    default_simp = (DEFAULT_SIMPLIFY * 0.2) if light_simplify else DEFAULT_SIMPLIFY
    approx_mode = cv2.CHAIN_APPROX_NONE if light_simplify else cv2.CHAIN_APPROX_SIMPLE

    for i, (mask, conf) in enumerate(components):
        if isinstance(mask, str):
            continue
        h, w = mask.shape[:2]
        u8 = (mask.astype(np.uint8) * 255)
        contours, _ = cv2.findContours(u8, cv2.RETR_EXTERNAL, approx_mode)
        for j, cnt in enumerate(contours):
            if cnt is None or len(cnt) < 3:
                continue
            ring = []
            for pt in cnt.reshape(-1, 2):
                col, row = float(pt[0]), float(pt[1])
                if use_affine and transform is not None:
                    lon, lat = _pixel_to_lonlat_affine(col, row, transform, to_wgs84)
                else:
                    lon, lat = _pixel_to_lonlat(col, row, bbox, w, h)
                ring.append([lon, lat])
            if len(ring) < 3:
                continue
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            try:
                poly = make_valid(Polygon(ring))
            except Exception:  # noqa: BLE001
                continue
            if poly.is_empty:
                continue
            if poly.geom_type == "MultiPolygon":
                polys = list(poly.geoms)
            elif poly.geom_type == "Polygon":
                polys = [poly]
            else:
                continue
            for k, p in enumerate(polys):
                simp = simplify if simplify is not None else default_simp
                if light_simplify and simplify is None:
                    try:
                        p = make_valid(p.simplify(max(float(simp), 1e-9), preserve_topology=True))
                    except Exception:  # noqa: BLE001
                        p = make_valid(p)
                else:
                    p = _smooth_polygon(p, simp)
                if p.is_empty or p.geom_type != "Polygon":
                    continue
                # Approximate geodesic area via local meters (deg² → m²)
                area_m2 = abs(p.area) * m_lon * m_lat
                # Soft floor so textured basemap parcels are not wiped out
                if area_m2 < max(8.0, min_area_m2 * 0.15):
                    continue
                peri_m = float(p.length) * ((m_lon + m_lat) / 2.0)
                field_id = f"FLD-{i + 1:04d}-{j + 1}{k}"
                color = _instance_color(len(features) + 1)
                features.append(
                    {
                        "type": "Feature",
                        "id": field_id,
                        "geometry": mapping(p),
                        "properties": {
                            "field_id": field_id,
                            "class": "agricultural_field",
                            "detected_object_type": "Agricultural Field",
                            "confidence": round(float(conf), 4),
                            "confidence_score": round(float(conf), 4),
                            "area_m2": round(area_m2, 2),
                            "area_ha": round(area_m2 / 10_000.0, 4),
                            "perimeter_m": round(peri_m, 2),
                            "fill_color": color,
                            "stroke_color": "#ffffff",
                            "detection_engine": (
                                _engine.name
                                if _engine.available
                                else (_da_engine.name if _da_engine.available else "instance-seg")
                            ),
                            "source_image": "AOI high-res capture",
                        },
                    }
                )
                stats["field"] += 1

    return features, stats


def _enrich_sam_geojson(geojson: dict, min_area_m2: float, mid_lat: float) -> tuple[list[dict], dict]:
    from shapely.geometry import shape
    from shapely.validation import make_valid

    m_lon, m_lat = _meters_per_deg(mid_lat)
    features: list[dict] = []
    stats = {"field": 0}
    for i, f in enumerate(geojson.get("features") or []):
        g = f.get("geometry")
        if not g:
            continue
        try:
            geom = make_valid(shape(g))
        except Exception:  # noqa: BLE001
            continue
        if geom.is_empty:
            continue
        polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom] if geom.geom_type == "Polygon" else []
        props = dict(f.get("properties") or {})
        conf = float(props.get("confidence") or props.get("confidence_score") or 0.7)
        for k, p in enumerate(polys):
            area_m2 = abs(p.area) * m_lon * m_lat
            if area_m2 < max(10.0, min_area_m2 * 0.25):
                continue
            peri_m = float(p.length) * ((m_lon + m_lat) / 2.0)
            field_id = f"FLD-{i + 1:04d}-{k + 1}"
            from shapely.geometry import mapping

            features.append(
                {
                    "type": "Feature",
                    "id": field_id,
                    "geometry": mapping(p),
                    "properties": {
                        **props,
                        "field_id": field_id,
                        "class": "agricultural_field",
                        "detected_object_type": "Agricultural Field",
                        "confidence": round(conf, 4),
                        "confidence_score": round(conf, 4),
                        "area_m2": round(area_m2, 2),
                        "area_ha": round(area_m2 / 10_000.0, 4),
                        "perimeter_m": round(peri_m, 2),
                        "fill_color": _instance_color(len(features) + 1),
                        "stroke_color": "#ffffff",
                        "detection_engine": "sam-amg-field",
                        "source_image": "AOI high-res capture",
                    },
                }
            )
            stats["field"] += 1
    return features, stats


def _execute_afd(req: DetectRequest, progress: ProgressCb | None = None) -> dict:
    """Agricultural Field Delineation: Sentinel-2 L2A 12-band → Mask R-CNN → polygons."""
    from engines.agricultural_field_delineation import get_afd_engine
    from sentinel2_l2a_stack import fetch_sentinel2_l2a_stack

    engine = get_afd_engine()
    if not engine.available:
        raise RuntimeError(
            engine.error
            or "Agricultural Field Delineation model is not loaded. Ensure weights are present under models/AgriculturalFieldDelineation/."
        )

    aoi_geom = _parse_aoi(req.aoi)
    stack = fetch_sentinel2_l2a_stack(
        list(req.bbox),
        emd=engine.emd,
        scene_date=req.scene_date,
        start_date=req.start_date,
        end_date=req.end_date,
        progress=progress,
    )
    if progress:
        progress(0.55, "detect")

    conf = max(0.2, float(req.min_confidence))
    components = engine.predict(stack.data, conf, mask_threshold=0.4, overlap=112)
    if components:
        try:
            from field_mask_refine import masks_to_cleaned_components

            # ~4 px @ 10 m ≈ 400 m² floor; keep merge off so adjacent fields stay separate.
            min_px = max(16, int(float(req.min_area_m2 or 0) / 100.0))
            components = masks_to_cleaned_components(
                components,
                rgb=None,
                min_px=min_px,
                merge=False,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[afd] mask refine skipped: {exc}", flush=True)

    if progress:
        progress(0.85, "vectorizing")

    poly_kwargs = {
        "transform": stack.transform,
        "epsg": stack.epsg,
        "light_simplify": True,
    }
    features, stats = _mask_to_polygon_features(
        components, stack.bbox, req.min_area_m2, req.simplify, **poly_kwargs
    )
    if not features and components:
        features, stats = _mask_to_polygon_features(
            components, stack.bbox, 10.0, req.simplify, **poly_kwargs
        )

    if aoi_geom is not None and features:
        from shapely.geometry import mapping, shape
        from shapely.ops import unary_union
        from shapely.validation import make_valid

        clipped = []
        for f in features:
            try:
                g = make_valid(shape(f["geometry"]).intersection(aoi_geom))
            except Exception:  # noqa: BLE001
                continue
            if g.is_empty:
                continue
            if g.geom_type == "GeometryCollection":
                polys = [x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
                if not polys:
                    continue
                g = unary_union(polys)
            if g.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            props = dict(f.get("properties") or {})
            props["detection_engine"] = engine.name
            props["source_image"] = f"Sentinel-2 L2A ({stack.acquisition_date})"
            props["scene_id"] = stack.scene_id
            clipped.append({**f, "geometry": mapping(g), "properties": props})
        features = clipped
        stats = {"field": len(features)}
    else:
        for f in features:
            props = dict(f.get("properties") or {})
            props["detection_engine"] = engine.name
            props["source_image"] = f"Sentinel-2 L2A ({stack.acquisition_date})"
            props["scene_id"] = stack.scene_id
            f["properties"] = props

    mean_score = (
        float(np.mean([float((f["properties"] or {}).get("confidence") or 0) for f in features]))
        if features
        else 0.0
    )
    if progress:
        progress(1.0, "done")
    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "count": len(features),
        "stats": stats,
        "score": mean_score,
        "width": stack.width,
        "height": stack.height,
        "engine": engine.name,
        "device": engine.device,
        "source": req.source,
        "aoi_applied": aoi_geom is not None,
        "scene_id": stack.scene_id,
        "acquisition_date": stack.acquisition_date,
        "cloud_cover": stack.cloud_cover,
        "imagery_source": stack.source,
    }


def _infer_scene_year(req: DetectRequest) -> int:
    for raw in (req.scene_date, req.end_date, req.start_date):
        if not raw:
            continue
        text = str(raw).strip()
        if len(text) >= 4:
            try:
                year = int(text[:4])
                if 2000 <= year <= 2100:
                    return year
            except ValueError:
                continue
    return time.gmtime().tm_year


def _infer_ftw_inference_year(req: DetectRequest) -> int:
    """FTW crop calendar rejects harvest/buffer dates in the future — cap to prior crop year."""
    from datetime import date

    today = date.today()
    max_safe = max(2017, today.year - 1)
    requested = _infer_scene_year(req)
    return max(2017, min(requested, max_safe))


def _ftw_crop_calendar_error(exc: BaseException) -> bool:
    msg = str(exc).lower()
    return "crop calendar" in msg or "harvest date" in msg or "in the future" in msg


def _execute_ftw_inference_s2(req: DetectRequest, progress: ProgressCb | None = None) -> dict:
    """FTW Inference (S2) — live Sentinel-2 + PRUE via ftw-baselines CLI."""
    from engines.ftw_inference_s2 import get_ftw_inference_s2_engine
    from shapely.geometry import mapping, shape
    from shapely.validation import make_valid

    engine = get_ftw_inference_s2_engine()
    if not engine.available:
        raise RuntimeError(
            engine.error or "FTW Inference (S2) is not available. Install ftw-baselines on :8092.",
        )

    aoi_geom = _parse_aoi(req.aoi)
    year = _infer_ftw_inference_year(req)

    if progress:
        progress(0.12, "scene_selection")
        progress(0.28, "download")
        progress(0.55, "run")

    fc: dict[str, Any] | None = None
    last_err: Exception | None = None
    for attempt_year in range(year, max(2016, year - 3), -1):
        try:
            fc = engine.infer_geojson(list(req.bbox), year=attempt_year)
            year = attempt_year
            break
        except RuntimeError as exc:
            last_err = exc
            if _ftw_crop_calendar_error(exc) and attempt_year > 2017:
                continue
            raise
    if fc is None:
        raise RuntimeError(
            str(last_err) if last_err else "FTW Inference (S2) failed without GeoJSON output.",
        )
    mid_lat = (float(req.bbox[1]) + float(req.bbox[3])) / 2.0
    m_lon, m_lat = _meters_per_deg(mid_lat)
    features: list[dict[str, Any]] = []
    for i, f in enumerate(fc.get("features") or []):
        if not isinstance(f, dict):
            continue
        props = dict(f.get("properties") or {})
        conf = float(props.get("confidence") or props.get("score") or props.get("conf") or 0.55)
        if conf < req.min_confidence:
            continue
        try:
            g = make_valid(shape(f.get("geometry")))
        except Exception:  # noqa: BLE001
            continue
        if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        if aoi_geom is not None:
            try:
                g = make_valid(g.intersection(aoi_geom))
            except Exception:  # noqa: BLE001
                continue
            if g.is_empty or g.geom_type not in ("Polygon", "MultiPolygon"):
                continue
        if g.geom_type == "MultiPolygon":
            area_m2 = sum(abs(p.area) * m_lon * m_lat for p in g.geoms)
        else:
            area_m2 = abs(g.area) * m_lon * m_lat
        if area_m2 < max(10.0, float(req.min_area_m2)):
            continue
        field_id = str(props.get("field_id") or f"FLD-{i + 1:04d}")
        props.update(
            {
                "field_id": field_id,
                "class": props.get("class") or "agricultural_field",
                "confidence": round(conf, 4),
                "confidence_score": round(conf, 4),
                "area_m2": round(area_m2, 2),
                "area_ha": round(area_m2 / 10_000.0, 4),
                "detection_engine": engine.name,
                "source_image": f"Sentinel-2 L2A ({year})",
            },
        )
        features.append(
            {
                "type": "Feature",
                "id": field_id,
                "geometry": mapping(g),
                "properties": props,
            },
        )

    if progress:
        progress(0.9, "normalize")
        progress(1.0, "done")

    mean_score = (
        float(np.mean([float((f["properties"] or {}).get("confidence") or 0) for f in features]))
        if features
        else 0.0
    )
    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "count": len(features),
        "stats": {"field": len(features)},
        "score": mean_score,
        "engine": engine.name,
        "device": engine.device,
        "source": req.source,
        "aoi_applied": aoi_geom is not None,
        "acquisition_date": req.scene_date or req.end_date or req.start_date,
        "imagery_source": "sentinel2-l2a",
    }


def _execute_detect(req: DetectRequest, progress: ProgressCb | None = None) -> dict:
    if progress:
        progress(0.02, "preparing")
    if len(req.bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north].")

    aoi_geom = _parse_aoi(req.aoi)
    source = (req.source or "basemap").strip().lower()

    # 0) FTW Inference (S2) — live Sentinel-2 + PRUE (no client image)
    if source in ("ftw-inference-s2", "ftw-infer", "ftw-live", "ftw-inference"):
        return _execute_ftw_inference_s2(req, progress)

    # 1) Agricultural Field Delineation — Sentinel-2 L2A 12-band Mask R-CNN
    if source in ("agricultural-field-delineation", "afd"):
        return _execute_afd(req, progress)

    if not req.image:
        raise ValueError(
            "image is required unless source is 'agricultural-field-delineation' or 'ftw-inference-s2'."
        )

    image = _decode_image(req.image)
    orig_w, orig_h = image.size
    max_edge = MAX_EDGE if req.high_res else min(MAX_EDGE, 1024)
    scale = min(1.0, max_edge / max(orig_w, orig_h))
    if scale < 1.0:
        work = image.resize((max(1, round(orig_w * scale)), max(1, round(orig_h * scale))), Image.BILINEAR)
    else:
        work = image
    rgb = np.asarray(work).copy()
    wh, ww = rgb.shape[:2]

    aoi_mask = _rasterize_aoi(aoi_geom, req.bbox, ww, wh) if aoi_geom is not None else None
    if aoi_mask is not None:
        cover = float(aoi_mask.sum()) / float(max(ww * wh, 1))
        if cover < 0.005:
            print(
                f"[field-boundary] AOI mask cover={cover:.4f} too small — ignoring mask",
                flush=True,
            )
            aoi_mask = None
        # Do NOT zero pixels outside the AOI before inference — black circles
        # destroy context and hurt YOLO recall near the AOI edge. Clip after.

    if progress:
        progress(0.1, "scanning")

    engine_used = "none"
    components: list[tuple[np.ndarray, float]] = []
    sam_features: list[dict] = []
    # Bias toward recall; UI confidence still gates weak masks later.
    conf = max(0.15, min(0.55, req.min_confidence * 0.75))

    # 2) Mask R-CNN when trained weights are present
    if _engine.available:
        if progress:
            progress(0.15, "mask-rcnn")
        components = _engine.predict(rgb, conf)
        if components:
            engine_used = _engine.name

    # 3) Delineate-Anything — always run when available; merge via NMS so we
    # don't stop after a sparse Mask R-CNN hit (or miss small parcels).
    if _da_engine.available:
        if progress:
            progress(0.25, "delineate-anything")
        da_components = _da_engine.predict(rgb, conf)
        if da_components:
            if components:
                components = _nms_mask_components(components + da_components, iou_thresh=0.4)
                engine_used = f"delineate+{engine_used}" if engine_used != "none" else _da_engine.name
            else:
                components = da_components
                engine_used = _da_engine.name

    # 4) SAM AMG enrichment / fallback when still sparse
    if len(components) < 5:
        if progress:
            progress(0.45, "sam")
        sam_hit = _try_sam_amg(rgb, req.bbox, req.aoi, req.min_confidence)
        if sam_hit and getattr(_try_sam_amg, "last_geojson", None):
            mid_lat = (float(req.bbox[1]) + float(req.bbox[3])) / 2.0
            sam_features, _ = _enrich_sam_geojson(
                _try_sam_amg.last_geojson,
                max(10.0, req.min_area_m2 * 0.25),
                mid_lat,
            )
            if sam_features and not components:
                engine_used = "sam-amg-field"

    if aoi_mask is not None and components:
        components = [
            (np.logical_and(m, aoi_mask), s)
            for m, s in components
            if not isinstance(m, str) and int(np.logical_and(m, aoi_mask).sum()) >= 20
        ]

    # Boundary refine + connected-component merge before contour extraction
    # (at inference resolution so RGB mean cues stay aligned).
    if components:
        from field_mask_refine import masks_to_cleaned_components

        min_px = max(40, int(float(req.min_area_m2 or 0) / 4.0))
        try:
            components = masks_to_cleaned_components(
                components,
                rgb=rgb,
                min_px=min_px,
                merge=True,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[field-boundary] mask refine skipped: {exc}", flush=True)

    if scale < 1.0 and components:

        def _up(m: np.ndarray) -> np.ndarray:
            img = Image.fromarray((m.astype(np.uint8) * 255)).resize((orig_w, orig_h), Image.NEAREST)
            return np.asarray(img) > 127

        components = [(_up(m), s) for m, s in components if not isinstance(m, str)]

    if progress:
        progress(0.85, "vectorizing")

    features, stats = _mask_to_polygon_features(
        components, req.bbox, req.min_area_m2, req.simplify
    )
    if not features and components:
        features, stats = _mask_to_polygon_features(components, req.bbox, 10.0, req.simplify)

    if sam_features:
        from shapely.geometry import shape
        from shapely.validation import make_valid

        kept_sam = []
        existing = []
        for f in features:
            try:
                existing.append(make_valid(shape(f["geometry"])))
            except Exception:  # noqa: BLE001
                continue
        for sf in sam_features:
            try:
                g = make_valid(shape(sf["geometry"]))
            except Exception:  # noqa: BLE001
                continue
            if g.is_empty:
                continue
            overlap = False
            for eg in existing:
                try:
                    inter = g.intersection(eg).area
                    union = g.union(eg).area
                    if union > 0 and inter / union >= 0.45:
                        overlap = True
                        break
                except Exception:  # noqa: BLE001
                    continue
            if not overlap:
                kept_sam.append(sf)
                existing.append(g)
        if kept_sam:
            merged = features + kept_sam
            for i, f in enumerate(merged):
                props = dict(f.get("properties") or {})
                props["field_id"] = f"FLD-{i + 1:04d}"
                props["fill_color"] = _instance_color(i + 1)
                props["stroke_color"] = "#ffffff"
                f["id"] = props["field_id"]
                f["properties"] = props
            features = merged
            stats = {"field": len(features)}
            if "sam" not in engine_used:
                engine_used = f"sam+{engine_used}" if engine_used != "none" else "sam-amg-field"

    if aoi_geom is not None and features:
        from shapely.geometry import mapping, shape
        from shapely.ops import unary_union
        from shapely.validation import make_valid

        clipped = []
        for f in features:
            try:
                g = make_valid(shape(f["geometry"]).intersection(aoi_geom))
            except Exception:  # noqa: BLE001
                continue
            if g.is_empty:
                continue
            if g.geom_type == "GeometryCollection":
                polys = [x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
                if not polys:
                    continue
                g = unary_union(polys)
            if g.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            f = {**f, "geometry": mapping(g)}
            clipped.append(f)
        features = clipped
        stats = {"field": len(features)}

    mean_score = (
        float(np.mean([float((f["properties"] or {}).get("confidence") or 0) for f in features]))
        if features
        else 0.0
    )

    if progress:
        progress(1.0, "done")

    device = (
        _engine.device
        if engine_used.startswith("mask")
        else (_da_engine.device if "delineate" in engine_used else _engine.device)
    )
    return {
        "geojson": {"type": "FeatureCollection", "features": features},
        "count": len(features),
        "stats": stats,
        "score": mean_score,
        "width": orig_w,
        "height": orig_h,
        "engine": engine_used,
        "device": device,
        "source": req.source,
        "aoi_applied": aoi_geom is not None,
    }


# ── Job store ────────────────────────────────────────────────────────────────
_JOBS: dict[str, dict[str, Any]] = {}
_JOBS_LOCK = threading.Lock()


def _set_job(job_id: str, **fields: Any) -> None:
    with _JOBS_LOCK:
        cur = _JOBS.get(job_id) or {}
        cur.update(fields)
        cur["updated_at"] = time.time()
        _JOBS[job_id] = cur


def _get_job(job_id: str) -> dict[str, Any] | None:
    with _JOBS_LOCK:
        return dict(_JOBS[job_id]) if job_id in _JOBS else None


def _run_job(job_id: str, req: DetectRequest) -> None:
    def progress(pct: float, stage: str) -> None:
        _set_job(job_id, status="running", progress=round(float(pct) * 100, 1), stage=stage)

    try:
        _set_job(job_id, status="running", progress=1.0, stage="preparing")
        result = _execute_detect(req, progress)
        _set_job(job_id, status="done", progress=100.0, stage="done", result=result, error=None)
    except Exception as exc:  # noqa: BLE001
        _set_job(job_id, status="error", progress=100.0, stage="error", error=_public_error(exc, max_len=1200), result=None)


@app.get("/health")
def health() -> dict:
    return _health_payload()


def _health_payload() -> dict[str, Any]:
    primary = (
        _engine.name
        if _engine.available
        else (_da_engine.name if _da_engine.available else "none")
    )
    sen2sr_ok = False
    sen2sr_err: str | None = None
    try:
        from services import super_resolution as sen2sr_svc

        sen2sr_ok = bool(sen2sr_svc.is_available())
        sen2sr_err = sen2sr_svc.get_error()
    except Exception as exc:  # noqa: BLE001
        sen2sr_ok = False
        sen2sr_err = f"{type(exc).__name__}: {exc}"

    afd_payload: dict[str, Any] = {"ready": False}
    try:
        from engines.agricultural_field_delineation import get_afd_engine

        afd_payload = get_afd_engine().status_payload()
    except Exception as exc:  # noqa: BLE001
        afd_payload = {"ready": False, "error": f"{type(exc).__name__}: {exc}"}

    ftw_s2_payload: dict[str, Any] = {"ready": False}
    try:
        from engines.ftw_inference_s2 import get_ftw_inference_s2_engine

        ftw_s2_payload = get_ftw_inference_s2_engine().status_payload()
    except Exception as exc:  # noqa: BLE001
        ftw_s2_payload = {"ready": False, "error": f"{type(exc).__name__}: {exc}"}

    out: dict[str, Any] = {
        "status": "ok",
        "engine": primary,
        "mask_rcnn": _engine.available,
        "delineate_anything": bool(getattr(_da_engine, "available", False)),
        "sen2sr": sen2sr_ok,
        "agricultural_field_delineation": bool(afd_payload.get("ready")),
        "agricultural_field_delineation_status": afd_payload,
        "ftw_inference_s2": bool(ftw_s2_payload.get("ready")),
        "ftw_inference_s2_status": ftw_s2_payload,
        "watershed": False,
        "device": _engine.device if _engine.available else getattr(_da_engine, "device", "cpu"),
        "gis": True,
        "optimized": True,
    }
    if sen2sr_err and not sen2sr_ok:
        out["sen2sr_error"] = sen2sr_err
    return out


def _service_ready(payload: dict[str, Any]) -> bool:
    return bool(
        payload.get("mask_rcnn")
        or payload.get("delineate_anything")
        or payload.get("sen2sr")
        or payload.get("agricultural_field_delineation")
        or payload.get("ftw_inference_s2")
    )


@app.get("/health/live")
def health_live() -> dict[str, Any]:
    """Process is up — used by systemd / deploy scripts before /health/ready."""
    return {"status": "live", "live": True}


@app.get("/health/ready")
def health_ready() -> dict[str, Any]:
    """Models loaded — Node proxy waits for ready before forwarding detect/SEN2SR."""
    payload = _health_payload()
    ready = _service_ready(payload)
    return {
        **payload,
        "status": "ok" if ready else "loading",
        "live": True,
        "ready": ready,
        "loading": not ready,
    }

def _public_error(exc: BaseException, *, max_len: int = 220) -> str:
    """Keep API errors short and free of huge URLs for UI panels."""
    import re

    text = " ".join(str(exc).split())
    text = re.sub(r"https?://\S+", "[url]", text, flags=re.IGNORECASE)
    text = re.sub(r"s3://\S+", "[s3]", text, flags=re.IGNORECASE)
    if len(text) > max_len:
        text = text[: max_len - 1] + "…"
    return text or "Field boundary request failed."


@app.post("/detect")
def detect(req: DetectRequest):
    try:
        return _execute_detect(req, None)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": _public_error(exc)})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": _public_error(exc)})


class FtwMosaicVectorizeRequest(BaseModel):
    """Binary FTW union mosaic (PNG) → GeoJSON via single-pass contour vectorize."""

    mask: str = Field(..., description="PNG data URL or base64 of binary field mask")
    bbox: list[float] = Field(..., min_length=4, max_length=4)
    width: int | None = None
    height: int | None = None
    min_area_m2: float = Field(default=500.0, ge=0)
    aoi: dict | None = None
    preserve_geometry: bool = Field(
        default=False,
        description="When true, vectorize the union mosaic without morphological smoothing or Douglas simplification (removes tile seams only).",
    )
    reference_geojson: dict | None = Field(
        default=None,
        description="Field boundary reference FeatureCollection — output these geometries unchanged when raster mask confirms presence.",
    )


@app.post("/ftw/mosaic-vectorize")
def ftw_mosaic_vectorize(req: FtwMosaicVectorizeRequest):
    try:
        from ftw_mosaic_vectorize import _decode_mask_png, vectorize_ftw_binary_mask

        mask = _decode_mask_png(req.mask)
        h, w = mask.shape[:2]
        if (
            req.width
            and req.height
            and (w != int(req.width) or h != int(req.height))
            and not req.preserve_geometry
        ):
            mask = cv2.resize(mask, (int(req.width), int(req.height)), interpolation=cv2.INTER_NEAREST)
        elif req.width and req.height and (w != int(req.width) or h != int(req.height)):
            raise ValueError(
                f"mask dimensions {w}x{h} must match width/height {req.width}x{req.height} when preserve_geometry is set."
            )

        aoi_geom = _parse_aoi(req.aoi)
        if aoi_geom is not None:
            aoi_mask = _rasterize_aoi(aoi_geom, req.bbox, mask.shape[1], mask.shape[0])
            if aoi_mask is not None:
                mask = (mask.astype(bool) & aoi_mask).astype(np.uint8)

        result = vectorize_ftw_binary_mask(
            mask,
            req.bbox,
            min_area_m2=float(req.min_area_m2),
            preserve_geometry=bool(req.preserve_geometry),
            reference_features=(
                list((req.reference_geojson or {}).get("features") or [])
                if req.reference_geojson
                else None
            ),
        )
        result["aoi_applied"] = aoi_geom is not None
        return result
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": _public_error(exc)})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": _public_error(exc)})


@app.post("/detect-job")
def detect_job(req: DetectRequest, background_tasks: BackgroundTasks):
    job_id = uuid.uuid4().hex[:16]
    _set_job(job_id, status="queued", progress=0.0, stage="queued", result=None, error=None, created_at=time.time())
    background_tasks.add_task(_run_job, job_id, req)
    return {"job_id": job_id, "status": "queued"}


@app.get("/detect-job/{job_id}")
def get_detect_job(job_id: str):
    job = _get_job(job_id)
    if not job:
        return JSONResponse(status_code=404, content={"error": f"Unknown job_id '{job_id}'."})
    out = {
        "job_id": job_id,
        "status": job.get("status"),
        "progress": job.get("progress", 0),
        "stage": job.get("stage"),
        "error": job.get("error"),
    }
    if job.get("status") == "done" and job.get("result"):
        out["result"] = job["result"]
    return out


# ---------------------------------------------------------------------------
# SEN2SR Lite — Sentinel-2 neural super-resolution (10 m → 2.5 m)
# ---------------------------------------------------------------------------


def _sen2sr_error_payload(exc: BaseException) -> dict[str, str]:
    """Return the real exception message (plan: detail / error)."""
    msg = f"{type(exc).__name__}: {exc}".strip() or "SEN2SR request failed"
    return {"detail": msg, "error": msg}


def _sen2sr_parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "y", "on"):
        return True
    if text in ("0", "false", "no", "n", "off", ""):
        return False
    return default


def _sen2sr_parse_bands(value: Any) -> list[str] | None:
    if value is None or value == "":
        return None
    if isinstance(value, (list, tuple)):
        out = [str(b).strip() for b in value if str(b).strip()]
        return out or None
    text = str(value).strip()
    if not text:
        return None
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                out = [str(b).strip() for b in parsed if str(b).strip()]
                return out or None
        except json.JSONDecodeError:
            pass
    out = [p.strip() for p in text.split(",") if p.strip()]
    return out or None


def _sen2sr_parse_aoi(value: Any) -> dict | list | None:
    if value is None or value == "":
        return None
    if isinstance(value, (dict, list)):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid aoi JSON: {exc}") from exc
    if not isinstance(parsed, (dict, list)):
        raise ValueError("aoi must be a GeoJSON object or FeatureCollection")
    return parsed


@app.get("/api/sentinel2/super-resolution/status")
def sentinel2_super_resolution_status() -> dict[str, Any]:
    from services import super_resolution as sen2sr_svc

    payload = sen2sr_svc.status_payload()
    print(
        f"[SEN2SR] status available={payload.get('available')} "
        f"device={payload.get('device')} error={payload.get('error')}",
        flush=True,
    )
    return payload


@app.post("/api/sentinel2/super-resolution")
async def sentinel2_super_resolution(request: Request):
    """
    Multipart GeoTIFF upload and/or form/JSON ``input_path``.

    Fields: file, input_path, aoi, bands, output_path, display_1m.
    """
    from services import super_resolution as sen2sr_svc

    tmp_path: Path | None = None
    try:
        content_type = (request.headers.get("content-type") or "").lower()
        input_path: str | None = None
        aoi: dict | list | None = None
        bands: list[str] | None = None
        output_path: str | None = None
        display_1m = False
        upload_name = ""

        if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            upload = form.get("file")
            raw_path = form.get("input_path")
            input_path = str(raw_path).strip() if raw_path not in (None, "") else None
            aoi = _sen2sr_parse_aoi(form.get("aoi"))
            bands = _sen2sr_parse_bands(form.get("bands"))
            raw_out = form.get("output_path")
            output_path = str(raw_out).strip() if raw_out not in (None, "") else None
            display_1m = _sen2sr_parse_bool(form.get("display_1m"), False)

            if upload is not None and hasattr(upload, "read"):
                upload_name = getattr(upload, "filename", None) or "upload.tif"
                suffix = Path(upload_name).suffix or ".tif"
                fd, tmp_name = tempfile.mkstemp(prefix="sen2sr-upload-", suffix=suffix)
                os.close(fd)
                tmp_path = Path(tmp_name)
                data = await upload.read()
                if not data:
                    raise ValueError("Uploaded file is empty")
                tmp_path.write_bytes(data)
                input_path = str(tmp_path)
                print(f"[SEN2SR] received upload name={upload_name} bytes={len(data)}", flush=True)
        else:
            try:
                body = await request.json()
            except Exception as exc:  # noqa: BLE001
                raise ValueError(
                    "Expected multipart/form-data with file and/or JSON body with input_path"
                ) from exc
            if not isinstance(body, dict):
                raise ValueError("JSON body must be an object")
            raw_path = body.get("input_path")
            input_path = str(raw_path).strip() if raw_path not in (None, "") else None
            aoi = _sen2sr_parse_aoi(body.get("aoi"))
            bands = _sen2sr_parse_bands(body.get("bands"))
            raw_out = body.get("output_path")
            output_path = str(raw_out).strip() if raw_out not in (None, "") else None
            display_1m = _sen2sr_parse_bool(body.get("display_1m"), False)

        if not input_path:
            raise ValueError("Provide multipart file and/or input_path to a local GeoTIFF")

        print(
            f"[SEN2SR] request input={Path(input_path).name} "
            f"bands={bands or 'default'} aoi={'yes' if aoi else 'no'} "
            f"display_1m={display_1m} output_path={output_path or 'cache'}",
            flush=True,
        )

        result = sen2sr_svc.super_resolve(
            input_path,
            aoi=aoi,
            bands=bands,
            output_path=output_path,
            display_1m=display_1m,
        )
        print(
            f"[SEN2SR] done cached={result.get('cached')} "
            f"output={result.get('output_path')} "
            f"display_1m_path={result.get('display_1m_path')}",
            flush=True,
        )
        return result
    except FileNotFoundError as exc:
        print(f"[SEN2SR] error: {exc}", flush=True)
        return JSONResponse(status_code=404, content=_sen2sr_error_payload(exc))
    except ValueError as exc:
        print(f"[SEN2SR] error: {exc}", flush=True)
        return JSONResponse(status_code=400, content=_sen2sr_error_payload(exc))
    except RuntimeError as exc:
        print(f"[SEN2SR] error: {exc}", flush=True)
        # Model unavailable / inference failures
        status = 503 if "not available" in str(exc).lower() or "not loaded" in str(exc).lower() else 500
        return JSONResponse(status_code=status, content=_sen2sr_error_payload(exc))
    except Exception as exc:  # noqa: BLE001
        print(f"[SEN2SR] error: {type(exc).__name__}: {exc}", flush=True)
        return JSONResponse(status_code=500, content=_sen2sr_error_payload(exc))
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:  # noqa: BLE001
                pass
