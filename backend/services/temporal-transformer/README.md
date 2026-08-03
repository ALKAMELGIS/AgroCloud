# Temporal Transformer crop typing

Attaches **Crop_Type** / **Crop_Confidence** onto refined field polygons for the
AgroCloud field accuracy pipeline (after SegFormer-B5 → SAM2).

v1 accepts a FeatureCollection + S2 dates and optional majority-class / per-feature
hints. When `TEMPORAL_PRITHVI_URL` (or `CROP_CLASSIFICATION_SELF_URL`) is set, the
service may call Prithvi `/predict` and apply the majority class to all fields.

## Run

```bash
cd backend/services/temporal-transformer
docker compose up --build
```

Serves `http://localhost:8097`. Backend: `TEMPORAL_TRANSFORMER_URL=http://127.0.0.1:8097/classify`.

## API

### `GET /health`

```jsonc
{ "status": "ok", "engine": "temporal-transformer", "prithvi_configured": false }
```

### `POST /classify`

```jsonc
{
  "geojson": { "type": "FeatureCollection", "features": [/* SAM2 refined */] },
  "dates": ["2024-04-10", "2024-05-12", "2024-06-15"],
  "bbox": [west, south, east, north],
  "majorityClassName": "Wheat",
  "majorityConfidence": 0.72
}
```

Response GeoJSON features include `Crop_Type`, `Crop_Confidence` (and camelCase aliases).
