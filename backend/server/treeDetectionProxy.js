/**
 * Tree Detection — tree-crown inference proxy.
 *
 * Forwards AOI imagery to backend/services/tree-detection (Ultralytics YOLO).
 * When Python :8080 is down, in-process spectral-builtin still returns boxes.
 */

import express from 'express'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { ensureLocalAiService } from './localAiServiceSupervisor.js'

const BUILTIN_MAX_EDGE = 1280
const BUILTIN_MAX_BOXES = 2500
const YOLO_PREDICT_TIMEOUT_MS = 20_000

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function decodeTreeImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    throw new Error('Empty image body — expected PNG or JPEG bytes.')
  }
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    const png = PNG.sync.read(buf)
    return { width: png.width, height: png.height, data: png.data }
  }
  const jpg = jpeg.decode(buf, { maxMemoryUsageInMB: 256, useTArray: true })
  return { width: jpg.width, height: jpg.height, data: Buffer.from(jpg.data) }
}

function downsampleRgba(data, width, height, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  if (scale >= 0.999) return { data, width, height, scale: 1 }
  const nw = Math.max(1, Math.round(width * scale))
  const nh = Math.max(1, Math.round(height * scale))
  const out = Buffer.alloc(nw * nh * 4)
  for (let y = 0; y < nh; y++) {
    const sy = Math.min(height - 1, Math.floor(y / scale))
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(width - 1, Math.floor(x / scale))
      const si = (sy * width + sx) * 4
      const di = (y * nw + x) * 4
      out[di] = data[si]
      out[di + 1] = data[si + 1]
      out[di + 2] = data[si + 2]
      out[di + 3] = data[si + 3]
    }
  }
  return { data: out, width: nw, height: nh, scale }
}

function treenessAt(r, g, b) {
  const sum = r + g + b + 1e-6
  const green = Math.max(0, g / sum - Math.max(r, b) / sum) * 4
  const lum = (r + g + b) / 765
  const dark = lum < 0.38 && r + g + b > 40 ? (0.38 - lum) * 2.4 : 0
  return Math.min(1, green > dark ? green : dark)
}

/** Peak finder over canopy treeness — YOLO-shaped boxes in pixel space. */
function detectTreesFromRgba(data, width, height, opts = {}) {
  const n = width * height
  if (n === 0) return []
  const mpp = opts.metersPerPixel > 0 ? opts.metersPerPixel : 0.3
  const score = clamp(opts.score ?? 0.25, 0.02, 0.9)
  const t = new Float32Array(n)
  for (let i = 0, p = 0; p < n; i += 4, p += 1) {
    if (data[i + 3] === 0) {
      t[p] = 0
      continue
    }
    t[p] = treenessAt(data[i], data[i + 1], data[i + 2])
  }
  let mean = 0
  for (let p = 0; p < n; p += 1) mean += t[p]
  mean /= n
  const thr = Math.max(0.08, mean + 0.12 + score * 0.22)
  const minSep = Math.max(3, Math.round(3.2 / mpp))
  const minR = Math.max(2, Math.round(0.6 / mpp))
  const maxR = Math.max(minR + 1, Math.round(18 / mpp))
  const taken = new Uint8Array(n)
  const boxes = []
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x
      const v = t[i]
      if (v < thr || taken[i]) continue
      let peak = true
      for (let dy = -1; dy <= 1 && peak; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (t[(y + dy) * width + (x + dx)] > v + 1e-6) {
            peak = false
            break
          }
        }
      }
      if (!peak) continue
      let rPx = minR
      for (let r = minR; r <= maxR; r += 1) {
        const sx = Math.min(width - 1, x + r)
        if (t[y * width + sx] < v * 0.45) {
          rPx = r
          break
        }
        rPx = r
      }
      boxes.push({
        xmin: x - rPx,
        ymin: y - rPx,
        xmax: x + rPx,
        ymax: y + rPx,
        score: Number(clamp(0.4 + (v - thr) * 1.6, 0.3, 0.98).toFixed(3)),
        label: 'tree',
      })
      for (let dy = -minSep; dy <= minSep; dy += 1) {
        for (let dx = -minSep; dx <= minSep; dx += 1) {
          const xx = x + dx
          const yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < width && yy < height) taken[yy * width + xx] = 1
        }
      }
      if (boxes.length >= BUILTIN_MAX_BOXES) return boxes
    }
  }
  return boxes
}

/** In-process canopy detect when Ultralytics YOLO is unreachable. */
export function detectTreesBuiltin({ buffer, score, metersPerPixel }) {
  const started = Date.now()
  const decoded = decodeTreeImage(buffer)
  const small = downsampleRgba(decoded.data, decoded.width, decoded.height, BUILTIN_MAX_EDGE)
  const mppWork = (metersPerPixel > 0 ? metersPerPixel : 0.3) / (small.scale > 0 ? small.scale : 1)
  const raw = detectTreesFromRgba(small.data, small.width, small.height, { score, metersPerPixel: mppWork })
  const inv = small.scale > 0 ? 1 / small.scale : 1
  return {
    boxes: raw.map(b => ({
      xmin: b.xmin * inv,
      ymin: b.ymin * inv,
      xmax: b.xmax * inv,
      ymax: b.ymax * inv,
      score: b.score,
      label: b.label,
    })),
    instances: [],
    engine: 'spectral-builtin',
    builtin_fallback: true,
    inference_ms: Date.now() - started,
  }
}

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
    let pythonOnline = false
    let engine = 'spectral-builtin'
    let enginesAvailable = ['spectral-builtin']
    let modelPathConfigured = false
    if (ENDPOINT) {
      try {
        const healthUrl = ENDPOINT.replace(/\/predict\/?$/i, '/health')
        const r = await fetch(healthUrl, { signal: AbortSignal.timeout(2500) })
        if (r.ok) {
          pythonOnline = true
          const body = await r.json().catch(() => ({}))
          if (body?.engine) engine = String(body.engine)
          else engine = 'yolo'
          enginesAvailable = Array.isArray(body?.engines_available)
            ? body.engines_available.map(String)
            : ['yolo', 'spectral-builtin']
          if (!enginesAvailable.includes('spectral-builtin')) enginesAvailable.push('spectral-builtin')
          modelPathConfigured = Boolean(body?.model_path)
        }
      } catch {
        pythonOnline = false
      }
    }
    if (!pythonOnline) ensureLocalAiService('tree-detection')
    res.json({
      configured: true,
      online: true,
      python: pythonOnline,
      builtin_fallback: true,
      model: MODEL || engine || 'yolo',
      engine,
      enginesAvailable,
      modelPathConfigured,
      supportsInstances: pythonOnline,
      imgSize: IMG_SIZE,
      iou: IOU,
      endpoint: ENDPOINT ? ENDPOINT.replace(/\/predict\/?$/i, '') : null,
    })
  })

  app.post(
    '/api/tree-detection/predict',
    express.raw({ type: () => true, limit: rawBodyLimit }),
    async (req, res) => {
      const buf = req.body
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        return res.status(400).json({ error: 'Empty image body — expected raw PNG bytes.' })
      }

      const conf = toNum(req.query.score, DEFAULT_CONF)
      const mpp = toNum(req.query.mpp, 0.3)
      const tryBuiltin = () => {
        try {
          return res.status(200).json(detectTreesBuiltin({ buffer: buf, score: conf, metersPerPixel: mpp }))
        } catch (builtinErr) {
          return res.status(502).json({
            error: 'Could not detect trees from the AOI imagery.',
            detail: String(builtinErr?.message || builtinErr),
          })
        }
      }

      if (!ENDPOINT) return tryBuiltin()

      try {
        const healthUrl = ENDPOINT.replace(/\/predict\/?$/i, '/health')
        let pythonUp = false
        try {
          const health = await fetch(healthUrl, { signal: AbortSignal.timeout(2500) })
          pythonUp = health.ok
        } catch {
          pythonUp = false
        }
        if (!pythonUp) {
          ensureLocalAiService('tree-detection')
          return tryBuiltin()
        }

        const imgsz = toNum(req.query.imgsz, IMG_SIZE)
        const checkpointId = String(req.query.checkpoint_id || '').trim()
        const engine = String(req.query.engine || 'yolo').trim()

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

        const upstream = await fetch(ENDPOINT, {
          method: 'POST',
          body: form,
          headers,
          signal: AbortSignal.timeout(YOLO_PREDICT_TIMEOUT_MS),
        })
        const text = await upstream.text()
        if (!upstream.ok) {
          ensureLocalAiService('tree-detection')
          return tryBuiltin()
        }
        let json
        try {
          json = JSON.parse(text)
        } catch {
          ensureLocalAiService('tree-detection')
          return tryBuiltin()
        }
        const boxes = normalizeBoxes(json)
        return res.json({
          boxes,
          instances: [],
          engine: typeof json?.engine === 'string' ? json.engine : 'yolo',
          inference_ms: toNum(json?.inference_ms, 0),
        })
      } catch (error) {
        ensureLocalAiService('tree-detection')
        return tryBuiltin()
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
