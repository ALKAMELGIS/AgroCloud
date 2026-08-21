# Agri Field Boundary Detection

OpenGeoAI-grade agricultural field boundary delineation (Mask R-CNN, Delineate-Anything, Agricultural Field Delineation).

## Run locally

Use a **dedicated virtualenv** (recommended).

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

### Docker

```bash
docker build -t agri-field-boundary .
docker run --rm -p 8092:8092 agri-field-boundary
```

## Engines

| `source` | Engine | Image required? | Notes |
|----------|--------|-----------------|-------|
| `agricultural-field-delineation` / `afd` | Bundled Esri Mask R-CNN (12-band) | No | Sentinel-2 L2A via Planetary Computer STAC; weights under `models/AgriculturalFieldDelineation/` |
| *(default / RGB)* | Mask R-CNN | Yes | Set `FIELD_BOUNDARY_MODEL_PATH` to a geoai / OpenGeoAI `best_model.pth` |
| *(default / RGB)* | Delineate-Anything | Yes | YOLOv11 instance seg (default ML for basemap / drone / PNG / JPEG) |
| *(fallback)* | SAM AMG | Yes | If SAM is running on `:8090` |

Priority for RGB requests: Mask R-CNN (if configured) → Delineate-Anything → SAM.

Watershed classical CV is **not** used in this tool.

### Agricultural Field Delineation (bundled)

Model assets are tracked with **Git LFS** under:

```text
models/AgriculturalFieldDelineation/
  AgriculturalFieldDelineation.dlpk
  AgricultureFieldDelination.emd
  AgricultureFieldDelination.pth
```

After clone / deploy:

```bash
git lfs install
git lfs pull
```

Example detect body (no client image):

```json
{
  "bbox": [west, south, east, north],
  "aoi": { "type": "Polygon", "coordinates": [...] },
  "source": "agricultural-field-delineation",
  "scene_date": "2024-06-15",
  "min_confidence": 0.35,
  "min_area_m2": 200
}
```

| Variable | Default | Meaning |
|----------|---------|---------|
| `AGRICULTURAL_FIELD_DELINEATION_MODEL_DIR` | `./models/AgriculturalFieldDelineation` | Model folder |
| `AGRICULTURAL_FIELD_DELINEATION_MODEL_PATH` | `…/AgricultureFieldDelination.pth` | Weights |
| `AGRICULTURAL_FIELD_DELINEATION_EMD_PATH` | `…/AgricultureFieldDelination.emd` | EMD metadata |
| `AFD_STAC_URL` | Planetary Computer STAC | Override STAC catalog |

## API

- `GET /health`
- `GET /health/live` — process up (systemd / deploy scripts)
- `GET /health/ready` — engines loaded (`ready: true` when Mask R-CNN, Delineate, AFD, or SEN2SR is available)
- `POST /detect` — sync (AFD needs no image; RGB sources require `image`)
- `POST /detect-job` + `GET /detect-job/{id}` — async with progress

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
| `FIELD_BOUNDARY_SAM_URL` | `http://127.0.0.1:8090/segment` | SAM fallback |

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
