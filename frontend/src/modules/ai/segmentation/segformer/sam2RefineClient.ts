/**
 * SAM2 boundary refinement client — talks to `/api/sam2-refinement/*`.
 */

import { normalizeSegFormerFeatureProperties } from './segformerFeatureNormalize'

const REFINE_URL = '/api/sam2-refinement/refine'
const HEALTH_URL = '/api/sam2-refinement/health'
const CONFIG_URL = '/api/sam2-refinement/config'

export type Sam2RefineInstance = {
  featureId: string
  bboxXyxy?: [number, number, number, number] | null
  centroidXy?: [number, number] | null
  score?: number
}

export type Sam2RefineRequest = {
  imageDataUrl: string
  bbox: [number, number, number, number]
  instances?: Sam2RefineInstance[]
  coarseGeojson?: GeoJSON.FeatureCollection | null
  aoi?: GeoJSON.FeatureCollection | GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  minConfidence?: number
  date?: string | null
  provider?: string | null
  signal?: AbortSignal
}

export type Sam2RefineResult = {
  geojson: GeoJSON.FeatureCollection
  count: number
  score: number
  maskPng: string | null
  width: number
  height: number
  engine: string
  offline?: boolean
}

export class Sam2RefinementServiceError extends Error {
  readonly offline: boolean
  constructor(message: string, opts?: { offline?: boolean }) {
    super(message)
    this.name = 'Sam2RefinementServiceError'
    this.offline = Boolean(opts?.offline)
  }
}

export async function fetchSam2RefinementHealth(
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch(HEALTH_URL, { signal })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false, status: 0 }
  }
}

export async function fetchSam2RefinementConfig(
  signal?: AbortSignal,
): Promise<{ configured: boolean }> {
  try {
    const res = await fetch(CONFIG_URL, { signal })
    if (!res.ok) return { configured: false }
    return (await res.json()) as { configured: boolean }
  } catch {
    return { configured: false }
  }
}

/** Normalize SAM2 refine response into GIS-ready FeatureCollection. */
export function normalizeSam2RefineResult(
  json: Record<string, unknown>,
  meta?: { date?: string | null; provider?: string | null },
): Sam2RefineResult {
  const raw = (json.geojson as GeoJSON.FeatureCollection) || {
    type: 'FeatureCollection' as const,
    features: [],
  }
  const features = (raw.features || []).map((f, i) =>
    normalizeSegFormerFeatureProperties(f, {
      classId: 1,
      className: 'Agricultural Field',
      index: i,
      date: meta?.date,
      provider: meta?.provider,
    }),
  )
  return {
    geojson: { type: 'FeatureCollection', features },
    count: Number(json.count) || features.length,
    score: Number(json.score) || 0,
    maskPng: (json.maskPng as string) ?? (json.mask_png as string) ?? null,
    width: Number(json.width) || 0,
    height: Number(json.height) || 0,
    engine: String(json.engine || 'sam2'),
  }
}

/**
 * Refine SegFormer-B5 instances with SAM2 box (+ centroid) prompts.
 */
export async function refineWithSam2(req: Sam2RefineRequest): Promise<Sam2RefineResult> {
  const payload = {
    image: req.imageDataUrl,
    imageDataUrl: req.imageDataUrl,
    bbox: req.bbox,
    instances: (req.instances || []).map(inst => ({
      feature_id: inst.featureId,
      featureId: inst.featureId,
      bbox_xyxy: inst.bboxXyxy ?? undefined,
      bboxXyxy: inst.bboxXyxy ?? undefined,
      centroid_xy: inst.centroidXy ?? undefined,
      centroidXy: inst.centroidXy ?? undefined,
      score: inst.score,
    })),
    coarse_geojson: req.coarseGeojson ?? undefined,
    coarseGeojson: req.coarseGeojson ?? undefined,
    aoi: req.aoi ?? null,
    minConfidence: req.minConfidence ?? 0.35,
    min_confidence: req.minConfidence ?? 0.35,
    date: req.date ?? null,
    provider: req.provider ?? null,
  }

  let res: Response
  try {
    res = await fetch(REFINE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: req.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new Sam2RefinementServiceError(
      'Cannot reach the SAM2 refinement service. Run backend/services/sam2-refinement (docker compose up).',
      { offline: true },
    )
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.status === 502 || res.status === 503 || res.status === 504 || json.offline) {
    throw new Sam2RefinementServiceError(
      String(json.error || json.detail || 'SAM2 refinement service is offline.'),
      { offline: true },
    )
  }
  if (!res.ok) {
    throw new Sam2RefinementServiceError(
      String(json.error || json.detail || `SAM2 refine failed (HTTP ${res.status}).`),
    )
  }
  return normalizeSam2RefineResult(json, { date: req.date, provider: req.provider })
}
