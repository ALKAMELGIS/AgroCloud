/**
 * Training & AI — Node façade for SegFormer fine-tune / inference.
 *
 * Primary: Python service (SEGFORMER_DETECTION_URL, default http://127.0.0.1:8095).
 * Fallback: in-process spectral prototype trainer so GitHub Pages → Hostinger
 * production still trains/infers when Python is not installed on the Node host.
 *
 *   GET  /api/training/health
 *   POST /api/training/start
 *   GET  /api/training/:jobId
 *   POST /api/training/:jobId/cancel
 *   GET  /api/training/models
 *   GET  /api/training/models/:modelId
 *   POST /api/inference/start
 *   GET  /api/inference/:jobId
 *
 * Env:
 *   SEGFORMER_DETECTION_URL   (default http://127.0.0.1:8095)
 *   SEGFORMER_DETECTION_TOKEN (optional Bearer)
 */

import express from 'express'
import {
  builtinTrainingHealth,
  cancelBuiltinTrainingJob,
  getBuiltinInferenceJob,
  getBuiltinModel,
  getBuiltinTrainingJob,
  isBuiltinInferenceJobId,
  isBuiltinTrainingJobId,
  listBuiltinModels,
  startBuiltinInferenceJob,
  startBuiltinTrainingJob,
} from './trainingAiBuiltin.js'

const INFER_TIMEOUT_MS = 15 * 60 * 1000
/** Polls can stall while CPU training holds the GIL — keep this generous. */
const POLL_TIMEOUT_MS = 60_000
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

async function probePython(base) {
  try {
    const upstream = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(3_000),
    })
    const json = await upstream.json().catch(() => ({}))
    return {
      ok: upstream.ok,
      training: Boolean(json?.training),
      json,
    }
  } catch {
    return { ok: false, training: false, json: null }
  }
}

export function registerTrainingAiRoutes(app) {
  const base = serviceBase()

  console.log(
    `[training-ai] routes registered — proxy target ${base} (built-in spectral fallback enabled)`,
  )

  app.get('/api/training/health', async (_req, res) => {
    const py = await probePython(base)
    if (py.training) {
      const json = py.json || {}
      return res.status(200).json({
        status: json.status || 'ok',
        available: true,
        training: true,
        onnx: Boolean(json.onnx),
        model_ready: Boolean(json.model_ready),
        engine: json.engine,
        model: json.model,
        device: json.device,
        builtin_fallback: false,
      })
    }
    return res.status(200).json(builtinTrainingHealth())
  })

  app.post('/api/training/start', express.json({ limit: BODY_LIMIT }), async (req, res) => {
    const py = await probePython(base)
    if (py.training) {
      try {
        const { status, json } = await forwardJson(`${base}/training/start`, {
          method: 'POST',
          body: req.body,
          timeoutMs: 180_000,
        })
        if (status < 500) return res.status(status).json(json)
      } catch (error) {
        const detail = String(error?.message || error)
        if (!isOfflineDetail(detail) && isTimeoutDetail(detail)) {
          return res.status(504).json({
            error: 'Training service is busy starting a job. Wait a moment and retry.',
            detail,
          })
        }
      }
    }
    try {
      const jobId = startBuiltinTrainingJob(req.body)
      return res.status(200).json({ job_id: jobId })
    } catch (error) {
      return res.status(422).json({
        error: String(error?.message || error),
        detail: String(error?.message || error),
      })
    }
  })

  app.get('/api/training/models', async (_req, res) => {
    const builtin = listBuiltinModels()
    const py = await probePython(base)
    if (!py.ok) return res.status(200).json(builtin)
    try {
      const { status, json } = await forwardJson(`${base}/training/models`, {
        timeoutMs: 10_000,
      })
      if (status >= 400) return res.status(200).json(builtin)
      const pythonModels = Array.isArray(json?.models) ? json.models : []
      const merged = [...pythonModels, ...builtin.models]
      return res.status(200).json({ models: merged, count: merged.length })
    } catch {
      return res.status(200).json(builtin)
    }
  })

  app.get('/api/training/models/:modelId', async (req, res) => {
    const modelId = String(req.params.modelId || '').trim()
    if (!modelId) return res.status(400).json({ error: 'modelId is required.' })
    if (isBuiltinTrainingJobId(modelId)) {
      const model = getBuiltinModel(modelId)
      if (!model) return res.status(404).json({ error: 'Model not found', detail: 'Model not found' })
      return res.status(200).json(model)
    }
    const py = await probePython(base)
    if (py.ok) {
      try {
        const { status, json } = await forwardJson(
          `${base}/training/models/${encodeURIComponent(modelId)}`,
          { timeoutMs: 10_000 },
        )
        if (status < 500) return res.status(status).json(json)
      } catch {
        /* fall through */
      }
    }
    const model = getBuiltinModel(modelId)
    if (!model) return res.status(404).json({ error: 'Model not found', detail: 'Model not found' })
    return res.status(200).json(model)
  })

  app.get('/api/training/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' })
    if (isBuiltinTrainingJobId(jobId)) {
      const job = getBuiltinTrainingJob(jobId)
      if (!job) return res.status(404).json({ error: 'Job not found', detail: 'Job not found' })
      return res.status(200).json(job)
    }
    try {
      const { status, json } = await forwardJson(`${base}/training/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        timeoutMs: POLL_TIMEOUT_MS,
      })
      if (status !== 404) return res.status(status).json(json)
    } catch (error) {
      const detail = String(error?.message || error)
      if (isTimeoutDetail(detail) && !isOfflineDetail(detail)) {
        return res.status(504).json({
          error: 'Training poll timed out (service busy).',
          transient: true,
          detail,
        })
      }
    }
    const job = getBuiltinTrainingJob(jobId)
    if (!job) return res.status(404).json({ error: 'Job not found', detail: 'Job not found' })
    return res.status(200).json(job)
  })

  app.post('/api/training/:jobId/cancel', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' })
    if (isBuiltinTrainingJobId(jobId)) {
      const ok = cancelBuiltinTrainingJob(jobId)
      if (!ok) return res.status(404).json({ error: 'Job not found', detail: 'Job not found' })
      return res.status(200).json({ ok: true, job_id: jobId })
    }
    try {
      const { status, json } = await forwardJson(
        `${base}/training/${encodeURIComponent(jobId)}/cancel`,
        { method: 'POST', timeoutMs: POLL_TIMEOUT_MS },
      )
      return res.status(status).json(json)
    } catch (error) {
      if (cancelBuiltinTrainingJob(jobId)) return res.status(200).json({ ok: true, job_id: jobId })
      return res.status(502).json({
        error: 'Could not cancel training job.',
        detail: String(error?.message || error),
      })
    }
  })

  app.post('/api/inference/start', express.json({ limit: BODY_LIMIT }), async (req, res) => {
    const modelId = String(req.body?.model_id || req.body?.modelId || '').trim()
    if (isBuiltinTrainingJobId(modelId)) {
      const jobId = startBuiltinInferenceJob(req.body)
      return res.status(200).json({ job_id: jobId })
    }
    const py = await probePython(base)
    if (py.ok) {
      try {
        const { status, json } = await forwardJson(`${base}/inference/start`, {
          method: 'POST',
          body: req.body,
          timeoutMs: INFER_TIMEOUT_MS,
        })
        if (status < 500) return res.status(status).json(json)
      } catch (error) {
        const detail = String(error?.message || error)
        if (!isOfflineDetail(detail) && isTimeoutDetail(detail)) {
          return res.status(504).json({
            error: 'Inference service is busy. Wait a moment and retry.',
            detail,
          })
        }
      }
    }
    try {
      const jobId = startBuiltinInferenceJob(req.body)
      return res.status(200).json({ job_id: jobId })
    } catch (error) {
      return res.status(422).json({
        error: String(error?.message || error),
        detail: String(error?.message || error),
      })
    }
  })

  app.get('/api/inference/:jobId', async (req, res) => {
    const jobId = String(req.params.jobId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId is required.' })
    if (isBuiltinInferenceJobId(jobId)) {
      const job = getBuiltinInferenceJob(jobId)
      if (!job) return res.status(404).json({ error: 'Job not found', detail: 'Job not found' })
      return res.status(200).json(job)
    }
    try {
      const { status, json } = await forwardJson(`${base}/inference/${encodeURIComponent(jobId)}`, {
        method: 'GET',
        timeoutMs: POLL_TIMEOUT_MS,
      })
      if (status !== 404) return res.status(status).json(json)
    } catch (error) {
      const detail = String(error?.message || error)
      if (isTimeoutDetail(detail) && !isOfflineDetail(detail)) {
        return res.status(504).json({
          error: 'Inference poll timed out (service busy).',
          transient: true,
          detail,
        })
      }
    }
    const job = getBuiltinInferenceJob(jobId)
    if (!job) return res.status(404).json({ error: 'Job not found', detail: 'Job not found' })
    return res.status(200).json(job)
  })
}
