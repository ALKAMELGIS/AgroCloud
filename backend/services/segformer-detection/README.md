# SegFormer GIS Detection service

Pretrained [SegFormer](https://huggingface.co/nvidia/segformer-b5-finetuned-ade-640-640)
(ADE20K, mit-b5) semantic segmentation for the AgroCloud **SegFormer Detection**
toolbox. You POST a captured map RGB view + AgroCloud class ID; the service
filters ADE20K logits to the curated class mapping, vectorizes connected
components (field class uses **distance-transform + watershed instance split**)
to **GeoJSON polygons** (EPSG:4326), and returns confidence / area / perimeter
attributes ready for the map layer.

**Default model:** `nvidia/segformer-b5-finetuned-ade-640-640`. For CPU / light
hosts set `SEGFORMER_MODEL_ID=nvidia/segformer-b0-finetuned-ade-512-512`.

**Field pipeline (class 1):** ADE20K index **29 (field) only**, open-only
morphology (no heavy close), higher `SEGFORMER_FIELD_MIN_COMPONENT_PX`,
watershed instance split, coarse `instances[]` boxes for SAM2 refine. No convex hull.

Classes without a reliable ADE20K mapping return HTTP 422 with a clear
“Requires fine-tuned SegFormer weights” message — no custom fine-tune loop in
this phase.

## GPU / memory

| Stack | Notes |
| ----- | ----- |
| B5 alone | Prefer GPU; CPU works but tiled AOIs are slow |
| B5 + SAM2 field pipeline | Plan ~8–16 GB VRAM when both services share a GPU; run SAM2 on a second GPU or CPU fallback if needed |
| B0 override | Use when VRAM &lt; 4 GB or CPU-only |

## Run (zero-config)

```bash
cd backend/services/segformer-detection
docker compose up --build
```

This serves `http://localhost:8095`, which is also the AgroCloud backend default
for `SEGFORMER_DETECTION_URL`.

Or run it directly with Python:

```bash
pip install -r requirements.txt
# CPU-only torch (optional):
# pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
# Light model:
# set SEGFORMER_MODEL_ID=nvidia/segformer-b0-finetuned-ade-512-512
uvicorn app:app --host 0.0.0.0 --port 8095
```

## Configuration

| Env var                          | Default                                           | Description                                      |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `SEGFORMER_MODEL_ID`             | `nvidia/segformer-b5-finetuned-ade-640-640`       | HuggingFace model id (B0 override for light hosts) |
| `SEGFORMER_MAX_EDGE`             | `1024`                                            | Max image edge fed to SegFormer (mask upscaled)  |
| `SEGFORMER_TILE_SIZE`            | `512`                                             | Default tile; B5 maps 512→640 when unset request |
| `SEGFORMER_OVERLAP`              | `0.2`                                             | Default tile overlap fraction                    |
| `SEGFORMER_MIN_CONFIDENCE`       | `0.45`                                            | Default min confidence for GIS features          |
| `SEGFORMER_AG_MIN_CONFIDENCE`    | `0.3`                                             | Ag/veg default when request omits confidence     |
| `SEGFORMER_MIN_COMPONENT_PX`     | `24`                                              | Drop connected components smaller than this      |
| `SEGFORMER_FIELD_MIN_COMPONENT_PX` | `96`                                            | Field pipeline min instance area (px)            |
| `PORT`                           | `8095`                                            | Listen port (Railway / Render / Cloud Run)       |

Allowed tile sizes: **256 / 512 / 640 / 1024**.

## API

### `GET /health`

```jsonc
{
  "status": "ok",
  "engine": "segformer-b5",
  "model": "nvidia/segformer-b5-finetuned-ade-640-640",
  "device": "cuda",
  "model_ready": true,
  "allowed_tile_sizes": [256, 512, 640, 1024]
}
```

### `POST /detect` (application/json)

```jsonc
{
  "imageDataUrl": "data:image/png;base64,...",
  "bbox": [west, south, east, north],
  "classId": 1,
  "className": "Agricultural Field",
  "ade20kIndices": [29],
  "minConfidence": 0.4,
  "tileSize": 640,
  "overlap": 0.2,
  "aoi": { /* GeoJSON Polygon|MultiPolygon|Feature|FeatureCollection */ }
}
```

Response includes `engine`, `instance_count`, and `instances` (coarse boxes /
centroids for SAM2):

```jsonc
{
  "geojson": { "type": "FeatureCollection", "features": [/* … */] },
  "mask_png": "data:image/png;base64,...",
  "engine": "segformer-b5",
  "instance_count": 3,
  "instances": [
    {
      "feature_id": "SF-00001",
      "bbox_xyxy": [10, 20, 120, 180],
      "centroid_xy": [65.0, 100.0],
      "score": 0.72
    }
  ],
  "count": 3,
  "device": "cuda"
}
```
