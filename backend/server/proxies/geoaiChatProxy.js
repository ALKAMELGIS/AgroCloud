/**
 * GeoAI Chat proxy — forwards conversational GIS requests to backend/services/geoai-chat.
 *
 *   GEOAI_CHAT_URL    (default http://127.0.0.1:8099)
 *   GEOAI_CHAT_TOKEN  (optional Bearer)
 */

import express from 'express'

/**
 * @param {import('express').Express} app
 */
export function registerGeoaiChatRoutes(app, { jsonBodyLimit = '4mb' } = {}) {
  const BASE = String(process.env.GEOAI_CHAT_URL || 'http://127.0.0.1:8099')
    .trim()
    .replace(/\/$/, '')
  const TOKEN = String(process.env.GEOAI_CHAT_TOKEN || '').trim()
  const CHAT_URL = `${BASE}/geoai/chat`
  const HEALTH_URL = `${BASE}/health`

  function authHeaders(extra = {}) {
    const headers = { ...extra }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
    return headers
  }

  async function forwardJson(url, { method = 'GET', body, timeoutMs = 120_000 } = {}) {
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
        json: { error: 'GeoAI Chat service returned a non-JSON response.', detail: text.slice(0, 600) },
      }
    }
    if (!upstream.ok) {
      return {
        status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
        json: {
          error: json?.error || json?.detail || `GeoAI Chat error (HTTP ${upstream.status}).`,
          ...((json && typeof json === 'object') ? json : {}),
        },
      }
    }
    return { status: 200, json }
  }

  app.get('/api/geoai-chat/config', (_req, res) => {
    res.json({ configured: Boolean(BASE), endpoint: Boolean(BASE) })
  })

  app.post('/api/geoai-chat/chat', express.json({ limit: jsonBodyLimit }), async (req, res) => {
    if (!BASE) {
      return res.status(503).json({
        error: 'GeoAI Chat service is not configured. Start backend/services/geoai-chat on port 8099.',
      })
    }
    const message = String(req.body?.message || '').trim()
    if (!message) return res.status(400).json({ error: 'message is required.' })
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {}

    try {
      const { status, json } = await forwardJson(CHAT_URL, {
        method: 'POST',
        body: { message, context },
        timeoutMs: 180_000,
      })
      return res.status(status).json(json)
    } catch (error) {
      return res.status(502).json({
        error: 'Could not reach GeoAI Chat. Start: cd backend/services/geoai-chat && uvicorn app:app --port 8099',
        detail: String(error?.message || error),
        offline: true,
      })
    }
  })

  app.get('/api/geoai-chat/health', async (_req, res) => {
    try {
      const upstream = await fetch(HEALTH_URL, {
        headers: authHeaders(),
        signal: AbortSignal.timeout(8_000),
      })
      const json = await upstream.json().catch(() => ({}))
      return res.status(upstream.ok ? 200 : 502).json({ ...json, reachable: upstream.ok })
    } catch (error) {
      return res.status(502).json({ status: 'offline', detail: String(error?.message || error), reachable: false })
    }
  })
}
