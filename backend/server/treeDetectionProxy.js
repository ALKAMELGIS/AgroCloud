/**
 * Tree Detection — tree-crown inference proxy.
 *
 * The Tree Detections tool relies on a Python tree-crown detector served from
 * an HTTP endpoint. A ready-to-run, zero-config FastAPI service ships in
 * `backend/services/tree-detection/` (DeepForest by default — it auto-downloads
 * a pretrained model — with optional YOLO). Just run it (`docker compose up`);
 * this proxy defaults to its local URL. These models are PyTorch and cannot run
 * in the browser, so the frontend posts an RGB AOI mosaic (PNG bytes) to this
 * proxy, which forwards it to the model service and returns the predicted
 * bounding boxes in image-pixel coordinates. The frontend georeferences the
 * boxes to lng/lat.
 *
 * Configure with env vars:
 *   TREE_DETECTION_URL          (optional) model predict endpoint
 *                               (default http://127.0.0.1:8080/predict)
 *   TREE_DETECTION_TOKEN        (optional) sent as `Authorization: Bearer <token>`
 *   TREE_DETECTION_FILE_FIELD   (optional) multipart file field name (default "file")
 *   TREE_DETECTION_MODEL        (optional) model name forwarded as the `model` field
 *   TREE_DETECTION_IMG_SIZE     (optional) inference image size px (default 640)
 *   TREE_DETECTION_IOU          (optional) NMS IoU threshold (default 0.45)
 *   TREE_DETECTION_CONF         (optional) default confidence threshold (default 0.25)
 *
 * Expected YOLO / Ultralytics response (tolerant — any of these shapes works):
 *   { "boxes": [ { "x1":.., "y1":.., "x2":.., "y2":.., "confidence":.., "name":"tree" }, ... ] }
 *   { "predictions": [ ... ] }   |   { "detections": [ ... ] }   |   [ { ... }, ... ]
 *   Ultralytics HUB: { "images": [ { "results": [ { "box": { "x1":.., "y1":.., "x2":.., "y2":.. }, "confidence":.., "name":".." } ] } ] }
 * Box coordinates may be x1/y1/x2/y2, xmin/ymin/xmax/ymax, left/top/right/bottom,
 * a `box`/`bbox` object with those keys, or a `box`/`bbox` array [x1,y1,x2,y2].
 */

import express from 'express'

function toNum(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Pull [x1,y1,x2,y2] out of the many ways a detector can express a box. */
function readBoxCoords(b) {
  const src =
    b && typeof b.box === 'object' && b.box
      ? b.box
      : b && typeof b.bbox === 'object' && b.bbox
        ? b.bbox
        : b
  // Array form: box: [x1, y1, x2, y2]
  if (Array.isArray(src) && src.length >= 4) {
    return { xmin: toNum(src[0], NaN), ymin: toNum(src[1], NaN), xmax: toNum(src[2], NaN), ymax: toNum(src[3], NaN) }
  }
  if (!src || typeof src !== 'object') return null
  return {
    xmin: toNum(src.xmin ?? src.x1 ?? src.left, NaN),
    ymin: toNum(src.ymin ?? src.y1 ?? src.top, NaN),
    xmax: toNum(src.xmax ?? src.x2 ?? src.right, NaN),
    ymax: toNum(src.ymax ?? src.y2 ?? src.bottom, NaN),
  }
}

/** Flatten a (varied) YOLO / Ultralytics JSON response into a raw detection array. */
function collectRawDetections(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.boxes)) return json.boxes
  if (Array.isArray(json?.predictions)) return json.predictions
  if (Array.isArray(json?.detections)) return json.detections
  if (Array.isArray(json?.results)) return json.results
  // Ultralytics HUB: { images: [ { results: [ ... ] }, ... ] }
  if (Array.isArray(json?.images)) {
    const out = []
    for (const img of json.images) {
      if (Array.isArray(img?.results)) out.push(...img.results)
      else if (Array.isArray(img?.boxes)) out.push(...img.boxes)
    }
    return out
  }
  return []
}

/** Normalise the (varied) YOLO JSON response into a flat box array. */
function normalizeBoxes(json) {
  const raw = collectRawDetections(json)
  const out = []
  for (const b of raw) {
    if (!b || typeof b !== 'object') continue
    const coords = readBoxCoords(b)
    if (!coords) continue
    const { xmin, ymin, xmax, ymax } = coords
    if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) continue
    if (xmax <= xmin || ymax <= ymin) continue
    const label =
      typeof b.name === 'string'
        ? b.name
        : typeof b.label === 'string'
          ? b.label
          : typeof b.class === 'string'
            ? b.class
            : 'Tree'
    out.push({
      xmin,
      ymin,
      xmax,
      ymax,
      score: toNum(b.confidence ?? b.score ?? b.conf, 0.5),
      label,
    })
  }
  return out
}

/**
 * Register the YOLO tree-detection proxy routes.
 * @param {import('express').Express} app
 */
export function registerTreeDetectionRoutes(app, { rawBodyLimit = '40mb' } = {}) {
  // Defaults to the bundled local service (backend/services/tree-detection),
  // so `docker compose up` there is enough — no env config required for local.
  const ENDPOINT =
    String(process.env.TREE_DETECTION_URL || 'http://127.0.0.1:8080/predict').trim()
  const TOKEN = String(process.env.TREE_DETECTION_TOKEN || '').trim()
  const FILE_FIELD = String(process.env.TREE_DETECTION_FILE_FIELD || 'file').trim() || 'file'
  const MODEL = String(process.env.TREE_DETECTION_MODEL || '').trim()
  const IMG_SIZE = toNum(process.env.TREE_DETECTION_IMG_SIZE, 640)
  const IOU = toNum(process.env.TREE_DETECTION_IOU, 0.45)
  const DEFAULT_CONF = toNum(process.env.TREE_DETECTION_CONF, 0.25)

  app.get('/api/tree-detection/config', (_req, res) => {
    res.json({
      configured: Boolean(ENDPOINT),
      model: MODEL || 'tree-crown',
      imgSize: IMG_SIZE,
      iou: IOU,
    })
  })

  // Buffer the raw PNG body for this route only (global express.json ignores
  // non-JSON content types, so the stream is still available here).
  app.post(
    '/api/tree-detection/predict',
    express.raw({ type: () => true, limit: rawBodyLimit }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({
          error:
            'Tree-detection model service is not configured. Run backend/services/tree-detection (docker compose up) — the backend defaults to its local /predict endpoint.',
        })
      }
      const buf = req.body
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'Empty image body — expected raw PNG bytes.' })
      }

      try {
        const conf = toNum(req.query.score, DEFAULT_CONF)
        const imgsz = toNum(req.query.imgsz, IMG_SIZE)

        const form = new FormData()
        form.append(FILE_FIELD, new Blob([buf], { type: 'image/png' }), 'aoi.png')
        // Common Ultralytics inference parameters (a tolerant server ignores extras).
        form.append('imgsz', String(imgsz))
        form.append('conf', String(conf))
        form.append('iou', String(IOU))
        if (MODEL) form.append('model', MODEL)

        const headers = {}
        if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`

        const upstream = await fetch(ENDPOINT, { method: 'POST', body: form, headers })
        const text = await upstream.text()
        if (!upstream.ok) {
          return res.status(502).json({
            error: `Tree-detection service error (HTTP ${upstream.status}).`,
            detail: text.slice(0, 600),
          })
        }
        let json
        try {
          json = JSON.parse(text)
        } catch {
          return res.status(502).json({ error: 'Tree-detection service returned a non-JSON response.' })
        }
        return res.json({ boxes: normalizeBoxes(json) })
      } catch (error) {
        return res.status(502).json({
          error:
            'Could not reach the tree-detection model service. Start it with: cd backend/services/tree-detection && docker compose up',
          detail: String(error?.message || error),
        })
      }
    },
  )
}
