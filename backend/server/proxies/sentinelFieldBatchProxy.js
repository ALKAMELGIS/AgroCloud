/**
 * Async batch Sentinel field index jobs — spatial grouping + shared scene grids.
 */
import crypto from 'crypto'
import { resolveSentinelHubWmsConfig, isSentinelHubStatisticsProxyConfigured } from './sentinelHubStatisticsProxy.js'
import { processFieldsSpatialBatch, spatialGroupFields } from './sentinelFieldBatchEngine.js'

const JOB_TTL_MS = 2 * 60 * 60_000
/** @type {Map<string, Record<string, unknown>>} */
const JOBS = new Map()

function newJobId() {
  return `sfb_${crypto.randomBytes(8).toString('hex')}`
}

function pruneJobs() {
  const now = Date.now()
  for (const [id, job] of JOBS.entries()) {
    if (now - Number(job.createdAt || 0) > JOB_TTL_MS) JOBS.delete(id)
  }
}

function newJob(input) {
  const job = {
    id: newJobId(),
    status: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    progress: { done: 0, total: 0, groups: 0, groupIndex: 0 },
    fieldCount: Array.isArray(input.fields) ? input.fields.length : 0,
    groupCount: 0,
    results: {},
    error: null,
  }
  JOBS.set(job.id, job)
  return job
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    fieldCount: job.fieldCount,
    groupCount: job.groupCount,
    results: job.results,
    error: job.error,
    updatedAt: job.updatedAt,
  }
}

/**
 * @param {Record<string, unknown>} job
 * @param {{ fields: Array<{ fieldKey: string; geometry?: GeoJSON.Geometry }>; lookbackDays?: number; maxCloudCoverage?: number; referenceDate?: string }} input
 * @param {{ secretsFilePath: string }} ctx
 */
async function runBatchJob(job, input, ctx) {
  job.status = 'running'
  job.updatedAt = Date.now()

  const wmsConfig = resolveSentinelHubWmsConfig(ctx.secretsFilePath)
  const groups = spatialGroupFields(input.fields)
  job.groupCount = groups.length
  job.progress = { done: 0, total: input.fields.length, groups: groups.length, groupIndex: 0 }

  try {
    const resultMap = await processFieldsSpatialBatch(input.fields, {
      wmsConfig,
      lookbackDays: input.lookbackDays,
      maxCloudCoverage: input.maxCloudCoverage,
      referenceDate: input.referenceDate,
      onProgress: p => {
        job.progress = p
        job.updatedAt = Date.now()
      },
    })

    /** @type {Record<string, { daily: unknown[]; source: string }>} */
    const results = {}
    for (const [fieldKey, daily] of resultMap.entries()) {
      results[fieldKey] = {
        daily,
        source: daily.length ? 'live' : 'sample',
      }
    }
    job.results = results
    job.status = 'done'
  } catch (err) {
    job.status = 'error'
    job.error = err instanceof Error ? err.message : String(err)
  }
  job.updatedAt = Date.now()
}

/**
 * @param {import('express').Express} app
 * @param {{ secretsFilePath: string }} options
 */
export function registerSentinelFieldBatchRoutes(app, { secretsFilePath }) {
  app.post('/api/sentinel-hub/batch/fields', (req, res) => {
    pruneJobs()
    if (!isSentinelHubStatisticsProxyConfigured(secretsFilePath)) {
      return res.status(503).json({ error: 'Sentinel Hub statistics proxy is not configured.' })
    }

    const body = req.body || {}
    const fields = Array.isArray(body.fields) ? body.fields : []
    if (!fields.length) {
      return res.status(400).json({ error: 'fields array is required.' })
    }
    if (fields.length > 2000) {
      return res.status(400).json({ error: 'Maximum 2000 fields per batch job.' })
    }

    const sanitized = []
    for (const row of fields) {
      const fieldKey = String(row?.fieldKey || '').trim()
      const geometry = row?.geometry
      if (!fieldKey || !geometry || typeof geometry !== 'object') continue
      if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue
      sanitized.push({ fieldKey, geometry })
    }
    if (!sanitized.length) {
      return res.status(400).json({ error: 'No valid field geometries in request.' })
    }

    const job = newJob({ fields: sanitized })
    const input = {
      fields: sanitized,
      lookbackDays: body.lookbackDays,
      maxCloudCoverage: body.maxCloudCoverage,
      referenceDate: typeof body.referenceDate === 'string' ? body.referenceDate.slice(0, 10) : undefined,
    }

    res.status(202).json({
      jobId: job.id,
      status: job.status,
      fieldCount: sanitized.length,
      groupCount: spatialGroupFields(sanitized).length,
    })

    void runBatchJob(job, input, { secretsFilePath })
  })

  app.get('/api/sentinel-hub/batch/jobs/:jobId', (req, res) => {
    pruneJobs()
    const job = JOBS.get(String(req.params.jobId || ''))
    if (!job) return res.status(404).json({ error: 'Job not found or expired.' })
    res.json(publicJob(job))
  })
}
