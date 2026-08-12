# AI Tree Detection service

Turnkey tree-crown detection endpoint. The AgroCloud frontend tiles the AOI,
posts each RGB mosaic to the backend proxy (`/api/tree-detection/predict`),
which forwards it here. Responses include axis-aligned **boxes** and optional
instance **mask polygons** (image-pixel rings) that the frontend georeferences.

## Engines

| Engine | When | Output |
|--------|------|--------|
| **DeepForest** (default / recommended) | Zero-config tree crowns | Boxes (+ rectangle rings as `instances`) |
| **YOLO Segmentation** | Tree-trained `MODEL_PATH=*.pt` only (COCO `yolo11n-seg.pt` is blocked) | Boxes + masks when available |
| **ONNX Segmentation** | `MODEL_PATH=*.onnx` + onnxruntime | Boxes (+ polygons when decode succeeds) |

Override with `TREE_DETECTION_ENGINE=deepforest|yolo|yolo_seg|onnx_seg`. Per-request: form/query `engine=`.

Default `TREE_DETECTION_IMG_SIZE=800`, `TREE_DETECTION_CONF=0.25`.

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
uvicorn app:app --host 0.0.0.0 --port 8080
```

### YOLO-seg (.pt)

```bash
pip install ultralytics
MODEL_PATH=/path/to/yolo-seg.pt TREE_DETECTION_ENGINE=yolo_seg \
  uvicorn app:app --host 0.0.0.0 --port 8080
```

### ONNX Runtime

```bash
# CPU:
pip install onnxruntime
# or GPU:
# pip install onnxruntime-gpu

MODEL_PATH=/path/to/model.onnx TREE_DETECTION_ENGINE=onnx_seg \
  uvicorn app:app --host 0.0.0.0 --port 8080
```

## Endpoint contract

`POST /predict` (`multipart/form-data`)

| field | type | default | notes |
|-------|------|---------|-------|
| `file` | image | — | AOI mosaic (PNG/JPEG) |
| `imgsz` | int | 640 | inference / tile size |
| `conf` | float | 0.25 | confidence threshold |
| `iou` | float | 0.45 | NMS IoU threshold |

Response `200`:

```json
{
  "boxes": [
    { "x1": 12.0, "y1": 34.0, "x2": 56.0, "y2": 78.0, "confidence": 0.91, "name": "Tree" }
  ],
  "instances": [
    {
      "polygon": [[12,34],[56,34],[56,78],[12,78],[12,34]],
      "score": 0.91,
      "label": "Tree",
      "area_px": 1936
    }
  ],
  "engine": "deepforest",
  "inference_ms": 420.5
}
```

Coordinates are in the original posted-image pixel space (top-left origin).

`GET /health`:

```json
{
  "status": "ok",
  "engine": "deepforest",
  "engines_available": ["deepforest", "yolo_seg", "onnx_seg"],
  "model_path": false
}
```

## Point AgroCloud at it

```ini
TREE_DETECTION_URL=http://127.0.0.1:8080/predict
```

Frontend **Tree Detections** tool: Imagery / Model / Confidence (default 0.50) /
Tile size / Overlap → Detect Trees → crown **polygons** on the map, stats,
Add to Map, GeoJSON / Shapefile. Sentinel-2 imagery mode extracts **vegetation
zones** only (not individual tree crowns).
