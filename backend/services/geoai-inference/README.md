# GeoAI Inference (opengeos/geoai)

Wraps [geoai-py](https://github.com/opengeos/geoai) Mask R-CNN extractors for AgroCloud:

| Task | Model file (HuggingFace `giswqs/geoai`) |
|------|----------------------------------------|
| `buildings` | `building_footprints_usa.pth` |
| `cars` | `car_detection_usa.pth` |
| `ships` | `ship_detection.pth` |
| `solar` | `solar_panel_detection.pth` |
| `parking` | `parking_spot_detection.pth` |

## Local install (Windows)

Needs roughly **4–6 GB free disk**. Prefer a **short venv path** (torch nests deep license paths; OneDrive project paths can hit Windows `MAX_PATH`). Prefer `--no-cache-dir`.

```powershell
# Short path recommended on Windows:
python -m venv C:\geoai-venv
cd backend\services\geoai-inference
cmd /c mklink /J .venv C:\geoai-venv
C:\geoai-venv\Scripts\activate
python -m pip install --upgrade pip
pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install --no-cache-dir --no-deps geoai-py
pip install --no-cache-dir -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8098
```

PyPI `geoai-py` does **not** ship an `[all]` extra. This service stubs `leafmap` so you need not install the full Jupyter/leafmap stack.

Or conda (upstream style):

```bash
conda create -n geoai python=3.12 -y
conda activate geoai
conda install -c conda-forge geoai -y
pip install fastapi "uvicorn[standard]" pydantic pillow
uvicorn app:app --host 127.0.0.1 --port 8098
```

## Docker

```bash
cd backend/services/geoai-inference
docker compose up --build
```

Serves `http://localhost:8098`. Backend default: `GEOAI_INFERENCE_URL=http://127.0.0.1:8098`.

## API

### `GET /health`

```jsonc
{ "status": "ok", "engine": "geoai-py", "package": "0.40.x", "device": "cpu", "tasks": ["buildings", ...] }
```

### `POST /detect`

```jsonc
{
  "image": "data:image/png;base64,...",
  "bbox": [west, south, east, north],
  "task": "buildings",
  "minConfidence": 0.5
}
```

Response includes `geojson` (EPSG:4326 FeatureCollection), `count`, `task`, `engine`, `model`, `device`.

## Env

| Variable | Default | Meaning |
|----------|---------|---------|
| `GEOAI_INFERENCE_URL` | `http://127.0.0.1:8098` | Node proxy base (set on AgroCloud backend) |
| `GEOAI_INFERENCE_TOKEN` | unset | Optional Bearer for proxy |
| `GEOAI_MIN_CONFIDENCE` | `0.5` | Default confidence |
| `GEOAI_EAGER_LOAD` | `0` | Preload buildings model at startup |
| `PORT` | `8098` | Uvicorn port |
