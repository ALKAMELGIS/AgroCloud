"""
AI SAM Detection — interactive Segment Anything Model (SAM) microservice.

Powered by Meta's segment-anything (https://github.com/facebookresearch/segment-anything)
with GIS-grade post-processing that turns the raw mask into clean, topologically correct
Point / LineString / Polygon features (EPSG:4326) ready for ArcGIS Pro and QGIS.

Contract (matches backend/server/samDetectionProxy.js):
  POST /segment   application/json
    {
      "image":  "<data:image/png;base64,...>" | "<base64>",
      "bbox":   [west, south, east, north],
      "points": [ { "x": <px>, "y": <px>, "label": 1|0 }, ... ],
      "feature_mode": "auto" | "point" | "line" | "polygon",  # optional, default auto
      "simplify": <degrees, optional>,
      "multimask": <bool, optional>,
      "aoi": <GeoJSON Polygon|MultiPolygon|Feature|FeatureCollection, optional>,
      "min_confidence": <0..1, optional, default 0.5>,
      "high_res": <bool, optional, default true>
    }
  Response 200:
    {
      "geojson":  FeatureCollection (Point | LineString | Polygon, with confidence),
      "mask_png": "data:image/png;base64,...",
      "width": int, "height": int,
      "score": float,
      "count": int,
      "stats": { "point": n, "line": n, "polygon": n }
    }
"""

from __future__ import annotations

import base64
import io
import math
import os
import threading
import time
import uuid
import urllib.request
from pathlib import Path
from typing import Any, Callable

import cv2
import numpy as np
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field

MODEL_TYPE = os.environ.get("SAM_MODEL_TYPE", "vit_b").strip() or "vit_b"
MAX_EDGE = int(os.environ.get("SAM_MAX_EDGE", "1024"))
MAX_EDGE_HIGH_RES = int(os.environ.get("SAM_MAX_EDGE_HIGH_RES", "1536"))
MAX_EDGE_SMALL_AOI = int(os.environ.get("SAM_MAX_EDGE_SMALL_AOI", "1792"))
DEFAULT_MIN_CONFIDENCE = float(os.environ.get("SAM_MIN_CONFIDENCE", "0.5"))
TILE_SIZE = int(os.environ.get("SAM_TILE_SIZE", "768"))
TILE_OVERLAP = int(os.environ.get("SAM_TILE_OVERLAP", "80"))
POINTS_PER_SIDE = int(os.environ.get("SAM_POINTS_PER_SIDE", "0"))  # 0 = auto by device
USE_FP16 = os.environ.get("SAM_USE_FP16", "1").strip() not in ("0", "false", "False")
TILE_AOI_MIN_FRAC = float(os.environ.get("SAM_TILE_AOI_MIN_FRAC", "0.02"))
NMS_IOU = float(os.environ.get("SAM_NMS_IOU", "0.55"))
SYNC_MAX_TILES = int(os.environ.get("SAM_SYNC_MAX_TILES", "4"))
MASK_RGB = (56, 189, 248)  # sky blue overlay

SAM_CHECKPOINTS = {
    "vit_b": ("sam_vit_b_01ec64.pth", "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth"),
    "vit_l": ("sam_vit_l_0b3195.pth", "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_l_0b3195.pth"),
    "vit_h": ("sam_vit_h_4b8939.pth", "https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth"),
}
SAM_CACHE_DIR = Path(os.environ.get("SAM_CACHE_DIR", str(Path(__file__).parent / "checkpoints")))

# Shape thresholds (metres / ratios) used by auto feature-type classification.
POINT_MAX_AREA_M2 = float(os.environ.get("SAM_POINT_MAX_AREA_M2", "80"))  # trees / small objects
LINE_MIN_ELONGATION = float(os.environ.get("SAM_LINE_MIN_ELONGATION", "3.2"))  # roads / rivers
LINE_MAX_FILL = float(os.environ.get("SAM_LINE_MAX_FILL", "0.42"))  # thinness vs bbox
MIN_COMPONENT_PX = int(os.environ.get("SAM_MIN_COMPONENT_PX", "12"))

app = FastAPI(title="AI SAM Detection")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SamPoint(BaseModel):
    x: float
    y: float
    label: int = 1  # 1 = foreground, 0 = background


class SegmentRequest(BaseModel):
    image: str
    bbox: list[float]  # [west, south, east, north] in WGS84
    points: list[SamPoint] = []
    simplify: float | None = None
    multimask: bool = True
    feature_mode: str = Field(default="auto")  # auto | point | line | polygon
    # Detected object type hint (trees, poles, vehicles, fields, …) for size filters.
    object_type: str | None = None
    aoi: dict | None = None  # GeoJSON polygon boundary for analysis mask
    min_confidence: float = Field(default=DEFAULT_MIN_CONFIDENCE, ge=0.0, le=1.0)
    high_res: bool = True
    # Scan the entire AOI with automatic mask generation (not only around click prompts).
    full_aoi: bool = True
    # When true (default for point mode), emit mask polygon + centroid point per instance.
    instance_segmentation: bool = True


def _ensure_checkpoint() -> Path:
    if MODEL_TYPE not in SAM_CHECKPOINTS:
        raise RuntimeError(f"Unknown SAM_MODEL_TYPE '{MODEL_TYPE}'. Use vit_b, vit_l, or vit_h.")
    filename, url = SAM_CHECKPOINTS[MODEL_TYPE]
    SAM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = SAM_CACHE_DIR / filename
    if dest.exists() and dest.stat().st_size > 1_000_000:
        return dest
    print(f"[sam] downloading {MODEL_TYPE} checkpoint -> {dest} ...", flush=True)
    tmp = dest.with_suffix(".part")
    urllib.request.urlretrieve(url, tmp)  # noqa: S310
    tmp.replace(dest)
    print(f"[sam] checkpoint ready ({dest.stat().st_size // (1024 * 1024)} MB).", flush=True)
    return dest


class SamEngine:
    name = "segment-anything"

    def __init__(self) -> None:
        import torch
        from segment_anything import SamPredictor, sam_model_registry

        checkpoint = _ensure_checkpoint()
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.sam = sam_model_registry[MODEL_TYPE](checkpoint=str(checkpoint))
        self.sam.to(device=self.device)
        self.use_fp16 = bool(self.device == "cuda" and USE_FP16)
        self.predictor = SamPredictor(self.sam)
        self._mask_generator = None
        self._mask_generator_key = None
        print(f"[sam] {MODEL_TYPE} loaded on {self.device} (fp16={self.use_fp16}).", flush=True)

    def predict(self, rgb: np.ndarray, points, labels, multimask: bool):
        import torch

        with torch.inference_mode():
            if self.device == "cuda" and self.use_fp16:
                with torch.cuda.amp.autocast():
                    self.predictor.set_image(rgb)
                    point_coords = np.array(points, dtype=np.float32) if len(points) else None
                    point_labels = np.array(labels, dtype=np.int32) if len(labels) else None
                    masks, scores, _ = self.predictor.predict(
                        point_coords=point_coords,
                        point_labels=point_labels,
                        multimask_output=bool(multimask),
                    )
            else:
                self.predictor.set_image(rgb)
                point_coords = np.array(points, dtype=np.float32) if len(points) else None
                point_labels = np.array(labels, dtype=np.int32) if len(labels) else None
                masks, scores, _ = self.predictor.predict(
                    point_coords=point_coords,
                    point_labels=point_labels,
                    multimask_output=bool(multimask),
                )
        best = int(np.argmax(scores))
        return masks[best].astype(bool), float(scores[best])

    def _amg_points_per_side(self, dense: bool = False) -> int:
        if POINTS_PER_SIDE > 0:
            return POINTS_PER_SIDE
        if dense:
            return 20 if self.device == "cuda" else 16
        return 14 if self.device == "cuda" else 10

    def mask_generator(self, dense: bool = False):
        """Lazy tile-optimized SamAutomaticMaskGenerator.
        `dense=True` uses a finer prompt grid for small discrete objects (trees).
        """
        from segment_anything import SamAutomaticMaskGenerator

        pps = self._amg_points_per_side(dense=dense)
        key = f"tile-{pps}-{'dense' if dense else 'std'}"
        if self._mask_generator is None or self._mask_generator_key != key:
            self._mask_generator = SamAutomaticMaskGenerator(
                model=self.sam,
                points_per_side=pps,
                pred_iou_thresh=0.82 if dense else 0.84,
                stability_score_thresh=0.88 if dense else 0.90,
                box_nms_thresh=0.65 if dense else 0.7,
                crop_n_layers=0,
                min_mask_region_area=max(6, MIN_COMPONENT_PX // 2) if dense else max(8, MIN_COMPONENT_PX // 2),
            )
            self._mask_generator_key = key
            print(f"[sam] AMG ready (points_per_side={pps}, dense={dense}).", flush=True)
        return self._mask_generator

    def generate_tile_masks(self, rgb_tile: np.ndarray, dense: bool = False) -> list[dict]:
        import torch

        with torch.inference_mode():
            if self.device == "cuda" and self.use_fp16:
                with torch.cuda.amp.autocast():
                    return self.mask_generator(dense=dense).generate(rgb_tile)
            return self.mask_generator(dense=dense).generate(rgb_tile)


_engine = SamEngine()


ProgressCb = Callable[[float, str], None]


def _adaptive_max_edge(bbox: list[float], high_res: bool) -> int:
    """Pick working image edge from AOI geographic span."""
    west, south, east, north = (float(v) for v in bbox)
    span = max(abs(east - west), abs(north - south))
    base = MAX_EDGE_HIGH_RES if high_res else MAX_EDGE
    if span < 0.008:  # ~900 m — small AOI, prefer sharper pixels
        return max(base, MAX_EDGE_SMALL_AOI) if high_res else base
    if span > 0.05:  # large AOI — cap mosaic, rely on tiles
        return min(base, 1280) if high_res else min(MAX_EDGE, 1024)
    return base


def _iter_tiles(h: int, w: int, tile: int, overlap: int) -> list[tuple[int, int, int, int]]:
    """Return (y0, y1, x0, x1) tiles covering the image with overlap."""
    step = max(32, tile - overlap)
    tiles = []
    y = 0
    while y < h:
        y1 = min(h, y + tile)
        y0 = max(0, y1 - tile) if y1 == h and h > tile else y
        x = 0
        while x < w:
            x1 = min(w, x + tile)
            x0 = max(0, x1 - tile) if x1 == w and w > tile else x
            tiles.append((y0, y1, x0, x1))
            if x1 >= w:
                break
            x += step
        if y1 >= h:
            break
        y += step
    # Deduplicate identical windows
    uniq = []
    seen = set()
    for t in tiles:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq


def _mask_iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = np.logical_and(a, b).sum()
    if inter == 0:
        return 0.0
    union = np.logical_or(a, b).sum()
    return float(inter) / float(max(union, 1))


def _nms_components(
    components: list[tuple[np.ndarray, float]],
    iou_thresh: float = NMS_IOU,
) -> list[tuple[np.ndarray, float]]:
    """Greedy NMS by score to remove duplicate detections across tile seams."""
    if not components:
        return []
    ordered = sorted(components, key=lambda t: t[1], reverse=True)
    kept: list[tuple[np.ndarray, float]] = []
    for mask, score in ordered:
        if any(_mask_iou(mask, k[0]) >= iou_thresh for k in kept):
            continue
        kept.append((mask, score))
    return kept


def _component_confidence(predicted_iou: float, stability: float, area_px: int) -> float:
    """Blend AMG quality signals into a 0..1 confidence."""
    base = 0.55 * max(0.0, min(1.0, predicted_iou)) + 0.45 * max(0.0, min(1.0, stability))
    # Tiny speckles get a small penalty even if AMG scores are high.
    if area_px < MIN_COMPONENT_PX * 2:
        base *= 0.85
    return round(float(max(0.0, min(1.0, base))), 4)


def _predict_full_aoi_tiled(
    rgb: np.ndarray,
    aoi_mask: np.ndarray | None,
    min_confidence: float,
    progress: ProgressCb | None = None,
    dense: bool = False,
) -> tuple[np.ndarray, list[tuple[np.ndarray, float]], float]:
    """
    Tile-based full-AOI AMG: skip empty tiles, per-tile inference, NMS merge.
    """
    h, w = rgb.shape[:2]
    tiles = _iter_tiles(h, w, TILE_SIZE, TILE_OVERLAP)
    if progress:
        progress(0.05, "tiling")

    # Filter tiles that barely intersect the AOI.
    active: list[tuple[int, int, int, int]] = []
    for y0, y1, x0, x1 in tiles:
        if aoi_mask is None:
            active.append((y0, y1, x0, x1))
            continue
        region = aoi_mask[y0:y1, x0:x1]
        if region.size == 0:
            continue
        if float(region.mean()) < TILE_AOI_MIN_FRAC:
            continue
        active.append((y0, y1, x0, x1))
    if not active:
        active = tiles[:1] if tiles else [(0, h, 0, w)]

    components: list[tuple[np.ndarray, float]] = []
    union = np.zeros((h, w), dtype=bool)
    n = max(len(active), 1)

    for i, (y0, y1, x0, x1) in enumerate(active):
        if progress:
            progress(0.08 + 0.72 * (i / n), f"scanning ({i + 1}/{n})")
        tile_rgb = rgb[y0:y1, x0:x1]
        try:
            raw = _engine.generate_tile_masks(tile_rgb, dense=dense)
        except Exception as exc:  # noqa: BLE001
            print(f"[sam] tile {i + 1}/{n} failed: {exc}", flush=True)
            continue
        for item in raw:
            seg = np.asarray(item.get("segmentation")).astype(bool)
            if seg.shape[:2] != tile_rgb.shape[:2]:
                continue
            full = np.zeros((h, w), dtype=bool)
            full[y0:y1, x0:x1] = seg
            if aoi_mask is not None:
                full = np.logical_and(full, aoi_mask)
            area = int(full.sum())
            if area < MIN_COMPONENT_PX:
                continue
            pred = float(item.get("predicted_iou") or 0.0)
            stab = float(item.get("stability_score") or 0.0)
            conf = _component_confidence(pred, stab, area)
            if conf < float(min_confidence):
                continue
            # Light boundary refinement before merge.
            full = _clean_mask(full)
            if int(full.sum()) < MIN_COMPONENT_PX:
                continue
            union |= full
            components.append((full, conf))

    if progress:
        progress(0.82, "refining")
    components = _nms_components(components, NMS_IOU)
    mean_score = float(np.mean([s for _, s in components])) if components else 0.0
    return union, components, mean_score


def _empty_segment_result(orig_w: int, orig_h: int, mode: str, min_confidence: float, full_aoi: bool) -> dict:
    return {
        "geojson": {"type": "FeatureCollection", "features": []},
        "mask_png": _mask_to_png(np.zeros((orig_h, orig_w), dtype=bool)),
        "width": orig_w,
        "height": orig_h,
        "score": 0.0,
        "count": 0,
        "stats": {"point": 0, "line": 0, "polygon": 0},
        "feature_mode": mode,
        "min_confidence": min_confidence,
        "aoi_applied": True,
        "full_aoi": full_aoi,
        "device": _engine.device,
    }


def _execute_segment(req: SegmentRequest, progress: ProgressCb | None = None) -> dict:
    """Shared sync/async segment pipeline with optional progress callbacks."""
    if progress:
        progress(0.02, "preparing")

    try:
        image = _decode_image(req.image)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Could not decode image: {exc}") from exc

    if len(req.bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north].")

    mode = (req.feature_mode or "auto").lower().strip()
    if mode not in ("auto", "point", "line", "polygon"):
        raise ValueError("feature_mode must be auto, point, line, or polygon.")

    aoi_geom = _parse_aoi_geometry(req.aoi)
    aoi_units = _aoi_units_from_request(req.aoi)
    use_full_aoi = bool(req.full_aoi and aoi_geom is not None)

    if not use_full_aoi and not req.points:
        raise ValueError("At least one point prompt is required (or provide an AOI for full-AOI scan).")

    max_edge = _adaptive_max_edge(req.bbox, bool(req.high_res))
    score = 0.0
    mask = np.zeros((1, 1), dtype=bool)

    orig_w, orig_h = image.size
    scale = min(1.0, max_edge / max(orig_w, orig_h))
    if scale < 1.0:
        work = image.resize((max(1, round(orig_w * scale)), max(1, round(orig_h * scale))), Image.BILINEAR)
    else:
        work = image
    rgb = np.asarray(work).copy()
    work_h, work_w = rgb.shape[:2]

    aoi_mask_work = _rasterize_aoi(aoi_geom, req.bbox, work_w, work_h) if aoi_geom is not None else None
    if aoi_mask_work is not None:
        rgb[~aoi_mask_work] = 0

    try:
        dense = mode == "point" or (req.object_type or "").lower() in (
            "trees",
            "tree",
            "poles",
            "pole",
            "vehicles",
            "vehicle",
        )
        instance_seg = bool(req.instance_segmentation)
        object_type = (req.object_type or "").strip() or None

        if use_full_aoi:
            print(
                f"[sam] optimized full-AOI tiled scan ({work_w}x{work_h}, edge={max_edge}, "
                f"dense={dense}, object_type={object_type or '-'})…",
                flush=True,
            )
            mask_small, components, score = _predict_full_aoi_tiled(
                rgb, aoi_mask_work, req.min_confidence, progress, dense=dense
            )
            if not components:
                return _empty_segment_result(orig_w, orig_h, mode, req.min_confidence, True)

            if scale < 1.0:

                def _up(m: np.ndarray) -> np.ndarray:
                    img = Image.fromarray((m.astype(np.uint8) * 255)).resize((orig_w, orig_h), Image.NEAREST)
                    return np.asarray(img) > 127

                mask = _up(mask_small)
                components = [(_up(c), s) for c, s in components]
            else:
                mask = mask_small

            if aoi_geom is not None:
                aoi_mask_full = _rasterize_aoi(aoi_geom, req.bbox, orig_w, orig_h)
                if aoi_mask_full is not None:
                    mask = np.logical_and(mask, aoi_mask_full)
                    components = [
                        (np.logical_and(c, aoi_mask_full), s)
                        for c, s in components
                        if int(np.logical_and(c, aoi_mask_full).sum()) >= MIN_COMPONENT_PX
                    ]

            if progress:
                progress(0.88, "vectorizing")
            all_features = []
            stats = {"point": 0, "line": 0, "polygon": 0}
            next_id = 1
            for comp_mask, comp_score in components:
                fc, st, next_id = _mask_to_gis_geojson(
                    comp_mask,
                    req.bbox,
                    req.simplify,
                    mode,
                    comp_score,
                    object_type=object_type,
                    instance_segmentation=instance_seg,
                    instance_id_start=next_id,
                )
                all_features.extend(fc.get("features") or [])
                for k in stats:
                    stats[k] += int(st.get(k, 0))
            geojson = {"type": "FeatureCollection", "features": all_features}
        else:
            if progress:
                progress(0.2, "scanning")
            points = [[p.x * scale, p.y * scale] for p in req.points]
            labels = [int(p.label) for p in req.points]

            if aoi_mask_work is not None and points:
                filtered_pts, filtered_lbls = [], []
                for (x, y), lab in zip(points, labels):
                    ix, iy = int(round(x)), int(round(y))
                    if 0 <= iy < work_h and 0 <= ix < work_w and aoi_mask_work[iy, ix]:
                        filtered_pts.append([x, y])
                        filtered_lbls.append(lab)
                if not any(l == 1 for l in filtered_lbls):
                    raise ValueError("All foreground prompts are outside the AOI. Place points inside the AOI.")
                points, labels = filtered_pts, filtered_lbls

            mask_small, score = _engine.predict(rgb, points, labels, req.multimask)
            if scale < 1.0:
                mask_img = Image.fromarray((mask_small * 255).astype("uint8")).resize(
                    (orig_w, orig_h), Image.NEAREST
                )
                mask = np.asarray(mask_img) > 127
            else:
                mask = mask_small

            if aoi_geom is not None:
                aoi_mask_full = _rasterize_aoi(aoi_geom, req.bbox, orig_w, orig_h)
                if aoi_mask_full is not None:
                    mask = np.logical_and(mask, aoi_mask_full)

            if progress:
                progress(0.88, "vectorizing")
            geojson, stats, _ = _mask_to_gis_geojson(
                mask,
                req.bbox,
                req.simplify,
                mode,
                score,
                object_type=object_type,
                instance_segmentation=instance_seg,
            )
    except ValueError:
        raise
    except Exception as exc:  # noqa: BLE001
        print(f"[sam] inference failed: {exc}", flush=True)
        raise RuntimeError(f"SAM inference failed: {exc}") from exc

    if progress:
        progress(0.94, "refining")
    try:
        geojson["features"] = _clip_features_to_aoi(
            geojson["features"], aoi_geom, req.min_confidence, aoi_units
        )
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"GIS post-process failed: {exc}") from exc

    stats = {"point": 0, "line": 0, "polygon": 0}
    instance_ids: set[str] = set()
    for f in geojson["features"]:
        props = f.get("properties") or {}
        role = props.get("role") or props.get("geometry_role")
        ft = props.get("feature_type") or "polygon"
        # Count geometry kinds for map legend; object_count is unique instances.
        if ft in stats:
            stats[ft] += 1
        oid = props.get("object_id") or props.get("instance_id")
        if oid is not None:
            instance_ids.add(str(oid))
        elif role != "centroid":
            instance_ids.add(str(f.get("id") or id(f)))

    object_count = len(instance_ids) if instance_ids else len(
        [f for f in geojson["features"] if (f.get("properties") or {}).get("role") != "centroid"]
    )

    if progress:
        progress(1.0, "done")

    return {
        "geojson": geojson,
        "mask_png": _mask_to_png(mask),
        "width": orig_w,
        "height": orig_h,
        "score": float(score),
        "count": object_count,
        "object_count": object_count,
        "stats": stats,
        "feature_mode": mode,
        "object_type": object_type,
        "instance_segmentation": instance_seg,
        "min_confidence": req.min_confidence,
        "aoi_applied": aoi_geom is not None,
        "full_aoi": use_full_aoi,
        "device": _engine.device,
    }


# ── Async job store for progress polling ─────────────────────────────────────
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


def _run_segment_job(job_id: str, req: SegmentRequest) -> None:
    def progress(pct: float, stage: str) -> None:
        _set_job(job_id, status="running", progress=round(float(pct) * 100, 1), stage=stage)

    try:
        _set_job(job_id, status="running", progress=1.0, stage="preparing")
        result = _execute_segment(req, progress)
        _set_job(job_id, status="done", progress=100.0, stage="done", result=result, error=None)
    except Exception as exc:  # noqa: BLE001
        _set_job(job_id, status="error", progress=100.0, stage="error", error=str(exc), result=None)


def _decode_image(data_url: str) -> Image.Image:
    raw = data_url.split(",", 1)[1] if "," in data_url and data_url.strip().startswith("data:") else data_url
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


def _meters_per_deg(lat: float) -> tuple[float, float]:
    """Approximate metres per degree lon/lat at a given latitude."""
    lat_r = math.radians(lat)
    m_lat = 111_132.92 - 559.82 * math.cos(2 * lat_r) + 1.175 * math.cos(4 * lat_r)
    m_lon = 111_412.84 * math.cos(lat_r) - 93.5 * math.cos(3 * lat_r)
    return max(m_lon, 1.0), max(m_lat, 1.0)


def _pixel_to_lonlat(col: float, row: float, bbox, width: int, height: int) -> tuple[float, float]:
    west, south, east, north = (float(v) for v in bbox)
    lon = west + (col / max(width - 1, 1)) * (east - west)
    lat = north - (row / max(height - 1, 1)) * (north - south)
    return lon, lat


def _clean_mask(mask: np.ndarray) -> np.ndarray:
    """Morphological open/close to remove speckles and seal tiny gaps (GIS-ready edges)."""
    u8 = (mask.astype(np.uint8) * 255)
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    u8 = cv2.morphologyEx(u8, cv2.MORPH_OPEN, k3, iterations=1)
    u8 = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, k5, iterations=2)
    # Drop tiny connected components (noise islands).
    n, labels, stats, _ = cv2.connectedComponentsWithStats((u8 > 0).astype(np.uint8), connectivity=8)
    cleaned = np.zeros_like(u8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= MIN_COMPONENT_PX:
            cleaned[labels == i] = 255
    return cleaned > 0


def _skeletonize(binary_u8: np.ndarray) -> np.ndarray:
    """Morphological skeleton (works without opencv-contrib)."""
    img = (binary_u8 > 0).astype(np.uint8) * 255
    skel = np.zeros_like(img)
    element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
    while True:
        eroded = cv2.erode(img, element)
        opened = cv2.dilate(eroded, element)
        temp = cv2.subtract(img, opened)
        skel = cv2.bitwise_or(skel, temp)
        img = eroded
        if cv2.countNonZero(img) == 0:
            break
    return skel


def _skeleton_to_linestring(skel: np.ndarray, bbox, width: int, height: int):
    """Trace skeleton pixels into an ordered LineString (EPSG:4326)."""
    from shapely.geometry import LineString

    ys, xs = np.where(skel > 0)
    if len(xs) < 2:
        return None
    # Prefer the longest contour of the dilated skeleton as a continuous path.
    dilated = cv2.dilate(skel, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)), iterations=1)
    # OpenCV 4 → (contours, hierarchy); OpenCV 3 → (image, contours, hierarchy).
    found = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    contours = found[0] if len(found) == 2 else found[1]
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    if len(contour) < 2:
        return None
    # Downsample contour for a clean polyline.
    epsilon = max(1.5, 0.008 * cv2.arcLength(contour, False))
    approx = cv2.approxPolyDP(contour, epsilon, False)
    coords = []
    for pt in approx.reshape(-1, 2):
        lon, lat = _pixel_to_lonlat(float(pt[0]), float(pt[1]), bbox, width, height)
        coords.append((lon, lat))
    if len(coords) < 2:
        return None
    line = LineString(coords)
    if line.length <= 0:
        return None
    return line.simplify(max(line.length * 0.002, 1e-7), preserve_topology=True)


def _polygon_from_component(comp_mask: np.ndarray, bbox, width: int, height: int, simplify_deg: float | None):
    """Vectorize one binary component to a cleaned Shapely polygon."""
    from rasterio.features import shapes as rio_shapes
    from rasterio.transform import from_bounds
    from shapely.geometry import MultiPolygon, Polygon, shape as shp_shape
    from shapely.ops import unary_union

    west, south, east, north = (float(v) for v in bbox)
    transform = from_bounds(west, south, east, north, width, height)
    geoms = []
    for geom, value in rio_shapes(comp_mask.astype("uint8"), mask=comp_mask, transform=transform):
        if int(value) != 1:
            continue
        g = shp_shape(geom)
        if not g.is_empty:
            geoms.append(g)
    if not geoms:
        return None
    poly = unary_union(geoms).buffer(0)
    if poly.is_empty:
        return None
    if isinstance(poly, MultiPolygon):
        poly = max(poly.geoms, key=lambda g: g.area)
    if not isinstance(poly, Polygon) or poly.area <= 0:
        return None

    # Drop tiny holes (topology cleanup).
    if poly.interiors:
        min_hole = poly.area * 0.015
        kept = [h for h in poly.interiors if Polygon(h).area >= min_hole]
        poly = Polygon(poly.exterior, kept)

    # Adaptive simplify: default ~0.4% of extent diagonal in degrees.
    if simplify_deg is None:
        diag = math.hypot(east - west, north - south)
        simplify_deg = max(diag * 0.0015, 1e-7)
    poly = poly.simplify(float(simplify_deg), preserve_topology=True)
    if poly.is_empty or poly.area <= 0:
        return None
    return poly.buffer(0) if not poly.is_valid else poly


def _shape_metrics(poly, lat0: float) -> dict:
    """Compute area (m²), elongation, fill-ratio for feature-type classification."""
    from shapely.geometry import Polygon

    m_lon, m_lat = _meters_per_deg(lat0)
    # Scale lon/lat → local metres for metric estimates.
    def to_m(x, y):
        return (x * m_lon, y * m_lat)

    coords_m = [to_m(x, y) for x, y in poly.exterior.coords]
    poly_m = Polygon(coords_m)
    area = float(poly_m.area)
    perim = float(poly_m.length)
    minx, miny, maxx, maxy = poly_m.bounds
    bw, bh = max(maxx - minx, 1e-6), max(maxy - miny, 1e-6)
    elongation = max(bw, bh) / min(bw, bh)
    fill = area / (bw * bh)
    circularity = (4.0 * math.pi * area) / max(perim * perim, 1e-9)
    return {
        "area_m2": area,
        "perimeter_m": perim,
        "elongation": elongation,
        "fill_ratio": fill,
        "circularity": circularity,
    }


def _classify_feature(metrics: dict, mode: str) -> str:
    mode = (mode or "auto").lower().strip()
    if mode in ("point", "line", "polygon"):
        return mode
    # Auto: trees / compact objects → Point; roads/rivers → Line; else Polygon.
    if metrics["area_m2"] <= POINT_MAX_AREA_M2 and metrics["circularity"] >= 0.35:
        return "point"
    if metrics["elongation"] >= LINE_MIN_ELONGATION and metrics["fill_ratio"] <= LINE_MAX_FILL:
        return "line"
    if metrics["elongation"] >= LINE_MIN_ELONGATION * 1.4 and metrics["area_m2"] < 2500:
        return "line"
    return "polygon"


def _feature_confidence(sam_score: float, metrics: dict, ftype: str) -> float:
    """Blend SAM mask score with shape-fit quality into a 0..1 confidence."""
    base = max(0.0, min(1.0, float(sam_score)))
    if ftype == "point":
        shape = min(1.0, metrics["circularity"] * 1.15)
    elif ftype == "line":
        shape = min(1.0, (metrics["elongation"] / 8.0) * (1.0 - metrics["fill_ratio"]))
    else:
        # Polygons: prefer filled, reasonably compact farm/building shapes.
        shape = min(1.0, 0.45 + metrics["fill_ratio"] * 0.55)
    return round(float(0.55 * base + 0.45 * max(0.15, shape)), 4)


def _parse_aoi_geometry(aoi: dict | None):
    """Parse GeoJSON AOI (Geometry / Feature / FeatureCollection) into a Shapely geometry."""
    if not aoi or not isinstance(aoi, dict):
        return None
    from shapely.geometry import shape
    from shapely.ops import unary_union

    t = aoi.get("type")
    try:
        if t == "FeatureCollection":
            geoms = []
            for f in aoi.get("features") or []:
                g = f.get("geometry") if isinstance(f, dict) else None
                if g:
                    geoms.append(shape(g))
            if not geoms:
                return None
            return unary_union(geoms)
        if t == "Feature":
            g = aoi.get("geometry")
            return shape(g) if g else None
        if t in ("Polygon", "MultiPolygon", "GeometryCollection"):
            return shape(aoi)
    except Exception:  # noqa: BLE001
        return None
    return None


def _rasterize_aoi(aoi_geom, bbox, width: int, height: int) -> np.ndarray | None:
    """Rasterize AOI polygon into a boolean pixel mask (True = inside AOI)."""
    if aoi_geom is None or aoi_geom.is_empty:
        return None
    from rasterio.features import rasterize
    from rasterio.transform import from_bounds
    from shapely.geometry import mapping

    west, south, east, north = (float(v) for v in bbox)
    transform = from_bounds(west, south, east, north, width, height)
    # Invert Y vs image row order: rasterio from_bounds uses south→north; we flip after.
    shapes = [(mapping(aoi_geom), 1)]
    arr = rasterize(
        shapes,
        out_shape=(height, width),
        transform=transform,
        fill=0,
        dtype="uint8",
        all_touched=True,
    )
    # Same transform as mask→GeoJSON vectorization (row 0 = north).
    return arr.astype(bool)


def _clip_features_to_aoi(features: list, aoi_geom, min_confidence: float, aoi_units: list | None = None) -> list:
    """Keep high-confidence GIS features inside AOI units and stamp aoi_id."""
    if not features:
        return features
    from shapely.geometry import mapping, shape
    from shapely.validation import make_valid

    aoi = make_valid(aoi_geom) if aoi_geom is not None else None
    units = aoi_units or []
    kept = []
    for f in features:
        props = dict(f.get("properties") or {})
        conf = float(props.get("confidence") or 0.0)
        if conf < float(min_confidence):
            continue
        geom = f.get("geometry")
        if not geom:
            continue
        try:
            g = make_valid(shape(geom))
        except Exception:  # noqa: BLE001
            continue
        if g.is_empty:
            continue

        assigned_id = None
        clipped = g
        if units:
            # Prefer the AOI unit that contains the representative point / largest overlap.
            best = (0.0, None, None)  # score, aoi_id, clipped geom
            c = g.representative_point() if hasattr(g, "representative_point") else g.centroid
            for unit_id, unit_geom in units:
                ug = make_valid(unit_geom)
                if ug.is_empty or not g.intersects(ug):
                    continue
                if g.geom_type in ("Point", "MultiPoint"):
                    if not ug.contains(g) and not ug.contains(c):
                        continue
                    score = 1.0
                    inter = g
                else:
                    inter = g.intersection(ug)
                    if inter.is_empty:
                        continue
                    if g.geom_type in ("LineString", "MultiLineString"):
                        if inter.length < 0.35 * max(g.length, 1e-12):
                            continue
                        score = float(inter.length)
                    else:
                        if g.area > 0 and inter.area < 0.35 * g.area:
                            continue
                        score = float(inter.area)
                # Boost if representative point is inside this unit.
                if ug.contains(c):
                    score += 1e9
                if score > best[0]:
                    best = (score, unit_id, inter)
            if best[1] is None:
                continue
            assigned_id, clipped = best[1], best[2]
        elif aoi is not None:
            if not g.intersects(aoi):
                continue
            if g.geom_type in ("Point", "MultiPoint"):
                if not aoi.contains(g):
                    continue
            else:
                inter = g.intersection(aoi)
                if inter.is_empty:
                    continue
                if g.geom_type in ("LineString", "MultiLineString"):
                    if inter.length < 0.35 * max(g.length, 1e-12):
                        continue
                elif g.area > 0 and inter.area < 0.35 * g.area:
                    continue
                clipped = inter
            assigned_id = "aoi-1"

        props["aoi_id"] = assigned_id
        kept.append({"type": "Feature", "geometry": mapping(clipped), "properties": props})
    return kept


def _aoi_units_from_request(aoi: dict | None):
    """Return list of (aoi_id, shapely geom) for FeatureCollection AOIs."""
    if not aoi or not isinstance(aoi, dict):
        return []
    from shapely.geometry import shape
    from shapely.validation import make_valid

    units = []
    if aoi.get("type") == "FeatureCollection":
        for i, f in enumerate(aoi.get("features") or []):
            if not isinstance(f, dict) or not f.get("geometry"):
                continue
            try:
                g = make_valid(shape(f["geometry"]))
            except Exception:  # noqa: BLE001
                continue
            if g.is_empty:
                continue
            props = f.get("properties") or {}
            aoi_id = str(props.get("aoi_id") or props.get("aoiId") or f.get("id") or f"aoi-{i + 1}")
            units.append((aoi_id, g))
    return units


def _object_area_band(object_type: str | None, feature_mode: str) -> tuple[float, float] | None:
    """Return (min_m2, max_m2) area filter for discrete object types, else None."""
    ot = (object_type or "").strip().lower().replace(" ", "_")
    mode = (feature_mode or "auto").lower()
    if mode != "point" and ot not in ("trees", "tree", "poles", "pole", "vehicles", "vehicle"):
        return None
    if ot in ("trees", "tree"):
        return (0.4, float(os.environ.get("SAM_TREE_MAX_AREA_M2", "120")))
    if ot in ("poles", "pole"):
        return (0.05, 25.0)
    if ot in ("vehicles", "vehicle"):
        return (1.5, 80.0)
    if mode == "point":
        # Generic discrete objects — keep compact instances.
        return (0.3, float(POINT_MAX_AREA_M2) * 2.5)
    return None


def _instance_fill_color(idx: int) -> str:
    import colorsys

    h = (idx * 0.61803398875) % 1.0
    r, g, b = colorsys.hsv_to_rgb(h, 0.55, 0.95)
    return f"#{int(r * 255):02x}{int(g * 255):02x}{int(b * 255):02x}"


def _mask_to_gis_geojson(
    mask: np.ndarray,
    bbox,
    simplify: float | None,
    feature_mode: str,
    sam_score: float,
    object_type: str | None = None,
    instance_segmentation: bool = True,
    instance_id_start: int = 1,
):
    """
    Turn a SAM mask into GIS-ready instance features.

    For Point / discrete objects (trees, poles, vehicles): emit both
      - Polygon mask boundary (role=mask)
      - Centroid Point (role=centroid)
    sharing the same object_id / instance_id — professional instance segmentation.
    """
    from shapely.geometry import mapping, Point

    cleaned = _clean_mask(mask)
    height, width = cleaned.shape[:2]
    west, south, east, north = (float(v) for v in bbox)
    lat0 = (south + north) / 2.0
    m_lon, m_lat = _meters_per_deg(lat0)

    u8 = (cleaned.astype(np.uint8) * 255)
    n, labels, stats, centroids = cv2.connectedComponentsWithStats((u8 > 0).astype(np.uint8), connectivity=8)

    features = []
    stats_count = {"point": 0, "line": 0, "polygon": 0}
    area_band = _object_area_band(object_type, feature_mode)
    instance_idx = instance_id_start

    for i in range(1, n):
        area_px = int(stats[i, cv2.CC_STAT_AREA])
        if area_px < MIN_COMPONENT_PX:
            continue
        comp = labels == i
        poly = _polygon_from_component(comp, bbox, width, height, simplify)
        if poly is None:
            continue
        metrics = _shape_metrics(poly, lat0)
        if area_band is not None:
            lo, hi = area_band
            if metrics["area_m2"] < lo or metrics["area_m2"] > hi:
                continue
            # Prefer compact blobs for trees/vehicles (drop elongated strips).
            if metrics["elongation"] > 4.5 and metrics["circularity"] < 0.2:
                continue

        ftype = _classify_feature(metrics, feature_mode)
        confidence = _feature_confidence(sam_score, metrics, ftype)

        # Mask centroid in geographic coords
        cy, cx = float(centroids[i][1]), float(centroids[i][0])
        lon, lat = _pixel_to_lonlat(cx, cy, bbox, width, height)
        if not (math.isfinite(lon) and math.isfinite(lat)):
            c = poly.centroid
            lon, lat = c.x, c.y

        # Equivalent circular diameter from area (m)
        diameter_m = 2.0 * math.sqrt(max(metrics["area_m2"], 0.0) / math.pi)
        # Axis-aligned size from geographic bbox
        minx, miny, maxx, maxy = poly.bounds
        width_m = abs(maxx - minx) * m_lon
        height_m = abs(maxy - miny) * m_lat
        size_m = max(width_m, height_m)

        object_id = f"SAM-{instance_idx:05d}"
        color = _instance_fill_color(instance_idx)
        ot_label = (object_type or "").strip() or None

        base_props = {
            "source": "sam",
            "feature_type": ftype,
            "object_id": object_id,
            "instance_id": instance_idx,
            "confidence": confidence,
            "confidence_score": confidence,
            "sam_score": round(float(sam_score), 4),
            "area_m2": round(metrics["area_m2"], 2),
            "perimeter_m": round(metrics["perimeter_m"], 2),
            "diameter_m": round(diameter_m, 2),
            "size_m": round(size_m, 2),
            "width_m": round(width_m, 2),
            "height_m": round(height_m, 2),
            "longitude": round(lon, 7),
            "latitude": round(lat, 7),
            "centroid_lon": round(lon, 7),
            "centroid_lat": round(lat, 7),
            "elongation": round(metrics["elongation"], 3),
            "circularity": round(metrics["circularity"], 3),
            "fill_color": color,
            "stroke_color": "#ffffff",
            "crs": "EPSG:4326",
        }
        if ot_label:
            base_props["detected_object_type"] = ot_label
            base_props["class"] = ot_label
        else:
            base_props["class"] = {
                "point": "tree_or_object",
                "line": "road_or_river",
                "polygon": "field_or_building",
            }[ftype]

        emit_dual = bool(instance_segmentation) and ftype == "point"

        if ftype == "point":
            if not ot_label:
                base_props["class"] = "tree" if metrics["area_m2"] <= POINT_MAX_AREA_M2 else "object"
            if emit_dual:
                # 1) Instance mask polygon
                mask_props = {
                    **base_props,
                    "role": "mask",
                    "geometry_role": "mask",
                    "feature_type": "polygon",  # geometry is polygon; detection mode stays point-object
                    "detection_mode": "point",
                }
                features.append(
                    {
                        "type": "Feature",
                        "id": f"{object_id}-mask",
                        "geometry": mapping(poly),
                        "properties": mask_props,
                    }
                )
                # 2) Centroid marker
                pt_props = {
                    **base_props,
                    "role": "centroid",
                    "geometry_role": "centroid",
                    "feature_type": "point",
                    "detection_mode": "point",
                }
                features.append(
                    {
                        "type": "Feature",
                        "id": f"{object_id}-centroid",
                        "geometry": mapping(Point(lon, lat)),
                        "properties": pt_props,
                    }
                )
                stats_count["point"] += 1
                stats_count["polygon"] += 1
            else:
                features.append(
                    {
                        "type": "Feature",
                        "id": object_id,
                        "geometry": mapping(Point(lon, lat)),
                        "properties": {**base_props, "role": "centroid", "feature_type": "point"},
                    }
                )
                stats_count["point"] += 1
        elif ftype == "line":
            skel = _skeletonize((comp.astype(np.uint8) * 255))
            line = _skeleton_to_linestring(skel, bbox, width, height)
            if line is None or line.length <= 0:
                coords = list(poly.exterior.coords)
                if len(coords) < 2:
                    continue
                best = (0.0, coords[0], coords[0])
                for a in range(0, len(coords), max(1, len(coords) // 40)):
                    for b in range(a + 1, len(coords), max(1, len(coords) // 40)):
                        d = (coords[a][0] - coords[b][0]) ** 2 + (coords[a][1] - coords[b][1]) ** 2
                        if d > best[0]:
                            best = (d, coords[a], coords[b])
                from shapely.geometry import LineString

                line = LineString([best[1], best[2]])
            props = {
                **base_props,
                "role": "centreline",
                "length_m": round(metrics["perimeter_m"] * 0.45, 2),
                "class": ot_label or "road_or_river",
                "feature_type": "line",
            }
            features.append({"type": "Feature", "id": object_id, "geometry": mapping(line), "properties": props})
            stats_count["line"] += 1
        else:
            props = {**base_props, "role": "mask", "feature_type": "polygon"}
            if not ot_label:
                if metrics["fill_ratio"] >= 0.62 and 1.0 <= metrics["elongation"] <= 2.8 and metrics["area_m2"] < 4000:
                    props["class"] = "building"
                elif metrics["area_m2"] >= 400:
                    props["class"] = "agricultural_field"
                else:
                    props["class"] = "polygon"
            features.append({"type": "Feature", "id": object_id, "geometry": mapping(poly), "properties": props})
            # Optional centroid for polygon instances (fields / buildings)
            if instance_segmentation:
                features.append(
                    {
                        "type": "Feature",
                        "id": f"{object_id}-centroid",
                        "geometry": mapping(Point(lon, lat)),
                        "properties": {
                            **props,
                            "role": "centroid",
                            "geometry_role": "centroid",
                            "feature_type": "point",
                        },
                    }
                )
                stats_count["point"] += 1
            stats_count["polygon"] += 1

        instance_idx += 1

    return {"type": "FeatureCollection", "features": features}, stats_count, instance_idx


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


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "engine": _engine.name,
        "model": MODEL_TYPE,
        "gis": True,
        "device": _engine.device,
        "tile_size": TILE_SIZE,
        "optimized": True,
    }


@app.post("/segment")
def segment(req: SegmentRequest):
    """Synchronous segment — preferred for small AOIs; still uses tiled optimized path."""
    try:
        return _execute_segment(req, None)
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc)})


@app.post("/segment-job")
def segment_job(req: SegmentRequest, background_tasks: BackgroundTasks):
    """Start an async full-AOI job; poll GET /segment-job/{id} for progress."""
    job_id = uuid.uuid4().hex[:16]
    _set_job(
        job_id,
        status="queued",
        progress=0.0,
        stage="queued",
        result=None,
        error=None,
        created_at=time.time(),
    )
    background_tasks.add_task(_run_segment_job, job_id, req)
    return {"job_id": job_id, "status": "queued"}


@app.get("/segment-job/{job_id}")
def get_segment_job(job_id: str):
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
