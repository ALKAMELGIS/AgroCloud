/**
 * Agri Field Boundary Detection client — Mask R-CNN instance segmentation
 * via `/api/agri-field-boundary/*` (Node proxy → FastAPI service).
 */

const BASE = '/api/agri-field-boundary'

export type FieldImagerySource =
  | 'basemap'
  | 'fow'
  | 'sentinel2'
  | 'landsat'
  | 'planet'
  | 'airbus'
  | 'drone'
  | 'geotiff'
  | 'png'
  | 'jpeg'

export type FieldBoundaryRequest = {
  image?: string
  bbox: [number, number, number, number]
  aoi?: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Feature | GeoJSON.FeatureCollection
  minConfidence?: number
  minAreaM2?: number
  source?: FieldImagerySource
  highRes?: boolean
  signal?: AbortSignal
}

export type FieldBoundaryResult = {
  geojson: GeoJSON.FeatureCollection
  count: number
  score: number
  engine: string
  device: string
  stats: { field: number }
  aoiApplied: boolean
}

export class FieldBoundaryServiceError extends Error {
  readonly offline: boolean
  constructor(message: string, offline = false) {
    super(message)
    this.name = 'FieldBoundaryServiceError'
    this.offline = offline
  }
}

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

function parseResult(json: Record<string, unknown>): FieldBoundaryResult {
  const stats = (json.stats || {}) as { field?: number }
  return {
    geojson: (json.geojson as GeoJSON.FeatureCollection) ?? { type: 'FeatureCollection', features: [] },
    count: Number(json.count) || 0,
    score: Number(json.score) || 0,
    engine: String(json.engine || 'unknown'),
    device: String(json.device || 'cpu'),
    stats: { field: Number(stats.field) || 0 },
    aoiApplied: Boolean(json.aoi_applied),
  }
}

function bodyOf(req: FieldBoundaryRequest) {
  const source = req.source ?? 'basemap'
  return {
    image: req.image ?? '',
    bbox: req.bbox,
    aoi: req.aoi ?? null,
    min_confidence: req.minConfidence ?? 0.45,
    min_area_m2: req.minAreaM2 ?? 200,
    source,
    high_res: req.highRes !== false,
  }
}

export async function fetchFowFieldBoundaries(
  req: Omit<FieldBoundaryRequest, 'image' | 'source'>,
): Promise<FieldBoundaryResult> {
  let res: Response
  try {
    res = await fetch(`${BASE}/fow-aoi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bbox: req.bbox,
        aoi: req.aoi ?? null,
        min_area_m2: req.minAreaM2 ?? 200,
      }),
      signal: req.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new FieldBoundaryServiceError('Could not reach the field-boundary service.', true)
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string }
  await throwIfFailed(res, json)
  return parseResult(json)
}

async function throwIfFailed(res: Response, json: { error?: string }) {
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    throw new FieldBoundaryServiceError(
      json?.error ||
        'Field-boundary service offline — run backend/services/agri-field-boundary (port 8092).',
      true,
    )
  }
  if (!res.ok) {
    throw new FieldBoundaryServiceError(json?.error || `Field boundary detection failed (HTTP ${res.status}).`)
  }
}

export async function startFieldBoundaryJob(
  req: FieldBoundaryRequest,
): Promise<{ jobId: string }> {
  let res: Response
  try {
    res = await fetch(`${BASE}/detect-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyOf(req)),
      signal: req.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new FieldBoundaryServiceError('Could not reach the field-boundary service.', true)
  }
  const json = (await res.json().catch(() => ({}))) as { job_id?: string; error?: string }
  await throwIfFailed(res, json)
  const jobId = String(json.job_id || '').trim()
  if (!jobId) throw new FieldBoundaryServiceError('Service did not return a job_id.')
  return { jobId }
}

export async function fetchFieldBoundaryJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<{
  status: string
  progress: number
  stage: string
  error?: string | null
  result?: FieldBoundaryResult
}> {
  let res: Response
  try {
    res = await fetch(`${BASE}/detect-job/${encodeURIComponent(jobId)}`, { signal })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new FieldBoundaryServiceError('Could not poll field-boundary job.', true)
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string }
  await throwIfFailed(res, json)
  return {
    status: String(json.status || 'running'),
    progress: Number(json.progress) || 0,
    stage: String(json.stage || ''),
    error: (json.error as string | null) ?? null,
    result: json.result ? parseResult(json.result as Record<string, unknown>) : undefined,
  }
}

/** Start async job and poll (~500ms) until GeoJSON is ready. */
export async function detectFieldBoundaries(
  req: FieldBoundaryRequest,
  onProgress?: (progress: number, stage: string) => void,
): Promise<FieldBoundaryResult> {
  // Prefer async job; fall back to sync /detect if job route missing.
  try {
    const { jobId } = await startFieldBoundaryJob(req)
    const start = Date.now()
    const timeout = 15 * 60 * 1000
    while (Date.now() - start < timeout) {
      if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const job = await fetchFieldBoundaryJob(jobId, req.signal)
      onProgress?.(job.progress, job.stage)
      if (job.status === 'done') {
        if (!job.result) throw new FieldBoundaryServiceError('Job finished without a result.')
        return job.result
      }
      if (job.status === 'error') {
        throw new FieldBoundaryServiceError(job.error || 'Field boundary job failed.')
      }
      await sleep(500, req.signal)
    }
    throw new FieldBoundaryServiceError('Timed out waiting for field boundary detection.')
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    const msg = String((err as Error)?.message || err)
    if (!/Route not found/i.test(msg)) throw err
  }

  onProgress?.(10, 'scanning')
  let res: Response
  try {
    res = await fetch(`${BASE}/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyOf(req)),
      signal: req.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new FieldBoundaryServiceError('Could not reach the field-boundary service.', true)
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string }
  await throwIfFailed(res, json)
  onProgress?.(100, 'done')
  return parseResult(json)
}
