/**
 * SegFormer GIS Detection client — talks to the Node proxy
 * (`/api/segformer-detection/*`), which forwards a captured map view + class ID
 * to the pretrained ADE20K SegFormer service and returns GIS-ready Polygon
 * GeoJSON (EPSG:4326) with confidence / area / perimeter attributes.
 */

import {
  getSegFormerClass,
  getSegFormerDefaultMinConfidence,
  isSegFormerClassMapped,
  SEGFORMER_UNSUPPORTED_TOOLTIP,
} from './segformerCatalog'
import {
  normalizeSegFormerOverlap,
  normalizeSegFormerTileSize,
  SEGFORMER_DEFAULT_OVERLAP,
  SEGFORMER_DEFAULT_TILE_SIZE,
} from './segformerTiling'
import { normalizeSegFormerFeatureProperties } from './segformerFeatureNormalize'

const BASE = '/api/segformer-detection'
const DETECT_ENDPOINTS = [
  '/api/segformer-detection/detect',
  '/api/v1/segformer-detection/detect',
  '/api/segformer/detect',
] as const
const CONFIG_ENDPOINTS = [
  '/api/segformer-detection/config',
  '/api/v1/segformer-detection/config',
  '/api/segformer/config',
] as const
const HEALTH_ENDPOINTS = [
  '/api/segformer-detection/health',
  '/api/v1/segformer-detection/health',
  '/api/segformer/health',
] as const

export type SegFormerDetectRequest = {
  /** Captured RGB view as a PNG/JPEG data URL. */
  imageDataUrl: string
  /** WGS84 extent of the image: [west, south, east, north]. */
  bbox: [number, number, number, number]
  /** Stable AgroCloud class ID from the detection catalogue. */
  classId: number
  /** Drop GIS features below this confidence (0..1). */
  minConfidence?: number
  /** Inference tile size in pixels (256 / 512 / 1024). Forwarded to the SegFormer service. */
  tileSize?: number
  /** Tile overlap as a fraction 0..0.5 (e.g. 0.2 = 20%). */
  overlap?: number
  /** Optional analysis boundary — detection clipped to AOI when provided. */
  aoi?: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.Feature | GeoJSON.FeatureCollection
  /** Scene / acquisition date stamped onto Feature.Date. */
  date?: string | null
  /** Imagery provider stamped onto Feature.Provider. */
  provider?: string | null
  signal?: AbortSignal
}

export type SegFormerFeatureProps = {
  objectId: string
  className: string
  classId: number
  confidence: number
  areaM2: number
  areaHa: number
  perimeterM: number
  date: string
  provider?: string
  source: string
  cropType?: string
  cropConfidence?: number
}

export type SegFormerDetectResult = {
  geojson: GeoJSON.FeatureCollection
  count: number
  score: number
  maskPng: string | null
  width: number
  height: number
  classId: number
  className: string
  aoiApplied: boolean
  /** Service engine label (e.g. segformer-b5). */
  engine?: string | null
  /** Coarse instance boxes for SAM2 refine (field pipeline). */
  instances?: Array<{
    featureId: string
    bboxXyxy: [number, number, number, number] | null
    centroidXy: [number, number] | null
    score: number
  }>
}

/** Raised when the SegFormer endpoint is not configured / not reachable. */
export class SegFormerDetectionServiceError extends Error {
  readonly offline: boolean
  readonly unsupported: boolean
  /**
   * `true` when **all** candidate endpoints returned HTTP 404.
   * This means the running backend process does not register the
   * SegFormer routes at all (stale build / wrong entry point).
   * Distinguished from `offline` (network error / 502/503) so the UI
   * can show a targeted "restart backend" recovery hint instead of a
   * generic "service down" message.
   */
  readonly routeMissing: boolean
  constructor(
    message: string,
    opts?: { offline?: boolean; unsupported?: boolean; routeMissing?: boolean },
  ) {
    super(message)
    this.name = 'SegFormerDetectionServiceError'
    this.offline = Boolean(opts?.offline)
    this.unsupported = Boolean(opts?.unsupported)
    this.routeMissing = Boolean(opts?.routeMissing)
  }
}

export type SegFormerDetectionConfig = { configured: boolean }

/** Whether a SegFormer detection endpoint is configured on the backend. */
export async function fetchSegFormerDetectionConfig(
  signal?: AbortSignal,
): Promise<SegFormerDetectionConfig> {
  for (const url of CONFIG_ENDPOINTS) {
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) continue
      return (await res.json()) as SegFormerDetectionConfig
    } catch {
      // try next endpoint
    }
  }
  return { configured: false }
}

/** Lightweight health probe for the SegFormer service (local or HF fallback). */
export async function fetchSegFormerHealth(
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; hfFallback?: boolean }> {
  for (const url of HEALTH_ENDPOINTS) {
    try {
      const res = await fetch(url, { signal })
      if (res.ok) {
        const json = await res.json().catch(() => ({})) as Record<string, unknown>
        return { ok: true, status: res.status, hfFallback: Boolean(json.hf_fallback) }
      }
      return { ok: res.ok, status: res.status }
    } catch {
      // try next endpoint
    }
  }
  return { ok: false, status: 0 }
}

type UpstreamPayload = {
  geojson?: GeoJSON.FeatureCollection
  mask_png?: string | null
  maskPng?: string | null
  width?: number
  height?: number
  score?: number
  count?: number
  class_id?: number
  classId?: number
  class_name?: string
  className?: string
  aoi_applied?: boolean
  aoiApplied?: boolean
  engine?: string
  instances?: Array<Record<string, unknown>>
  error?: string
  detail?: string
}

/** Normalize camelCase / snake_case feature attributes from the SegFormer service. */
export function normalizeSegFormerFeature(
  feature: GeoJSON.Feature,
  fallback: {
    classId: number
    className: string
    index: number
    date?: string | null
    provider?: string | null
  },
): GeoJSON.Feature {
  return normalizeSegFormerFeatureProperties(feature, fallback)
}

function parseDetectResult(
  json: UpstreamPayload,
  classId: number,
  meta?: { date?: string | null; provider?: string | null },
): SegFormerDetectResult {
  const def = getSegFormerClass(classId)
  const className =
    String(json.className || json.class_name || def?.name || `Class ${classId}`).trim() ||
    `Class ${classId}`
  const raw = json.geojson ?? { type: 'FeatureCollection' as const, features: [] }
  const features = (raw.features || []).map((f, i) =>
    normalizeSegFormerFeature(f, {
      classId,
      className,
      index: i,
      date: meta?.date,
      provider: meta?.provider,
    }),
  )
  return {
    geojson: { type: 'FeatureCollection', features },
    count: Number(json.count) || features.length,
    score: Number(json.score) || 0,
    maskPng: json.maskPng ?? json.mask_png ?? null,
    width: Number(json.width) || 0,
    height: Number(json.height) || 0,
    classId: Number(json.classId ?? json.class_id) || classId,
    className,
    aoiApplied: Boolean(json.aoiApplied ?? json.aoi_applied),
    engine: json.engine ? String(json.engine) : null,
    instances: Array.isArray(json.instances)
      ? json.instances.map((inst, i) => {
          const box = (inst.bbox_xyxy ?? inst.bboxXyxy) as number[] | undefined
          const cent = (inst.centroid_xy ?? inst.centroidXy) as number[] | undefined
          return {
            featureId: String(inst.feature_id || inst.featureId || `SF-${String(i + 1).padStart(5, '0')}`),
            bboxXyxy:
              Array.isArray(box) && box.length === 4
                ? ([box[0], box[1], box[2], box[3]] as [number, number, number, number])
                : null,
            centroidXy:
              Array.isArray(cent) && cent.length === 2
                ? ([cent[0], cent[1]] as [number, number])
                : null,
            score: Number(inst.score) || 0,
          }
        })
      : undefined,
  }
}

function throwIfHttpFailed(res: Response, json: UpstreamPayload) {
  if (res.status === 503 || res.status === 502 || res.status === 504) {
    throw new SegFormerDetectionServiceError(
      json.error ||
        json.detail ||
        'SegFormer detection service is offline — run backend/services/segformer-detection to enable it.',
      { offline: true },
    )
  }
  if (res.status === 422 || /no pretrained mapping|unsupported|fine-tuned/i.test(String(json.error || json.detail || ''))) {
    throw new SegFormerDetectionServiceError(
      json.error || json.detail || SEGFORMER_UNSUPPORTED_TOOLTIP,
      { unsupported: true },
    )
  }
  if (!res.ok) {
    throw new SegFormerDetectionServiceError(
      json.error || json.detail || `SegFormer detection failed (HTTP ${res.status}).`,
    )
  }
}

/**
 * Run pretrained SegFormer on a captured AOI view for a single AgroCloud class.
 * Classes without ADE20K indices are rejected client-side before the request.
 */
export async function detectWithSegFormer(req: SegFormerDetectRequest): Promise<SegFormerDetectResult> {
  if (!isSegFormerClassMapped(req.classId)) {
    throw new SegFormerDetectionServiceError(SEGFORMER_UNSUPPORTED_TOOLTIP, { unsupported: true })
  }

  const def = getSegFormerClass(req.classId)
  const date = req.date?.trim() || null
  const provider = req.provider?.trim() || null
  const tileSize = normalizeSegFormerTileSize(req.tileSize ?? SEGFORMER_DEFAULT_TILE_SIZE)
  const overlap = normalizeSegFormerOverlap(req.overlap ?? SEGFORMER_DEFAULT_OVERLAP)
  const payload = JSON.stringify({
    imageDataUrl: req.imageDataUrl,
    image: req.imageDataUrl,
    bbox: req.bbox,
    classId: req.classId,
    class_id: req.classId,
    className: def?.name ?? null,
    class_name: def?.name ?? null,
    ade20kIndices: def?.ade20kIndices ?? [],
    ade20k_indices: def?.ade20kIndices ?? [],
    minConfidence: req.minConfidence ?? getSegFormerDefaultMinConfidence(req.classId),
    min_confidence: req.minConfidence ?? getSegFormerDefaultMinConfidence(req.classId),
    tileSize,
    tile_size: tileSize,
    overlap,
    overlap_pct: overlap,
    aoi: req.aoi ?? null,
    date,
    provider,
  })

  let networkError: Error | null = null
  let last404Payload: UpstreamPayload | null = null
  for (const url of DETECT_ENDPOINTS) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        signal: req.signal,
      })
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
      networkError = err as Error
      continue
    }

    const json = (await res.json().catch(() => ({}))) as UpstreamPayload
    if (res.status === 404) {
      last404Payload = json
      continue
    }
    throwIfHttpFailed(res, json)
    return parseDetectResult(json, req.classId, { date, provider })
  }

  if (last404Payload) {
    // All endpoints returned 404 → the running backend process does not expose
    // SegFormer routes.  This is a route-registration problem (stale code /
    // wrong entry point), NOT a service-offline situation.
    throw new SegFormerDetectionServiceError(
      'SegFormer route not registered on the running backend. ' +
        'The active server process does not expose /api/segformer-detection/detect. ' +
        'Stop the current backend and restart it from the repository root: ' +
        'node backend/server/index.js',
      { offline: false, routeMissing: true },
    )
  }
  // Pure network failure — backend is not reachable at all.
  throw new SegFormerDetectionServiceError(
    'Cannot reach the SegFormer backend. ' +
      (networkError?.message
        ? `Network error: ${networkError.message}. `
        : '') +
      'Make sure the backend server is running (node backend/server/index.js) ' +
      'and the frontend dev-server proxy is pointing at the correct port.',
    { offline: true },
  )
}
