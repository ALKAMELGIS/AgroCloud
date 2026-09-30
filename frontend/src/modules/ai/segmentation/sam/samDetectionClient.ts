/**
 * AI SAM Detection client — talks to the backend SAM proxy (`/api/sam-detection/*`),
 * which forwards a captured map view + point prompts to a Segment Anything Model
 * service and returns GIS-ready Point / LineString / Polygon GeoJSON (EPSG:4326)
 * with confidence scores, plus a translucent mask overlay.
 */

const BASE = '/api/sam-detection'

/** GIS feature geometry mode requested from the SAM service. */
export type SamFeatureMode = 'auto' | 'point' | 'line' | 'polygon'

/** A point prompt in captured-image pixel space (origin top-left). */
export type SamPixelPoint = {
  x: number
  y: number
  /** 1 = foreground (keep), 0 = background (exclude). */
  label: 0 | 1
}

export type SamSegmentRequest = {
  /** Captured RGB view as a PNG/JPEG data URL. */
  image: string
  /** WGS84 extent of the image: [west, south, east, north]. */
  bbox: [number, number, number, number]
  points: SamPixelPoint[]
  /** Optional polygon simplify tolerance in degrees. */
  simplify?: number
  /** Target GIS geometry family (auto classifies from shape metrics). */
  featureMode?: SamFeatureMode
  /** Analysis boundary — SAM runs only inside this AOI. */
  aoi?: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Feature | GeoJSON.FeatureCollection
  /** Drop GIS features below this confidence (0..1). */
  minConfidence?: number
  /** Prefer higher-resolution SAM input (up to ~1536px edge). */
  highRes?: boolean
  /**
   * Scan the entire AOI with automatic mask generation.
   * When true (default with AOI), results cover the full AOI — not only click prompts.
   */
  fullAoi?: boolean
  /** Detected object type id/label (trees, poles, …) for size filters + attributes. */
  objectType?: string | null
  /** Emit mask polygon + centroid point per instance (default true). */
  instanceSegmentation?: boolean
  signal?: AbortSignal
}

export type SamFeatureStats = { point: number; line: number; polygon: number }

export type SamSegmentResult = {
  geojson: GeoJSON.FeatureCollection
  maskPng: string | null
  width: number
  height: number
  score: number
  /** Unique instance / object count (not raw feature count). */
  count: number
  objectCount: number
  stats: SamFeatureStats
  featureMode: SamFeatureMode
  aoiApplied: boolean
}

/** Raised when the SAM endpoint is not configured / not reachable. */
export class SamDetectionServiceError extends Error {
  readonly offline: boolean
  constructor(message: string, offline = false) {
    super(message)
    this.name = 'SamDetectionServiceError'
    this.offline = offline
  }
}

export type SamDetectionConfig = { configured: boolean }

/** Whether a SAM endpoint is configured on the backend. */
export async function fetchSamDetectionConfig(signal?: AbortSignal): Promise<SamDetectionConfig> {
  try {
    const res = await fetch(`${BASE}/config`, { signal })
    if (!res.ok) return { configured: false }
    return (await res.json()) as SamDetectionConfig
  } catch {
    return { configured: false }
  }
}

type SamUpstreamPayload = {
  geojson?: GeoJSON.FeatureCollection
  mask_png?: string
  width?: number
  height?: number
  score?: number
  count?: number
  object_count?: number
  stats?: Partial<SamFeatureStats>
  feature_mode?: string
  aoi_applied?: boolean
  error?: string
}

function segmentBody(req: SamSegmentRequest) {
  return {
    image: req.image,
    bbox: req.bbox,
    points: req.points,
    simplify: req.simplify ?? null,
    multimask: true,
    feature_mode: req.featureMode ?? 'auto',
    object_type: req.objectType ?? null,
    aoi: req.aoi ?? null,
    min_confidence: req.minConfidence ?? 0.5,
    high_res: req.highRes !== false,
    full_aoi: req.fullAoi !== false,
    instance_segmentation: req.instanceSegmentation !== false,
  }
}

function parseSegmentResult(json: SamUpstreamPayload, featureMode?: SamFeatureMode): SamSegmentResult {
  const mode = (json.feature_mode || featureMode || 'auto') as SamFeatureMode
  const objectCount = Number(json.object_count ?? json.count) || 0
  return {
    geojson: json.geojson ?? { type: 'FeatureCollection', features: [] },
    maskPng: json.mask_png ?? null,
    width: Number(json.width) || 0,
    height: Number(json.height) || 0,
    score: Number(json.score) || 0,
    count: objectCount,
    objectCount,
    stats: {
      point: Number(json.stats?.point) || 0,
      line: Number(json.stats?.line) || 0,
      polygon: Number(json.stats?.polygon) || 0,
    },
    featureMode: mode,
    aoiApplied: Boolean(json.aoi_applied),
  }
}

function throwIfSamHttpFailed(res: Response, json: SamUpstreamPayload & { detail?: string }) {
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    throw new SamDetectionServiceError(
      json?.error ||
        'SAM segmentation service is offline — run backend/services/sam-detection to enable it.',
      true,
    )
  }
  if (!res.ok) {
    throw new SamDetectionServiceError(json?.error || `SAM segmentation failed (HTTP ${res.status}).`)
  }
}

/**
 * Run SAM on a captured view with foreground/background point prompts (sync).
 * Prefer `segmentWithSamJob` for full-AOI scans so the UI can show live progress.
 */
export async function segmentWithSam(req: SamSegmentRequest): Promise<SamSegmentResult> {
  let res: Response
  try {
    res = await fetch(`${BASE}/segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(segmentBody(req)),
      signal: req.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new SamDetectionServiceError(
      'Could not reach the SAM segmentation service. Check your connection or the model endpoint.',
      true,
    )
  }

  const json = (await res.json().catch(() => ({}))) as SamUpstreamPayload
  throwIfSamHttpFailed(res, json)
  return parseSegmentResult(json, req.featureMode)
}

export type SamSegmentJobStatus = {
  jobId: string
  status: 'queued' | 'running' | 'done' | 'error' | string
  /** 0–100 */
  progress: number
  stage: string
  error?: string | null
  result?: SamSegmentResult
}

const JOB_POLL_MS = 500
const JOB_TIMEOUT_MS = 15 * 60 * 1000

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

/** Start an async full-AOI SAM job; returns `{ job_id }` immediately. */
export async function startSamSegmentJob(
  req: SamSegmentRequest,
): Promise<{ jobId: string; status: string }> {
  let res: Response
  try {
    res = await fetch(`${BASE}/segment-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(segmentBody(req)),
      signal: req.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new SamDetectionServiceError(
      'Could not reach the SAM segmentation service. Check your connection or the model endpoint.',
      true,
    )
  }
  const json = (await res.json().catch(() => ({}))) as {
    job_id?: string
    status?: string
    error?: string
  }
  throwIfSamHttpFailed(res, json)
  const jobId = String(json.job_id || '').trim()
  if (!jobId) throw new SamDetectionServiceError('SAM service did not return a job_id.')
  return { jobId, status: String(json.status || 'queued') }
}

/** Poll a SAM job once. */
export async function fetchSamSegmentJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<SamSegmentJobStatus> {
  let res: Response
  try {
    res = await fetch(`${BASE}/segment-job/${encodeURIComponent(jobId)}`, { signal })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new SamDetectionServiceError('Could not poll SAM job status.', true)
  }
  const json = (await res.json().catch(() => ({}))) as {
    job_id?: string
    status?: string
    progress?: number
    stage?: string
    error?: string | null
    result?: SamUpstreamPayload
  }
  throwIfSamHttpFailed(res, json)
  return {
    jobId: String(json.job_id || jobId),
    status: String(json.status || 'running'),
    progress: Number(json.progress) || 0,
    stage: String(json.stage || ''),
    error: json.error ?? null,
    result: json.result ? parseSegmentResult(json.result) : undefined,
  }
}

/**
 * Start a SAM job and poll until done. Calls `onProgress(pct0to100, stage)` ~every 500ms.
 * Falls back to sync `/segment` when the async job route is unavailable (stale backend).
 */
export async function segmentWithSamJob(
  req: SamSegmentRequest,
  onProgress?: (progress: number, stage: string) => void,
): Promise<SamSegmentResult> {
  let jobId: string
  try {
    ;({ jobId } = await startSamSegmentJob(req))
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    const msg = String((err as Error)?.message || err)
    // Stale Node process without POST /segment-job — use sync segment instead.
    if (/Route not found/i.test(msg) || (/\b404\b/.test(msg) && /segment-job/i.test(msg))) {
      onProgress?.(8, 'scanning')
      const out = await segmentWithSam(req)
      onProgress?.(100, 'done')
      return out
    }
    throw err
  }

  const start = Date.now()
  while (Date.now() - start < JOB_TIMEOUT_MS) {
    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const job = await fetchSamSegmentJob(jobId, req.signal)
    onProgress?.(job.progress, job.stage)
    if (job.status === 'done') {
      if (!job.result) throw new SamDetectionServiceError('SAM job finished without a result.')
      return job.result
    }
    if (job.status === 'error') {
      throw new SamDetectionServiceError(job.error || 'SAM segmentation job failed.')
    }
    await sleep(JOB_POLL_MS, req.signal)
  }
  throw new SamDetectionServiceError('Timed out waiting for SAM segmentation to complete.')
}
