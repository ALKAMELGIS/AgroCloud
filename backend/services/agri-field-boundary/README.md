# Agri Field Boundary Detection

OpenGeoAI / Fields-of-the-World grade agricultural field boundary delineation.

## Run locally

```bash
cd backend/services/agri-field-boundary
pip install -r requirements.txt
# Optional: Delineate-Anything weights auto-download on first run
C:\samenv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8092
```

Backend Node defaults to `http://127.0.0.1:8092/detect`.

## Engines (priority)

1. **Fields of the World (`source=fow`)** — AOI clip of global FTW GeoParquet via DuckDB/httpfs.
2. **Mask R-CNN** — set `FIELD_BOUNDARY_MODEL_PATH` to a geoai / OpenGeoAI `best_model.pth` (sliding-window tiles).
3. **Delineate-Anything** — YOLOv11 instance segmentation (default ML for RGB basemap / drone / PNG / JPEG).
4. **SAM AMG** — if SAM is running on `:8090`.

Watershed classical CV is **not** used in this tool.

## API

- `GET /health`
- `POST /detect` — sync (supports `source: "fow"` without image)
- `POST /fow-aoi` — FoW clip `{ bbox, aoi?, min_area_m2? }`
- `POST /detect-job` + `GET /detect-job/{id}` — async with progress

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `FIELD_BOUNDARY_MODEL_PATH` | unset | Mask R-CNN `.pth` |
| `FIELD_BOUNDARY_MAX_EDGE` | 4096 | Max capture edge |
| `DELINEATE_ANYTHING_ENABLED` | 1 | Enable YOLO engine |
| `DELINEATE_ANYTHING_PATH` | `./weights/DelineateAnything-S.pt` | Local weights |
| `FOW_PARQUET_GLOB` | Source Coop predictions | FoW GeoParquet glob |
| `FOW_MAX_FEATURES` | 5000 | Cap polygons per AOI |
