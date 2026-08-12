"""
SegFormer GIS Detection — pretrained ADE20K SegFormer microservice.

Powered by HuggingFace `nvidia/segformer-b5-finetuned-ade-640-640` (override with
`SEGFORMER_MODEL_ID`, e.g. B0 for CPU/light hosts) with an explicit AgroCloud
class ID → ADE20K label-index mapping. Every catalogue class has at least one
ADE20K proxy so Detect can run on the pretrained checkpoint.

Field pipeline (class 1 / Agricultural Field):
  ADE20K field(29) only, open-only morphology, distance-transform watershed
  instance split, higher min component area, coarse boxes for SAM2 refine.

Contract (matches frontend segformerClient + Node /api/segformer-detection proxy):
  POST /detect   application/json
    {
      "imageDataUrl" | "image": "<data:image/png;base64,...>" | "<base64>",
      "bbox":   [west, south, east, north],
      "classId" | "class_id": <int>,
      "className" | "class_name": <str, optional>,
      "ade20kIndices" | "ade20k_indices": [<int>, ...],  # optional override
      "minConfidence" | "min_confidence": <0..1, optional>,
      "tileSize" | "tile_size": <256|512|640|1024, optional, default 512>,
      "overlap" | "overlap_pct": <0..0.5 fraction or 0..50 percent, optional, default 0.2>,
      "aoi": <GeoJSON Polygon|MultiPolygon|Feature|FeatureCollection, optional>
    }
  Response 200:
    {
      "geojson": FeatureCollection (Polygon, EPSG:4326),
      "mask_png": "data:image/png;base64,...",
      "width": int, "height": int,
      "score": float, "count": int,
      "class_id": int, "class_name": str,
      "aoi_applied": bool, "device": str,
      "engine": "segformer-b5" | "segformer-ade20k",
      "instance_count": int,
      "instances": [ { "feature_id", "bbox_xyxy", "centroid_xy", "score" }, ... ]
    }
  GET /health → { status, engine, model, device, model_ready }
"""

from __future__ import annotations

import base64
import io
import json
import math
import os
import threading
from datetime import datetime, timezone
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field

_DEFAULT_MODEL_ID = "nvidia/segformer-b5-finetuned-ade-640-640"
MODEL_ID = os.environ.get("SEGFORMER_MODEL_ID", _DEFAULT_MODEL_ID).strip() or _DEFAULT_MODEL_ID
MAX_EDGE = int(os.environ.get("SEGFORMER_MAX_EDGE", "1024"))
# When tiling, allow a larger work canvas (tiles keep inference at tileSize).
MAX_EDGE_TILED = int(os.environ.get("SEGFORMER_MAX_EDGE_TILED", "4096"))
DEFAULT_TILE_SIZE = int(os.environ.get("SEGFORMER_TILE_SIZE", "512"))
DEFAULT_OVERLAP = float(os.environ.get("SEGFORMER_OVERLAP", "0.2"))
# 640 matches B5 ADE20K-640 native size; UI 512 maps to nearest allowed.
ALLOWED_TILE_SIZES = (256, 512, 640, 1024)
DEFAULT_MIN_CONFIDENCE = float(os.environ.get("SEGFORMER_MIN_CONFIDENCE", "0.45"))
AG_MIN_CONFIDENCE = float(os.environ.get("SEGFORMER_AG_MIN_CONFIDENCE", "0.3"))
MIN_COMPONENT_PX = int(os.environ.get("SEGFORMER_MIN_COMPONENT_PX", "24"))
# Field pipeline: drop tiny fragments so watershed instances stay parcel-scale.
FIELD_MIN_COMPONENT_PX = int(os.environ.get("SEGFORMER_FIELD_MIN_COMPONENT_PX", "96"))
# Agricultural Field class uses field-only ADE20K + instance split.
FIELD_CLASS_IDS = {1}
UNSUPPORTED_MSG = "Requires fine-tuned SegFormer weights"
MASK_RGB = (34, 197, 94)  # emerald overlay


def _engine_label() -> str:
    mid = MODEL_ID.lower()
    if "b5" in mid or "mit-b5" in mid:
        return "segformer-b5"
    if "b4" in mid or "mit-b4" in mid:
        return "segformer-b4"
    if "b3" in mid or "mit-b3" in mid:
        return "segformer-b3"
    if "b2" in mid or "mit-b2" in mid:
        return "segformer-b2"
    if "b1" in mid or "mit-b1" in mid:
        return "segformer-b1"
    if "b0" in mid or "mit-b0" in mid:
        return "segformer-b0"
    return "segformer-ade20k"


# Agriculture (1–15) + trees (20–34): spaceborne proxies need looser thresholds.
AG_VEG_CLASS_IDS = set(range(1, 16)) | set(range(20, 35))
# Min fraction of polygon area that must remain after AOI clip (ag fields are lenient).
AOI_OVERLAP_MIN = 0.2
AOI_OVERLAP_MIN_AG = 0.05

# AgroCloud classId → ADE20K indices (mirrors frontend segformerCatalog.ts).
# Every class has at least one proxy so pretrained Detect can run.
# Class 1 (field pipeline): ADE20K field(29) only — no earth/grass/plant soup.
CLASS_ADE20K: dict[int, list[int]] = {
    1: [29],
    2: [29, 9, 17, 13],
    3: [13, 94, 9],
    4: [13, 94, 9],
    5: [29, 13, 9],
    6: [29, 9, 17, 21],
    7: [29, 9, 17, 13],
    8: [32, 6],
    9: [1],
    10: [17, 4],
    11: [4, 17],
    12: [4, 17],
    13: [9, 17, 29],
    14: [9, 17, 29],
    15: [13, 9, 29],
    20: [4],
    21: [4],
    22: [4],
    23: [4],
    24: [72],
    25: [4],
    26: [4],
    27: [4],
    28: [17],
    29: [17],
    30: [9],
    31: [4, 17],
    32: [9, 17],
    33: [4],
    34: [4, 17],
    40: [1],
    41: [1, 25],
    42: [1],
    43: [1],
    44: [1],
    45: [1],
    46: [13, 1],
    47: [1, 25, 48],
    48: [1, 25, 79],
    50: [6],
    51: [6],
    52: [6, 11],
    53: [6, 52],
    54: [61],
    55: [54],
    56: [54],
    57: [6, 11],
    60: [20],
    61: [83],
    62: [80],
    63: [83],
    64: [116],
    65: [90],
    66: [76, 103],
    67: [41],
    68: [83, 41],
    70: [60, 21],
    71: [128, 21],
    72: [21, 128],
    73: [21, 61],
    74: [21],
    75: [21],
    76: [21],
    77: [21],
    78: [21],
    79: [26, 21],
    80: [13],
    81: [46],
    82: [46, 13],
    83: [34],
    84: [16, 68],
    85: [13],
    86: [46, 13],
    87: [94, 13],
    88: [13, 94],
    90: [6, 91],
    91: [91],
    92: [21],
    93: [29],
    94: [29, 21],
    95: [29],
    96: [122],
    97: [1],
    98: [1],
    110: [13, 34],
    111: [13, 34],
    112: [34, 13],
    113: [13],
    114: [13, 46],
    115: [13],
    116: [1],
    117: [1],
    120: [1],
    121: [130, 1],
    122: [84],
    123: [1],
    124: [1],
    125: [6, 91],
    126: [1],
    127: [1],
    130: [21],
    131: [13],
    132: [13, 1],
    133: [13, 34],
    134: [46, 13],
    135: [9, 17],
    136: [13, 94],
    137: [46, 13],
}

CLASS_NAMES: dict[int, str] = {
    1: "Agricultural Field",
    2: "Cultivated Land",
    3: "Fallow Field",
    11: "Orchard",
    12: "Plantation",
    13: "Pasture",
    14: "Grassland",
    20: "Tree Canopy",
    21: "Individual Tree",
    22: "Tree Row",
    23: "Forest Tree",
    27: "Plantation Tree",
    28: "Shrub",
    29: "Bush Area",
    30: "Grass Vegetation",
    31: "Dense Vegetation",
    32: "Sparse Vegetation",
    40: "Building",
    41: "Residential Building",
    42: "Industrial Building",
    43: "Warehouse",
    44: "Farm Building",
    47: "Urban Area",
    48: "Settlement",
    50: "Road",
    51: "Highway",
    52: "Street",
    54: "Bridge",
    56: "Runway",
    60: "Car",
    61: "Truck",
    62: "Bus",
    64: "Motorcycle",
    65: "Aircraft",
    66: "Ship",
    70: "River",
    71: "Lake",
    72: "Reservoir",
    74: "Canal",
    76: "Water Pond",
    77: "Flood Water",
    78: "Wetland",
    79: "Coastal Water",
    80: "Bare Soil",
    81: "Sand",
    82: "Desert",
    83: "Rock",
    84: "Mountain",
    85: "Gravel Area",
    87: "Dry Land",
    90: "Farm Road",
    91: "Field Track",
    96: "Water Tank",
    98: "Agricultural Warehouse",
    116: "Industrial Area",
    117: "Factory",
    130: "Flood Area",
    137: "Desertification Area",
}

app = FastAPI(title="SegFormer GIS Detection")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DetectRequest(BaseModel):
    imageDataUrl: str | None = None
    image: str | None = None
    bbox: list[float]
    classId: int | None = None
    class_id: int | None = None
    className: str | None = None
    class_name: str | None = None
    ade20kIndices: list[int] | None = None
    ade20k_indices: list[int] | None = None
    minConfidence: float | None = None
    min_confidence: float | None = None
    tileSize: int | None = None
    tile_size: int | None = None
    overlap: float | None = None
    overlap_pct: float | None = None
    aoi: dict | None = None
    simplify: float | None = None
    date: str | None = None
    Date: str | None = None
    provider: str | None = None
    Provider: str | None = None

    def resolved_image(self) -> str:
        raw = self.imageDataUrl or self.image
        if not raw or not str(raw).strip():
            raise ValueError("imageDataUrl (or image) is required.")
        return str(raw)

    def resolved_class_id(self) -> int:
        cid = self.classId if self.classId is not None else self.class_id
        if cid is None:
            raise ValueError("classId is required.")
        return int(cid)

    def resolved_class_name(self, class_id: int) -> str:
        name = (self.className or self.class_name or "").strip()
        if name:
            return name
        return CLASS_NAMES.get(class_id, f"Class {class_id}")

    def resolved_ade20k(self, class_id: int) -> list[int]:
        override = self.ade20kIndices if self.ade20kIndices is not None else self.ade20k_indices
        if override is not None:
            return [int(i) for i in override]
        return list(CLASS_ADE20K.get(class_id, []))

    def resolved_min_confidence(self, class_id: int | None = None) -> float:
        v = self.minConfidence if self.minConfidence is not None else self.min_confidence
        if v is None:
            if class_id is not None and int(class_id) in AG_VEG_CLASS_IDS:
                return AG_MIN_CONFIDENCE
            return DEFAULT_MIN_CONFIDENCE
        return max(0.0, min(1.0, float(v)))

    def resolved_tile_size(self) -> int:
        raw = self.tileSize if self.tileSize is not None else self.tile_size
        if raw is None:
            # B5 native size is 640; prefer it when the env default is unset / 512.
            if "b5" in MODEL_ID.lower() and 640 in ALLOWED_TILE_SIZES:
                return 640 if DEFAULT_TILE_SIZE not in ALLOWED_TILE_SIZES else (
                    DEFAULT_TILE_SIZE if DEFAULT_TILE_SIZE != 512 else 640
                )
            return DEFAULT_TILE_SIZE if DEFAULT_TILE_SIZE in ALLOWED_TILE_SIZES else 512
        try:
            v = int(raw)
        except (TypeError, ValueError):
            return 512
        # Map UI 512 → 640 when running B5 ADE20K-640.
        if v == 512 and "b5" in MODEL_ID.lower() and 640 in ALLOWED_TILE_SIZES:
            return 640
        if v in ALLOWED_TILE_SIZES:
            return v
        # Nearest allowed preset.
        return min(ALLOWED_TILE_SIZES, key=lambda t: abs(t - v))

    def resolved_overlap(self) -> float:
        """Return overlap as a fraction of tile size in [0, 0.5]."""
        raw = self.overlap if self.overlap is not None else self.overlap_pct
        if raw is None:
            return max(0.0, min(0.5, float(DEFAULT_OVERLAP)))
        try:
            v = float(raw)
        except (TypeError, ValueError):
            return max(0.0, min(0.5, float(DEFAULT_OVERLAP)))
        # Accept either 0..1 fraction or 1..50 percent.
        if v > 1.0:
            v = v / 100.0
        return max(0.0, min(0.5, v))

    def resolved_date(self) -> str:
        raw = (self.date or self.Date or "").strip()
        return raw or datetime.now(timezone.utc).isoformat()

    def resolved_provider(self) -> str:
        raw = (self.provider or self.Provider or "").strip()
        return raw or "segformer-ade20k"


def _overlap_pixels(tile_size: int, overlap_frac: float) -> int:
    tile = max(32, int(tile_size))
    frac = max(0.0, min(0.5, float(overlap_frac)))
    return max(0, min(tile - 1, int(round(tile * frac))))


def _iter_tiles(
    height: int, width: int, tile_size: int, overlap_px: int
) -> list[tuple[int, int, int, int]]:
    """Return (y0, y1, x0, x1) windows covering HxW with overlap."""
    h = max(0, int(height))
    w = max(0, int(width))
    if h <= 0 or w <= 0:
        return []
    tile = max(32, int(tile_size))
    if h <= tile and w <= tile:
        return [(0, h, 0, w)]

    overlap = max(0, min(tile - 1, int(overlap_px)))
    step = max(32, tile - overlap)
    tiles: list[tuple[int, int, int, int]] = []
    seen: set[tuple[int, int, int, int]] = set()

    y = 0
    while y < h:
        y0 = y
        y1 = min(h, y0 + tile)
        if y1 - y0 < tile and y0 > 0:
            y0 = max(0, y1 - tile)
        x = 0
        while x < w:
            x0 = x
            x1 = min(w, x0 + tile)
            if x1 - x0 < tile and x0 > 0:
                x0 = max(0, x1 - tile)
            win = (y0, y1, x0, x1)
            if win not in seen:
                seen.add(win)
                tiles.append(win)
            if x1 >= w:
                break
            x += step
        if y1 >= h:
            break
        y += step
    return tiles


def _predict_tiled(
    engine: "SegFormerEngine",
    rgb: np.ndarray,
    tile_size: int,
    overlap_frac: float,
) -> tuple[np.ndarray, np.ndarray, int]:
    """
    Run SegFormer on overlapping tiles and stitch by max confidence.
    Returns (labels HxW int64, conf HxW float32, tile_count).
    """
    h, w = rgb.shape[:2]
    overlap_px = _overlap_pixels(tile_size, overlap_frac)
    windows = _iter_tiles(h, w, tile_size, overlap_px)
    if len(windows) <= 1:
        labels, conf = engine.predict(rgb)
        return labels, conf, 1

    labels_full = np.zeros((h, w), dtype=np.int64)
    conf_full = np.zeros((h, w), dtype=np.float32)

    for y0, y1, x0, x1 in windows:
        crop = rgb[y0:y1, x0:x1]
        if crop.size == 0:
            continue
        labels, conf = engine.predict(crop)
        # Pad/crop if the model returned a slightly different size.
        th, tw = y1 - y0, x1 - x0
        if labels.shape[0] != th or labels.shape[1] != tw:
            labels = cv2.resize(
                labels.astype(np.float32), (tw, th), interpolation=cv2.INTER_NEAREST
            ).astype(np.int64)
            conf = cv2.resize(
                conf.astype(np.float32), (tw, th), interpolation=cv2.INTER_LINEAR
            ).astype(np.float32)

        region_conf = conf_full[y0:y1, x0:x1]
        better = conf >= region_conf
        labels_full[y0:y1, x0:x1][better] = labels[better]
        conf_full[y0:y1, x0:x1][better] = conf[better]

    return labels_full, conf_full, len(windows)


class SegFormerEngine:
    name = "segformer-ade20k"

    def __init__(self) -> None:
        import torch
        from transformers import AutoImageProcessor, SegformerForSemanticSegmentation

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[segformer] loading {MODEL_ID} on {self.device}…", flush=True)
        self.processor = AutoImageProcessor.from_pretrained(MODEL_ID)
        self.model = SegformerForSemanticSegmentation.from_pretrained(MODEL_ID)
        self.model.to(self.device)
        self.model.eval()
        self.num_labels = int(getattr(self.model.config, "num_labels", 150) or 150)
        print(f"[segformer] ready (labels={self.num_labels}).", flush=True)

    def predict(self, rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """
        Returns:
          pred_labels: HxW int64 ADE20K class ids
          conf_map: HxW float32 max softmax probability (0..1)
        """
        import torch
        import torch.nn.functional as F

        pil = Image.fromarray(rgb)
        inputs = self.processor(images=pil, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}
        with torch.inference_mode():
            outputs = self.model(**inputs)
            logits = outputs.logits  # (1, C, h, w)
            upsampled = F.interpolate(
                logits,
                size=rgb.shape[:2],
                mode="bilinear",
                align_corners=False,
            )
            probs = torch.softmax(upsampled, dim=1)[0]  # (C, H, W)
            conf, labels = torch.max(probs, dim=0)
        return labels.detach().cpu().numpy().astype(np.int64), conf.detach().cpu().numpy().astype(np.float32)


_engine: SegFormerEngine | None = None
_engine_lock = threading.Lock()
_engine_error: str | None = None


def _get_engine() -> SegFormerEngine:
    global _engine, _engine_error
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is not None:
            return _engine
        try:
            _engine = SegFormerEngine()
            _engine_error = None
        except Exception as exc:  # noqa: BLE001
            _engine_error = str(exc)
            print(f"[segformer] failed to load model: {exc}", flush=True)
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
    """Rasterize AOI into a boolean mask aligned with image rows (row 0 = north)."""
    if aoi_geom is None or aoi_geom.is_empty:
        return None
    west, south, east, north = (float(v) for v in bbox)
    xs = np.linspace(west, east, width, dtype=np.float64)
    ys = np.linspace(north, south, height, dtype=np.float64)
    try:
        import shapely

        xx, yy = np.meshgrid(xs, ys)
        # Shapely 2.x vectorized containment (lon=x, lat=y).
        if hasattr(shapely, "contains_xy"):
            return shapely.contains_xy(aoi_geom, xx, yy)
        from shapely.geometry import Point
        from shapely.prepared import prep

        prepared = prep(aoi_geom)
        mask = np.zeros((height, width), dtype=bool)
        for r in range(height):
            lat = float(ys[r])
            for c in range(width):
                if prepared.contains(Point(float(xs[c]), lat)):
                    mask[r, c] = True
        return mask
    except Exception:  # noqa: BLE001
        return None


def _min_component_px(class_id: int) -> int:
    return FIELD_MIN_COMPONENT_PX if int(class_id) in FIELD_CLASS_IDS else MIN_COMPONENT_PX


def _is_field_pipeline(class_id: int) -> bool:
    return int(class_id) in FIELD_CLASS_IDS


def _clean_mask(mask: np.ndarray, *, field_mode: bool = False, min_px: int | None = None) -> np.ndarray:
    """Morphology + connected-component filter.

    Field mode: open only (no heavy 5×5 close ×2) so adjacent parcels stay separable.
    """
    floor = int(min_px) if min_px is not None else MIN_COMPONENT_PX
    u8 = (mask.astype(np.uint8) * 255)
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    u8 = cv2.morphologyEx(u8, cv2.MORPH_OPEN, k3, iterations=1)
    if not field_mode:
        k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        u8 = cv2.morphologyEx(u8, cv2.MORPH_CLOSE, k5, iterations=2)
    n, labels, stats, _ = cv2.connectedComponentsWithStats((u8 > 0).astype(np.uint8), connectivity=8)
    cleaned = np.zeros_like(u8)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= floor:
            cleaned[labels == i] = 255
    return cleaned > 0


def _instance_split_watershed(
    mask: np.ndarray,
    *,
    min_px: int = FIELD_MIN_COMPONENT_PX,
) -> np.ndarray:
    """
    Split a binary semantic field mask into separate instance labels via
    distance-transform + watershed. Returns int32 label map (0 = background).
    Pure CC fallback when watershed yields a single blob.
    """
    binary = (mask.astype(np.uint8) > 0).astype(np.uint8)
    if not binary.any():
        return np.zeros(binary.shape, dtype=np.int32)

    # Seed markers from distance peaks so touching fields separate.
    dist = cv2.distanceTransform(binary, cv2.DIST_L2, 5)
    # Adaptive peak threshold: keep local maxima that are parcel-scale.
    peak_floor = max(2.0, float(np.percentile(dist[binary > 0], 55)) * 0.45)
    _, sure_fg = cv2.threshold(dist, peak_floor, 255, cv2.THRESH_BINARY)
    sure_fg = sure_fg.astype(np.uint8)
    # Slight erode to disconnect weak bridges between fields.
    k3 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    sure_fg = cv2.erode(sure_fg, k3, iterations=1)

    n_markers, markers = cv2.connectedComponents(sure_fg)
    if n_markers <= 1:
        # Fall back to plain connected components on the cleaned binary.
        n_cc, cc = cv2.connectedComponents(binary)
        out = np.zeros(binary.shape, dtype=np.int32)
        next_id = 1
        for i in range(1, n_cc):
            area = int((cc == i).sum())
            if area >= min_px:
                out[cc == i] = next_id
                next_id += 1
        return out

    # Unknown region = mask minus sure foreground.
    unknown = cv2.subtract(binary * 255, sure_fg)
    markers = markers + 1  # 0 reserved for watershed barrier
    markers[unknown > 0] = 0

    # Watershed needs a 3-channel image.
    surface = cv2.cvtColor((binary * 255).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    cv2.watershed(surface, markers)

    # markers: 1 = background barrier leftovers, >=2 = instances; -1 = boundaries.
    out = np.zeros(binary.shape, dtype=np.int32)
    next_id = 1
    for label in range(2, int(markers.max()) + 1):
        region = (markers == label) & (binary > 0)
        area = int(region.sum())
        if area >= min_px:
            out[region] = next_id
            next_id += 1

    if next_id == 1:
        # Watershed produced nothing usable — CC fallback.
        n_cc, cc = cv2.connectedComponents(binary)
        for i in range(1, n_cc):
            area = int((cc == i).sum())
            if area >= min_px:
                out[cc == i] = next_id
                next_id += 1
    return out


def _instance_bbox_and_centroid(label_mask: np.ndarray) -> tuple[list[int], list[float]] | None:
    """Return [x0,y0,x1,y1] pixel box + [cx,cy] for a boolean instance mask."""
    ys, xs = np.where(label_mask)
    if len(xs) == 0:
        return None
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    cx = float(xs.mean())
    cy = float(ys.mean())
    return [x0, y0, x1, y1], [cx, cy]


def _contour_to_polygon(contour: np.ndarray, bbox, width: int, height: int, simplify_deg: float | None):
    from shapely.geometry import Polygon
    from shapely.validation import make_valid

    if contour is None or len(contour) < 3:
        return None
    epsilon = max(1.0, 0.002 * cv2.arcLength(contour, True))
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
        simplify_deg = max(diag * 0.0015, 1e-7)
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
    return {
        "area_m2": float(poly_m.area),
        "perimeter_m": float(poly_m.length),
    }


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


def _clip_polygon_to_aoi(poly, aoi_geom, min_overlap: float = AOI_OVERLAP_MIN):
    from shapely.validation import make_valid

    if aoi_geom is None:
        return poly
    aoi = make_valid(aoi_geom)
    if aoi.is_empty or not poly.intersects(aoi):
        return None
    inter = poly.intersection(aoi)
    if inter.is_empty:
        return None
    if inter.geom_type == "MultiPolygon":
        inter = max(inter.geoms, key=lambda g: g.area)
    if inter.geom_type != "Polygon" or inter.area <= 0:
        return None
    # Large agricultural fields often extend past a tight AOI; keep a lower overlap bar.
    if poly.area > 0 and inter.area < float(min_overlap) * poly.area:
        return None
    return inter


def _mask_to_geojson(
    mask: np.ndarray,
    conf_map: np.ndarray,
    bbox: list[float],
    class_id: int,
    class_name: str,
    min_confidence: float,
    aoi_geom,
    simplify: float | None,
    *,
    date_iso: str | None = None,
    provider: str | None = None,
) -> tuple[dict, float, list[dict[str, Any]]]:
    from shapely.geometry import mapping

    field_mode = _is_field_pipeline(class_id)
    min_px = _min_component_px(class_id)
    cleaned = _clean_mask(mask, field_mode=field_mode, min_px=min_px)
    height, width = cleaned.shape[:2]
    west, south, east, north = (float(v) for v in bbox)
    lat0 = (south + north) / 2.0
    date_value = (date_iso or "").strip() or datetime.now(timezone.utc).isoformat()
    provider_value = (provider or "").strip() or "segformer-ade20k"
    aoi_overlap_min = AOI_OVERLAP_MIN_AG if int(class_id) in AG_VEG_CLASS_IDS else AOI_OVERLAP_MIN

    features: list[dict[str, Any]] = []
    scores: list[float] = []
    instances: list[dict[str, Any]] = []
    object_idx = 1

    def _emit_from_region(region: np.ndarray) -> None:
        nonlocal object_idx
        area_px = float(region.sum())
        if area_px < min_px:
            return
        conf = float(conf_map[region].mean()) if conf_map is not None else 0.0
        if conf < float(min_confidence):
            return

        # Contour of this instance only (no convex hull).
        u8 = (region.astype(np.uint8) * 255)
        found = cv2.findContours(u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = found[0] if len(found) == 2 else found[1]
        if not contours:
            return
        contour = max(contours, key=cv2.contourArea)
        if float(cv2.contourArea(contour)) < min_px:
            return

        poly = _contour_to_polygon(contour, bbox, width, height, simplify)
        if poly is None:
            return
        poly = _clip_polygon_to_aoi(poly, aoi_geom, min_overlap=aoi_overlap_min)
        if poly is None:
            return

        metrics = _shape_metrics(poly, lat0)
        if metrics["area_m2"] <= 0:
            return

        object_id = f"SF-{object_idx:05d}"
        box_cent = _instance_bbox_and_centroid(region)
        bbox_xyxy = box_cent[0] if box_cent else None
        centroid_xy = box_cent[1] if box_cent else None
        props = {
            "Feature_ID": object_id,
            "Class_Name": class_name,
            "Confidence": round(conf, 4),
            "Area_m2": round(metrics["area_m2"], 2),
            "Area_Hectare": round(metrics["area_m2"] / 10_000.0, 6),
            "Perimeter": round(metrics["perimeter_m"], 2),
            "Date": date_value,
            "Provider": provider_value,
            "objectId": object_id,
            "object_id": object_id,
            "className": class_name,
            "class_name": class_name,
            "classId": class_id,
            "class_id": class_id,
            "confidence": round(conf, 4),
            "areaM2": round(metrics["area_m2"], 2),
            "area_m2": round(metrics["area_m2"], 2),
            "areaHa": round(metrics["area_m2"] / 10_000.0, 6),
            "area_ha": round(metrics["area_m2"] / 10_000.0, 6),
            "perimeterM": round(metrics["perimeter_m"], 2),
            "perimeter_m": round(metrics["perimeter_m"], 2),
            "date": date_value,
            "provider": provider_value,
            "source": "segformer-ade20k",
            "crs": "EPSG:4326",
        }
        if bbox_xyxy is not None:
            props["bbox_xyxy"] = bbox_xyxy
            props["centroid_xy"] = centroid_xy
        features.append(
            {
                "type": "Feature",
                "id": object_id,
                "geometry": mapping(poly),
                "properties": props,
            }
        )
        scores.append(conf)
        instances.append(
            {
                "feature_id": object_id,
                "featureId": object_id,
                "bbox_xyxy": bbox_xyxy,
                "bboxXyxy": bbox_xyxy,
                "centroid_xy": centroid_xy,
                "centroidXy": centroid_xy,
                "score": round(conf, 4),
            }
        )
        object_idx += 1

    if field_mode:
        labels = _instance_split_watershed(cleaned, min_px=min_px)
        max_label = int(labels.max()) if labels.size else 0
        for lid in range(1, max_label + 1):
            _emit_from_region(labels == lid)
    else:
        u8 = (cleaned.astype(np.uint8) * 255)
        found = cv2.findContours(u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = found[0] if len(found) == 2 else found[1]
        for contour in contours:
            area_px = float(cv2.contourArea(contour))
            if area_px < min_px:
                continue
            region_mask = np.zeros((height, width), dtype=np.uint8)
            cv2.drawContours(region_mask, [contour], -1, 1, thickness=-1)
            _emit_from_region(region_mask.astype(bool))

    mean_score = float(np.mean(scores)) if scores else 0.0
    return {"type": "FeatureCollection", "features": features}, mean_score, instances


def _execute_detect(req: DetectRequest) -> dict:
    if len(req.bbox) != 4:
        raise ValueError("bbox must be [west, south, east, north].")

    class_id = req.resolved_class_id()
    class_name = req.resolved_class_name(class_id)
    ade_indices = req.resolved_ade20k(class_id)
    min_confidence = req.resolved_min_confidence(class_id)
    tile_size = req.resolved_tile_size()
    overlap_frac = req.resolved_overlap()

    if not ade_indices:
        raise PermissionError(UNSUPPORTED_MSG)

    try:
        image = _decode_image(req.resolved_image())
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Could not decode image: {exc}") from exc

    orig_w, orig_h = image.size
    # When the capture exceeds one tile, keep more resolution and rely on tiling.
    needs_tiles = max(orig_w, orig_h) > tile_size
    max_edge = MAX_EDGE_TILED if needs_tiles else MAX_EDGE
    scale = min(1.0, max_edge / max(orig_w, orig_h))
    if scale < 1.0:
        work = image.resize(
            (max(1, round(orig_w * scale)), max(1, round(orig_h * scale))),
            Image.BILINEAR,
        )
    else:
        work = image
    rgb = np.asarray(work).copy()
    work_h, work_w = rgb.shape[:2]

    aoi_geom = _parse_aoi_geometry(req.aoi)
    aoi_mask_work = _rasterize_aoi(aoi_geom, req.bbox, work_w, work_h) if aoi_geom is not None else None
    if aoi_mask_work is not None:
        rgb[~aoi_mask_work] = 0

    engine = _get_engine()
    try:
        labels, conf_map, tile_count = _predict_tiled(engine, rgb, tile_size, overlap_frac)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"SegFormer inference failed: {exc}") from exc

    allowed = set(int(i) for i in ade_indices)
    class_mask = np.isin(labels, list(allowed))
    if aoi_mask_work is not None:
        class_mask = np.logical_and(class_mask, aoi_mask_work)

    # Upscale mask + confidence to original capture resolution.
    if scale < 1.0:
        mask_img = Image.fromarray((class_mask.astype(np.uint8) * 255)).resize(
            (orig_w, orig_h), Image.NEAREST
        )
        mask = np.asarray(mask_img) > 127
        conf_img = Image.fromarray((np.clip(conf_map, 0, 1) * 255).astype(np.uint8)).resize(
            (orig_w, orig_h), Image.BILINEAR
        )
        conf_full = np.asarray(conf_img).astype(np.float32) / 255.0
    else:
        mask = class_mask
        conf_full = conf_map

    if aoi_geom is not None:
        aoi_mask_full = _rasterize_aoi(aoi_geom, req.bbox, orig_w, orig_h)
        if aoi_mask_full is not None:
            mask = np.logical_and(mask, aoi_mask_full)

    geojson, score, instances = _mask_to_geojson(
        mask,
        conf_full,
        req.bbox,
        class_id,
        class_name,
        min_confidence,
        aoi_geom,
        req.simplify,
        date_iso=req.resolved_date(),
        provider=req.resolved_provider(),
    )

    engine_name = _engine_label()
    return {
        "geojson": geojson,
        "mask_png": _mask_to_png(mask),
        "width": orig_w,
        "height": orig_h,
        "score": float(score),
        "count": len(geojson.get("features") or []),
        "class_id": class_id,
        "classId": class_id,
        "class_name": class_name,
        "className": class_name,
        "aoi_applied": aoi_geom is not None,
        "aoiApplied": aoi_geom is not None,
        "device": engine.device,
        "model": MODEL_ID,
        "engine": engine_name,
        "instance_count": len(instances),
        "instanceCount": len(instances),
        "instances": instances,
        "ade20k_indices": list(ade_indices),
        "min_confidence": min_confidence,
        "tile_size": tile_size,
        "tileSize": tile_size,
        "overlap": overlap_frac,
        "tile_count": tile_count,
        "tileCount": tile_count,
        "field_pipeline": _is_field_pipeline(class_id),
        "fieldPipeline": _is_field_pipeline(class_id),
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
    training_ok = False
    training_err: str | None = None
    onnx_ok = False
    try:
        from finetune_segformer import training_deps_status
        from inference_jobs import onnx_available

        training_ok, training_err = training_deps_status()
        onnx_ok = bool(onnx_available())
    except Exception as exc:  # noqa: BLE001
        training_ok = False
        training_err = f"{type(exc).__name__}: {exc}"
    out = {
        "status": "ok" if _engine_error is None else "degraded",
        "engine": _engine_label(),
        "model": MODEL_ID,
        "device": _probe_device(),
        "model_ready": _engine is not None,
        "error": _engine_error,
        "port_default": 8095,
        "allowed_tile_sizes": list(ALLOWED_TILE_SIZES),
        "field_min_component_px": FIELD_MIN_COMPONENT_PX,
        "training": training_ok,
        "onnx": onnx_ok,
    }
    if training_err and not training_ok:
        out["training_error"] = training_err
    return out


@app.on_event("startup")
def _warm_model() -> None:
    """Load weights in a background thread so /health responds immediately."""

    def _load() -> None:
        try:
            _get_engine()
        except Exception:  # noqa: BLE001
            pass
        # Prefetch Training AI base encoder so "loading_model" is nearly instant.
        try:
            from finetune_segformer import training_deps_status, warm_train_assets

            ok, _err = training_deps_status()
            if ok:
                print("[segformer] warming Training AI base encoder…", flush=True)
                warm_train_assets()
                print("[segformer] Training AI base encoder ready.", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[segformer] Training AI warmup skipped: {exc}", flush=True)

    threading.Thread(target=_load, name="segformer-warmup", daemon=True).start()


@app.post("/detect")
def detect(req: DetectRequest):
    try:
        return _execute_detect(req)
    except PermissionError as exc:
        return JSONResponse(status_code=422, content={"error": str(exc), "detail": str(exc)})
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc), "detail": str(exc)})
    except Exception as exc:  # noqa: BLE001
        print(f"[segformer] detect failed: {exc}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(exc), "detail": str(exc)})


# ---------------------------------------------------------------------------
# Training & AI — interactive SegFormer fine-tune (B0 by default) + inference jobs
# ---------------------------------------------------------------------------


@app.get("/training/models")
def training_list_models():
    """List fine-tuned checkpoints available for Infer."""
    from finetune_segformer import MODEL_DIR

    items: list[dict] = []
    try:
        root = MODEL_DIR
        if root.is_dir():
            for child in sorted(root.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                if not child.is_dir() or child.name == "base_cache":
                    continue
                meta_path = child / "training_meta.json"
                meta: dict = {}
                if meta_path.is_file():
                    try:
                        meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    except Exception:  # noqa: BLE001
                        meta = {}
                has_weights = (child / "model.safetensors").is_file() or (
                    child / "pytorch_model.bin"
                ).is_file()
                if not has_weights and not meta_path.is_file():
                    continue
                history = meta.get("loss_history") if isinstance(meta.get("loss_history"), list) else []
                items.append(
                    {
                        "model_id": meta.get("model_id") or child.name,
                        "model_name": meta.get("model_name") or "SegFormer",
                        "model_version": meta.get("model_version") or child.name,
                        "training_date": meta.get("training_date"),
                        "epochs": meta.get("epochs"),
                        "sample_count": meta.get("sample_count"),
                        "class_count": meta.get("class_count"),
                        "path": str(child),
                        "has_loss_history": bool(history),
                        "loss_history_len": len(history),
                    }
                )
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc), "detail": str(exc)})
    return {"models": items, "count": len(items)}


@app.get("/training/models/{model_id}")
def training_get_model(model_id: str):
    from finetune_segformer import MODEL_DIR

    mid = (model_id or "").strip()
    if not mid or mid == "base_cache":
        return JSONResponse(status_code=404, content={"error": "Model not found", "detail": "Model not found"})
    model_dir = MODEL_DIR / mid
    if not model_dir.is_dir():
        return JSONResponse(
            status_code=404,
            content={"error": f"Trained model not found: {mid}", "detail": f"Trained model not found: {mid}"},
        )
    meta_path = model_dir / "training_meta.json"
    meta: dict = {}
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            meta = {}
    history = meta.get("loss_history") if isinstance(meta.get("loss_history"), list) else []
    return {
        "model_id": meta.get("model_id") or mid,
        "model_name": meta.get("model_name") or "SegFormer",
        "model_version": meta.get("model_version") or mid,
        "training_date": meta.get("training_date"),
        "epochs": meta.get("epochs"),
        "sample_count": meta.get("sample_count"),
        "class_count": meta.get("class_count"),
        "class_names": meta.get("class_names") or [],
        "learning_rate": meta.get("learning_rate"),
        "train_loss": meta.get("train_loss"),
        "val_loss": meta.get("val_loss"),
        "final_metrics": meta.get("final_metrics") or {},
        "loss_history": history,
    }


@app.post("/training/start")
async def training_start(request: Request):
    from training_jobs import start_training_job

    try:
        body = await request.json()
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": str(exc), "detail": str(exc)})
    if not isinstance(body, dict):
        return JSONResponse(
            status_code=400,
            content={"error": "JSON body required", "detail": "JSON body required"},
        )
    try:
        job_id = start_training_job(body)
        return {"job_id": job_id}
    except ValueError as exc:
        return JSONResponse(status_code=422, content={"error": str(exc), "detail": str(exc)})
    except RuntimeError as exc:
        return JSONResponse(status_code=503, content={"error": str(exc), "detail": str(exc)})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc), "detail": str(exc)})


@app.get("/training/{job_id}")
def training_status(job_id: str):
    from training_jobs import get_job

    job = get_job(job_id)
    if not job:
        return JSONResponse(
            status_code=404,
            content={"error": "Job not found", "detail": "Job not found"},
        )
    return job


@app.post("/training/{job_id}/cancel")
def training_cancel(job_id: str):
    from training_jobs import cancel_training_job

    ok = cancel_training_job(job_id)
    if not ok:
        return JSONResponse(
            status_code=404,
            content={"error": "Job not found", "detail": "Job not found"},
        )
    return {"ok": True, "job_id": job_id}


@app.post("/inference/start")
async def inference_start(request: Request):
    from inference_jobs import start_inference_job

    try:
        body = await request.json()
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": str(exc), "detail": str(exc)})
    if not isinstance(body, dict):
        return JSONResponse(
            status_code=400,
            content={"error": "JSON body required", "detail": "JSON body required"},
        )
    try:
        job_id = start_inference_job(body)
        return {"job_id": job_id}
    except ValueError as exc:
        return JSONResponse(status_code=422, content={"error": str(exc), "detail": str(exc)})
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": str(exc), "detail": str(exc)})


@app.get("/inference/{job_id}")
def inference_status(job_id: str):
    from inference_jobs import get_job

    job = get_job(job_id)
    if not job:
        return JSONResponse(
            status_code=404,
            content={"error": "Job not found", "detail": "Job not found"},
        )
    return job
