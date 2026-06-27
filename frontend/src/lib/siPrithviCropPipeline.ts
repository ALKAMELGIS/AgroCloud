/**
 * Client for the Prithvi multi-temporal crop classification pipeline.
 *
 * Drives the async job on the backend orchestrator (`/api/crop-classification/*`):
 *   AOI → Sentinel Hub (3 timesteps) → preprocessing → Prithvi inference → classification.
 *
 * @see backend/server/cropClassificationProxy.js
 */

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

const BASE = '/api/crop-classification'

/**
 * Build a CORS-safe URL for a Hugging Face Space prediction image so it can be
 * used as a Mapbox/MapLibre `image` source (the HF file endpoint omits CORS headers).
 */
export function cropPredictionImageUrl(remoteUrl: string): string {
  return `${BASE}/proxy-image?url=${encodeURIComponent(remoteUrl)}`
}

export async function fetchCropClassificationConfig(): Promise<CropClassificationConfig | null> {
  try {
    const res = await fetch(`${BASE}/config`)
    if (!res.ok) return null
    return (await res.json()) as CropClassificationConfig
  } catch {
    return null
  }
}

async function startJob(body: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `Failed to start job (HTTP ${res.status})`)
  if (!json?.jobId) throw new Error('Backend did not return a jobId')
  return json.jobId as string
}

export function startAoiJob(input: RunAoiInput): Promise<string> {
  return startJob({
    mode: 'aoi',
    aoi: input.aoi,
    season: input.season,
    timesteps: input.timesteps ?? 3,
  })
}

export function startChipJob(imageUrl: string): Promise<string> {
  return startJob({ mode: 'chip', imageUrl })
}

export async function getJob(jobId: string): Promise<CropClassificationJob> {
  const res = await fetch(`${BASE}/jobs/${jobId}`)
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
