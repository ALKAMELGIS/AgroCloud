/**
 * Client for the SAR-based flood monitoring pipeline.
 *
 * Drives the async job on the backend orchestrator (`/api/flood-monitoring/*`):
 *   AOI → Sentinel-1 GRD (pre/post) → SAR change detection → flood extent + change rasters + stats.
 *
 * @see backend/server/floodMonitoringProxy.js
 */

import {
  apiUrl,
  configuredApiOrigin,
  ensureBackendAvailable,
  noteApiResponse,
} from './apiOrigin'

export type FloodMonitoringJobStatus =
  | 'queued'
  | 'fetching'
  | 'detecting'
  | 'vectorizing'
  | 'done'
  | 'error'

export type FloodBounds = [number, number, number, number] // [w, s, e, n]

export type FloodClassStat = { name: string; color: string; pct: number; areaHa: number }

export type FloodMonitoringStats = {
  aoiHa: number
  floodedHa: number
  pctInundated: number
  preWaterHa: number
  postWaterHa: number
  mode: 'change-detection' | 'single-date'
  thresholdDb: number
  preDate: string | null
  postDate: string | null
  resolution: string
}

export type FloodMonitoringResult = {
  bounds: FloodBounds
  flood: { url: string; bounds: FloodBounds }
  change: { url: string; bounds: FloodBounds }
  vector: GeoJSON.FeatureCollection
  stats: FloodMonitoringStats
  classStats: FloodClassStat[]
}

export type FloodMonitoringJob = {
  id: string
  status: FloodMonitoringJobStatus
  progress: number
  message: string
  result: FloodMonitoringResult | null
  error: string | null
}

export type FloodMonitoringConfig = {
  configured: boolean
  source: string
  hint: string | null
}

export type RunFloodInput = {
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon
  /** Post-event (flood) acquisition date (YYYY-MM-DD). */
  postDate: string
  /** Optional pre-event baseline date for change detection (YYYY-MM-DD). */
  preDate?: string
  /** VV backscatter (dB) below which a pixel is treated as open water. Default -17. */
  threshold?: number
}

export const FLOOD_PIPELINE_STAGES: Array<{ status: FloodMonitoringJobStatus; label: string }> = [
  { status: 'fetching', label: 'Fetch Sentinel-1 GRD (VV/VH)' },
  { status: 'detecting', label: 'SAR change detection' },
  { status: 'vectorizing', label: 'Flood rasters & boundaries' },
  { status: 'done', label: 'Flood extent ready' },
]

/** Backend path for a flood-monitoring sub-route (resolved via the shared origin helper). */
function floodApiUrl(path: string): string {
  return apiUrl(`/api/flood-monitoring${path}`)
}

/** Error thrown when this static deployment has no backend to run the pipeline against. */
function backendUnavailableError(): Error {
  return new Error(
    'Flood monitoring needs the Node backend. This static deployment has no API — set VITE_AGRI_API_SECRETS_URL to your backend origin.',
  )
}

export async function fetchFloodMonitoringConfig(): Promise<FloodMonitoringConfig | null> {
  // Proactively confirm a live backend before touching `/api/*`. On static hosts the
  // health probe fails up-front, so we never fire the doomed `/config` GET that 404s
  // and floods the console.
  if (!(await ensureBackendAvailable())) return null
  try {
    const res = await fetch(floodApiUrl('/config'))
    noteApiResponse(res.status)
    if (!res.ok) return null
    return (await res.json()) as FloodMonitoringConfig
  } catch {
    return null
  }
}

export async function startFloodJob(input: RunFloodInput): Promise<string> {
  // No co-located backend → don't POST to the static CDN (returns 405). Probe first and
  // fail fast with a clear, actionable message instead of a doomed network request.
  if (!(await ensureBackendAvailable()) && !configuredApiOrigin()) {
    throw backendUnavailableError()
  }
  let res: Response
  try {
    res = await fetch(floodApiUrl('/run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        aoi: input.aoi,
        postDate: input.postDate,
        preDate: input.preDate || undefined,
        threshold: input.threshold,
      }),
    })
  } catch {
    throw new Error('Cannot reach the flood-monitoring backend. Check your connection or backend URL.')
  }
  const unreachable = noteApiResponse(res.status)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (unreachable && !configuredApiOrigin()) {
      throw backendUnavailableError()
    }
    throw new Error(json?.error || `Failed to start flood job (HTTP ${res.status})`)
  }
  if (!json?.jobId) throw new Error('Backend did not return a jobId')
  return json.jobId as string
}

export async function getFloodJob(jobId: string): Promise<FloodMonitoringJob> {
  const res = await fetch(floodApiUrl(`/jobs/${jobId}`))
  noteApiResponse(res.status)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Job lookup failed (HTTP ${res.status})`)
  return json as FloodMonitoringJob
}

const TERMINAL: FloodMonitoringJobStatus[] = ['done', 'error']

export async function pollFloodJob(
  jobId: string,
  onUpdate: (job: FloodMonitoringJob) => void,
  signal?: AbortSignal,
  intervalMs = 1500,
): Promise<FloodMonitoringJob> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const job = await getFloodJob(jobId)
    onUpdate(job)
    if (TERMINAL.includes(job.status)) return job
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}
