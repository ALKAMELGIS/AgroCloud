"""
opengeos/geoai (geoai-py) inference microservice for AgroCloud.

Wraps Mask R-CNN extractors (buildings, cars, ships, solar, parking) behind the
same image+bbox contract used by SegFormer / SAM2 proxies.

  POST /detect  application/json
    {
      "image" | "imageDataUrl": "<data:image/png;base64,...>",
      "bbox": [west, south, east, north],
      "task" | "target": "buildings" | "cars" | "ships" | "solar" | "parking",
      "minConfidence"?: 0..1,
      "overlap"?: 0..0.5,
      "chipSize"?: int
    }
  Response 200:
    {
      "geojson": FeatureCollection (EPSG:4326),
      "count": int,
      "task": str,
      "engine": "geoai-py",
      "model": str,
      "device": "cuda"|"cpu"
    }
  GET /health → { status, engine, package, device, tasks, models_loaded }
"""

from __future__ import annotations

import base64
import io
import os
import tempfile
import threading
from typing import Any

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel, Field

PORT = int(os.environ.get("PORT", "8098"))
DEFAULT_CONFIDENCE = float(os.environ.get("GEOAI_MIN_CONFIDENCE", "0.5"))
DEFAULT_OVERLAP = float(os.environ.get("GEOAI_OVERLAP", "0.25"))
DEFAULT_CHIP = int(os.environ.get("GEOAI_CHIP_SIZE", "512"))
MAX_EDGE = int(os.environ.get("GEOAI_MAX_EDGE", "2048"))
EAGER_LOAD = os.environ.get("GEOAI_EAGER_LOAD", "0").strip() not in ("0", "false", "False")

TASK_ALIASES = {
    "buildings": "buildings",
    "building": "buildings",
    "building_footprints": "buildings",
    "cars": "cars",
    "car": "cars",
    "vehicles": "cars",
    "ships": "ships",
    "ship": "ships",
    "solar": "solar",
    "solar_panels": "solar",
    "parking": "parking",
    "parking_spots": "parking",
}

TASK_MODEL_FILES = {
    "buildings": "building_footprints_usa.pth",
    "cars": "car_detection_usa.pth",
    "ships": "ship_detection.pth",
    "solar": "solar_panel_detection.pth",
    "parking": "parking_spot_detection.pth",
}

app = FastAPI(title="GeoAI Inference (opengeos/geoai)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = threading.Lock()
_extractors: dict[str, Any] = {}
_device = "cpu"
_package_version = "unknown"


def _detect_device() -> str:
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _load_package_meta() -> None:
    global _package_version, _device
    _device = _detect_device()
    try:
        import geoai

        _package_version = getattr(geoai, "__version__", "unknown")
    except Exception as exc:  # noqa: BLE001
        print(f"[geoai] package import deferred: {exc}", flush=True)


def _ensure_leafmap_stub() -> None:
    """geoai.utils.conversion imports leafmap only for array_to_image; avoid the full Jupyter stack."""
    import sys
    import types

    if "leafmap" in sys.modules:
        return
    stub = types.ModuleType("leafmap")

    def array_to_image(*_a, **_k):  # pragma: no cover
        raise NotImplementedError("leafmap.array_to_image is not required for /detect")

    stub.array_to_image = array_to_image
    sys.modules["leafmap"] = stub


def _get_extractor(task: str):
    with _lock:
        if task in _extractors:
            return _extractors[task]
        print(f"[geoai] loading extractor for task={task}…", flush=True)
        _ensure_leafmap_stub()
        from geoai.extract import (
            BuildingFootprintExtractor,
            CarDetector,
            ParkingSplotDetector,
            ShipDetector,
            SolarPanelDetector,
        )

        factories = {
            "buildings": BuildingFootprintExtractor,
            "cars": CarDetector,
            "ships": ShipDetector,
            "solar": SolarPanelDetector,
            "parking": ParkingSplotDetector,
        }
        cls = factories[task]
        kwargs: dict[str, Any] = {"device": _device}
        if task == "parking":
            kwargs["num_classes"] = 3
        extractor = cls(**kwargs)
        _extractors[task] = extractor
        print(f"[geoai] ready: {task} on {getattr(extractor, 'device', _device)}", flush=True)
        return extractor


class DetectRequest(BaseModel):
    image: str | None = None
    imageDataUrl: str | None = None
    bbox: list[float]
    task: str | None = None
    target: str | None = None
    minConfidence: float | None = None
    min_confidence: float | None = None
    overlap: float | None = None
    chipSize: int | None = None
    chip_size: int | None = None
    filterEdges: bool | None = None
    filter_edges: bool | None = None

    def resolved_image(self) -> str:
        raw = self.imageDataUrl or self.image
        if not raw or not str(raw).strip():
            raise ValueError("image (or imageDataUrl) is required.")
        return str(raw)

    def resolved_task(self) -> str:
        key = (self.task or self.target or "buildings").strip().lower()
        task = TASK_ALIASES.get(key)
        if not task:
            raise ValueError(
                f"Unknown task '{key}'. Use one of: {', '.join(sorted(set(TASK_ALIASES.values())))}."
            )
        return task

    def resolved_confidence(self) -> float:
        v = self.minConfidence if self.minConfidence is not None else self.min_confidence
        if v is None:
            return DEFAULT_CONFIDENCE
        return max(0.0, min(1.0, float(v)))

    def resolved_overlap(self) -> float:
        if self.overlap is None:
            return DEFAULT_OVERLAP
        return max(0.0, min(0.5, float(self.overlap)))

    def resolved_chip(self) -> int:
        v = self.chipSize if self.chipSize is not None else self.chip_size
        if v is None:
            return DEFAULT_CHIP
        return max(256, min(1024, int(v)))

    def resolved_filter_edges(self) -> bool:
        v = self.filterEdges if self.filterEdges is not None else self.filter_edges
        return True if v is None else bool(v)


def _decode_image(raw: str) -> Image.Image:
    payload = raw.strip()
    if "," in payload and payload.lower().startswith("data:"):
        payload = payload.split(",", 1)[1]
    data = base64.b64decode(payload)
    img = Image.open(io.BytesIO(data)).convert("RGB")
    w, h = img.size
    longest = max(w, h)
    if longest > MAX_EDGE:
        scale = MAX_EDGE / float(longest)
        img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.BILINEAR)
    return img


def _write_geotiff(img: Image.Image, bbox: list[float], path: str) -> None:
    import rasterio
    from rasterio.transform import from_bounds

    west, south, east, north = [float(v) for v in bbox]
    if east <= west or north <= south:
        raise ValueError("bbox must be [west, south, east, north] with positive extent.")
    arr = np.asarray(img, dtype=np.uint8)
    height, width = arr.shape[0], arr.shape[1]
    transform = from_bounds(west, south, east, north, width, height)
    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": 3,
        "dtype": "uint8",
        "crs": "EPSG:4326",
        "transform": transform,
        "compress": "lzw",
    }
    with rasterio.open(path, "w", **profile) as dst:
        for i in range(3):
            dst.write(arr[:, :, i], i + 1)


def _gdf_to_geojson(gdf, task: str) -> dict[str, Any]:
    if gdf is None or len(gdf) == 0:
        return {"type": "FeatureCollection", "features": []}
    try:
        gdf = gdf.to_crs("EPSG:4326")
    except Exception:
        pass
    features: list[dict[str, Any]] = []
    for idx, row in gdf.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        props = {
            "feature_id": f"GEOAI-{task[:3].upper()}-{int(idx) + 1:05d}",
            "task": task,
            "engine": "geoai-py",
        }
        for key in ("confidence", "score", "class", "label", "area"):
            if key in row.index and row[key] is not None:
                try:
                    val = row[key]
                    props[key] = float(val) if hasattr(val, "__float__") else val
                except Exception:
                    props[key] = str(row[key])
        features.append(
            {
                "type": "Feature",
                "geometry": geom.__geo_interface__,
                "properties": props,
            }
        )
    return {"type": "FeatureCollection", "features": features}


@app.on_event("startup")
def _startup() -> None:
    _load_package_meta()
    if EAGER_LOAD:
        try:
            _get_extractor("buildings")
        except Exception as exc:  # noqa: BLE001
            print(f"[geoai] eager load failed (will retry on request): {exc}", flush=True)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "engine": "geoai-py",
        "package": _package_version,
        "device": _device,
        "tasks": sorted(set(TASK_ALIASES.values())),
        "models_loaded": sorted(_extractors.keys()),
        "model_files": TASK_MODEL_FILES,
    }


@app.get("/tasks")
def list_tasks() -> dict[str, Any]:
    return {
        "tasks": [
            {"id": tid, "model": TASK_MODEL_FILES[tid]}
            for tid in sorted(TASK_MODEL_FILES.keys())
        ]
    }


@app.post("/detect")
def detect(body: DetectRequest) -> JSONResponse:
    try:
        task = body.resolved_task()
        img = _decode_image(body.resolved_image())
        if not isinstance(body.bbox, list) or len(body.bbox) != 4:
            raise ValueError("bbox must be [west, south, east, north].")
        confidence = body.resolved_confidence()
        overlap = body.resolved_overlap()
        chip = body.resolved_chip()
        filter_edges = body.resolved_filter_edges()
    except ValueError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})

    extractor = None
    try:
        extractor = _get_extractor(task)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=502,
            content={
                "error": "Failed to load geoai-py extractor (install geoai-py and retry).",
                "detail": str(exc),
                "task": task,
            },
        )

    tmp_dir = tempfile.mkdtemp(prefix="geoai_")
    raster_path = os.path.join(tmp_dir, "aoi.tif")
    try:
        _write_geotiff(img, body.bbox, raster_path)
        gdf = extractor.process_raster(
            raster_path,
            confidence_threshold=confidence,
            overlap=overlap,
            chip_size=(chip, chip),
            filter_edges=filter_edges,
            edge_buffer=10,
        )
        geojson = _gdf_to_geojson(gdf, task)
        count = len(geojson.get("features") or [])
        device = str(getattr(extractor, "device", _device))
        return JSONResponse(
            {
                "geojson": geojson,
                "count": count,
                "task": task,
                "engine": "geoai-py",
                "model": TASK_MODEL_FILES.get(task, task),
                "device": device,
                "width": img.size[0],
                "height": img.size[1],
                "score": confidence,
            }
        )
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=502,
            content={"error": "geoai-py inference failed.", "detail": str(exc), "task": task},
        )
    finally:
        try:
            for name in os.listdir(tmp_dir):
                os.remove(os.path.join(tmp_dir, name))
            os.rmdir(tmp_dir)
        except OSError:
            pass
