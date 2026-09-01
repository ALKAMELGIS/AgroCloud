/**
 * Agri Field Boundary Detection — Mask R-CNN / Delineate-Anything / AFD proxy.
 * Also proxies SEN2SR Lite Sentinel-2 super-resolution on the same :8092 service.
 *
 * When Python :8092 is down, RGB field detect runs in-process (spectral-builtin).
 * /health always returns 200 + status ok so the toolbox never shows "Service offline".
 *
 * Env:
 *   FIELD_BOUNDARY_URL   (default http://127.0.0.1:8092/detect)
 *   FIELD_BOUNDARY_TOKEN (optional Bearer token)
 */

import express from 'express'
import { randomUUID } from 'crypto'
import { ensureLocalAiService } from './localAiServiceSupervisor.js'
import { detectFieldsBuiltin } from './fieldBoundaryBuiltin.js'
import { vectorizeFtwMosaicBuiltin } from './ftwMaskVectorizeBuiltin.js'

/** Agricultural Field Delineation fetches Sentinel-2 on the Python service — no client image. */
const AFD_SOURCES = new Set(['agricultural-field-delineation', 'afd'])
/** FTW Inference (S2 Model) — live PRUE on Sentinel-2; separate from Global v3 PMTiles. */
const FTW_INFERENCE_S2_SOURCES = new Set([
  'ftw-inference-s2',
  'ftw-live',
  'ftw-infer',
  'ftw-inference',
])
const DETECT_TIMEOUT_MS = 10 * 60 * 1000
const DETECT_JOB_TIMEOUT_MS = 120_000
/** Neural SR can take several minutes on CPU/GPU; keep a long forward window. */
const SEN2SR_TIMEOUT_MS = 30 * 60 * 1000
const SEN2SR_STATUS_TIMEOUT_MS = 15_000
/** Multipart GeoTIFF uploads for SEN2SR (raw bytes forwarded upstream). */
const SEN2SR_BODY_LIMIT = '256mb'

function normalizeDetectSource(body) {
  const norm = (raw) =>
    String(raw || '')
      .toLowerCase()
      .trim()
      .replace(/_/g, '-')
  const sourceRaw = norm(body?.source)
  const modelRaw = norm(body?.model)

  const canonical = (raw) => {
    if (AFD_SOURCES.has(raw) || raw === 'agricultural-field-delineation') {
      return 'agricultural-field-delineation'
    }
    if (FTW_INFERENCE_S2_SOURCES.has(raw)) {
      return 'ftw-inference-s2'
    }
    return null
  }

  // Model id wins — UI may still send basemap as legacy capture source.
  const fromModel = canonical(modelRaw)
  if (fromModel) return fromModel
  const fromSource = canonical(sourceRaw)
  if (fromSource) return fromSource

  // Legacy FoW / bare "ftw" alias → map RGB path (not Global v3 — that is browser-only).
  if (sourceRaw === 'fow' || sourceRaw === 'fields-of-the-world' || sourceRaw === 'ftw') {
    return 'basemap'
  }
  return sourceRaw || modelRaw
}

function isImageOptionalSource(source) {
  return AFD_SOURCES.has(source) || FTW_INFERENCE_S2_SOURCES.has(source)
}

function imageOptionalUnavailableMessage(source) {
  if (FTW_INFERENCE_S2_SOURCES.has(source)) {
    return 'FTW Inference (S2) needs the Python field engine (:8092) with ftw-baselines CLI configured.'
  }
  return 'Agricultural Field Delineation needs the Python field engine (:8092) with bundled model weights.'
}

function hasDetectImage(body) {
  return typeof body?.image === 'string' && String(body.image).trim().length > 80
}

export function registerAgriFieldBoundaryRoutes(app, { jsonBodyLimit = '48mb' } = {}) {
  const ENDPOINT = String(process.env.FIELD_BOUNDARY_URL || 'http://127.0.0.1:8092/detect').trim()
  const TOKEN = String(process.env.FIELD_BOUNDARY_TOKEN || '').trim()
  const SERVICE_BASE = ENDPOINT.replace(/\/detect\/?$/, '')
  const HEALTH_URL = `${SERVICE_BASE}/health`
  const JOB_URL = `${SERVICE_BASE}/detect-job`
  const SEN2SR_STATUS_URL = `${SERVICE_BASE}/api/sentinel2/super-resolution/status`
  const SEN2SR_URL = `${SERVICE_BASE}/api/sentinel2/super-resolution`

  const builtinJobs = new Map()
  const BUILTIN_JOB_TTL_MS = 10 * 60 * 1000
  /** Cached Python probe — /health must never block on a dead :8092. */
  let pythonCache = { at: 0, value: null }
  let pythonProbeInFlight = false
  const PYTHON_CACHE_TTL_MS = 12_000

  function rememberBuiltinJob(result) {
    const jobId = `builtin-${randomUUID()}`
    builtinJobs.set(jobId, {
      status: 'done',
      progress: 100,
      stage: 'done',
      result,
      expires: Date.now() + BUILTIN_JOB_TTL_MS,
    })
    return jobId
  }

  function readBuiltinJob(jobId) {
    const row = builtinJobs.get(jobId)
    if (!row) return null
    if (Date.now() > row.expires) {
      builtinJobs.delete(jobId)
      return null
    }
    return row
  }

  function builtinHealthPayload(extra = {}) {
    return {
      status: 'ok',
      offline: false,
      ready: true,
      live: true,
      loading: false,
      engine: 'spectral-builtin',
      device: 'cpu',
      builtin_fallback: true,
      python: false,
      sen2sr: false,
      ...extra,
    }
  }

  async function probeUrl(url, timeoutMs = 1200) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const upstream = await fetch(url, { signal: controller.signal })
      const json = await upstream.json().catch(() => ({}))
      return { ok: upstream.ok, status: upstream.status, json }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  async function probePythonHealth() {
    const live = await probeUrl(`${SERVICE_BASE}/health/live`, 800)
    if (live?.ok && (live.json?.live === true || live.json?.status === 'live' || live.json?.status === 'ok')) {
      const ready = await probeUrl(`${SERVICE_BASE}/health/ready`, 800)
      if (ready?.ok && ready.json?.ready !== false && String(ready.json?.status || '') !== 'loading') {
        return { ...ready.json, live: true, ready: true, status: ready.json?.status || 'ok' }
      }
      return {
        ...(ready?.json || live.json || {}),
        live: true,
        ready: false,
        loading: true,
        status: 'loading',
      }
    }
    const health = await probeUrl(HEALTH_URL, 1200)
    if (!health?.json || typeof health.json !== 'object') return null
    const json = health.json
    const status = String(json.status || '')
    if (health.ok && (status === 'ok' || status === 'live' || status === 'loading' || json.live === true)) {
      const loading = status === 'loading' || json.ready === false
      return { ...json, live: true, ready: !loading, loading }
    }
    return null
  }

  function cachedPython() {
    return pythonCache.value
  }

  function refreshPythonHealth() {
    if (pythonProbeInFlight) return
    pythonProbeInFlight = true
    probePythonHealth()
      .then(value => {
        pythonCache = { at: Date.now(), value }
      })
      .catch(() => {
        pythonCache = { at: Date.now(), value: null }
      })
      .finally(() => {
        pythonProbeInFlight = false
      })
  }

  function pythonReady() {
    const cached = cachedPython()
    if (!cached?.ready) return false
    if (Date.now() - pythonCache.at > PYTHON_CACHE_TTL_MS * 3) return false
    return true
  }

  async function ensurePythonReady() {
    if (pythonReady()) return true
    const value = await probePythonHealth()
    pythonCache = { at: Date.now(), value }
    return Boolean(value?.ready)
  }

  function runBuiltinDetect(body) {
    return detectFieldsBuiltin({
      image: body.image,
      bbox: body.bbox,
      aoi: body.aoi,
      min_confidence: body.min_confidence ?? body.minConfidence,
      min_area_m2: body.min_area_m2 ?? body.minAreaM2,
      source: body.source,
    })
  }

  function authHeaders(extra = {}) {
    const headers = { ...extra }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
    return headers
  }

  function validateDetectBody(body) {
    if (!body || typeof body !== 'object') {
      return 'Expected JSON body for field boundary detection.'
    }
    if (!Array.isArray(body.bbox) || body.bbox.length !== 4) {
      return 'bbox must be [west, south, east, north].'
    }
    const source = normalizeDetectSource(body)
    if (!isImageOptionalSource(source) && (typeof body.image !== 'string' || !String(body.image || '').trim())) {
      return 'Expected JSON { image, bbox } for field boundary detection.'
    }
    return null
  }

  async function forwardJson(url, { method = 'GET', body, timeoutMs = 60_000 } = {}) {
    const headers = authHeaders(body != null ? { 'Content-Type': 'application/json' } : {})
    const upstream = await fetch(url, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await upstream.text()
    let json
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      return {
        status: 502,
        json: { error: 'Field-boundary service returned a non-JSON response.', detail: text.slice(0, 600) },
      }
    }
    if (!upstream.ok) {
      const rawError = String(
        json?.error || json?.detail || `Field-boundary service error (HTTP ${upstream.status}).`,
      )
      const cleanError = rawError
        .replace(/https?:\/\/\S+/gi, '[url]')
        .replace(/s3:\/\/\S+/gi, '[s3]')
      const shortError =
        cleanError.length > 220 ? `${cleanError.slice(0, 219)}…` : cleanError
      const passStatus =
        upstream.status === 400 || upstream.status === 404 || upstream.status === 422
          ? upstream.status
          : 502
      return {
        status: passStatus,
        json: {
          ...((json && typeof json === 'object') ? json : {}),
          error: shortError,
        },
      }
    }
    return { status: 200, json }
  }

  app.get('/api/agri-field-boundary/config', (_req, res) => {
    res.json({ configured: true, endpoint: Boolean(ENDPOINT), builtin_fallback: true })
  })

  app.get('/api/agri-field-boundary/health', (_req, res) => {
    ensureLocalAiService('agri-field-boundary')
    const python = cachedPython()
    refreshPythonHealth()
    if (python?.ready) {
      return res.status(200).json({
        ...python,
        status: 'ok',
        offline: false,
        python: true,
        builtin_fallback: true,
        ready: true,
        live: true,
        loading: false,
      })
    }
    if (python?.loading || python?.live) {
      return res.status(200).json({
        ...builtinHealthPayload(python),
        status: 'loading',
        loading: true,
        ready: false,
        live: true,
        python: true,
        offline: false,
      })
    }
    return res.status(200).json(builtinHealthPayload())
  })

  app.post(
    '/api/agri-field-boundary/detect',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      const err = validateDetectBody(req.body)
      if (err) return res.status(400).json({ error: err })
      const ready = await ensurePythonReady()
      const tryBuiltin = () => {
        if (!hasDetectImage(req.body)) {
          return res.status(400).json({
            error: imageOptionalUnavailableMessage(normalizeDetectSource(req.body)),
          })
        }
        try {
          return res.status(200).json(runBuiltinDetect(req.body))
        } catch (builtinErr) {
          return res.status(400).json({
            error: 'Could not delineate fields from the map RGB capture.',
            detail: String(builtinErr?.message || builtinErr),
          })
        }
      }
      const source = normalizeDetectSource(req.body)
      const imageOptional = isImageOptionalSource(source)
      if (!ready) {
        ensureLocalAiService('agri-field-boundary')
        if (imageOptional) {
          return res.status(400).json({ error: imageOptionalUnavailableMessage(source) })
        }
        return tryBuiltin()
      }
      try {
        const { status, json } = await forwardJson(ENDPOINT, {
          method: 'POST',
          body: req.body,
          timeoutMs: DETECT_TIMEOUT_MS,
        })
        if (status === 200) return res.status(200).json(json)
        if (status === 400 || status === 404 || status === 422) return res.status(status).json(json)
        // AFD cannot use map-RGB builtin — surface the real upstream error.
        if (imageOptional) {
          return res.status(status === 502 ? 502 : 400).json({
            error:
              String(json?.error || json?.detail || '').trim() ||
              imageOptionalUnavailableMessage(source),
            ...(json?.detail && json?.error ? { detail: json.detail } : {}),
          })
        }
        return tryBuiltin()
      } catch (err) {
        ensureLocalAiService('agri-field-boundary')
        if (imageOptional) {
          return res.status(502).json({
            error: imageOptionalUnavailableMessage(source),
            detail: String(err?.message || err),
          })
        }
        return tryBuiltin()
      }
    },
  )

  app.post(
    '/api/agri-field-boundary/detect-job',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      const err = validateDetectBody(req.body)
      if (err) return res.status(400).json({ error: err })
      const ready = await ensurePythonReady()
      const tryBuiltinJob = () => {
        if (!hasDetectImage(req.body)) {
          return res.status(400).json({
            error: imageOptionalUnavailableMessage(normalizeDetectSource(req.body)),
          })
        }
        try {
          const result = runBuiltinDetect(req.body)
          const jobId = rememberBuiltinJob(result)
          return res.status(200).json({ job_id: jobId, status: 'queued' })
        } catch (builtinErr) {
          return res.status(400).json({
            error: 'Could not delineate fields from the map RGB capture.',
            detail: String(builtinErr?.message || builtinErr),
          })
        }
      }
      const source = normalizeDetectSource(req.body)
      const imageOptional = isImageOptionalSource(source)
      if (!ready) {
        ensureLocalAiService('agri-field-boundary')
        if (imageOptional) {
          return res.status(400).json({ error: imageOptionalUnavailableMessage(source) })
        }
        return tryBuiltinJob()
      }
      try {
        const { status, json } = await forwardJson(JOB_URL, {
          method: 'POST',
          body: req.body,
          timeoutMs: DETECT_JOB_TIMEOUT_MS,
        })
        if (status === 200) return res.status(200).json(json)
        if (status === 400 || status === 404 || status === 422) return res.status(status).json(json)
        if (imageOptional) {
          return res.status(status === 502 ? 502 : 400).json({
            error:
              String(json?.error || json?.detail || '').trim() ||
              imageOptionalUnavailableMessage(source),
            ...(json?.detail && json?.error ? { detail: json.detail } : {}),
          })
        }
        return tryBuiltinJob()
      } catch (err) {
        ensureLocalAiService('agri-field-boundary')
        if (imageOptional) {
          return res.status(502).json({
            error: imageOptionalUnavailableMessage(source),
            detail: String(err?.message || err),
          })
        }
        return tryBuiltinJob()
      }
    },
  )

  const FTW_MOSAIC_URL = `${SERVICE_BASE}/ftw/mosaic-vectorize`

  app.post('/api/agri-field-boundary/ftw-mosaic-vectorize', express.json({ limit: jsonBodyLimit }), async (req, res) => {
    const body = req.body
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Expected JSON body.' })
    }
    if (!Array.isArray(body.bbox) || body.bbox.length !== 4) {
      return res.status(400).json({ error: 'bbox must be [west, south, east, north].' })
    }
    if (typeof body.mask !== 'string' || !String(body.mask).trim()) {
      return res.status(400).json({ error: 'mask PNG data URL is required.' })
    }
    refreshPythonHealth()
    if (pythonReady()) {
      try {
        const { status, json } = await forwardJson(FTW_MOSAIC_URL, {
          method: 'POST',
          body,
          timeoutMs: 120_000,
        })
        if (status >= 200 && status < 300) {
          return res.status(200).json({
            ...json,
            geojson: json.geojson,
            aoiApplied: Boolean(json.aoi_applied ?? json.aoiApplied),
          })
        }
        // Python :8092 may be healthy but missing /ftw/mosaic-vectorize — use Node builtin.
      } catch {
        /* fall through to builtin */
      }
    }
    try {
      const result = vectorizeFtwMosaicBuiltin(body)
      return res.status(200).json({
        ...result,
        aoiApplied: Boolean(result.aoi_applied),
      })
    } catch (err) {
      return res.status(400).json({ error: String(err?.message || err) })
    }
  })

  app.get('/api/agri-field-boundary/detect-job/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' })
    const builtin = readBuiltinJob(jobId)
    if (builtin) {
      return res.status(200).json({
        status: builtin.status,
        progress: builtin.progress,
        stage: builtin.stage,
        result: builtin.result,
      })
    }
    if (!pythonReady()) {
      return res.status(404).json({ error: 'Unknown field-boundary job.' })
    }
    try {
      const { status, json } = await forwardJson(`${JOB_URL}/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        timeoutMs: 30_000,
      })
      if (status >= 500) {
        return res.status(503).json({
          error: 'Field boundary job poll failed on the Python engine.',
          detail: String(json?.error || json?.detail || `HTTP ${status}`),
        })
      }
      return res.status(status).json(json)
    } catch {
      return res.status(503).json({ error: 'Could not poll field-boundary job.' })
    }
  })

  // --- SEN2SR Lite (same agri-field-boundary service on :8092) ---------------

  app.get('/api/sentinel2/super-resolution/status', async (_req, res) => {
    refreshPythonHealth()
    if (!pythonReady()) {
      return res.status(200).json({
        available: false,
        model: 'SEN2SRLite',
        error: 'SEN2SR needs the Python field engine on this host.',
      })
    }
    try {
      const { status, json } = await forwardJson(SEN2SR_STATUS_URL, {
        method: 'GET',
        timeoutMs: SEN2SR_STATUS_TIMEOUT_MS,
      })
      if (status === 200) return res.status(200).json(json)
      return res.status(200).json({
        available: false,
        model: 'SEN2SRLite',
        error: String(json?.error || json?.detail || 'SEN2SR status unavailable.'),
      })
    } catch {
      return res.status(200).json({
        available: false,
        model: 'SEN2SRLite',
        error: 'SEN2SR is unavailable on this host.',
      })
    }
  })

  /**
   * Transparent body forward for multipart GeoTIFF and/or JSON/form fields
   * (input_path, aoi, bands, display_1m, …). Preserves Content-Type so the
   * FastAPI route can parse Multipart or JSON as appropriate.
   */
  app.post(
    '/api/sentinel2/super-resolution',
    express.raw({ type: () => true, limit: SEN2SR_BODY_LIMIT }),
    async (req, res) => {
      refreshPythonHealth()
      if (!pythonReady()) {
        return res.status(400).json({ error: 'SEN2SR needs the Python field engine on this host.' })
      }
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
      const contentType = String(req.headers['content-type'] || '').trim()
      try {
        const headers = authHeaders(contentType ? { 'Content-Type': contentType } : {})
        const upstream = await fetch(SEN2SR_URL, {
          method: 'POST',
          headers,
          body: buf.length ? buf : undefined,
          signal: AbortSignal.timeout(SEN2SR_TIMEOUT_MS),
        })
        const text = await upstream.text()
        let json
        try {
          json = text ? JSON.parse(text) : {}
        } catch {
          return res.status(400).json({
            error: 'SEN2SR service returned a non-JSON response.',
            detail: text.slice(0, 600),
          })
        }
        if (!upstream.ok) {
          const detail = String(
            json?.detail || json?.error || `SEN2SR service error (HTTP ${upstream.status}).`,
          )
          return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 400).json({
            ...((json && typeof json === 'object') ? json : {}),
            error: detail,
            detail,
          })
        }
        return res.status(200).json(json)
      } catch (error) {
        return res.status(400).json({
          error: 'SEN2SR enhance failed on this host.',
          detail: String(error?.message || error),
        })
      }
    },
  )
}
