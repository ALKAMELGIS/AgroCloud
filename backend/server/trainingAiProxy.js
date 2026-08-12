/**
 * Training & AI — Node façade for SegFormer fine-tune / inference jobs on :8095.
 *
 *   POST /api/training/start
 *   GET  /api/training/:jobId
 *   POST /api/training/:jobId/cancel
 *   POST /api/inference/start
 *   GET  /api/inference/:jobId
 *
 * Env:
 *   SEGFORMER_DETECTION_URL   (default http://127.0.0.1:8095)
 *   SEGFORMER_DETECTION_TOKEN (optional Bearer)
 */

import express from 'express'

const TRAIN_TIMEOUT_MS = 30 * 60 * 1000
const INFER_TIMEOUT_MS = 15 * 60 * 1000
/** Polls can stall while CPU training holds the GIL — keep this generous. */
const POLL_TIMEOUT_MS = 60_000
const HEALTH_TIMEOUT_MS = 15_000
const BODY_LIMIT = '64mb'

function isOfflineDetail(detail) {
  return /ECONNREFUSED|ENOTFOUND|connect ECONNREFUSED|getaddrinfo/i.test(String(detail || ''))
}

function isTimeoutDetail(detail) {
  return /timed out|TimeoutError|AbortError|operation was aborted/i.test(String(detail || ''))
}

function serviceBase() {
  const raw = String(process.env.SEGFORMER_DETECTION_URL || 'http://127.0.0.1:8095').trim()
  return raw.replace(/\/detect\/?$/i, '').replace(/\/$/, '')
}

function authHeaders(extra = {}) {
  const headers = { ...extra }
  const token = String(process.env.SEGFORMER_DETECTION_TOKEN || '').trim()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
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
      json: {
        error: 'Training/inference service returned a non-JSON response.',
        detail: text.slice(0, 600),
      },
    }
  }
  if (!upstream.ok) {
    const detail = String(json?.detail || json?.error || `Upstream HTTP ${upstream.status}`)
    return {
      status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      json: { ...(json && typeof json === 'object' ? json : {}), error: detail, detail },
    }
  }
  return { status: 200, json }
}

export function registerTrainingAiRoutes(app) {
  const base = serviceBase()

  // Dedicated health for Training & AI (does not pretend training is OK via spectral builtin).
  app.get('/api/training/health', async (_req, res) => {
    try {
      const upstream = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      })
      const json = await upstream.json().catch(() => ({}))
      const training = Boolean(json?.training)
      return res.status(200).json({
        status: upstream.ok ? 'ok' : 'degraded',
        available: upstream.ok,
        training,
        onnx: Boolean(json?.onnx),
        model_ready: Boolean(json?.model_ready),
        engine: json?.engine,
        model: json?.model,
        device: json?.device,
        training_error: training
          ? undefined
          : json?.training_error || 'Training dependencies unavailable on :8095.',
      })
    } catch (error) {
      const detail = String(error?.message || error)
      // Busy/timeout during CPU training is not the same as the process being down.
      if (isTimeoutDetail(detail) && !isOfflineDetail(detail)) {
        return res.status(200).json({
          status: 'busy',
          available: true,
          training: true,
          onnx: false,
          error: undefined,
          detail,
        })
      }
      return res.status(503).json({
        status: 'offline',
        available: false,
        training: false,
        onnx: false,
        error: 'Training service offline (port 8095).',
        detail,
      })
    }
  })

  app.post('/api/training/start', express.json({ limit: BODY_LIMIT }), async (req, res) => {
    try {
      const { status, json } = await forwardJson(`${base}/training/start`, {
        method: 'POST',
        body: req.body,
        timeoutMs: 180_000,
      })
      return res.status(status).json(json)
    } catch (error) {
      const detail = String(error?.message || error)
      if (isOfflineDetail(detail)) {
        return res.status(502).json({
          error: 'Training service offline (port 8095).',
          detail,
        })
      }
      if (isTimeoutDetail(detail)) {
        return res.status(504).json({
          error: 'Training service is busy starting a job. Wait a moment and retry.',
          detail,
        })
      }
      return res.status(502).json({
        error: 'Could not reach the training service.',
        detail,
      })
    }
  })

  // Must be registered before /api/training/:jobId so "models" is not treated as a job id.
  app.get('/api/training/models', async (_req, res) => {
    try {
      const { status, json } = await forwardJson(`${base}/training/models`, {
        timeoutMs: 10_000,
      })
      return res.status(status).json(json)
    } catch (error) {
      return res.status(503).json({
        error: 'Could not list training models.',
        detail: String(error?.message || error),
        models: [],
        count: 0,
      })
    }
  })

  app.get('/api/training/models/:modelId', async (req, res) => {
    const modelId = String(req.params.modelId || '').trim()
    if (!modelId) return res.status(400).json({ error: 'modelId is required.' })
    try {
      const { status, json } = await forwardJson(
        `${base}/training/models/${encodeURIComponent(modelId)}`,
        { timeoutMs: 10_000 },
      )
      return res.status(status).json(json)
    } catch (error) {
      return res.status(503).json({
        error: 'Could not load training model.',
        detail: String(error?.message || error),
      })
    }
  })

  app.get('/api/training/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' })
    try {
      const { status, json } = await forwardJson(`${base}/training/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        timeoutMs: POLL_TIMEOUT_MS,
      })
      return res.status(status).json(json)
    } catch (error) {
      const detail = String(error?.message || error)
      if (isOfflineDetail(detail)) {
        return res.status(502).json({
          error: 'Training service offline (port 8095).',
          detail,
        })
      }
      if (isTimeoutDetail(detail)) {
        // Let the UI keep polling — training thread may still be alive.
        return res.status(504).json({
          error: 'Training poll timed out (service busy).',
          transient: true,
          detail,
        })
      }
      return res.status(502).json({
        error: 'Could not poll training job.',
        detail,
      })
    }
  })

  app.post('/api/training/:jobId/cancel', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' })
    try {
      const { status, json } = await forwardJson(
        `${base}/training/${encodeURIComponent(jobId)}/cancel`,
        { method: 'POST', timeoutMs: POLL_TIMEOUT_MS },
      )
      return res.status(status).json(json)
    } catch (error) {
      return res.status(502).json({
        error: 'Could not cancel training job.',
        detail: String(error?.message || error),
      })
    }
  })

  app.post('/api/inference/start', express.json({ limit: BODY_LIMIT }), async (req, res) => {
    try {
      const { status, json } = await forwardJson(`${base}/inference/start`, {
        method: 'POST',
        body: req.body,
        timeoutMs: INFER_TIMEOUT_MS,
      })
      return res.status(status).json(json)
    } catch (error) {
      const detail = String(error?.message || error)
      if (isOfflineDetail(detail)) {
        return res.status(502).json({
          error: 'Inference service offline (port 8095).',
          detail,
        })
      }
      if (isTimeoutDetail(detail)) {
        return res.status(504).json({
          error: 'Inference service is busy. Wait a moment and retry.',
          detail,
        })
      }
      return res.status(502).json({
        error: 'Unable to run inference. Check the model and imagery.',
        detail,
      })
    }
  })

  app.get('/api/inference/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' })
    try {
      const { status, json } = await forwardJson(`${base}/inference/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        timeoutMs: POLL_TIMEOUT_MS,
      })
      return res.status(status).json(json)
    } catch (error) {
      const detail = String(error?.message || error)
      if (isTimeoutDetail(detail) && !isOfflineDetail(detail)) {
        return res.status(504).json({
          error: 'Inference poll timed out (service busy).',
          transient: true,
          detail,
        })
      }
      return res.status(502).json({
        error: isOfflineDetail(detail)
          ? 'Inference service offline (port 8095).'
          : 'Could not poll inference job.',
        detail,
      })
    }
  })
}
