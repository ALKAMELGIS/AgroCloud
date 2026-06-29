/**
 * Client for the Prithvi multi-temporal crop classification pipeline.
 *
 * Drives the async job on the backend orchestrator (`/api/crop-classification/*`):
 *   AOI → Sentinel Hub (3 timesteps) → preprocessing → Prithvi inference → classification.
 *
 * @see backend/server/cropClassificationProxy.js
 */

import {
  apiUrl,
  configuredApiOrigin,
  ensureBackendAvailable,
  noteApiResponse,
} from './apiOrigin'

export type CropClassificationClass = {
  id: number
  name: string
  color: string
}

export type CropClassificationConfig = {
  space: string
  selfInference: boolean
  classes: CropClassificationClass[]
}

/** Prithvi prediction palette (USDA CDL-style classes shown in the demo legend). */
export const PRITHVI_CROP_CLASSES: CropClassificationClass[] = [
  { id: 1, name: 'Natural vegetation', color: '#f5b6c9' },
  { id: 2, name: 'Forest', color: '#a4d08c' },
  { id: 3, name: 'Corn', color: '#f6e700' },
  { id: 4, name: 'Soybeans', color: '#1f7a1f' },
  { id: 5, name: 'Wetlands', color: '#9fd4cf' },
  { id: 6, name: 'Developed/Barren', color: '#9a9a9a' },
  { id: 7, name: 'Open Water', color: '#4b5aa7' },
  { id: 8, name: 'Winter Wheat', color: '#7a5a1e' },
  { id: 9, name: 'Alfalfa', color: '#ff66d1' },
  { id: 10, name: 'Fallow/Idle cropland', color: '#d9d98c' },
  { id: 11, name: 'Cotton', color: '#e30613' },
  { id: 12, name: 'Sorghum', color: '#f5a000' },
]

export const PIPELINE_STAGES: Array<{ status: CropClassificationJobStatus; label: string }> = [
  { status: 'fetching', label: 'Detect country + fetch spectral series' },
  { status: 'preprocessing', label: 'Build NDVI phenology signatures' },
  { status: 'inferring', label: 'Crop classification' },
  { status: 'done', label: 'Crop Type layer' },
]

export type CropClassificationJobStatus =
  | 'queued'
  | 'fetching'
  | 'preprocessing'
  | 'inferring'
  | 'done'
  | 'error'

export type CropClassLegendItem = {
  id: string | number
  name: string
  nameAr?: string
  color: string
  kind?: 'crop' | 'landcover'
}

export type CropClassificationResult = {
  engine?: 'country' | 'prithvi'
  country?: { code: string; name: string; source: string } | null
  legend?: CropClassLegendItem[] | null
  scenes?: { t1: string | null; t2: string | null; t3: string | null }
  dates?: string[]
  prediction?: { url: string | null; bounds: [number, number, number, number] | null }
  classStats?: Array<{ id?: string; name: string; pct: number; areaHa?: number }> | null
  inferenceAvailable?: boolean
}

export type CropClassificationJob = {
  id: string
  mode: 'aoi' | 'chip'
  status: CropClassificationJobStatus
  progress: number
  message: string
  result: CropClassificationResult | null
  error: string | null
}

export type RunAoiInput = {
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon
  season: { start: string; end: string }
  timesteps?: number
}

/** Backend path for a crop-classification sub-route (resolved via the shared origin helper). */
function cropApiUrl(path: string): string {
  return apiUrl(`/api/crop-classification${path}`)
}

/** Error thrown when this static deployment has no backend to run the pipeline against. */
function backendUnavailableError(): Error {
  return new Error(
    'Crop classification needs the Node backend. This static deployment has no API — set VITE_AGRI_API_SECRETS_URL to your backend origin.',
  )
}

/**
 * Build a CORS-safe URL for a Hugging Face Space prediction image so it can be
 * used as a Mapbox/MapLibre `image` source (the HF file endpoint omits CORS headers).
 */
export function cropPredictionImageUrl(remoteUrl: string): string {
  return cropApiUrl(`/proxy-image?url=${encodeURIComponent(remoteUrl)}`)
}

export async function fetchCropClassificationConfig(): Promise<CropClassificationConfig | null> {
  // Proactively confirm a live backend before touching `/api/*`. On static hosts the
  // health probe fails up-front, so we never fire the doomed `/config` GET that 404s
  // and floods the console.
  if (!(await ensureBackendAvailable())) return null
  try {
    const res = await fetch(cropApiUrl('/config'))
    noteApiResponse(res.status)
    if (!res.ok) return null
    return (await res.json()) as CropClassificationConfig
  } catch {
    return null
  }
}

async function startJob(body: Record<string, unknown>): Promise<string> {
  // No co-located backend → don't POST to the static CDN (returns 405). Probe first and
  // fail fast with a clear, actionable message instead of a doomed network request.
  if (!(await ensureBackendAvailable()) && !configuredApiOrigin()) {
    throw backendUnavailableError()
  }
  let res: Response
  try {
    res = await fetch(cropApiUrl('/run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Cannot reach the crop-classification backend. Check your connection or backend URL.')
  }
  const unreachable = noteApiResponse(res.status)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    // On static hosting (e.g. GitHub Pages) there is no Node API at this origin,
    // so the CDN rejects the POST with 404/405. Point the build at the backend.
    if (unreachable && !configuredApiOrigin()) {
      throw backendUnavailableError()
    }
    throw new Error(json?.error || `Failed to start job (HTTP ${res.status})`)
  }
  if (!json?.jobId) throw new Error('Backend did not return a jobId')
  return json.jobId as string
}

/**
 * In-browser job registry for the client-side country engine. On a static
 * deployment (no Node backend) AOI classification runs entirely in the browser;
 * its progressive snapshots are stored here so the existing `getJob`/`pollJob`
 * polling flow works unchanged (no UI changes required).
 */
const localJobs = new Map<string, CropClassificationJob>()

function newLocalJobId(): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `local-${rnd}`
}

export async function startAoiJob(input: RunAoiInput): Promise<string> {
  // Prefer the backend when one is reachable (same-origin Node or a configured
  // remote origin) — it also unlocks the heavy Prithvi engine. Otherwise fall
  // back to the deterministic country engine running fully in the browser so the
  // tool keeps working on a static deployment with no API.
  const backendReachable = await ensureBackendAvailable()
  if (backendReachable || configuredApiOrigin()) {
    return startJob({
      mode: 'aoi',
      aoi: input.aoi,
      season: input.season,
      timesteps: input.timesteps ?? 3,
    })
  }

  const jobId = newLocalJobId()
  localJobs.set(jobId, {
    id: jobId,
    mode: 'aoi',
    status: 'queued',
    progress: 0,
    message: 'Starting in-browser classification…',
    result: null,
    error: null,
  })
  // Lazy-load the engine so its code is only fetched when actually needed (and
  // kept out of the initial bundle on backend-served deployments).
  void import('./siCropClassificationClientEngine')
    .then(({ runClientAoiCropClassification }) =>
      runClientAoiCropClassification(jobId, input, job => localJobs.set(jobId, job)),
    )
    .catch(err => {
      localJobs.set(jobId, {
        id: jobId,
        mode: 'aoi',
        status: 'error',
        progress: 1,
        message: 'Pipeline failed.',
        result: null,
        error: String((err as Error)?.message || err),
      })
    })
  return jobId
}

export function startChipJob(imageUrl: string): Promise<string> {
  return startJob({ mode: 'chip', imageUrl })
}

export async function getJob(jobId: string): Promise<CropClassificationJob> {
  // Client-side (in-browser) jobs are served from the local registry.
  const local = localJobs.get(jobId)
  if (local) return local
  const res = await fetch(cropApiUrl(`/jobs/${jobId}`))
  noteApiResponse(res.status)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Job lookup failed (HTTP ${res.status})`)
  return json as CropClassificationJob
}

const TERMINAL: CropClassificationJobStatus[] = ['done', 'error']

/**
 * Poll a job until it reaches a terminal state.
 * @param onUpdate called on every poll with the latest job snapshot.
 * @param signal abort to stop polling early.
 */
export async function pollJob(
  jobId: string,
  onUpdate: (job: CropClassificationJob) => void,
  signal?: AbortSignal,
  intervalMs = 1500,
): Promise<CropClassificationJob> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const job = await getJob(jobId)
    onUpdate(job)
    if (TERMINAL.includes(job.status)) return job
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}
