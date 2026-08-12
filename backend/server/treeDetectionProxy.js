/**
 * Tree Detection — tree-crown inference proxy.
 *
 * Forwards AOI imagery to backend/services/tree-detection and returns boxes +
 * optional instance polygons (image-pixel space) for GIS georeferencing.
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

function collectRawDetections(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.boxes)) return json.boxes
  if (Array.isArray(json?.predictions)) return json.predictions
  if (Array.isArray(json?.detections)) return json.detections
  if (Array.isArray(json?.results)) return json.results
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

/** Normalise instance polygons from the service (pixel rings). */
function normalizeInstances(json) {
  const raw = Array.isArray(json?.instances) ? json.instances : []
  const out = []
  for (const inst of raw) {
    if (!inst || typeof inst !== 'object') continue
    const poly = Array.isArray(inst.polygon)
      ? inst.polygon
      : Array.isArray(inst.ring)
        ? inst.ring
        : Array.isArray(inst.coordinates)
          ? inst.coordinates
          : null
    if (!poly || poly.length < 3) continue
    const ring = []
    for (const pt of poly) {
      if (!Array.isArray(pt) || pt.length < 2) continue
      const x = Number(pt[0])
      const y = Number(pt[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue
      ring.push([x, y])
    }
    if (ring.length < 3) continue
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push([ring[0][0], ring[0][1]])
    }
    out.push({
      polygon: ring,
      score: toNum(inst.score ?? inst.confidence ?? inst.conf, 0.5),
      label: typeof inst.label === 'string' ? inst.label : typeof inst.name === 'string' ? inst.name : 'Tree',
      area_px: toNum(inst.area_px ?? inst.areaPx, 0),
    })
  }
  return out
}

/**
 * Register the YOLO tree-detection proxy routes.
 * @param {import('express').Express} app
 */
export function registerTreeDetectionRoutes(app, { rawBodyLimit = '40mb' } = {}) {
  const ENDPOINT = String(process.env.TREE_DETECTION_URL || 'http://127.0.0.1:8080/predict').trim()
  const TOKEN = String(process.env.TREE_DETECTION_TOKEN || '').trim()
  const FILE_FIELD = String(process.env.TREE_DETECTION_FILE_FIELD || 'file').trim() || 'file'
  const MODEL = String(process.env.TREE_DETECTION_MODEL || '').trim()
  const IMG_SIZE = toNum(process.env.TREE_DETECTION_IMG_SIZE, 800)
  const IOU = toNum(process.env.TREE_DETECTION_IOU, 0.45)
  const DEFAULT_CONF = toNum(process.env.TREE_DETECTION_CONF, 0.25)

  app.get('/api/tree-detection/config', async (_req, res) => {
    let online = false
    let engine = null
    let enginesAvailable = ['deepforest', 'yolo_seg', 'onnx_seg']
    let modelPathConfigured = false
    try {
      const healthUrl = ENDPOINT.replace(/\/predict\/?$/i, '/health')
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 2500)
      const r = await fetch(healthUrl, { signal: ctrl.signal })
      clearTimeout(t)
      if (r.ok) {
        online = true
        const body = await r.json().catch(() => ({}))
        if (body?.engine) engine = String(body.engine)
        if (Array.isArray(body?.engines_available)) enginesAvailable = body.engines_available.map(String)
        modelPathConfigured = Boolean(body?.model_path)
      }
    } catch {
      online = false
    }
    res.json({
      configured: Boolean(ENDPOINT) && online,
      online,
      model: MODEL || engine || 'deepforest',
      engine: engine || null,
      enginesAvailable,
      modelPathConfigured,
      supportsInstances: true,
      imgSize: IMG_SIZE,
      iou: IOU,
      endpoint: ENDPOINT.replace(/\/predict\/?$/i, ''),
    })
  })

  app.post(
    '/api/tree-detection/predict',
    express.raw({ type: () => true, limit: rawBodyLimit }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({
          error:
            'Tree-detection model service is not configured. Start backend/services/tree-detection (see start-local.ps1 or docker compose up).',
        })
      }
      const buf = req.body
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'Empty image body — expected raw PNG bytes.' })
      }

      try {
        const conf = toNum(req.query.score, DEFAULT_CONF)
        const imgsz = toNum(req.query.imgsz, IMG_SIZE)
        const checkpointId = String(req.query.checkpoint_id || '').trim()
        const engine = String(req.query.engine || '').trim()

        const form = new FormData()
        form.append(FILE_FIELD, new Blob([buf], { type: 'image/png' }), 'aoi.png')
        form.append('imgsz', String(imgsz))
        form.append('conf', String(conf))
        form.append('iou', String(IOU))
        if (MODEL) form.append('model', MODEL)
        if (checkpointId) form.append('checkpoint_id', checkpointId)
        if (engine && engine !== 'auto') form.append('engine', engine)

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
        const boxes = normalizeBoxes(json)
        let instances = normalizeInstances(json)
        // Synthesize rectangle rings when the service only returned boxes.
        if (!instances.length && boxes.length) {
          instances = boxes.map(b => ({
            polygon: [
              [b.xmin, b.ymin],
              [b.xmax, b.ymin],
              [b.xmax, b.ymax],
              [b.xmin, b.ymax],
              [b.xmin, b.ymin],
            ],
            score: b.score,
            label: b.label,
            area_px: Math.max(0, (b.xmax - b.xmin) * (b.ymax - b.ymin)),
          }))
        }
        return res.json({
          boxes,
          instances,
          engine: typeof json?.engine === 'string' ? json.engine : null,
          inference_ms: toNum(json?.inference_ms, 0),
        })
      } catch (error) {
        return res.status(502).json({
          error:
            'Could not reach the tree-detection model service. Start it with: cd backend/services/tree-detection; .\\start-local.ps1  (or docker compose up if Docker is installed).',
          detail: String(error?.message || error),
        })
      }
    },
  )

  app.post('/api/tree-detection/finetune', express.json({ limit: rawBodyLimit }), async (req, res) => {
    const base = ENDPOINT.replace(/\/predict\/?$/i, '')
    const url = `${base}/finetune`
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
      const upstream = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body || {}),
      })
      const text = await upstream.text()
      let json
      try {
        json = JSON.parse(text)
      } catch {
        return res.status(502).json({ error: 'Fine-tune service returned non-JSON.', detail: text.slice(0, 400) })
      }
      return res.status(upstream.status).json(json)
    } catch (error) {
      return res.status(502).json({
        error: 'Could not reach tree-detection /finetune.',
        detail: String(error?.message || error),
      })
    }
  })
}
