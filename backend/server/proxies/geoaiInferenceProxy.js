/**
 * opengeos/geoai (geoai-py) inference proxy.
 *
 * Forwards detect requests to backend/services/geoai-inference.
 *
 *   GEOAI_INFERENCE_URL    (default http://127.0.0.1:8098)
 *   GEOAI_INFERENCE_TOKEN  (optional Bearer)
 */

import express from 'express'

const VALID_TASKS = new Set(['buildings', 'cars', 'ships', 'solar', 'parking'])

/**
 * @param {import('express').Express} app
 */
export function registerGeoaiInferenceRoutes(app, { jsonBodyLimit = '48mb' } = {}) {
  const BASE = String(process.env.GEOAI_INFERENCE_URL || 'http://127.0.0.1:8098')
    .trim()
    .replace(/\/$/, '')
  const TOKEN = String(process.env.GEOAI_INFERENCE_TOKEN || '').trim()
  const DETECT_URL = `${BASE}/detect`
  const HEALTH_URL = `${BASE}/health`

  function authHeaders(extra = {}) {
    const headers = { ...extra }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
    return headers
  }

  function validateDetectBody(body) {
    if (!body || typeof body !== 'object') {
      return 'Expected JSON { image, bbox, task } for GeoAI detect.'
    }
    const image = body.image || body.imageDataUrl
    if (typeof image !== 'string' || !image.trim()) {
      return 'image (or imageDataUrl) is required.'
    }
    if (!Array.isArray(body.bbox) || body.bbox.length !== 4) {
      return 'bbox must be [west, south, east, north].'
    }
    const task = String(body.task || body.target || 'buildings')
      .trim()
      .toLowerCase()
    if (task && !VALID_TASKS.has(task) && !['building', 'car', 'vehicles', 'ship', 'solar_panels', 'parking_spots', 'building_footprints'].includes(task)) {
      // Let the Python service resolve aliases; only reject empty nonsense.
      if (!task) return 'task is required (buildings|cars|ships|solar|parking).'
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
        json: { error: 'GeoAI service returned a non-JSON response.', detail: text.slice(0, 600) },
      }
    }
    if (!upstream.ok) {
      return {
        status: upstream.status === 400 || upstream.status === 404 ? upstream.status : 502,
        json: {
          error: json?.error || `GeoAI service error (HTTP ${upstream.status}).`,
          detail: typeof json === 'object' ? undefined : text.slice(0, 600),
          ...((json && typeof json === 'object') ? json : {}),
        },
      }
    }
    return { status: 200, json }
  }

  app.get('/api/geoai-inference/config', (_req, res) => {
    res.json({ configured: Boolean(BASE), endpoint: Boolean(BASE), tasks: [...VALID_TASKS] })
  })

  app.post(
    '/api/geoai-inference/detect',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      if (!BASE) {
        return res.status(503).json({
          error:
            'GeoAI inference service is not configured. Run backend/services/geoai-inference (docker compose up).',
        })
      }
      const err = validateDetectBody(req.body)
      if (err) return res.status(400).json({ error: err })

      try {
        const { status, json } = await forwardJson(DETECT_URL, {
          method: 'POST',
          body: req.body,
          timeoutMs: 15 * 60 * 1000,
        })
        return res.status(status).json(json)
      } catch (error) {
        return res.status(502).json({
          error:
            'Could not reach the GeoAI inference service. Start it with: cd backend/services/geoai-inference && docker compose up',
          detail: String(error?.message || error),
          offline: true,
        })
      }
    },
  )

  app.get('/api/geoai-inference/health', async (_req, res) => {
    try {
      const upstream = await fetch(HEALTH_URL, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(8_000),
      })
      const json = await upstream.json().catch(() => ({}))
      return res.status(upstream.ok ? 200 : 502).json(json)
    } catch (error) {
      return res.status(502).json({ status: 'offline', detail: String(error?.message || error) })
    }
  })

  app.get('/api/geoai-inference/tasks', async (_req, res) => {
    try {
      const { status, json } = await forwardJson(`${BASE}/tasks`, { timeoutMs: 8_000 })
      return res.status(status).json(json)
    } catch (error) {
      return res.status(502).json({
        tasks: [...VALID_TASKS].map((id) => ({ id })),
        offline: true,
        detail: String(error?.message || error),
      })
    }
  })
}
