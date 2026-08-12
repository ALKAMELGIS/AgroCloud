/**
 * Agri Field Boundary Detection — Mask R-CNN / Delineate-Anything / FoW / FTW-infer / FTW-live proxy.
 * Also proxies SEN2SR Lite Sentinel-2 super-resolution on the same :8092 service.
 *
 * Env:
 *   FIELD_BOUNDARY_URL   (default http://127.0.0.1:8092/detect)
 *   FIELD_BOUNDARY_TOKEN (optional Bearer token)
 */

import express from 'express'
import { ensureLocalAiService } from './localAiServiceSupervisor.js'

/** Precomputed FoW GeoParquet clip — image not required. */
const FOW_SOURCES = new Set(['fow', 'fields-of-the-world', 'ftw'])
/**
 * On-demand FTW paths (S2 download + model) — image not required; slow (minutes).
 * Includes CLI infer and live Sentinel-2 stack (ftw-live).
 */
const FTW_INFER_SOURCES = new Set([
  'ftw-infer',
  'ftw_model',
  'ftw-baselines',
  'ftw-live',
  'sentinel2-live',
])
const DETECT_TIMEOUT_MS = 10 * 60 * 1000
const DETECT_JOB_TIMEOUT_MS = 120_000
/** FTW inference / live stack downloads S2 + runs the model; allow a long forward window. */
const FTW_INFER_DETECT_TIMEOUT_MS = 30 * 60 * 1000
const FTW_INFER_DETECT_JOB_TIMEOUT_MS = 10 * 60 * 1000
/** Neural SR can take several minutes on CPU/GPU; keep a long forward window. */
const SEN2SR_TIMEOUT_MS = 30 * 60 * 1000
const SEN2SR_STATUS_TIMEOUT_MS = 15_000
/** Multipart GeoTIFF uploads for SEN2SR (raw bytes forwarded upstream). */
const SEN2SR_BODY_LIMIT = '256mb'

function normalizeDetectSource(body) {
  return String(body?.source || '').toLowerCase()
}

function isImageOptionalSource(source) {
  return FOW_SOURCES.has(source) || FTW_INFER_SOURCES.has(source)
}

function isFtwInferSource(source) {
  return FTW_INFER_SOURCES.has(source)
}

export function registerAgriFieldBoundaryRoutes(app, { jsonBodyLimit = '48mb' } = {}) {
  const ENDPOINT = String(process.env.FIELD_BOUNDARY_URL || 'http://127.0.0.1:8092/detect').trim()
  const TOKEN = String(process.env.FIELD_BOUNDARY_TOKEN || '').trim()
  const SERVICE_BASE = ENDPOINT.replace(/\/detect\/?$/, '')
  const HEALTH_URL = `${SERVICE_BASE}/health`
  const JOB_URL = `${SERVICE_BASE}/detect-job`
  const FOW_URL = `${SERVICE_BASE}/fow-aoi`
  const SEN2SR_STATUS_URL = `${SERVICE_BASE}/api/sentinel2/super-resolution/status`
  const SEN2SR_URL = `${SERVICE_BASE}/api/sentinel2/super-resolution`

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

  function validateFowBody(body) {
    if (!body || typeof body !== 'object') return 'Expected JSON { bbox }.'
    if (!Array.isArray(body.bbox) || body.bbox.length !== 4) {
      return 'bbox must be [west, south, east, north].'
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
    res.json({ configured: Boolean(ENDPOINT), endpoint: Boolean(ENDPOINT) })
  })

  app.get('/api/agri-field-boundary/health', async (_req, res) => {
    const tryOnce = async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      try {
        const upstream = await fetch(HEALTH_URL, { signal: controller.signal })
        const json = await upstream.json().catch(() => ({}))
        return { ok: upstream.ok, json }
      } finally {
        clearTimeout(timer)
      }
    }
    try {
      let result = await tryOnce()
      // Brief retry — uvicorn rebound / cold start should not flicker the toolbox offline.
      if (!result.ok || String(result.json?.status || '') !== 'ok') {
        await new Promise(r => setTimeout(r, 350))
        result = await tryOnce()
      }
      if (result.ok && String(result.json?.status || '') === 'ok') {
        return res.status(200).json({ ...result.json, offline: false })
      }
      // Offline in dev means the local launcher died — bring it back now instead
      // of waiting for the supervisor's next sweep.
      ensureLocalAiService('agri-field-boundary')
      return res.status(502).json({
        status: 'offline',
        offline: true,
        detail: result.json?.detail || 'Upstream health not ok',
      })
    } catch (error) {
      // One more attempt after a short pause before declaring offline to the UI.
      try {
        await new Promise(r => setTimeout(r, 400))
        const retry = await tryOnce()
        if (retry.ok && String(retry.json?.status || '') === 'ok') {
          return res.status(200).json({ ...retry.json, offline: false })
        }
      } catch {
        /* fall through */
      }
      ensureLocalAiService('agri-field-boundary')
      return res.status(502).json({
        status: 'offline',
        offline: true,
        detail: String(error?.message || error),
      })
    }
  })

  app.post(
    '/api/agri-field-boundary/fow-aoi',
    express.json({ limit: '2mb' }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({ error: 'Field-boundary service is not configured.' })
      }
      const err = validateFowBody(req.body)
      if (err) return res.status(400).json({ error: err })
      try {
        const { status, json } = await forwardJson(FOW_URL, {
          method: 'POST',
          body: req.body,
          timeoutMs: 5 * 60 * 1000,
        })
        return res.status(status).json(json)
      } catch (error) {
        return res.status(502).json({
          error: 'Could not reach the FoW field-boundary service.',
          detail: String(error?.message || error),
        })
      }
    },
  )

  app.post(
    '/api/agri-field-boundary/detect',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({
          error: 'Field-boundary service is not configured. Run backend/services/agri-field-boundary.',
        })
      }
      const err = validateDetectBody(req.body)
      if (err) return res.status(400).json({ error: err })
      const ftwInfer = isFtwInferSource(normalizeDetectSource(req.body))
      try {
        const { status, json } = await forwardJson(ENDPOINT, {
          method: 'POST',
          body: req.body,
          timeoutMs: ftwInfer ? FTW_INFER_DETECT_TIMEOUT_MS : DETECT_TIMEOUT_MS,
        })
        return res.status(status).json(json)
      } catch (error) {
        const detail = String(error?.message || error)
        const offline = /ECONNREFUSED|ENOTFOUND|fetch failed|AbortError|timed out|TimeoutError/i.test(detail)
        return res.status(502).json({
          error: offline
            ? 'Field-boundary service offline (port 8092).'
            : 'Could not reach the field-boundary service.',
          detail,
        })
      }
    },
  )

  app.post(
    '/api/agri-field-boundary/detect-job',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({ error: 'Field-boundary service is not configured.' })
      }
      const err = validateDetectBody(req.body)
      if (err) return res.status(400).json({ error: err })
      const ftwInfer = isFtwInferSource(normalizeDetectSource(req.body))
      try {
        const { status, json } = await forwardJson(JOB_URL, {
          method: 'POST',
          body: req.body,
          timeoutMs: ftwInfer ? FTW_INFER_DETECT_JOB_TIMEOUT_MS : DETECT_JOB_TIMEOUT_MS,
        })
        return res.status(status).json(json)
      } catch (error) {
        const detail = String(error?.message || error)
        const offline = /ECONNREFUSED|ENOTFOUND|fetch failed|AbortError|timed out|TimeoutError/i.test(detail)
        return res.status(502).json({
          error: offline
            ? 'Field-boundary service offline (port 8092).'
            : 'Could not start field-boundary job.',
          detail,
        })
      }
    },
  )

  app.get('/api/agri-field-boundary/detect-job/:jobId', async (req, res) => {
    if (!ENDPOINT) {
      return res.status(503).json({ error: 'Field-boundary service is not configured.' })
    }
    const jobId = String(req.params.jobId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' })
    try {
      const { status, json } = await forwardJson(`${JOB_URL}/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        timeoutMs: 30_000,
      })
      return res.status(status).json(json)
    } catch (error) {
      const detail = String(error?.message || error)
      const offline = /ECONNREFUSED|ENOTFOUND|fetch failed|AbortError|timed out|TimeoutError/i.test(detail)
      return res.status(502).json({
        error: offline
          ? 'Field-boundary service offline (port 8092).'
          : 'Could not poll field-boundary job.',
        detail,
      })
    }
  })

  // --- SEN2SR Lite (same agri-field-boundary service on :8092) ---------------

  app.get('/api/sentinel2/super-resolution/status', async (_req, res) => {
    if (!ENDPOINT) {
      return res.status(503).json({
        available: false,
        model: 'SEN2SRLite',
        error: 'Field-boundary service is not configured.',
      })
    }
    try {
      const { status, json } = await forwardJson(SEN2SR_STATUS_URL, {
        method: 'GET',
        timeoutMs: SEN2SR_STATUS_TIMEOUT_MS,
      })
      return res.status(status).json(json)
    } catch (error) {
      const detail = String(error?.message || error)
      const offline = /ECONNREFUSED|ENOTFOUND|fetch failed|AbortError|timed out|TimeoutError/i.test(detail)
      return res.status(502).json({
        available: false,
        model: 'SEN2SRLite',
        error: offline
          ? 'Field-boundary service offline (port 8092).'
          : 'Could not reach SEN2SR status endpoint.',
        detail,
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
      if (!ENDPOINT) {
        return res.status(503).json({
          error: 'Field-boundary service is not configured. Run backend/services/agri-field-boundary.',
        })
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
          return res.status(502).json({
            error: 'SEN2SR service returned a non-JSON response.',
            detail: text.slice(0, 600),
          })
        }
        if (!upstream.ok) {
          const detail = String(
            json?.detail || json?.error || `SEN2SR service error (HTTP ${upstream.status}).`,
          )
          return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json({
            ...((json && typeof json === 'object') ? json : {}),
            error: detail,
            detail,
          })
        }
        return res.status(200).json(json)
      } catch (error) {
        const detail = String(error?.message || error)
        const offline = /ECONNREFUSED|ENOTFOUND|fetch failed|AbortError|timed out|TimeoutError/i.test(detail)
        return res.status(502).json({
          error: offline
            ? 'Field-boundary service offline (port 8092).'
            : 'Could not reach the SEN2SR super-resolution service.',
          detail,
        })
      }
    },
  )
}
