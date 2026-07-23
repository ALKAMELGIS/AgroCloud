/**
 * AI SAM Detection — Segment Anything Model inference proxy.
 *
 * The AI SAM Detection tool relies on a Python Segment Anything service served over
 * HTTP. A ready-to-run, zero-config FastAPI service (segment-geospatial / samgeo)
 * ships in `backend/services/sam-detection/` — it auto-downloads the SAM checkpoint.
 * Just run it (`docker compose up`); this proxy defaults to its local URL.
 *
 * SAM is a PyTorch model and cannot run in the browser, so the frontend posts the
 * current AOI extent (high-res RGB + WGS84 bounds + optional AOI GeoJSON) with
 * foreground/background point prompts to this proxy, which forwards the request and
 * returns georeferenced GeoJSON Point/Line/Polygon features + a translucent mask.
 *
 * Configure with env vars:
 *   SAM_DETECTION_URL    (optional) segment endpoint
 *                        (default http://127.0.0.1:8090/segment)
 *   SAM_DETECTION_TOKEN  (optional) sent as `Authorization: Bearer <token>`
 */

import express from 'express'

/**
 * Register the SAM-detection proxy routes.
 * @param {import('express').Express} app
 */
export function registerSamDetectionRoutes(app, { jsonBodyLimit = '48mb' } = {}) {
  // Defaults to the bundled local service (backend/services/sam-detection), so
  // `docker compose up` there is enough — no env config required for local dev.
  const ENDPOINT = String(process.env.SAM_DETECTION_URL || 'http://127.0.0.1:8090/segment').trim()
  const TOKEN = String(process.env.SAM_DETECTION_TOKEN || '').trim()
  const SERVICE_BASE = ENDPOINT.replace(/\/segment\/?$/, '')
  const HEALTH_URL = `${SERVICE_BASE}/health`
  const JOB_URL = `${SERVICE_BASE}/segment-job`

  function authHeaders(extra = {}) {
    const headers = { ...extra }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
    return headers
  }

  function validateSegmentBody(body) {
    if (!body || typeof body !== 'object' || typeof body.image !== 'string') {
      return 'Expected JSON { image, bbox, points } for segmentation.'
    }
    if (!Array.isArray(body.bbox) || body.bbox.length !== 4) {
      return 'bbox must be [west, south, east, north].'
    }
    const hasPoints = Array.isArray(body.points) && body.points.length > 0
    const hasAoi = Boolean(body.aoi) && body.full_aoi !== false
    if (!hasPoints && !hasAoi) {
      return 'Provide point prompts, or an AOI with full_aoi for whole-boundary detection.'
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
        json: { error: 'SAM service returned a non-JSON response.', detail: text.slice(0, 600) },
      }
    }
    if (!upstream.ok) {
      return {
        status: upstream.status === 400 || upstream.status === 404 ? upstream.status : 502,
        json: {
          error: json?.error || `SAM service error (HTTP ${upstream.status}).`,
          detail: typeof json === 'object' ? undefined : text.slice(0, 600),
          ...((json && typeof json === 'object') ? json : {}),
        },
      }
    }
    return { status: 200, json }
  }

  app.get('/api/sam-detection/config', (_req, res) => {
    res.json({ configured: Boolean(ENDPOINT), endpoint: ENDPOINT ? true : false })
  })

  // Large base64 image payloads: parse JSON with a generous limit for this route only.
  app.post(
    '/api/sam-detection/segment',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({
          error:
            'SAM segmentation service is not configured. Run backend/services/sam-detection (docker compose up) — the backend defaults to its local /segment endpoint.',
        })
      }
      const err = validateSegmentBody(req.body)
      if (err) return res.status(400).json({ error: err })

      try {
        // Full-AOI automatic mask generation can take several minutes on CPU.
        const { status, json } = await forwardJson(ENDPOINT, {
          method: 'POST',
          body: req.body,
          timeoutMs: 10 * 60 * 1000,
        })
        return res.status(status).json(json)
      } catch (error) {
        return res.status(502).json({
          error:
            'Could not reach the SAM segmentation service. Start it with: cd backend/services/sam-detection && docker compose up',
          detail: String(error?.message || error),
        })
      }
    },
  )

  // Async job: returns quickly with { job_id }; poll GET .../segment-job/:id for progress.
  app.post(
    '/api/sam-detection/segment-job',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({
          error:
            'SAM segmentation service is not configured. Run backend/services/sam-detection (docker compose up).',
        })
      }
      const err = validateSegmentBody(req.body)
      if (err) return res.status(400).json({ error: err })

      try {
        const { status, json } = await forwardJson(JOB_URL, {
          method: 'POST',
          body: req.body,
          timeoutMs: 120_000,
        })
        return res.status(status).json(json)
      } catch (error) {
        return res.status(502).json({
          error: 'Could not reach the SAM segmentation service to start a job.',
          detail: String(error?.message || error),
        })
      }
    },
  )

  app.get('/api/sam-detection/segment-job/:jobId', async (req, res) => {
    if (!ENDPOINT) {
      return res.status(503).json({ error: 'SAM segmentation service is not configured.' })
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
      return res.status(502).json({
        error: 'Could not poll SAM job status.',
        detail: String(error?.message || error),
      })
    }
  })

  // Lightweight reachability check the frontend can use to show "offline" state.
  app.get('/api/sam-detection/health', async (_req, res) => {
    try {
      const upstream = await fetch(HEALTH_URL)
      const json = await upstream.json().catch(() => ({}))
      return res.status(upstream.ok ? 200 : 502).json(json)
    } catch (error) {
      return res.status(502).json({ status: 'offline', detail: String(error?.message || error) })
    }
  })
}
