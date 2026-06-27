"""
AI Tree Detection — tree-crown inference microservice.

Exposes a tiny HTTP endpoint that the AgroCloud backend proxy
(`/api/tree-detection/predict`) forwards AOI imagery to. The AgroCloud
frontend tiles the AOI, posts each RGB mosaic here, and georeferences the
returned image-pixel boxes back to lng/lat.

Two interchangeable engines, auto-selected so the service "just works":

  • DeepForest (DEFAULT, zero-config) — https://github.com/weecology/DeepForest
    A pip-installable package that AUTO-DOWNLOADS a pretrained tree-crown model
    on first run. No manual weights file is needed.

  • YOLO (optional) — set MODEL_PATH to a YOLO weights file (e.g. best.pt from
    https://anapgit.scanlab.gr/yolo-trees/ai-tree-detection) and, if Ultralytics
    is installed, it is used instead of DeepForest.

Engine selection (override with TREE_DETECTION_ENGINE = "deepforest" | "yolo"):
  - "yolo"       → require Ultralytics + a weights file at MODEL_PATH
  - "deepforest" → force DeepForest
  - unset        → YOLO if MODEL_PATH exists and Ultralytics imports, else DeepForest

Contract (matches backend/server/treeDetectionProxy.js):
  POST /predict   multipart/form-data
    file   : the AOI mosaic image (PNG/JPEG)
    imgsz  : (optional) inference size, default 640
    conf   : (optional) confidence threshold 0..1, default 0.25
    iou    : (optional) NMS IoU threshold 0..1, default 0.45
  Response 200:
    { "boxes": [ { "x1":.., "y1":.., "x2":.., "y2":.., "confidence":.., "name":"Tree" }, ... ] }
  Coordinates are in the ORIGINAL posted-image pixel space (top-left origin).

Run (zero-config DeepForest):
  pip install -r requirements.txt
  uvicorn app:app --host 0.0.0.0 --port 8080
Then on the AgroCloud backend (optional — this is also the default):
  TREE_DETECTION_URL=http://127.0.0.1:8080/predict
"""

import io
import os
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

DEFAULT_IMGSZ = int(os.environ.get("TREE_DETECTION_IMG_SIZE", "640"))
DEFAULT_CONF = float(os.environ.get("TREE_DETECTION_CONF", "0.25"))
DEFAULT_IOU = float(os.environ.get("TREE_DETECTION_IOU", "0.45"))
MODEL_PATH = os.environ.get("MODEL_PATH", "").strip()
ENGINE = os.environ.get("TREE_DETECTION_ENGINE", "").strip().lower()

app = FastAPI(title="AI Tree Detection")


def _select_engine() -> str:
    """Decide which inference engine to load (see module docstring)."""
    if ENGINE in ("deepforest", "yolo"):
        return ENGINE
    if MODEL_PATH and os.path.exists(MODEL_PATH):
        try:
            import ultralytics  # noqa: F401

            return "yolo"
        except Exception:
            return "deepforest"
    return "deepforest"


class DeepForestEngine:
    """Zero-config tree-crown detector (auto-downloads a pretrained model)."""

    name = "deepforest"

    def __init__(self) -> None:
        from deepforest import main as df_main

        self.model = df_main.deepforest()
        # Load a pretrained tree-crown model. Newer DeepForest releases moved
        # from `use_release()` to `load_model(...)`; try both so the service
        # works regardless of the installed version.
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
        if not loaded:  # surface a clear failure at startup, not per-request
            raise RuntimeError(
                "DeepForest could not load a pretrained tree model "
                "(use_release / load_model both failed)."
            )

    def predict(self, image: Image.Image, imgsz: int, conf: float, iou: float):
        # Write a clean RGB file so DeepForest reads it via its own loader
        # (avoids the RGB/BGR ambiguity of passing in-memory arrays).
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

        boxes = []
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
        return boxes

    def _run(self, image_path: str, imgsz: int, iou: float):
        """Tolerant call into DeepForest across versions: prefer tiled prediction."""
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


class YoloEngine:
    """Ultralytics YOLO detector (requires a weights file at MODEL_PATH)."""

    name = "yolo"

    def __init__(self) -> None:
        from ultralytics import YOLO

        weights = MODEL_PATH or "best.pt"
        self.model = YOLO(weights)

    def predict(self, image: Image.Image, imgsz: int, conf: float, iou: float):
        results = self.model.predict(
            source=image,
            imgsz=int(imgsz) if imgsz else DEFAULT_IMGSZ,
            conf=float(conf) if conf is not None else DEFAULT_CONF,
            iou=float(iou) if iou is not None else DEFAULT_IOU,
            verbose=False,
        )
        boxes = []
        for result in results:
            names = getattr(result, "names", {}) or {}
            for box in result.boxes:
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
                cls_id = int(box.cls[0].item()) if box.cls is not None else 0
                boxes.append(
                    {
                        "x1": x1,
                        "y1": y1,
                        "x2": x2,
                        "y2": y2,
                        "confidence": float(box.conf[0].item()) if box.conf is not None else 0.0,
                        "name": names.get(cls_id, "Tree"),
                    }
                )
        return boxes


# Loaded once at startup and reused for every request.
_engine = YoloEngine() if _select_engine() == "yolo" else DeepForestEngine()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": _engine.name}


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    imgsz: int = Form(DEFAULT_IMGSZ),
    conf: float = Form(DEFAULT_CONF),
    iou: float = Form(DEFAULT_IOU),
):
    try:
        raw = await file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=400, content={"error": f"Could not decode image: {exc}"})

    try:
        boxes = _engine.predict(
            image,
            imgsz=int(imgsz) if imgsz else DEFAULT_IMGSZ,
            conf=float(conf) if conf is not None else DEFAULT_CONF,
            iou=float(iou) if iou is not None else DEFAULT_IOU,
        )
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": f"Inference failed: {exc}"})

    return {"boxes": boxes}
