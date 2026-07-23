# AI SAM Detection service

Interactive [Segment Anything Model](https://segment-anything.com/) segmentation for the
AgroCloud **AI SAM Detection** tool, powered by
[segment-geospatial (samgeo)](https://github.com/opengeos/segment-geospatial).

You drop **foreground** (keep) and **background** (exclude) point prompts on the map, and
this service returns the segmented object as georeferenced **GeoJSON polygons** plus a
translucent mask overlay.

## Run (zero-config)

samgeo auto-downloads the SAM checkpoint on first run.

```bash
cd backend/services/sam-detection
docker compose up --build
```

This serves `http://localhost:8090/segment`, which is also the AgroCloud backend default
for `SAM_DETECTION_URL` — so once it is up, the tool works with no further configuration.

Or run it directly with Python:

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8090
```

## Configuration

| Env var          | Default  | Description                                             |
| ---------------- | -------- | ------------------------------------------------------- |
| `SAM_MODEL_TYPE` | `vit_h`  | SAM checkpoint: `vit_h` (best), `vit_l`, `vit_b` (fast) |
| `SAM_MAX_EDGE`   | `1024`   | Max image edge fed to SAM (mask is scaled back up)      |
| `PORT`           | `8090`   | Listen port (honored on Railway/Render/Cloud Run)       |

A GPU with ≥ 8 GB VRAM is strongly recommended. The service runs on CPU but slowly.

## API

`POST /segment` (application/json)

```jsonc
{
  "image":  "data:image/png;base64,...",   // captured RGB map view
  "bbox":   [west, south, east, north],     // WGS84 extent of the image
  "points": [{ "x": 512, "y": 300, "label": 1 }, { "x": 40, "y": 40, "label": 0 }],
  "simplify": 0.00001,                       // optional polygon simplify tolerance (deg)
  "multimask": true                          // let SAM pick the best of 3 masks
}
```

Response:

```jsonc
{
  "geojson":  { "type": "FeatureCollection", "features": [ /* EPSG:4326 polygons */ ] },
  "mask_png": "data:image/png;base64,...",
  "width": 1024, "height": 768,
  "score": 0.97,
  "count": 1
}
```

`GET /health` → `{ "status": "ok", "engine": "samgeo", "model": "vit_h" }`
