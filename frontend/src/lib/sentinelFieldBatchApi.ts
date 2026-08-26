import type { GeoJSON } from 'geojson'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'

export type SentinelFieldBatchInput = {
  fieldKey: string
  geometry: GeoJSON.Geometry
}

export type SentinelFieldBatchJobProgress = {
  done: number
  total: number
  groups: number
  groupIndex: number
}

export type SentinelFieldBatchJobResponse = {
  id: string
  status: 'queued' | 'running' | 'done' | 'error'
  progress: SentinelFieldBatchJobProgress
  fieldCount: number
  groupCount: number
  results: Record<
    string,
    {
      daily: SentinelHubDailyIndexMeans[]
      source: 'live' | 'sample'
    }
  >
  error: string | null
  updatedAt: number
}

/** Use server spatial batch when at least this many uncached fields need fetching. */
export const SENTINEL_FIELD_BATCH_SERVER_THRESHOLD = 3

const POLL_MS = 450
const JOB_TIMEOUT_MS = 240_000

function apiBase(): string {
  if (typeof window !== 'undefined' && window.location?.origin) return ''
  return process.env.VITE_API_BASE || ''
}

export async function startSentinelFieldBatchJob(options: {
  fields: SentinelFieldBatchInput[]
  referenceDate: string
  lookbackDays?: number
  maxCloudCoverage?: number
  signal?: AbortSignal
}): Promise<{ jobId: string; groupCount: number }> {
  const res = await fetch(`${apiBase()}/api/sentinel-hub/batch/fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      fields: options.fields,
      referenceDate: options.referenceDate,
      lookbackDays: options.lookbackDays,
      maxCloudCoverage: options.maxCloudCoverage,
    }),
    signal: options.signal,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(json?.error || `Batch job failed (${res.status})`))
  }
  const jobId = String(json?.jobId || '')
  if (!jobId) throw new Error('Batch job did not return jobId.')
  return { jobId, groupCount: Number(json?.groupCount) || 0 }
}

export async function fetchSentinelFieldBatchJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<SentinelFieldBatchJobResponse> {
  const res = await fetch(`${apiBase()}/api/sentinel-hub/batch/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(json?.error || `Batch job poll failed (${res.status})`))
  }
  return json as SentinelFieldBatchJobResponse
}

export async function runSentinelFieldBatchJob(options: {
  fields: SentinelFieldBatchInput[]
  referenceDate: string
  lookbackDays?: number
  maxCloudCoverage?: number
  signal?: AbortSignal
  onProgress?: (p: SentinelFieldBatchJobProgress) => void
}): Promise<Map<string, SentinelHubDailyIndexMeans[]>> {
  const { jobId } = await startSentinelFieldBatchJob(options)
  const started = Date.now()

  while (Date.now() - started < JOB_TIMEOUT_MS) {
    if (options.signal?.aborted) throw new Error('aborted')
    const job = await fetchSentinelFieldBatchJob(jobId, options.signal)
    options.onProgress?.(job.progress)

    if (job.status === 'done') {
      const map = new Map<string, SentinelHubDailyIndexMeans[]>()
      for (const [fieldKey, row] of Object.entries(job.results || {})) {
        map.set(fieldKey, Array.isArray(row?.daily) ? row.daily : [])
      }
      return map
    }
    if (job.status === 'error') {
      throw new Error(job.error || 'Batch job failed.')
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS))
  }

  throw new Error('Batch job timed out.')
}
