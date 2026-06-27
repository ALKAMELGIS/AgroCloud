# AI Tree Detection service

Turnkey tree-crown detection endpoint. The AgroCloud frontend tiles the AOI,
posts each RGB mosaic to the backend proxy (`/api/tree-detection/predict`),
which forwards it here; this service returns image-pixel boxes that the
frontend georeferences back to lng/lat.

Two interchangeable engines, auto-selected so it **just works**:

- **DeepForest** (default, zero-config) —
  [`weecology/DeepForest`](https://github.com/weecology/DeepForest).
  Pip-installable and **auto-downloads a pretrained tree-crown model** on first
  run. No manual weights file.
- **YOLO** (optional) — point `MODEL_PATH` at a YOLO weights file
  (e.g. `best.pt` from
  [`yolo-trees/ai-tree-detection`](https://anapgit.scanlab.gr/yolo-trees/ai-tree-detection))
  and install `ultralytics` to use it instead.

## Quickest start (Docker, one command)

```bash
cd backend/services/tree-detection
docker compose up --build
```

This serves `http://localhost:8080/predict` — which is the AgroCloud backend's
**default** `TREE_DETECTION_URL`. Once it's up, open **Tree Detections**, draw an
AOI, and **Run detection**. No `.env` change needed for local use.

## Run locally (pip)

```bash
cd backend/services/tree-detection
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8080
```

The first request (or first build) downloads the pretrained DeepForest model
(~tens of MB) and caches it.

## Use the optional YOLO engine

```bash
pip install -r requirements.txt ultralytics
# get best.pt from the model repo, then:
MODEL_PATH=/path/to/best.pt TREE_DETECTION_ENGINE=yolo \
  uvicorn app:app --host 0.0.0.0 --port 8080
```

## Deploy to Railway (hosted)

This folder ships a `railway.json` so Railway deploys it with zero extra config:

1. **Railway → New → Deploy from GitHub repo**, then in the service
   **Settings → Source**, set **Root Directory** to
   `backend/services/tree-detection`. Railway detects the `Dockerfile` and the
   bundled `railway.json` (Docker builder + `/health` healthcheck).
2. The container binds to Railway's injected `$PORT` automatically (the
   `Dockerfile` `CMD` falls back to `8080` locally). No port config needed.
3. **Memory:** DeepForest pulls in PyTorch (~1.5–2 GB RAM at inference). If you
   see OOM restarts on large AOIs, raise the service memory in
   **Settings → Resources**.
4. Grab the public domain Railway assigns (e.g.
   `https://tree-detection-production.up.railway.app`) and verify:

   ```bash
   curl https://<your-railway-domain>/health   # → {"status":"ok","engine":"deepforest"}
   ```
5. On the **AgroCloud backend** env, set (note the `/predict` suffix):

   ```ini
   TREE_DETECTION_URL=https://<your-railway-domain>/predict
   ```

## Point AgroCloud at it

The backend defaults to `http://127.0.0.1:8080/predict`. To use a remote/hosted
instance (e.g. in production), set on the AgroCloud **backend** (`.env`):

```ini
TREE_DETECTION_URL=https://your-host:8080/predict
# optional tuning:
# TREE_DETECTION_ENGINE=deepforest   # or yolo
# TREE_DETECTION_CONF=0.25
# TREE_DETECTION_IOU=0.45
# TREE_DETECTION_IMG_SIZE=640
```

> **Deployed / production note:** this service runs PyTorch and needs a real
> Python host (VM, container host, or GPU box) — it cannot run on static/shared
> hosting. Deploy this container next to (or reachable from) your backend and
> set `TREE_DETECTION_URL` to its public `/predict` URL.

## Endpoint contract

`POST /predict` (`multipart/form-data`)

| field | type | default | notes |
|-------|------|---------|-------|
| `file` | image | — | AOI mosaic (PNG/JPEG) |
| `imgsz` | int | 640 | inference / tile size |
| `conf` | float | 0.25 | confidence threshold |
| `iou` | float | 0.45 | NMS IoU threshold |

Response `200`:

```json
{ "boxes": [ { "x1": 12.0, "y1": 34.0, "x2": 56.0, "y2": 78.0, "confidence": 0.91, "name": "Tree" } ] }
```

Coordinates are in the original posted-image pixel space (top-left origin).
`GET /health` returns `{ "status": "ok", "engine": "deepforest" }`.
