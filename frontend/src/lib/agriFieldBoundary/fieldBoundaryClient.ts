/**
 * Agri Field Boundary Detection client — Mask R-CNN instance segmentation
 * via `/api/agri-field-boundary/*` (Node proxy → FastAPI service).
 */

import * as turf from '@turf/turf'
import {
  regularizeFieldFootprints,
  type FootprintRegularizeMethod,
} from './fieldFootprintRegularize'
import { apiUrl, isBackendUnavailablePayload } from '../apiOrigin'

const BASE = () => apiUrl('/api/agri-field-boundary')

export type FieldImagerySource =
  | 'basemap'
  | 'delineate-fbis'
  | 'agricultural-field-delineation'
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
  /** @deprecated Unused — kept optional for older callers. */
  adminIso?: string
  highRes?: boolean
  /** Sentinel-2 acquisition day (YYYY-MM-DD) for Agricultural Field Delineation. */
  sceneDate?: string
  sceneDateFrom?: string
  sceneDateTo?: string
  year?: number
  model?: string
  signal?: AbortSignal
}

export type FieldBoundaryHealth = {
  status?: string
  /** @deprecated Unused — optional for older health payloads. */
  fow?: boolean
  /** Bundled Esri Mask R-CNN Agricultural Field Delineation (12-band S2). */
  agricultural_field_delineation?: boolean
  agricultural_field_delineation_status?: {
    ready?: boolean
    device?: string
    emd_version?: string
    info?: Record<string, unknown>
    error?: string
  }
  /** SEN2SRLite neural SR available on the Python service (optional on Hostinger). */
  sen2sr?: boolean
  sen2sr_error?: string
  offline?: boolean
  /** Map RGB / builtin detect is reachable through the AgroCloud API. */
  live?: boolean
  /** Python field engines / SEN2SR weights finished loading. */
  ready?: boolean
  /** Python service still starting — Detect Fields still works via map RGB. */
  loading?: boolean
  engine?: string
  python?: boolean
  builtin_fallback?: boolean
}

export type FieldBoundaryResult = {
  geojson: GeoJSON.FeatureCollection
  count: number
  score: number
  engine: string
  device: string
  stats: { field: number; fallback_from?: string }
  aoiApplied: boolean
}

import {
  FIELD_BOUNDARY_STROKE_COLOR,
  FIELD_BOUNDARY_STROKE_WIDTH,
} from './fieldBoundaryStyle'

export {
  FIELD_BOUNDARY_STROKE_COLOR,
  FIELD_BOUNDARY_STROKE_WIDTH,
} from './fieldBoundaryStyle'

function stampFieldStroke(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (fc.features || []).map(f => ({
      ...f,
      properties: {
        ...(f.properties || {}),
        stroke_color: FIELD_BOUNDARY_STROKE_COLOR,
        stroke: FIELD_BOUNDARY_STROKE_COLOR,
        stroke_width: FIELD_BOUNDARY_STROKE_WIDTH,
        'stroke-width': FIELD_BOUNDARY_STROKE_WIDTH,
        // Border only — exports and re-added layers must not tint field interiors.
        fill: 'none',
        fill_opacity: 0,
      },
    })),
  }
}

/**
 * Keep field edges usable on the map.
 * Optionally regularize each footprint into an oriented rectangle (clean field cadastral look).
 */
export function optimizeFieldBoundaryResult(
  result: FieldBoundaryResult,
  opts?: {
    regularizeFootprints?: boolean
    /** ArcGIS Regularize Building Footprint method. */
    regularizeMethod?: FootprintRegularizeMethod
    minFillRatio?: number
    maxAreaInflation?: number
    abutNeighborsM?: number
    softenKept?: boolean
    softenMeters?: number
  },
): FieldBoundaryResult {
  const fc = result?.geojson
  if (!fc?.features?.length) return result
  try {
    const features = fc.features.filter(f => {
      const g = f?.geometry
      if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return false
      const area = Number((f.properties as { area_m2?: number } | null)?.area_m2)
      if (Number.isFinite(area) && area > 0 && area < 1) return false
      return true
    })
    if (!features.length) return result
    // cleanCoords removes duplicate vertices without shifting edges.
    let cleaned = turf.cleanCoords({
      type: 'FeatureCollection',
      features,
    } as any) as GeoJSON.FeatureCollection
    if (opts?.regularizeFootprints !== false) {
      cleaned = regularizeFieldFootprints(cleaned, {
        method: opts?.regularizeMethod ?? 'right-angles',
        minFillRatio: opts?.minFillRatio ?? 0.65,
        maxAreaInflation: opts?.maxAreaInflation ?? 1.35,
        softenKept: opts?.softenKept !== false,
        softenMeters: opts?.softenMeters ?? (opts?.regularizeMethod === 'right-angles' ? 3.2 : 5.2),
        cadastralSnap: true,
        resolveOverlaps: true,
        abutNeighborsM: opts?.abutNeighborsM ?? 1.15,
      })
    }
    cleaned = stampFieldStroke(cleaned)
    return {
      ...result,
      geojson: cleaned?.features?.length ? cleaned : { type: 'FeatureCollection', features },
      count: (cleaned?.features || features).length,
    }
  } catch {
    return result
  }
}

export class FieldBoundaryServiceError extends Error {
  readonly offline: boolean
  readonly detail?: string
  constructor(message: string, offline = false, detail?: string) {
    super(message)
    this.name = 'FieldBoundaryServiceError'
    this.offline = offline
    this.detail = detail
  }
}

export type FieldBoundaryUserError = { short: string; detail: string }

/** Map raw backend / network errors to short toolbox-friendly copy. */
export function formatFieldBoundaryUserError(
  raw: string | null | undefined,
  opts?: { offline?: boolean; source?: FieldImagerySource; empty?: boolean },
): FieldBoundaryUserError {
  if (opts?.offline || isBackendUnavailablePayload(raw)) {
    return {
      short: 'Loading field model… Detect Fields is available on the AgroCloud API.',
      detail:
        'Map RGB detect runs on the AgroCloud API (api.eliteagrocloud.com). Retry Detect Fields on map RGB while Python field engines load.',
    }
  }

  const msg = String(raw || '').replace(/\s+/g, ' ').trim()
  if (
    /Service offline/i.test(msg) ||
    /agri-field-boundary on :8092/i.test(msg) ||
    /uvicorn app:app --port 8092/i.test(msg) ||
    /port 8092/i.test(msg)
  ) {
    return {
      short: 'Loading field model… Detect Fields is available on the AgroCloud API.',
      detail: msg,
    }
  }
  const stripUrls = (s: string) =>
    s.replace(/https?:\/\/\S+/gi, '[url]').replace(/s3:\/\/\S+/gi, '[s3]')
  const detail = stripUrls(msg).slice(0, 480)
  const source = opts?.source

  if (
    /^Not Found$/i.test(msg) ||
    /\bdetail["']?\s*:\s*["']?Not Found/i.test(msg) ||
    /Unknown (field-boundary )?job/i.test(msg)
  ) {
    return {
      short: 'Field API not reached — restart Vite so /api proxies to :3011',
      detail:
        detail ||
        'Dev proxy sent /api to a Python AI port (e.g. :8092). Restart npm run dev with PORT=3011.',
    }
  }

  if (opts?.empty || /^No (FoW )?fields/i.test(msg)) {
    if (source === 'delineate-fbis') {
      return {
        short: 'No Delineate Anything fields — lower confidence, zoom to cropland, ensure :8096',
        detail: detail || msg,
      }
    }
    if (
      source === 'basemap' ||
      source === 'sentinel2' ||
      source === 'landsat' ||
      source === 'planet' ||
      source === 'airbus'
    ) {
      return {
        short: 'No fields in map RGB — zoom to cropland, lower confidence, retry',
        detail:
          detail ||
          'Capture uses the current Esri / Google / Sentinel map as a photo (like Drone). Hide NDVI if only RGB is needed, enlarge AOI, retry.',
      }
    }
    if (
      source === 'drone' ||
      source === 'geotiff' ||
      source === 'png' ||
      source === 'jpeg'
    ) {
      return {
        short: 'No fields in this image — lower confidence or try another scene',
        detail: detail || msg,
      }
    }
    return {
      short: 'No fields found — lower confidence, enlarge AOI, or try Delineate / Map RGB',
      detail: detail || msg,
    }
  }

  if (
    /DataLoader worker .*exited unexpectedly|OpenBLAS error: Memory allocation|Cannot allocate memory|paging file is too small|std::bad_alloc/i.test(
      msg,
    )
  ) {
    return {
      short: 'Field model ran out of memory — close other apps and retry with a smaller AOI',
      detail: detail || msg,
    }
  }

  if (/duckdb|httpfs|source\.coop|FoW catalog|Fields of the World|FoW parcels|FoW requires/i.test(msg)) {
    return {
      short: 'Legacy field catalog unreachable — use Delineate Anything or Map RGB detect',
      detail: detail || msg,
    }
  }

  if (/AOI too large|max .*span|span.*°/i.test(msg)) {
    return { short: 'AOI too large — zoom in and redraw', detail: detail || msg }
  }

  if (/crop calendar|harvest date|can't be in the future|cannot be in the future/i.test(msg)) {
    return {
      short: 'Scene year too recent — pick a previous calendar year',
      detail: detail || msg,
    }
  }

  if (/offline|ECONNREFUSED|Could not reach/i.test(msg)) {
    return {
      short: 'Loading field model… Detect Fields is available on the AgroCloud API.',
      detail: detail || msg,
    }
  }

  const first = stripUrls(msg).split(/(?<=[.!?])\s+/)[0] || stripUrls(msg)
  const short = (first.length > 110 ? `${first.slice(0, 109)}…` : first) || 'Field boundary detection failed.'
  return { short, detail: detail || short }
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
  const stats = (json.stats || {}) as { field?: number; fallback_from?: string }
  return {
    geojson: (json.geojson as GeoJSON.FeatureCollection) ?? { type: 'FeatureCollection', features: [] },
    count: Number(json.count) || 0,
    score: Number(json.score) || 0,
    engine: String(json.engine || 'unknown'),
    device: String(json.device || 'cpu'),
    stats: {
      field: Number(stats.field) || 0,
      ...(stats.fallback_from ? { fallback_from: String(stats.fallback_from) } : {}),
    },
    aoiApplied: Boolean(json.aoi_applied),
  }
}

function bodyOf(req: FieldBoundaryRequest) {
  const source = req.source ?? 'basemap'
  const iso = String(req.adminIso || '')
    .trim()
    .toUpperCase()
  return {
    image: req.image ?? '',
    bbox: req.bbox,
    aoi: req.aoi ?? null,
    min_confidence: req.minConfidence ?? 0.45,
    min_area_m2: req.minAreaM2 ?? 200,
    source,
    high_res: req.highRes !== false,
    ...(req.year != null && Number.isFinite(req.year) ? { year: Math.trunc(req.year) } : {}),
    ...(req.sceneDate && /^\d{4}-\d{2}-\d{2}$/.test(String(req.sceneDate).trim())
      ? { scene_date: String(req.sceneDate).trim().slice(0, 10) }
      : {}),
    ...(req.sceneDateFrom && /^\d{4}-\d{2}-\d{2}$/.test(String(req.sceneDateFrom).trim())
      ? { start_date: String(req.sceneDateFrom).trim().slice(0, 10) }
      : {}),
    ...(req.sceneDateTo && /^\d{4}-\d{2}-\d{2}$/.test(String(req.sceneDateTo).trim())
      ? { end_date: String(req.sceneDateTo).trim().slice(0, 10) }
      : {}),
    ...(req.model != null && String(req.model).trim() ? { model: String(req.model).trim() } : {}),
    ...(iso.length === 2 ? { admin_iso: iso } : {}),
  }
}

export async function fetchFieldBoundaryHealth(signal?: AbortSignal): Promise<FieldBoundaryHealth> {
  const builtinOnline: FieldBoundaryHealth = {
    status: 'ok',
    offline: false,
    builtin_fallback: true,
    ready: true,
    live: true,
    loading: false,
  }
  try {
    const res = await fetch(`${BASE()}/health`, { signal })
    const json = (await res.json().catch(() => null)) as (FieldBoundaryHealth & { error?: string }) | null
    if (
      isBackendUnavailablePayload(json?.error) ||
      (res.status === 503 && isBackendUnavailablePayload(String(json?.error || '')))
    ) {
      return builtinOnline
    }
    if (json && typeof json === 'object') {
      const status = String(json.status || '')
      const loading = Boolean(json.loading) || status === 'loading' || json.ready === false
      const live =
        json.offline === false ||
        json.live === true ||
        json.builtin_fallback === true ||
        status === 'ok' ||
        status === 'live' ||
        status === 'loading' ||
        status === 'ready'
      if (live || loading) {
        return {
          ...json,
          offline: false,
          loading,
          ready: json.ready !== false && !loading,
          live: true,
        }
      }
    }
    return builtinOnline
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return builtinOnline
  }
}

function looksLikeOfflineUpstream(raw: string | null | undefined): boolean {
  if (isBackendUnavailablePayload(raw)) return true
  return /offline|ECONNREFUSED|Could not reach|fetch failed|network/i.test(String(raw || ''))
}

async function throwIfFailed(res: Response, json: { error?: string; detail?: string }) {
  const payloadError =
    (typeof json?.error === 'string' && json.error.trim()) ||
    (typeof json?.detail === 'string' && json.detail.trim()) ||
    ''
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    // Only treat as offline when the body looks like a connectivity failure
    // (or is empty). Application errors remapped to 502 must stay visible.
    const offline =
      !payloadError || looksLikeOfflineUpstream(payloadError) || /service offline|ECONNREFUSED/i.test(payloadError)
    const { short, detail } = formatFieldBoundaryUserError(payloadError || `HTTP ${res.status}`, {
      offline,
    })
    throw new FieldBoundaryServiceError(short, offline, detail)
  }
  if (!res.ok) {
    const raw = payloadError || `Field boundary detection failed (HTTP ${res.status}).`
    const offline = looksLikeOfflineUpstream(raw)
    const { short, detail } = formatFieldBoundaryUserError(raw, { offline })
    throw new FieldBoundaryServiceError(short, offline, detail)
  }
}

export async function startFieldBoundaryJob(
  req: FieldBoundaryRequest,
): Promise<{ jobId: string }> {
  let res: Response
  try {
    res = await fetch(`${BASE()}/detect-job`, {
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
    res = await fetch(`${BASE()}/detect-job/${encodeURIComponent(jobId)}`, { signal })
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
        const { short, detail } = formatFieldBoundaryUserError(job.error || 'Field boundary job failed.')
        throw new FieldBoundaryServiceError(short, false, detail)
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
    res = await fetch(`${BASE()}/detect`, {
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
