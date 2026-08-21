/**
 * Field Boundaries — training sample curation (not raw inference dumps).
 *
 * Lifecycle: predicted → draft (Generate) → approved (Accept) → saved dataset.
 * Rejected / draft never enter the training export.
 */

export type FieldTrainingSampleStatus = 'draft' | 'approved' | 'rejected'

export type FieldTrainingSample = {
  sample_id: string
  status: FieldTrainingSampleStatus
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  /** Scene / imagery stamp from the Detect run. */
  scene_id?: string
  acquisition_date?: string
  detection_engine?: string
  source_prediction_id?: string
  confidence?: number
  area_m2?: number
  /** Optional curator note after Edit / review. */
  note?: string
  created_at: string
  updated_at: string
  approved_at?: string
}

export type FieldTrainingGenerateMeta = {
  sceneId?: string
  acquisitionDate?: string
  engine?: string
}

let seq = 0
export function nextFieldTrainingSampleId(): string {
  seq += 1
  return `afb-train-${Date.now().toString(36)}-${seq}`
}

function asPolygonGeometry(
  g: GeoJSON.Geometry | null | undefined,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!g) return null
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return g
  return null
}

/** Copy Detect polygons into draft samples — never approved. */
export function predictionsToDraftSamples(
  fc: GeoJSON.FeatureCollection | null | undefined,
  meta: FieldTrainingGenerateMeta = {},
): FieldTrainingSample[] {
  const now = new Date().toISOString()
  const out: FieldTrainingSample[] = []
  for (const f of fc?.features || []) {
    const geom = asPolygonGeometry(f.geometry)
    if (!geom) continue
    const props = (f.properties || {}) as Record<string, unknown>
    const conf = Number(props.confidence ?? props.confidence_score)
    const area = Number(props.area_m2)
    out.push({
      sample_id: nextFieldTrainingSampleId(),
      status: 'draft',
      geometry: geom,
      scene_id: meta.sceneId || String(props.scene_id || '') || undefined,
      acquisition_date: meta.acquisitionDate || String(props.acquisition_date || '') || undefined,
      detection_engine: meta.engine || String(props.detection_engine || '') || undefined,
      source_prediction_id: String(f.id || props.field_id || props.id || '') || undefined,
      confidence: Number.isFinite(conf) ? conf : undefined,
      area_m2: Number.isFinite(area) ? area : undefined,
      created_at: now,
      updated_at: now,
    })
  }
  return out
}

export function countFieldTrainingByStatus(samples: FieldTrainingSample[]): {
  draft: number
  approved: number
  rejected: number
  total: number
} {
  let draft = 0
  let approved = 0
  let rejected = 0
  for (const s of samples) {
    if (s.status === 'draft') draft += 1
    else if (s.status === 'approved') approved += 1
    else rejected += 1
  }
  return { draft, approved, rejected, total: samples.length }
}

const STATUS_STROKE: Record<FieldTrainingSampleStatus, string> = {
  draft: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
}

/** FeatureCollection for map / export preview (includes status styling). */
export function fieldTrainingSamplesToFeatureCollection(
  samples: FieldTrainingSample[],
  opts?: { statuses?: FieldTrainingSampleStatus[]; selectedId?: string | null },
): GeoJSON.FeatureCollection {
  const allow = opts?.statuses ? new Set(opts.statuses) : null
  const selected = opts?.selectedId || null
  return {
    type: 'FeatureCollection',
    features: samples
      .filter(s => !allow || allow.has(s.status))
      .map(s => ({
        type: 'Feature' as const,
        id: s.sample_id,
        geometry: s.geometry,
        properties: {
          sample_id: s.sample_id,
          status: s.status,
          class_name: 'agricultural_field',
          scene_id: s.scene_id || null,
          acquisition_date: s.acquisition_date || null,
          detection_engine: s.detection_engine || null,
          source_prediction_id: s.source_prediction_id || null,
          confidence: s.confidence ?? null,
          area_m2: s.area_m2 ?? null,
          note: s.note || null,
          created_at: s.created_at,
          updated_at: s.updated_at,
          approved_at: s.approved_at || null,
          stroke: STATUS_STROKE[s.status],
          'stroke-width': selected === s.sample_id ? 3 : 1.5,
          'fill-opacity': s.status === 'approved' ? 0.22 : 0.08,
          selected: selected === s.sample_id,
        },
      })),
  }
}

/** Only approved polygons — safe training export. */
export function approvedFieldTrainingFeatureCollection(
  samples: FieldTrainingSample[],
): GeoJSON.FeatureCollection {
  return fieldTrainingSamplesToFeatureCollection(samples, { statuses: ['approved'] })
}

export function downloadApprovedFieldTrainingSamples(
  samples: FieldTrainingSample[],
  basename = 'afb-training-samples-approved',
): { ok: true; count: number } | { ok: false; reason: string } {
  const approved = samples.filter(s => s.status === 'approved')
  if (!approved.length) {
    return { ok: false, reason: 'No approved samples — Accept drafts before Save.' }
  }
  const fc = approvedFieldTrainingFeatureCollection(approved)
  const payload = {
    type: 'FeatureCollection',
    name: basename,
    metadata: {
      purpose: 'field-boundary-training',
      class: 'agricultural_field',
      rule: 'approved-only',
      count: approved.length,
      exported_at: new Date().toISOString(),
    },
    features: fc.features,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/geo+json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${basename}.geojson`
  a.click()
  URL.revokeObjectURL(url)
  return { ok: true, count: approved.length }
}
