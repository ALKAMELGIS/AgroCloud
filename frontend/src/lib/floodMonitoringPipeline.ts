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
  /** Optional scene / acquisition metadata for reporting. */
  postItemId?: string | null
  preItemId?: string | null
  polarization?: string | null
  sourceLabel?: string | null
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

/** Error thrown when a probed backend route turns out to be unreachable mid-request. */
function backendUnavailableError(): Error {
  return new Error('Flood monitoring backend became unreachable. Please retry.')
}

/**
 * In-browser job registry for the client-side flood engine.
 *
 * On a static deployment with no Node backend, the SAR pipeline runs fully in the
 * browser (Sentinel-1 via the Microsoft Planetary Computer, no auth). Its progressive
 * snapshots are stored here so the existing `getFloodJob`/`pollFloodJob` polling flow
 * works unchanged (no UI changes required).
 */
const localJobs = new Map<string, FloodMonitoringJob>()

function newLocalJobId(): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `local-${rnd}`
}

export async function fetchFloodMonitoringConfig(): Promise<FloodMonitoringConfig | null> {
  // Prefer a live backend (it unlocks the optional Sentinel Hub / CDSE OAuth higher-tier
  // source). When none is reachable — static deployment / shared link — the tool still
  // runs fully in the browser against the Planetary Computer (free, no auth), so report
  // `configured: true` instead of gating the panel behind "source unavailable".
  if (!(await ensureBackendAvailable())) {
    return {
      configured: true,
      source: 'sentinel-1-rtc (planetary computer · in-browser)',
      hint: null,
    }
  }
  try {
    const res = await fetch(floodApiUrl('/config'))
    noteApiResponse(res.status)
    if (!res.ok) {
      return { configured: true, source: 'sentinel-1-rtc (planetary computer · in-browser)', hint: null }
    }
    return (await res.json()) as FloodMonitoringConfig
  } catch {
    return { configured: true, source: 'sentinel-1-rtc (planetary computer · in-browser)', hint: null }
  }
}

export async function startFloodJob(input: RunFloodInput): Promise<string> {
  // Prefer the backend when one is reachable (same-origin Node or a configured remote
  // origin) — it also unlocks the optional Sentinel Hub / CDSE OAuth source. Otherwise
  // run the SAR pipeline fully in the browser so Flood Monitoring works on a static
  // deployment with the SAME Sentinel-1 data the local backend uses (Planetary Computer).
  const backendReachable = await ensureBackendAvailable()
  if (!backendReachable && !configuredApiOrigin()) {
    const jobId = newLocalJobId()
    localJobs.set(jobId, {
      id: jobId,
      status: 'queued',
      progress: 0.02,
      message: 'Queued (in-browser SAR engine)',
      result: null,
      error: null,
    })
    // Lazy-load the engine so its code (incl. the geotiff decoder) is only fetched when
    // actually needed and stays out of the initial bundle on backend-served deployments.
    void import('./floodMonitoringClientEngine')
      .then(({ runClientFloodMonitoring }) =>
        runClientFloodMonitoring(jobId, input, job => localJobs.set(jobId, job)),
      )
      .catch(err => {
        localJobs.set(jobId, {
          id: jobId,
          status: 'error',
          progress: 1,
          message: 'Flood analysis failed.',
          result: null,
          error: err instanceof Error ? err.message : String(err),
        })
      })
    return jobId
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
  // Client-side (in-browser) jobs are served from the local registry.
  const local = localJobs.get(jobId)
  if (local) return local
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
