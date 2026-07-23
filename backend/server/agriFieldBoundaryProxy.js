/**
 * Agri Field Boundary Detection — Mask R-CNN / Delineate-Anything / FoW proxy.
 *
 * Env:
 *   FIELD_BOUNDARY_URL   (default http://127.0.0.1:8092/detect)
 *   FIELD_BOUNDARY_TOKEN (optional Bearer token)
 */

import express from 'express'

export function registerAgriFieldBoundaryRoutes(app, { jsonBodyLimit = '48mb' } = {}) {
  const ENDPOINT = String(process.env.FIELD_BOUNDARY_URL || 'http://127.0.0.1:8092/detect').trim()
  const TOKEN = String(process.env.FIELD_BOUNDARY_TOKEN || '').trim()
  const SERVICE_BASE = ENDPOINT.replace(/\/detect\/?$/, '')
  const HEALTH_URL = `${SERVICE_BASE}/health`
  const JOB_URL = `${SERVICE_BASE}/detect-job`
  const FOW_URL = `${SERVICE_BASE}/fow-aoi`

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
    const source = String(body.source || '').toLowerCase()
    const isFow = source === 'fow' || source === 'fields-of-the-world' || source === 'ftw'
    if (!isFow && typeof body.image !== 'string') {
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
      return {
        status: upstream.status === 400 || upstream.status === 404 ? upstream.status : 502,
        json: {
          error: json?.error || `Field-boundary service error (HTTP ${upstream.status}).`,
          ...(json && typeof json === 'object' ? json : {}),
        },
      }
    }
    return { status: 200, json }
  }

  app.get('/api/agri-field-boundary/config', (_req, res) => {
    res.json({ configured: Boolean(ENDPOINT), endpoint: Boolean(ENDPOINT) })
  })

  app.get('/api/agri-field-boundary/health', async (_req, res) => {
    try {
      const upstream = await fetch(HEALTH_URL)
      const json = await upstream.json().catch(() => ({}))
      return res.status(upstream.ok ? 200 : 502).json(json)
    } catch (error) {
      return res.status(502).json({ status: 'offline', detail: String(error?.message || error) })
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
      try {
        const { status, json } = await forwardJson(ENDPOINT, {
          method: 'POST',
          body: req.body,
          timeoutMs: 10 * 60 * 1000,
        })
        return res.status(status).json(json)
      } catch (error) {
        return res.status(502).json({
          error: 'Could not reach the field-boundary service.',
          detail: String(error?.message || error),
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
      try {
        const { status, json } = await forwardJson(JOB_URL, {
          method: 'POST',
          body: req.body,
          timeoutMs: 120_000,
        })
        return res.status(status).json(json)
      } catch (error) {
        return res.status(502).json({
          error: 'Could not start field-boundary job.',
          detail: String(error?.message || error),
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
      return res.status(502).json({
        error: 'Could not poll field-boundary job.',
        detail: String(error?.message || error),
      })
    }
  })
}
