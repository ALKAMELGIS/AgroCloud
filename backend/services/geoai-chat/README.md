# GeoAI Chat Service

FastAPI spatial intelligence API for AgroCloud Satellite Intelligence. Powers **GeoAI Chat** — server-side GIS analysis (GeoPandas, Shapely, Rasterio) with optional OpenAI explanations.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health |
| POST | `/geoai/chat` | `{ message, context }` → answer, statistics, geojson, action |

Node proxy (production / CORS): `GET /api/geoai-chat/health`, `POST /api/geoai-chat/chat`

## Local setup (Windows)

```powershell
cd backend/services/geoai-chat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Optional: set OPENAI_API_KEY in .env for LLM explanations
uvicorn app:app --reload --port 8099
```

In a second terminal, from repo root:

```powershell
npm run dev
```

Health check: `http://localhost:3011/api/geoai-chat/health`

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `8099` | Uvicorn port |
| `OPENAI_API_KEY` | — | Server-side only; never expose as `VITE_*` |
| `GEOAI_CHAT_URL` | `http://127.0.0.1:8099` | Set in repo root `.env` for Node proxy |
| `GEOAI_CHAT_TOKEN` | — | Optional Bearer auth |

## Tests

```powershell
cd backend/services/geoai-chat
.venv\Scripts\activate
pip install pytest
pytest tests/
```

## Architecture

- `app.py` — FastAPI entry
- `agent/geo_agent.py` — intent routing + optional OpenAI explain
- `services/gis_service.py` — orchestrates tools
- `tools/` — spatial, raster, layer, place tools
- `data/vector/`, `data/raster/` — optional local fixtures

Separate from **geoai-inference** (8098, Mask R-CNN detection).
