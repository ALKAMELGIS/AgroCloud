/**
 * Temporal Transformer crop-typing client — `/api/temporal-transformer/*`.
 */

import { normalizeSegFormerFeatureProperties } from './segformerFeatureNormalize'

const CLASSIFY_URL = '/api/temporal-transformer/classify'
const HEALTH_URL = '/api/temporal-transformer/health'

export type TemporalClassifyRequest = {
  geojson: GeoJSON.FeatureCollection
  dates?: string[]
  bbox?: [number, number, number, number] | null
  aoi?: GeoJSON.FeatureCollection | GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  cropByFeatureId?: Record<string, { cropType?: string; confidence?: number } | string>
  majorityClassName?: string | null
  majorityConfidence?: number | null
  provider?: string | null
  signal?: AbortSignal
}

export type TemporalClassifyResult = {
  geojson: GeoJSON.FeatureCollection
  count: number
  engine: string
  backend?: string
  dates: string[]
  offlineFallback?: boolean
}

export class TemporalTransformerServiceError extends Error {
  readonly offline: boolean
  constructor(message: string, opts?: { offline?: boolean }) {
    super(message)
    this.name = 'TemporalTransformerServiceError'
    this.offline = Boolean(opts?.offline)
  }
}

/** Pure merge for Crop_Type props (mirrors Node mergeCropTypeProps). */
export function mergeTemporalCropProps(
  geojson: GeoJSON.FeatureCollection,
  opts?: {
    cropByFeatureId?: Record<string, { cropType?: string; confidence?: number } | string>
    majorityClassName?: string | null
    majorityConfidence?: number | null
    dates?: string[]
    defaultCrop?: string
  },
): GeoJSON.FeatureCollection {
  const byId = opts?.cropByFeatureId || {}
  const majName = (opts?.majorityClassName || '').trim()
  const majConf =
    opts?.majorityConfidence != null && Number.isFinite(opts.majorityConfidence)
      ? Math.max(0, Math.min(1, Number(opts.majorityConfidence)))
      : null
  const dateNote = (opts?.dates || []).filter(Boolean).join(',').slice(0, 120)
  const defaultCrop = (opts?.defaultCrop || 'Unknown').trim() || 'Unknown'

  const features = (geojson.features || []).map(f => {
    const props = { ...((f.properties || {}) as Record<string, unknown>) }
    const fid = String(props.Feature_ID || props.objectId || props.object_id || f.id || '')
    const hint = fid ? byId[fid] : undefined
    let cropName = defaultCrop
    let cropConf = 0.15
    if (hint && typeof hint === 'object') {
      cropName = String(hint.cropType || cropName)
      const c = Number(hint.confidence ?? cropConf)
      cropConf = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.15
    } else if (typeof hint === 'string' && hint.trim()) {
      cropName = hint.trim()
      cropConf = 0.55
    } else if (majName) {
      cropName = majName
      cropConf = majConf != null ? majConf : 0.45
    }
    props.Crop_Type = cropName
    props.Crop_Confidence = Math.round(cropConf * 10000) / 10000
    props.cropType = cropName
    props.crop_type = cropName
    props.cropConfidence = props.Crop_Confidence
    props.crop_confidence = props.Crop_Confidence
    if (dateNote) {
      props.Temporal_Dates = dateNote
      props.temporalDates = dateNote
    }
    return { ...f, properties: props }
  })
  return { type: 'FeatureCollection', features }
}

export async function fetchTemporalTransformerHealth(
  signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; degraded?: boolean }> {
  try {
    const res = await fetch(HEALTH_URL, { signal })
    const json = (await res.json().catch(() => ({}))) as { status?: string }
    const degraded = json.status === 'degraded'
    return { ok: res.ok || degraded, status: res.status, degraded }
  } catch {
    return { ok: false, status: 0 }
  }
}

/**
 * Attach Crop_Type / Crop_Confidence onto refined field polygons.
 * Node proxy falls back to local merge when the Python service is offline.
 */
export async function classifyWithTemporalTransformer(
  req: TemporalClassifyRequest,
): Promise<TemporalClassifyResult> {
  const payload = {
    geojson: req.geojson,
    dates: req.dates || [],
    bbox: req.bbox ?? undefined,
    aoi: req.aoi ?? undefined,
    cropByFeatureId: req.cropByFeatureId,
    majorityClassName: req.majorityClassName ?? undefined,
    majorityConfidence: req.majorityConfidence ?? undefined,
    provider: req.provider ?? undefined,
  }

  let res: Response
  try {
    res = await fetch(CLASSIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: req.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    // Client-side merge so the pipeline can still publish.
    const merged = mergeTemporalCropProps(req.geojson, {
      cropByFeatureId: req.cropByFeatureId,
      majorityClassName: req.majorityClassName,
      majorityConfidence: req.majorityConfidence,
      dates: req.dates,
    })
    return {
      geojson: merged,
      count: merged.features.length,
      engine: 'temporal-transformer',
      backend: 'client-merge',
      dates: req.dates || [],
      offlineFallback: true,
    }
  }

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new TemporalTransformerServiceError(
      String(json.error || json.detail || `Temporal classify failed (HTTP ${res.status}).`),
      { offline: res.status === 502 || res.status === 503 },
    )
  }

  const raw = (json.geojson as GeoJSON.FeatureCollection) || req.geojson
  const features = (raw.features || []).map((f, i) => {
    const normalized = normalizeSegFormerFeatureProperties(f, {
      classId: Number((f.properties as Record<string, unknown> | null)?.classId) || 1,
      className: String(
        (f.properties as Record<string, unknown> | null)?.Class_Name ||
          (f.properties as Record<string, unknown> | null)?.className ||
          'Agricultural Field',
      ),
      index: i,
      provider: req.provider,
    })
    // Preserve Crop_* from merge / service.
    const rawProps = (f.properties || {}) as Record<string, unknown>
    const props = {
      ...(normalized.properties || {}),
      Crop_Type: rawProps.Crop_Type ?? rawProps.cropType,
      Crop_Confidence: rawProps.Crop_Confidence ?? rawProps.cropConfidence,
      cropType: rawProps.cropType ?? rawProps.Crop_Type,
      cropConfidence: rawProps.cropConfidence ?? rawProps.Crop_Confidence,
      Temporal_Dates: rawProps.Temporal_Dates ?? rawProps.temporalDates,
    }
    return { ...normalized, properties: props }
  })

  return {
    geojson: { type: 'FeatureCollection', features },
    count: Number(json.count) || features.length,
    engine: String(json.engine || 'temporal-transformer'),
    backend: json.backend ? String(json.backend) : undefined,
    dates: Array.isArray(json.dates) ? (json.dates as string[]) : req.dates || [],
    offlineFallback: Boolean(json.offlineFallback),
  }
}
