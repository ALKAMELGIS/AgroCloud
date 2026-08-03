# SAM2 Boundary Refinement service

Meta [SAM 2](https://github.com/facebookresearch/sam2) refinement for AgroCloud
**field accuracy pipeline** (after SegFormer-B5 instance split).

Each B5 instance box (+ optional centroid) is refined to a crisp polygon —
light simplify, **no convex hull**. Existing interactive SAM1
(`backend/services/sam-detection`) is left untouched.

## GPU / memory

| Model | Notes |
| ----- | ----- |
| `facebook/sam2-hiera-large` (default) | Best boundaries; prefer GPU, ~2–4 GB+ VRAM with B5 on same card is tight |
| `facebook/sam2-hiera-base-plus` | Lower RAM / CPU-friendlier |
| CPU | Supported via transformers fallback; expect multi-minute AOIs |

Together with SegFormer-B5, plan **8–16 GB VRAM** or run services on separate devices.

## Run

```bash
cd backend/services/sam2-refinement
docker compose up --build
```

Serves `http://localhost:8096`. Backend env:

| Env | Default |
| --- | --- |
| `SAM2_REFINEMENT_URL` | `http://127.0.0.1:8096/refine` |
| `SAM2_REFINEMENT_TOKEN` | (optional Bearer) |

Service env: `SAM2_MODEL_ID`, `SAM2_MAX_EDGE`, `SAM2_MIN_CONFIDENCE`, `SAM2_MIN_COMPONENT_PX`, `PORT`.

## API

### `GET /health`

```jsonc
{ "status": "ok", "engine": "sam2", "model": "facebook/sam2-hiera-large", "device": "cuda", "model_ready": true }
```

### `POST /refine`

```jsonc
{
  "image": "data:image/png;base64,...",
  "bbox": [west, south, east, north],
  "instances": [
    {
      "feature_id": "SF-00001",
      "bbox_xyxy": [10, 20, 200, 180],
      "centroid_xy": [105, 100],
      "score": 0.7
    }
  ],
  "aoi": { /* optional GeoJSON */ },
  "minConfidence": 0.35,
  "date": "2024-06-15",
  "provider": "Sentinel Hub"
}
```

Response: GeoJSON polygons with `Feature_ID`, `Class_Name`, `Confidence`,
`Area_m2`, `Area_Hectare`, `Perimeter`, `Date`, `Provider` + `mask_png`.
