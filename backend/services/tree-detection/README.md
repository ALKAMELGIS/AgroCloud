# AI Tree Detection service

Ultralytics **YOLO Detection** with a single class `tree`. The AgroCloud frontend
tiles Esri World Imagery, posts each RGB mosaic to `/api/tree-detection/predict`,
and converts every bounding-box **centre** to a GIS Point.

```
Esri Basemap → YOLO detect (class: tree) → box centre → GIS Point
```

No segmentation and no crown polygons.

Package: [ultralytics/ultralytics](https://github.com/ultralytics/ultralytics.git)

## Engine

| Engine | When | Output |
|--------|------|--------|
| **yolo** (default) | Ultralytics YOLO-World `set_classes(["tree"])`, or `MODEL_PATH=*.pt` trained on trees | Boxes only |
| **yolo_seg** | Fine-tune checkpoints only | Boxes (+ masks, unused by GIS) |
| **deepforest** | `TREE_DETECTION_ENGINE=deepforest` (legacy) | Boxes |

Default weights: `yolov8s-worldv2.pt` (open-vocabulary detect, class `tree`).
To train your own single-class detector:

```bash
yolo detect train data=trees.yaml model=yolo11n.pt epochs=100 imgsz=640
```

Then:

```bash
MODEL_PATH=/path/to/best.pt TREE_DETECTION_ENGINE=yolo uvicorn app:app --host 0.0.0.0 --port 8080
```

`trees.yaml` should declare one class:

```yaml
names:
  0: tree
```

## Quickest start (Docker)

```bash
cd backend/services/tree-detection
docker compose up --build
```

Serves `http://localhost:8080/predict` (AgroCloud default `TREE_DETECTION_URL`).

## Run locally (pip)

```bash
cd backend/services/tree-detection
pip install -r requirements.txt
.\start-local.ps1
```

## Endpoint contract

`POST /predict` (`multipart/form-data` or raw PNG)

| field | type | default | notes |
|-------|------|---------|-------|
| `file` | image | — | AOI mosaic (PNG/JPEG) |
| `imgsz` | int | 800 | inference size |
| `conf` / `score` | float | 0.25 | confidence threshold |
| `iou` | float | 0.45 | NMS IoU |
| `engine` | string | yolo | `yolo` |

Response `200`:

```json
{
  "boxes": [
    { "x1": 12.0, "y1": 34.0, "x2": 56.0, "y2": 78.0, "confidence": 0.91, "name": "Tree" }
  ],
  "instances": [],
  "engine": "yolo",
  "inference_ms": 42.0
}
```

GIS attributes after georeference: `Tree_ID | X | Y | Confidence | Date | Image_Source`.

`GET /health`: `{ "status": "ok", "engine": "yolo" }`

## Point AgroCloud at it

```ini
TREE_DETECTION_URL=http://127.0.0.1:8080/predict
```
