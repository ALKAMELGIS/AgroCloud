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
| `FTW_INFER_NUM_WORKERS` | `1` on CPU, `4` on GPU | DataLoader worker processes |
| `FTW_INFER_BATCH_SIZE` | `1` on CPU, `2` on GPU | Patches per forward pass |
| `FTW_INFER_BLAS_THREADS` | `1` | Threads each worker's BLAS backend may reserve |

The CLI's own defaults (4 workers / batch 2, one OpenBLAS arena per core in every
worker) exhaust RAM on a CPU-only host and the run dies with `OpenBLAS error:
Memory allocation still failed` followed by `DataLoader worker … exited
unexpectedly`. The worker/batch/thread caps above prevent that, and a run that
still hits the signature is retried once at 1 worker / batch 1 / 1 thread.

### Choosing the imagery date

`/detect` accepts `start_date` / `end_date` (or a single `scene_date`), all
`YYYY-MM-DD`, for both `ftw-infer` and `ftw-live`. The panel's Image date picker
sends them.

A pinned window is resolved against the Planetary Computer STAC: the window is
split in half and the least cloudy Sentinel-2 scene from each side becomes the
early/late pair FTW needs. Too narrow a window (a single day, or a cloudy week)
is widened by `FTW_INFER_BUFFER_DAYS` up to three times before the request fails
with a "no cloud-free pair" message. Because `ftw inference all` only takes a
year, a pinned window for `ftw-infer` drives the download → run → polygonize
steps with those explicit scene ids instead.

A window covering a whole calendar year is treated as "no preference" and hands
scene choice back to the FTW crop calendar, which is the default behaviour.

Install note: keep a dedicated venv; first run downloads model weights and S2 tiles. Do not feed arbitrary basemap RGB into the FTW 8-band dual-date stack — only the S2 FTW CLI pipeline is supported for `ftw-infer`.

### FTW live speed

Three levers keep a live detection short:

- **Disk cache** (`cache/ftw_live/`). Scene selection, the 8-band Sentinel-2 stack
  and the model raster are each keyed by their inputs, so re-running the same AOI
  skips straight to polygonize — measured 44.6 s → 1.1 s on a 0.06° AOI.
- **Pixel budget.** An AOI whose 10 m grid exceeds the budget is requested from
  STAC at a coarser resolution instead of downloading pixels that would only be
  averaged away, with an in-place downsample as the safety net.
- **Checkpoint prefetch.** The FTW weights download in a background thread at
  startup rather than inside the first user's request.

| Variable | Default | Role |
|----------|---------|------|
| `FTW_CACHE_ENABLED` | `1` | Disk cache for scenes / stack / prediction |
| `FTW_CACHE_DIR` | `cache/ftw_live` | Cache root |
| `FTW_CACHE_TTL_H` | `168` | Entry lifetime (hours) |
| `FTW_CACHE_MAX_MB` | `6144` | Cache budget; oldest entries pruned first |
| `FTW_LIVE_PIXEL_BUDGET_MPX` | `6` | Megapixels per model pass (×4 on GPU) |
| `FTW_LIVE_RESIZE_FACTOR` | `1` | Patch upsample before the model — costs f² |
| `FTW_LIVE_GPU` | auto | CUDA index; unset picks GPU when available, else CPU |
| `FTW_LIVE_THREADS` | auto | Torch CPU threads; auto leaves one core for the API |
| `FTW_PREFETCH_MODEL` | `1` | Warm the checkpoint at startup |

### Geometry postprocess (FTW live + FTW infer)

After polygonize, both FTW engines run `field_geom_postprocess.improve_field_geometries`:
morphological open → meter-aware simplify → neighbour separation → sliver filter →
oriented-rectangle snap only when fill ratio is high (farm-like parcels).

Centre-pivot circles are excluded from the rectangle snap: a rectangle can never
exceed Polsby–Popper `π/4 ≈ 0.785`, and pivots also overlap their fitted equal-area
circle far more than a square does (≈0.94 vs ≈0.83), so round parcels stay round.

| Variable | Default | Role |
|----------|---------|------|
| `FTW_GEOM_SIMPLIFY_M` | `2.2` | Edge simplify tolerance (metres) |
| `FTW_GEOM_OPEN_M` | `1.25` | Morphological opening radius (m) |
| `FTW_GEOM_SEP_M` | `1.5` | Neighbour separation gap (m) |
| `FTW_GEOM_RECT_FILL_MIN` | `0.72` | Min fill vs OBB before rect snap |
| `FTW_GEOM_ROUND_GUARD` | `0.82` | Compactness above which a parcel is never squared |
| `FTW_GEOM_CIRCLE_IOU_MIN` | `0.9` | Overlap with fitted circle that marks a pivot |
| `FTW_LIVE_SIMPLIFY` | `4` | Upstream `ftw_tools` polygonize simplify |

### BASELINE vs IMPROVED metrics

Export predicted polygons GeoJSON, then:

```bash
# Baseline run (save metrics)
python scripts/eval_ftw_baseline.py --pred baseline.geojson --gt gt.geojson \
  --label baseline --out-dir cache/ftw_eval/baseline

# Improved run (compare)
python scripts/eval_ftw_baseline.py --pred improved.geojson --gt gt.geojson \
  --label improved --baseline-metrics cache/ftw_eval/baseline/metrics.json \
  --out-dir cache/ftw_eval/improved
```

Reports IoU, Precision/Recall/F1, Boundary F1, Instance F1, and field area error %.
