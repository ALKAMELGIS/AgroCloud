# Agri Field Boundary Detection

OpenGeoAI / Fields-of-the-World grade agricultural field boundary delineation.

## Run locally

Use a **dedicated virtualenv** (recommended). `ftw-tools` pulls a sizable stack from GitHub and needs `git` on `PATH` at install time.

```bash
cd backend/services/agri-field-boundary
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
# Optional CPU PyTorch if you have no GPU:
#   pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
# Optional: Delineate-Anything weights auto-download on first run
uvicorn app:app --host 127.0.0.1 --port 8092
```

Backend Node defaults to `http://127.0.0.1:8092/detect`.

**First FTW infer run** downloads the published checkpoint and Sentinel-2 tiles for the AOI (slow; needs network). Scratch files go under `FTW_INFER_WORKDIR` or the system temp dir and are cleaned after success.

To skip FTW infer (slim deploys / pip git failure): set `FTW_INFER_ENABLED=0` and omit or comment the `ftw-tools` line in `requirements.txt`.

### Docker

```bash
docker build -t agri-field-boundary .
docker run --rm -p 8092:8092 agri-field-boundary
```

The image installs `git`, copies all service modules, and sets `FTW_INFER_ENABLED=1`.

## Engines

| `source` | Engine | Image required? | Notes |
|----------|--------|-----------------|-------|
| `fow` / `fields-of-the-world` / `ftw` | Fields of the World GeoParquet | No | AOI clip of global FTW predictions via DuckDB/httpfs |
| `ftw-infer` / `ftw_model` / `ftw-baselines` | FTW baseline model (S2) | No | Official `ftw inference all` CLI — scene select → download → run → polygonize |
| *(default / RGB)* | Mask R-CNN | Yes | Set `FIELD_BOUNDARY_MODEL_PATH` to a geoai / OpenGeoAI `best_model.pth` |
| *(default / RGB)* | Delineate-Anything | Yes | YOLOv11 instance seg (default ML for basemap / drone / PNG / JPEG) |
| *(fallback)* | SAM AMG | Yes | If SAM is running on `:8090` |

Priority for RGB requests: Mask R-CNN (if configured) → Delineate-Anything → SAM.

Watershed classical CV is **not** used in this tool.

`GET /health` reports `ftw_infer: true` when the engine is enabled and the `ftw` CLI / `ftw_tools` package is importable.

## API

- `GET /health`
- `GET /health/live` — process up (systemd / deploy scripts)
- `GET /health/ready` — engines loaded (`ready: true` when Mask R-CNN, Delineate, FoW, FTW, or SEN2SR is available)
- `POST /detect` — sync (supports `source: "fow"` or `"ftw-infer"` without image)
- `POST /fow-aoi` — FoW clip `{ bbox, aoi?, min_area_m2? }`
- `POST /detect-job` + `GET /detect-job/{id}` — async with progress (prefer for `ftw-infer`; runs can take minutes)

Example FTW infer body:

```json
{
  "bbox": [west, south, east, north],
  "aoi": { "type": "Polygon", "coordinates": [...] },
  "source": "ftw-infer",
  "min_area_m2": 150
}
```

AOI span is capped (default ~1.0°); oversized requests return a clear `ValueError`.

## Env

### Shared / RGB engines

| Variable | Default | Meaning |
|----------|---------|---------|
| `FIELD_BOUNDARY_MODEL_PATH` | unset | Mask R-CNN `.pth` |
| `FIELD_BOUNDARY_MAX_EDGE` | 4096 | Max capture edge |
| `FIELD_BOUNDARY_MIN_CONF` | 0.35 | Min detection confidence |
| `FIELD_BOUNDARY_MIN_AREA_M2` | 150 | Min polygon area (m²) |
| `DELINEATE_ANYTHING_ENABLED` | 1 | Enable YOLO engine |
| `DELINEATE_ANYTHING_PATH` | `./weights/DelineateAnything-S.pt` | Local weights |
| `FOW_PARQUET_GLOB` | Source Coop predictions | FoW GeoParquet glob |
| `FOW_MAX_FEATURES` | 5000 | Cap polygons per AOI |
| `FIELD_BOUNDARY_SAM_URL` | `http://127.0.0.1:8090/segment` | SAM fallback |

### FTW inference (`source=ftw-infer`)

| Variable | Default | Role |
|----------|---------|------|
| `FTW_INFER_ENABLED` | `1` | Enable engine (`0` / `false` disables) |
| `FTW_INFER_MODEL` | `FTW_PRUE_EFNET_B5` | Published registry checkpoint id (`ftw model list`) |
| `FTW_INFER_YEAR` | previous calendar year | Scene calendar year for STAC select |
| `FTW_INFER_WORKDIR` | system temp | Scratch directory for downloads / outputs |
| `FTW_INFER_MAX_SPAN_DEG` | `1.0` | Max bbox width/height in degrees |
| `FTW_INFER_GPU` | `-1` | CUDA device index; `-1` = CPU |
| `FTW_INFER_TIMEOUT_S` | `2400` | Subprocess timeout (seconds) |
| `FTW_INFER_CLOUD_COVER_MAX` | `20` | Max cloud cover % for scene select |
| `FTW_INFER_STAC_HOST` | `mspc` | STAC host for imagery |

Install note: keep a dedicated venv; first run downloads model weights and S2 tiles. Do not feed arbitrary basemap RGB into the FTW 8-band dual-date stack — only the S2 FTW CLI pipeline is supported for `ftw-infer`.

## Hostinger VPS (production runtime)

GitHub Pages + Hostinger **shared Node** cannot bind Python ports. Run this service on a **VPS** and point the Node API at it:

```bash
# On the VPS (once)
git clone https://github.com/<org>/AgroCloud.git /opt/AgroCloud
cd /opt/AgroCloud/backend/services/agri-field-boundary
chmod +x start-vps.sh
sudo cp agri-field-boundary.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agri-field-boundary
```

On the Hostinger Node API host set:

```env
FIELD_BOUNDARY_URL=http://<VPS_IP>:8092/detect
```

`start-vps.sh` pulls latest code (when `AFB_GIT_PULL=1`), refreshes the venv, installs deps, restarts systemd, and waits for `/health/live` then `/health/ready`.

GitHub Actions (`.github/workflows/deploy-agri-field-boundary-vps.yml`) redeploys on push to `main` when these secrets are set:

| Secret | Meaning |
|--------|---------|
| `VPS_HOST` | VPS IP or hostname |
| `VPS_USER` | SSH user (e.g. `root`) |
| `VPS_SSH_KEY` | Private key for deploy |
| `VPS_DEPLOY_PATH` | Optional repo path (default `/opt/AgroCloud`) |

The React toolbox calls `/api/agri-field-boundary/*` on `api.eliteagrocloud.com`. When Python is still loading, the UI shows **Loading field model…** and map RGB detect keeps working via the Node builtin fallback.
