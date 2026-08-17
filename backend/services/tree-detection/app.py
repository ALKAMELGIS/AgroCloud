"""
AI Tree Detection — Ultralytics YOLO Detection microservice.

Pipeline: RGB mosaic → YOLO detect (single class `tree`) → axis-aligned boxes.
The GIS client converts each box centre to a Point. No segmentation / crowns.

Engines (TREE_DETECTION_ENGINE or auto):
  • yolo — Ultralytics detect (default). Open-vocab YOLO-World class `tree`,
    or a tree-trained `.pt` via MODEL_PATH
  • yolo_seg / onnx_seg — optional, unused by the GIS point pipeline
  • deepforest — legacy, only if TREE_DETECTION_ENGINE=deepforest
"""

from __future__ import annotations

import base64
import io
import json
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

DEFAULT_IMGSZ = int(os.environ.get("TREE_DETECTION_IMG_SIZE", "800"))
DEFAULT_CONF = float(os.environ.get("TREE_DETECTION_CONF", "0.25"))
DEFAULT_IOU = float(os.environ.get("TREE_DETECTION_IOU", "0.45"))
MODEL_PATH = os.environ.get("MODEL_PATH", "").strip()
ENGINE = os.environ.get("TREE_DETECTION_ENGINE", "").strip().lower()
# Default: Ultralytics YOLO-World open-vocab detect locked to class "tree".
# Override with a custom single-class tree .pt via MODEL_PATH / TREE_DETECTION_YOLO_WEIGHTS.
YOLO_FALLBACK_WEIGHTS = os.environ.get("TREE_DETECTION_YOLO_WEIGHTS", "yolov8s-worldv2.pt").strip()
ALLOW_COCO_YOLO = os.environ.get("TREE_DETECTION_ALLOW_COCO", "").strip().lower() in (
    "1",
    "true",
    "yes",
)
TREE_CLASS_NAME = "tree"
CHECKPOINTS_DIR = Path(
    os.environ.get(
        "TREE_DETECTION_CHECKPOINTS",
        str(Path(__file__).resolve().parent / "models" / "finetuned"),
    )
)

app = FastAPI(title="AI Tree Detection")


def _empty_result(engine: str, ms: float) -> dict[str, Any]:
    return {"boxes": [], "instances": [], "engine": engine, "inference_ms": round(ms, 1)}


def _box_to_instance(box: dict[str, Any]) -> dict[str, Any]:
    x1, y1, x2, y2 = float(box["x1"]), float(box["y1"]), float(box["x2"]), float(box["y2"])
    poly = [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]
    return {
        "polygon": poly,
        "score": float(box.get("confidence", 0.0)),
        "label": str(box.get("name", "Tree")),
        "area_px": max(0.0, (x2 - x1) * (y2 - y1)),
    }


def _mask_to_polygon(mask: np.ndarray, simplify_eps: float = 1.5) -> list[list[float]] | None:
    """Largest exterior contour of a boolean/uint8 mask → closed ring [[x,y],...]."""
    try:
        import cv2  # type: ignore
    except Exception:
        return None
    m = (mask > 0).astype(np.uint8) * 255
    if m.ndim != 2 or not m.any():
        return None
    contours, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    cnt = max(contours, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 4:
        return None
    approx = cv2.approxPolyDP(cnt, simplify_eps, True)
    if len(approx) < 3:
        return None
    ring = [[float(p[0][0]), float(p[0][1])] for p in approx]
    if ring[0] != ring[-1]:
        ring.append(ring[0][:])
    return ring


def _is_coco_general_weights(path: str) -> bool:
    """Ultralytics COCO checkpoints are not trained for tree crowns."""
    name = Path(path).name.lower()
    return bool(
        name.startswith("yolo")
        and any(tag in name for tag in ("n-seg", "s-seg", "m-seg", "l-seg", "x-seg", "n.pt", "s.pt"))
        and "tree" not in name
    )


def _find_tree_yolo_weights(weights: str | None = None) -> str | None:
    """Return a path to tree-trained YOLO weights, or None (never COCO by default)."""
    for candidate in (weights, MODEL_PATH, "best.pt"):
        name = (candidate or "").strip()
        if not name:
            continue
        if os.path.exists(name) and not _is_coco_general_weights(name):
            return name
    local = Path(__file__).resolve().parent / "best.pt"
    if local.is_file():
        return str(local)
    return None


def _select_engine() -> str:
    """Default Ultralytics YOLO detect. Seg/DeepForest only when explicitly set."""
    if ENGINE in ("deepforest", "yolo", "yolo_detect", "yolo_seg", "onnx_seg"):
        if ENGINE in ("yolo", "yolo_detect"):
            return "yolo"
        if ENGINE == "onnx_seg" and not (
            MODEL_PATH and MODEL_PATH.lower().endswith(".onnx") and os.path.exists(MODEL_PATH)
        ):
            return "yolo"
        return ENGINE
    if MODEL_PATH and os.path.exists(MODEL_PATH):
        if MODEL_PATH.lower().endswith(".onnx"):
            return "onnx_seg"
        return "yolo"
    return "yolo"


class DeepForestEngine:
    name = "deepforest"

    def __init__(self) -> None:
        from deepforest import main as df_main

        self.model = df_main.deepforest()
        loaded = False
        for loader in (
            lambda: self.model.use_release(),
            lambda: self.model.load_model("weecology/deepforest-tree"),
        ):
            try:
                loader()
                loaded = True
                break
            except Exception:
                continue
        if not loaded:
            raise RuntimeError(
                "DeepForest could not load a pretrained tree model "
                "(use_release / load_model both failed)."
            )

    def predict(self, image: Image.Image, imgsz: int, conf: float, iou: float) -> dict[str, Any]:
        t0 = time.perf_counter()
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name
            image.save(tmp_path, format="PNG")
        try:
            df = self._run(tmp_path, imgsz, iou)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

        boxes: list[dict[str, Any]] = []
        if df is not None and len(df):
            for _, row in df.iterrows():
                score = float(row.get("score", row.get("confidence", 0.0)) or 0.0)
                if score < conf:
                    continue
                try:
                    x1 = float(row["xmin"])
                    y1 = float(row["ymin"])
                    x2 = float(row["xmax"])
                    y2 = float(row["ymax"])
                except (KeyError, TypeError, ValueError):
                    continue
                boxes.append(
                    {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "confidence": score,
                        "name": str(row.get("label", "Tree")) if hasattr(row, "get") else "Tree",
                    }
                )
        instances = [_box_to_instance(b) for b in boxes]
        return {
            "boxes": boxes,
            "instances": instances,
            "engine": self.name,
            "inference_ms": (time.perf_counter() - t0) * 1000,
        }

    def _run(self, image_path: str, imgsz: int, iou: float):
        patch = int(imgsz) if imgsz else 400
        tile_attempts = (
            dict(raster_path=image_path, patch_size=patch, patch_overlap=0.25, iou_threshold=iou),
            dict(path=image_path, patch_size=patch, patch_overlap=0.25, iou_threshold=iou),
            dict(raster_path=image_path, patch_size=patch, patch_overlap=0.25),
            dict(path=image_path, patch_size=patch, patch_overlap=0.25),
        )
        predict_tile = getattr(self.model, "predict_tile", None)
        if predict_tile is not None:
            for kwargs in tile_attempts:
                try:
                    return predict_tile(**kwargs)
                except TypeError:
                    continue
                except Exception:
                    break
        for kwargs in (dict(path=image_path), dict(image_path=image_path)):
            try:
                return self.model.predict_image(**kwargs)
            except TypeError:
                continue
            except Exception:
                break
        return None


def _resolve_yolo_detect_weights(weights: str | None = None) -> str:
    """Tree-trained .pt if present, otherwise Ultralytics YOLO-World (class tree)."""
    found = _find_tree_yolo_weights(weights)
    if found:
        return found
    local_tree = Path(__file__).resolve().parent / "models" / "tree.pt"
    if local_tree.is_file():
        return str(local_tree)
    if ALLOW_COCO_YOLO and YOLO_FALLBACK_WEIGHTS:
        return YOLO_FALLBACK_WEIGHTS
    return YOLO_FALLBACK_WEIGHTS or "yolov8s-worldv2.pt"


def _is_open_vocab_weights(path: str) -> bool:
    name = Path(path).name.lower()
    return "world" in name or name.startswith("yoloe")


class YoloDetectEngine:
    """Ultralytics YOLO Detection — single class `tree`. Boxes only (no masks)."""

    name = "yolo"

    def __init__(self, weights: str | None = None) -> None:
        path = _resolve_yolo_detect_weights(weights)
        self.weights = path
        if _is_open_vocab_weights(path):
            try:
                from ultralytics import YOLOWorld  # type: ignore

                self.model = YOLOWorld(path)
            except Exception:
                from ultralytics import YOLO

                self.model = YOLO(path)
            try:
                self.model.set_classes([TREE_CLASS_NAME])
            except Exception:
                pass
        else:
            from ultralytics import YOLO

            self.model = YOLO(path)

    def predict(self, image: Image.Image, imgsz: int, conf: float, iou: float) -> dict[str, Any]:
        t0 = time.perf_counter()
        results = self.model.predict(
            source=image,
            imgsz=int(imgsz) if imgsz else DEFAULT_IMGSZ,
            conf=float(conf) if conf is not None else DEFAULT_CONF,
            iou=float(iou) if iou is not None else DEFAULT_IOU,
            verbose=False,
        )
        boxes: list[dict[str, Any]] = []
        for result in results:
            names = getattr(result, "names", {}) or {}
            if result.boxes is None:
                continue
            for box in result.boxes:
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
                cls_id = int(box.cls[0].item()) if box.cls is not None else 0
                score = float(box.conf[0].item()) if box.conf is not None else 0.0
                raw_label = str(names.get(cls_id, TREE_CLASS_NAME) or TREE_CLASS_NAME)
                if not _is_open_vocab_weights(self.weights):
                    # Custom/COCO: keep only tree-like labels (or everything if single-class).
                    if len(names) > 1 and "tree" not in raw_label.lower() and "plant" not in raw_label.lower():
                        continue
                boxes.append(
                    {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "confidence": score,
                        "name": "Tree",
                    }
                )
        return {
            "boxes": boxes,
            "instances": [],
            "engine": self.name,
            "inference_ms": (time.perf_counter() - t0) * 1000,
        }


def _resolve_yolo_weights(weights: str | None = None) -> str:
    """Explicit tree weights → MODEL_PATH → local best.pt. COCO only if ALLOW_COCO_YOLO."""
    found = _find_tree_yolo_weights(weights)
    if found:
        return found
    if ALLOW_COCO_YOLO and YOLO_FALLBACK_WEIGHTS:
        return YOLO_FALLBACK_WEIGHTS
    raise RuntimeError(
        "No tree-trained YOLO-seg weights found (set MODEL_PATH to a tree .pt). "
        "The GIS pipeline uses TREE_DETECTION_ENGINE=yolo (detect) instead."
    )


class YoloSegEngine:
    """Ultralytics YOLO / YOLO-seg (.pt). Prefers masks when the model yields them."""

    name = "yolo_seg"

    def __init__(self, weights: str | None = None) -> None:
        from ultralytics import YOLO

        path = _resolve_yolo_weights(weights)
        self.model = YOLO(path)
        self.name = "yolo_seg"
        self.weights = path

    def predict(self, image: Image.Image, imgsz: int, conf: float, iou: float) -> dict[str, Any]:
        t0 = time.perf_counter()
        results = self.model.predict(
            source=image,
            imgsz=int(imgsz) if imgsz else DEFAULT_IMGSZ,
            conf=float(conf) if conf is not None else DEFAULT_CONF,
            iou=float(iou) if iou is not None else DEFAULT_IOU,
            verbose=False,
            retina_masks=True,
        )
        boxes: list[dict[str, Any]] = []
        instances: list[dict[str, Any]] = []
        for result in results:
            names = getattr(result, "names", {}) or {}
            masks = getattr(result, "masks", None)
            mask_data = None
            if masks is not None:
                try:
                    mask_data = masks.data.cpu().numpy()
                except Exception:
                    try:
                        mask_data = np.asarray(masks.data)
                    except Exception:
                        mask_data = None
            for i, box in enumerate(result.boxes):
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
                cls_id = int(box.cls[0].item()) if box.cls is not None else 0
                score = float(box.conf[0].item()) if box.conf is not None else 0.0
                label = names.get(cls_id, "Tree")
                boxes.append(
                    {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "confidence": score,
                        "name": label,
                    }
                )
                poly = None
                if mask_data is not None and i < len(mask_data):
                    # Ultralytics mask is often imgsz; rescale to original image
                    m = mask_data[i]
                    if m.shape[0] != image.height or m.shape[1] != image.width:
                        try:
                            import cv2  # type: ignore

                            m = cv2.resize(
                                m.astype(np.float32),
                                (image.width, image.height),
                                interpolation=cv2.INTER_LINEAR,
                            )
                        except Exception:
                            m = None
                    if m is not None:
                        poly = _mask_to_polygon(m)
                if poly is None:
                    instances.append(_box_to_instance(boxes[-1]))
                else:
                    area = float(max(0, len(poly) - 1))
                    try:
                        xs = [p[0] for p in poly]
                        ys = [p[1] for p in poly]
                        area = max(0.0, (max(xs) - min(xs)) * (max(ys) - min(ys)) * 0.7)
                    except Exception:
                        pass
                    instances.append(
                        {
                            "polygon": poly,
                            "score": score,
                            "label": label,
                            "area_px": area,
                        }
                    )
        return {
            "boxes": boxes,
            "instances": instances,
            "engine": self.name,
            "inference_ms": (time.perf_counter() - t0) * 1000,
        }


class OnnxSegEngine:
    """
    YOLO-seg style ONNX via onnxruntime.
    Expects Ultralytics-export layout when possible; falls back to empty instances
    with a clear engine tag if outputs cannot be decoded.
    """

    name = "onnx_seg"

    def __init__(self) -> None:
        import onnxruntime as ort

        providers: list[str] = []
        avail = ort.get_available_providers()
        if "CUDAExecutionProvider" in avail:
            providers.append("CUDAExecutionProvider")
        providers.append("CPUExecutionProvider")
        path = MODEL_PATH
        if not path or not os.path.exists(path):
            raise RuntimeError("MODEL_PATH must point to an existing .onnx file for onnx_seg.")
        self.session = ort.InferenceSession(path, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        self.providers = providers

    def _letterbox(self, image: Image.Image, imgsz: int) -> tuple[np.ndarray, float, int, int]:
        w, h = image.size
        scale = min(imgsz / w, imgsz / h)
        nw, nh = int(round(w * scale)), int(round(h * scale))
        resized = image.resize((nw, nh), Image.BILINEAR)
        canvas = Image.new("RGB", (imgsz, imgsz), (114, 114, 114))
        pad_x = (imgsz - nw) // 2
        pad_y = (imgsz - nh) // 2
        canvas.paste(resized, (pad_x, pad_y))
        arr = np.asarray(canvas).astype(np.float32) / 255.0
        arr = np.transpose(arr, (2, 0, 1))[None, ...]
        return arr, scale, pad_x, pad_y

    def predict(self, image: Image.Image, imgsz: int, conf: float, iou: float) -> dict[str, Any]:
        t0 = time.perf_counter()
        size = int(imgsz) if imgsz else DEFAULT_IMGSZ
        blob, scale, pad_x, pad_y = self._letterbox(image, size)
        outputs = self.session.run(None, {self.input_name: blob})
        boxes: list[dict[str, Any]] = []
        instances: list[dict[str, Any]] = []

        # Best-effort decode: look for a predictions tensor [1, N, 4+1+…] or [1, C, N]
        try:
            pred = outputs[0]
            if pred.ndim == 3 and pred.shape[1] < pred.shape[2]:
                pred = np.transpose(pred, (0, 2, 1))
            rows = pred[0]
            for row in rows:
                # xywh + conf common for YOLO onnx
                if row.shape[0] < 5:
                    continue
                score = float(row[4])
                if score < conf:
                    continue
                cx, cy, bw, bh = float(row[0]), float(row[1]), float(row[2]), float(row[3])
                x1 = (cx - bw / 2 - pad_x) / scale
                y1 = (cy - bh / 2 - pad_y) / scale
                x2 = (cx + bw / 2 - pad_x) / scale
                y2 = (cy + bh / 2 - pad_y) / scale
                box = {
                    "x1": x1,
                    "y1": y1,
                    "x2": x2,
                    "y2": y2,
                    "confidence": score,
                    "name": "Tree",
                }
                boxes.append(box)
                instances.append(_box_to_instance(box))
        except Exception:
            pass

        return {
            "boxes": boxes,
            "instances": instances,
            "engine": self.name,
            "inference_ms": (time.perf_counter() - t0) * 1000,
            "onnx_providers": self.providers,
        }


def _make_engine(kind: str):
    if kind == "onnx_seg":
        return OnnxSegEngine()
    if kind == "yolo_seg":
        eng = YoloSegEngine()
        return eng
    if kind in ("yolo", "yolo_detect"):
        return YoloDetectEngine()
    return DeepForestEngine()


def _build_engine() -> tuple[Any, str | None]:
    """Default Ultralytics YOLO detect. DeepForest only when explicitly requested."""
    preferred = _select_engine()
    order = [preferred]
    if "yolo" not in order:
        order.append("yolo")
    if ENGINE == "deepforest" and "deepforest" not in order:
        order.append("deepforest")
    errors: list[str] = []
    for kind in order:
        try:
            return _make_engine(kind), None
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{kind}: {exc}")
    return None, "; ".join(errors)


_engine, _engine_error = _build_engine()
_checkpoint_engines: dict[str, Any] = {}
_named_engines: dict[str, Any] = {}


def _resolve_named_engine(kind: str | None):
    """Load/cache an engine by name for per-request UI selection."""
    name = (kind or "").strip().lower()
    if not name or name in ("auto", "default"):
        return None
    if name == "yolo_detect":
        name = "yolo"
    if name not in ("deepforest", "yolo", "yolo_seg", "onnx_seg"):
        return None
    if name in _named_engines:
        return _named_engines[name]
    eng = _make_engine(name)
    _named_engines[name] = eng
    return eng


def _resolve_engine(checkpoint_id: str | None, engine_name: str | None = None):
    cid = (checkpoint_id or "").strip()
    if not cid:
        named = _resolve_named_engine(engine_name)
        if named is not None:
            return named
        if _engine is None:
            raise RuntimeError(
                f"No tree-detection engine available ({_engine_error}). "
                "Install Ultralytics in the service venv: pip install ultralytics"
            )
        return _engine
    if cid in _checkpoint_engines:
        return _checkpoint_engines[cid]
    ckpt = CHECKPOINTS_DIR / cid / "weights" / "best.pt"
    if not ckpt.is_file():
        ckpt = CHECKPOINTS_DIR / cid / "best.pt"
    if not ckpt.is_file():
        raise FileNotFoundError(f"Unknown checkpoint_id={cid}")
    eng = YoloSegEngine(str(ckpt))
    _checkpoint_engines[cid] = eng
    return eng


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if _engine is not None else "degraded",
        "engine": getattr(_engine, "name", None),
        "engines_available": ["yolo", "yolo_seg", "onnx_seg", "deepforest"],
        "model_path": bool(MODEL_PATH and os.path.exists(MODEL_PATH)),
        "weights": getattr(_engine, "weights", None),
        "error": _engine_error,
        "finetune_dir": str(CHECKPOINTS_DIR),
    }


@app.post("/predict")
async def predict(
    request: Request,
    file: UploadFile | None = File(None),
    imgsz: int = Form(DEFAULT_IMGSZ),
    conf: float = Form(DEFAULT_CONF),
    iou: float = Form(DEFAULT_IOU),
    checkpoint_id: str | None = Form(None),
    engine: str | None = Form(None),
):
    # Support raw PNG body (proxy) and multipart form.
    raw: bytes
    ckpt = checkpoint_id or request.query_params.get("checkpoint_id")
    engine_name = (engine or request.query_params.get("engine") or "").strip() or None
    if file is not None:
        raw = await file.read()
    else:
        raw = await request.body()
    # Query conf/imgsz for raw-body clients
    if request.query_params.get("score") is not None:
        try:
            conf = float(request.query_params.get("score"))
        except Exception:
            pass
    if request.query_params.get("imgsz") is not None:
        try:
            imgsz = int(request.query_params.get("imgsz"))
        except Exception:
            pass
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": f"Could not decode image: {exc}"})

    try:
        eng = _resolve_engine(ckpt, engine_name)
    except FileNotFoundError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except RuntimeError as exc:
        return JSONResponse(status_code=503, content={"error": str(exc)})

    try:
        result = eng.predict(
            image,
            imgsz=int(imgsz) if imgsz else DEFAULT_IMGSZ,
            conf=float(conf) if conf is not None else DEFAULT_CONF,
            iou=float(iou) if iou is not None else DEFAULT_IOU,
        )
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": f"Inference failed: {exc}"})

    if not isinstance(result, dict):
        boxes = list(result or [])
        return {
            "boxes": boxes,
            "instances": [],
            "engine": getattr(eng, "name", "yolo"),
            "inference_ms": 0,
            "checkpoint_id": ckpt,
        }
    result.setdefault("instances", [])
    if "engine" not in result:
        result["engine"] = getattr(eng, "name", "yolo")
    result["checkpoint_id"] = ckpt
    return result


def _write_yolo_seg_dataset(root: Path, chips: list[dict[str, Any]]) -> Path:
    """Write Ultralytics-compatible seg dataset (2 classes: Tree, Non-Tree)."""
    img_dir = root / "images" / "train"
    lbl_dir = root / "labels" / "train"
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)
    n = 0
    for i, chip in enumerate(chips):
        b64 = chip.get("image_png_b64") or chip.get("png_b64")
        labels = chip.get("labels") or []
        if not b64 or not labels:
            continue
        try:
            raw = base64.b64decode(b64)
        except Exception:
            continue
        img_path = img_dir / f"chip_{i:04d}.png"
        img_path.write_bytes(raw)
        lines: list[str] = []
        for lab in labels:
            cls = int(lab.get("cls", 0))
            pts = lab.get("pts_norm") or []
            flat: list[str] = []
            for p in pts:
                if not isinstance(p, (list, tuple)) or len(p) < 2:
                    continue
                x = min(1.0, max(0.0, float(p[0])))
                y = min(1.0, max(0.0, float(p[1])))
                flat.append(f"{x:.6f}")
                flat.append(f"{y:.6f}")
            if len(flat) < 6:
                continue
            lines.append(f"{cls} " + " ".join(flat))
        if not lines:
            img_path.unlink(missing_ok=True)
            continue
        (lbl_dir / f"chip_{i:04d}.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        n += 1
    if n < 1:
        raise ValueError("No valid labeled chips to train on.")
    data_yaml = root / "data.yaml"
    data_yaml.write_text(
        "\n".join(
            [
                f"path: {root.as_posix()}",
                "train: images/train",
                "val: images/train",
                "names:",
                "  0: Tree",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    return data_yaml


@app.post("/finetune")
async def finetune(request: Request):
    """
    Fine-tune YOLO segmentation on labeled chips from Training Samples.
    Requires ultralytics. Base weights: MODEL_PATH or yolo11n-seg.pt.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"ok": False, "error": "Expected JSON body."})
    chips = body.get("chips") if isinstance(body, dict) else None
    if not isinstance(chips, list) or not chips:
        return JSONResponse(status_code=400, content={"ok": False, "error": "chips[] required."})
    epochs = int(body.get("epochs") or 8)
    epochs = max(1, min(40, epochs))

    try:
        from ultralytics import YOLO
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=501,
            content={
                "ok": False,
                "error": f"Ultralytics not installed ({exc}). pip install ultralytics",
            },
        )

    base = (body.get("base_model") or MODEL_PATH or "yolo11n-seg.pt").strip()
    if base and base != "yolo11n-seg.pt" and not os.path.exists(base):
        # Fall back to nano seg weights downloadable by ultralytics
        base = "yolo11n-seg.pt"

    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
    run_id = f"ft-{uuid.uuid4().hex[:10]}"
    work = Path(tempfile.mkdtemp(prefix="tree-ft-"))
    try:
        data_yaml = _write_yolo_seg_dataset(work, chips)
        model = YOLO(base)
        model.train(
            data=str(data_yaml),
            epochs=epochs,
            imgsz=DEFAULT_IMGSZ,
            batch=max(1, min(4, len(chips))),
            project=str(CHECKPOINTS_DIR),
            name=run_id,
            exist_ok=True,
            verbose=False,
            patience=max(2, epochs // 2),
            plots=False,
        )
        run_dir = CHECKPOINTS_DIR / run_id
        best = run_dir / "weights" / "best.pt"
        if not best.is_file():
            # Older layout
            alt = run_dir / "best.pt"
            if alt.is_file():
                best = alt
        if not best.is_file():
            return JSONResponse(
                status_code=500,
                content={"ok": False, "error": "Training finished but best.pt was not found."},
            )
        # Prime cache
        try:
            _checkpoint_engines[run_id] = YoloSegEngine(str(best))
        except Exception:
            pass
        meta = {
            "checkpoint_id": run_id,
            "best_pt": str(best),
            "epochs": epochs,
            "chips": len(chips),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        (run_dir / "agrocloud_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        return {
            "ok": True,
            "checkpoint_id": run_id,
            "model_version": run_id,
            "engine": "yolo_seg",
            "epochs": epochs,
            "sample_chips": len(chips),
        }
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"ok": False, "error": f"Fine-tune failed: {exc}"})
    finally:
        shutil.rmtree(work, ignore_errors=True)
