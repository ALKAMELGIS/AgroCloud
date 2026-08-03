/**
 * SAM2 boundary refinement proxy.
 *
 * Forwards field-pipeline refine requests to backend/services/sam2-refinement.
 *
 *   SAM2_REFINEMENT_URL    (default http://127.0.0.1:8096/refine)
 *   SAM2_REFINEMENT_TOKEN  (optional Bearer)
 */

import express from 'express'

/**
 * @param {import('express').Express} app
 */
export function registerSam2RefinementRoutes(app, { jsonBodyLimit = '48mb' } = {}) {
  const ENDPOINT = String(process.env.SAM2_REFINEMENT_URL || 'http://127.0.0.1:8096/refine').trim()
  const TOKEN = String(process.env.SAM2_REFINEMENT_TOKEN || '').trim()
  const SERVICE_BASE = ENDPOINT.replace(/\/refine\/?$/, '')
  const HEALTH_URL = `${SERVICE_BASE}/health`

  function authHeaders(extra = {}) {
    const headers = { ...extra }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
    return headers
  }

  function validateRefineBody(body) {
    if (!body || typeof body !== 'object') {
      return 'Expected JSON { image, bbox, instances } for SAM2 refine.'
    }
    const image = body.image || body.imageDataUrl
    if (typeof image !== 'string' || !image.trim()) {
      return 'image (or imageDataUrl) is required.'
    }
    if (!Array.isArray(body.bbox) || body.bbox.length !== 4) {
      return 'bbox must be [west, south, east, north].'
    }
    const hasInstances = Array.isArray(body.instances) && body.instances.length > 0
    const hasCoarse = Boolean(body.coarse_geojson || body.coarseGeojson)
    if (!hasInstances && !hasCoarse) {
      return 'Provide instances[] with bbox_xyxy, or coarse_geojson from SegFormer-B5.'
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
        json: { error: 'SAM2 service returned a non-JSON response.', detail: text.slice(0, 600) },
      }
    }
    if (!upstream.ok) {
      return {
        status: upstream.status === 400 || upstream.status === 404 ? upstream.status : 502,
        json: {
          error: json?.error || `SAM2 service error (HTTP ${upstream.status}).`,
          detail: typeof json === 'object' ? undefined : text.slice(0, 600),
          ...((json && typeof json === 'object') ? json : {}),
        },
      }
    }
    return { status: 200, json }
  }

  app.get('/api/sam2-refinement/config', (_req, res) => {
    res.json({ configured: Boolean(ENDPOINT), endpoint: Boolean(ENDPOINT) })
  })

  app.post(
    '/api/sam2-refinement/refine',
    express.json({ limit: jsonBodyLimit }),
    async (req, res) => {
      if (!ENDPOINT) {
        return res.status(503).json({
          error:
            'SAM2 refinement service is not configured. Run backend/services/sam2-refinement (docker compose up).',
        })
      }
      const err = validateRefineBody(req.body)
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
          error:
            'Could not reach the SAM2 refinement service. Start it with: cd backend/services/sam2-refinement && docker compose up',
          detail: String(error?.message || error),
          offline: true,
        })
      }
    },
  )

  app.get('/api/sam2-refinement/health', async (_req, res) => {
    try {
      const upstream = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8_000) })
      const json = await upstream.json().catch(() => ({}))
      return res.status(upstream.ok ? 200 : 502).json(json)
    } catch (error) {
      return res.status(502).json({ status: 'offline', detail: String(error?.message || error) })
    }
  })
}
