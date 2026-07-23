/**
 * Image Classification Wizard — server-side proxy to the FastAPI ML service.
 *
 * The heavy ML work (segmentation / training / classification / accuracy) lives in
 * the Python `image-classification` service. Raster upload + COG + XYZ tiling is
 * reused from the existing `/api/raster` stack, so this proxy only forwards ML calls.
 *
 * Step 1: `/config` is proxied live (with an offline fallback), and `/run` + `/jobs/:id`
 * are scaffolded on an in-memory JOBS map for the later async pipeline steps.
 */
import { randomUUID } from 'crypto'
import { basename } from 'path'
import { getRasterRecord } from './raster/rasterStore.js'

/** Base URL of the FastAPI ML service. */
const IMAGE_CLASSIFICATION_URL = String(
  process.env.IMAGE_CLASSIFICATION_URL || 'http://127.0.0.1:8000',
).replace(/\/$/, '')

/** @type {Map<string, any>} */
const JOBS = new Map()
const JOB_TTL_MS = 30 * 60 * 1000

function pruneJobs() {
  const now = Date.now()
  for (const [id, job] of JOBS) {
    if (now - job.updatedAt > JOB_TTL_MS) JOBS.delete(id)
  }
}

function newJob(input) {
  const id = randomUUID()
  const job = {
    id,
    kind: input.kind || 'classify',
    status: 'queued',
    progress: 0,
    message: 'Queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: null,
    error: null,
  }
  JOBS.set(id, job)
  return job
}

function setJob(job, patch, broadcast) {
  Object.assign(job, patch, { updatedAt: Date.now() })
  if (typeof broadcast === 'function') {
    broadcast({ topic: 'image-classification/job', payload: publicJob(job) })
  }
}

function publicJob(job) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    message: job.message,
    result: job.result,
    error: job.error,
  }
}

/** Offline fallback advertised when the FastAPI service is unreachable. */
function offlineConfig(reason) {
  return {
    configured: false,
    service: 'image-classification',
    classifiers: [],
    segmenters: [],
    hint: reason || 'Image classification ML service is offline. Start it to enable classification.',
  }
}

/** Build the ordered raster-path candidates the FastAPI service tries (docker volume, then host abs path). */
function rasterPathCandidates(record, rasterId) {
  const absPath = record.cogPath || record.sourcePath || null
  const fileName = absPath ? basename(absPath) : 'cog.tif'
  // In docker the uploads volume is mounted read-only at /data (see docker-compose).
  const dockerPath = `/data/${rasterId}/${fileName}`
  return [dockerPath, absPath].filter(Boolean)
}

/** Background: forward a segmentation request to FastAPI and store the result on the job. */
async function runSegmentJob(job, payload, broadcast) {
  try {
    setJob(job, { status: 'running', progress: 0.15, message: 'Segmenting raster…' }, broadcast)
    const record = getRasterRecord(payload.rasterId)
    if (!record) throw new Error(`Raster ${payload.rasterId} not found.`)

    const body = {
      raster_id: payload.rasterId,
      path_candidates: rasterPathCandidates(record, payload.rasterId),
      algorithm: payload.algorithm || 'slic',
      spectral_detail: payload.spectralDetail,
      spatial_detail: payload.spatialDetail,
      min_segment_size: payload.minSegmentSize,
    }

    const upstream = await fetch(`${IMAGE_CLASSIFICATION_URL}/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    })
    if (!upstream.ok) {
      let detail = `Segmentation service responded ${upstream.status}.`
      try {
        const err = await upstream.json()
        if (err?.detail) detail = String(err.detail)
      } catch {
        /* ignore parse errors */
      }
      throw new Error(detail)
    }
    const result = await upstream.json()
    setJob(
      job,
      {
        status: 'done',
        progress: 1,
        message: `Segmentation complete — ${result.segment_count ?? '?'} segments.`,
        result,
      },
      broadcast,
    )
  } catch (err) {
    const offline = /fetch failed|ECONNREFUSED|timeout|aborted/i.test(String(err?.message || ''))
    setJob(
      job,
      {
        status: 'error',
        progress: 1,
        message: offline
          ? 'Cannot reach the image-classification ML service. Start it (docker compose up image-classification) and retry.'
          : 'Segmentation failed.',
        error: String(err?.message || err),
      },
      broadcast,
    )
  }
}

/** Background: forward a training request to FastAPI and store the fitted-model summary. */
async function runTrainJob(job, payload, broadcast) {
  try {
    setJob(job, { status: 'running', progress: 0.2, message: 'Training classifier…' }, broadcast)
    const record = getRasterRecord(payload.rasterId)
    if (!record) throw new Error(`Raster ${payload.rasterId} not found.`)

    const body = {
      raster_id: payload.rasterId,
      path_candidates: rasterPathCandidates(record, payload.rasterId),
      classifier: payload.classifier,
      n_estimators: payload.nEstimators,
      n_clusters: payload.nClusters,
      max_samples_per_class: payload.maxSamplesPerClass,
      samples: payload.samples,
      classes: payload.classes,
    }

    const upstream = await fetch(`${IMAGE_CLASSIFICATION_URL}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    })
    if (!upstream.ok) {
      let detail = `Training service responded ${upstream.status}.`
      try {
        const err = await upstream.json()
        if (err?.detail) detail = String(err.detail)
      } catch {
        /* ignore */
      }
      throw new Error(detail)
    }
    const result = await upstream.json()
    const acc = typeof result.train_accuracy === 'number' ? ` — fit ${(result.train_accuracy * 100).toFixed(1)}%` : ''
    setJob(job, { status: 'done', progress: 1, message: `Model trained${acc}.`, result }, broadcast)
  } catch (err) {
    const offline = /fetch failed|ECONNREFUSED|timeout|aborted/i.test(String(err?.message || ''))
    setJob(
      job,
      {
        status: 'error',
        progress: 1,
        message: offline
          ? 'Cannot reach the image-classification ML service. Start it (docker compose up image-classification) and retry.'
          : 'Training failed.',
        error: String(err?.message || err),
      },
      broadcast,
    )
  }
}

/** Background: forward a classify request to FastAPI and store the colorized overlay + stats. */
async function runClassifyJob(job, payload, broadcast) {
  try {
    setJob(job, { status: 'running', progress: 0.25, message: 'Classifying raster…' }, broadcast)
    const record = getRasterRecord(payload.rasterId)
    if (!record) throw new Error(`Raster ${payload.rasterId} not found.`)

    const body = {
      raster_id: payload.rasterId,
      path_candidates: rasterPathCandidates(record, payload.rasterId),
      model_id: payload.modelId,
      classes: payload.classes,
      max_preview_dim: payload.maxPreviewDim,
    }

    const upstream = await fetch(`${IMAGE_CLASSIFICATION_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000),
    })
    if (!upstream.ok) {
      let detail = `Classification service responded ${upstream.status}.`
      try {
        const err = await upstream.json()
        if (err?.detail) detail = String(err.detail)
      } catch {
        /* ignore */
      }
      throw new Error(detail)
    }
    const result = await upstream.json()
    const n = Array.isArray(result.class_distribution) ? result.class_distribution.length : '?'
    setJob(job, { status: 'done', progress: 1, message: `Classification complete — ${n} classes.`, result }, broadcast)
  } catch (err) {
    const offline = /fetch failed|ECONNREFUSED|timeout|aborted/i.test(String(err?.message || ''))
    setJob(
      job,
      {
        status: 'error',
        progress: 1,
        message: offline
          ? 'Cannot reach the image-classification ML service. Start it (docker compose up image-classification) and retry.'
          : 'Classification failed.',
        error: String(err?.message || err),
      },
      broadcast,
    )
  }
}

/**
 * @param {import('express').Express} app
 * @param {{ secretsFilePath?: string, broadcast?: (obj: any) => void }} [options]
 */
export function registerImageClassificationRoutes(app, { broadcast } = {}) {
  app.get('/api/image-classification/config', async (_req, res) => {
    try {
      const upstream = await fetch(`${IMAGE_CLASSIFICATION_URL}/config`, {
        signal: AbortSignal.timeout(4000),
      })
      if (!upstream.ok) {
        return res.status(503).json(offlineConfig(`ML service responded ${upstream.status}.`))
      }
      const config = await upstream.json()
      res.json(config)
    } catch (err) {
      res.status(503).json(offlineConfig(`Cannot reach ML service: ${String(err?.message || err)}`))
    }
  })

  // Object-based segmentation (Step 2) — async job: 202 + jobId, poll /jobs/:id.
  app.post('/api/image-classification/segment', (req, res) => {
    pruneJobs()
    const body = req.body || {}
    const rasterId = String(body.rasterId || '').trim()
    if (!rasterId) return res.status(400).json({ error: 'rasterId is required.' })
    const payload = {
      rasterId,
      algorithm: body.algorithm === 'felzenszwalb' ? 'felzenszwalb' : 'slic',
      spectralDetail: Number.isFinite(body.spectralDetail) ? body.spectralDetail : 15,
      spatialDetail: Number.isFinite(body.spatialDetail) ? body.spatialDetail : 15,
      minSegmentSize: Number.isFinite(body.minSegmentSize) ? body.minSegmentSize : 20,
    }
    const job = newJob({ kind: 'segment' })
    res.status(202).json({ jobId: job.id })
    void runSegmentJob(job, payload, broadcast)
  })

  // Supervised/unsupervised training (Step 4) — async job.
  app.post('/api/image-classification/train', (req, res) => {
    pruneJobs()
    const body = req.body || {}
    const rasterId = String(body.rasterId || '').trim()
    if (!rasterId) return res.status(400).json({ error: 'rasterId is required.' })
    const classifier = String(body.classifier || 'random_forest')
    const samples = Array.isArray(body.samples) ? body.samples : []
    if (classifier !== 'kmeans' && samples.length === 0) {
      return res.status(400).json({ error: 'Supervised training requires training samples.' })
    }
    const payload = {
      rasterId,
      classifier,
      nEstimators: Number.isFinite(body.nEstimators) ? body.nEstimators : 200,
      nClusters: Number.isFinite(body.nClusters) ? body.nClusters : 8,
      maxSamplesPerClass: Number.isFinite(body.maxSamplesPerClass) ? body.maxSamplesPerClass : 5000,
      samples,
      classes: Array.isArray(body.classes) ? body.classes : [],
    }
    const job = newJob({ kind: 'train' })
    res.status(202).json({ jobId: job.id })
    void runTrainJob(job, payload, broadcast)
  })

  // Full-raster classification (Step 5) — async job → colorized overlay + stats.
  app.post('/api/image-classification/classify', (req, res) => {
    pruneJobs()
    const body = req.body || {}
    const rasterId = String(body.rasterId || '').trim()
    const modelId = String(body.modelId || '').trim()
    if (!rasterId) return res.status(400).json({ error: 'rasterId is required.' })
    if (!modelId) return res.status(400).json({ error: 'modelId is required (train a model first).' })
    const payload = {
      rasterId,
      modelId,
      classes: Array.isArray(body.classes) ? body.classes : [],
      maxPreviewDim: Number.isFinite(body.maxPreviewDim) ? body.maxPreviewDim : 1024,
    }
    const job = newJob({ kind: 'classify' })
    res.status(202).json({ jobId: job.id })
    void runClassifyJob(job, payload, broadcast)
  })

  app.get('/api/image-classification/jobs/:jobId', (req, res) => {
    const job = JOBS.get(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'Job not found or expired.' })
    res.json(publicJob(job))
  })

  // Assign / merge clusters (Step 6, unsupervised) — synchronous remap of the labelled raster.
  app.post('/api/image-classification/assign', async (req, res) => {
    const body = req.body || {}
    const rasterId = String(body.rasterId || '').trim()
    const modelId = String(body.modelId || '').trim()
    if (!rasterId) return res.status(400).json({ error: 'rasterId is required.' })
    if (!modelId) return res.status(400).json({ error: 'modelId is required.' })
    const assignments = Array.isArray(body.assignments) ? body.assignments : []
    if (assignments.length === 0) {
      return res.status(400).json({ error: 'assignments are required.' })
    }
    await forwardJson(
      res,
      '/assign',
      { raster_id: rasterId, model_id: modelId, assignments },
      'Class assignment',
    )
  })

  // Accuracy assessment (Step 7) — synchronous (fast point-sampling, no job polling).
  app.post('/api/image-classification/accuracy', async (req, res) => {
    const body = req.body || {}
    const rasterId = String(body.rasterId || '').trim()
    const modelId = String(body.modelId || '').trim()
    if (!rasterId) return res.status(400).json({ error: 'rasterId is required.' })
    if (!modelId) return res.status(400).json({ error: 'modelId is required.' })
    const referencePoints = Array.isArray(body.referencePoints) ? body.referencePoints : []
    if (referencePoints.length === 0) {
      return res.status(400).json({ error: 'reference points are required.' })
    }
    await forwardJson(
      res,
      '/accuracy',
      {
        raster_id: rasterId,
        model_id: modelId,
        reference_points: referencePoints,
        classes: Array.isArray(body.classes) ? body.classes : [],
      },
      'Accuracy assessment',
    )
  })

  // Stratified/equalized check-point generator (Step 7 helper) — synchronous.
  app.post('/api/image-classification/accuracy/points', async (req, res) => {
    const body = req.body || {}
    const rasterId = String(body.rasterId || '').trim()
    const modelId = String(body.modelId || '').trim()
    if (!rasterId) return res.status(400).json({ error: 'rasterId is required.' })
    if (!modelId) return res.status(400).json({ error: 'modelId is required.' })
    await forwardJson(
      res,
      '/accuracy/points',
      {
        raster_id: rasterId,
        model_id: modelId,
        method: String(body.method || 'stratified'),
        count: Number.isFinite(body.count) ? body.count : 100,
        classes: Array.isArray(body.classes) ? body.classes : [],
      },
      'Check-point generation',
    )
  })
}

/** Forward a JSON POST to the FastAPI service and relay its response (or a friendly error). */
async function forwardJson(res, path, body, label) {
  try {
    const upstream = await fetch(`${IMAGE_CLASSIFICATION_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })
    if (!upstream.ok) {
      let detail = `${label} service responded ${upstream.status}.`
      try {
        const err = await upstream.json()
        if (err?.detail) detail = String(err.detail)
      } catch {
        /* ignore */
      }
      return res.status(upstream.status === 404 ? 404 : 422).json({ error: detail })
    }
    return res.json(await upstream.json())
  } catch (err) {
    const offline = /fetch failed|ECONNREFUSED|timeout|aborted/i.test(String(err?.message || ''))
    return res.status(503).json({
      error: offline
        ? 'Cannot reach the image-classification ML service. Start it (docker compose up image-classification) and retry.'
        : `${label} failed: ${String(err?.message || err)}`,
    })
  }
}
