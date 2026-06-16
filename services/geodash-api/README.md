# GeoDash API (FastAPI)

Minimal service for **dataset ingestion** and a **one-to-many** model:

- `Dataset` — uploaded Excel/CSV/Geo package
- `SpatialFeature` — geometry row (WKT placeholder; swap for PostGIS `Geometry` in production)
- `TelemetryRecord` — many rows per feature (yield, logistics events, NDVI summaries, …)

## Run locally

```bash
cd services/geodash-api
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8090
```

## Frontend

Set in the Vite env:

```bash
VITE_GEODASH_API_URL=http://localhost:8090
```

The GeoDash Enterprise page (`/dashboards/geodash`) will POST multipart files to `/sources/upload`.

## Next steps (production)

- Replace SQLite with **PostGIS**; store `geometry(Geometry, 4326)` on `spatial_features`.
- Use **GeoPandas / pyogrio** (or `ogr2ogr`) in a background worker to parse Shapefile/KMZ/GeoJSON.
- Add auth (API keys or OAuth) and per-tenant dataset isolation.
