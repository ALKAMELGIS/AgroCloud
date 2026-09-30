/**
 * Field-boundary validation metrics — browser mirror of
 * `backend/services/agri-field-boundary/eval/field_boundary_metrics.py`.
 *
 * Detected polygons are compared against a reference (ground-truth) layer:
 *   - greedy max-IoU instance matching → TP / FP / FN confusion matrix
 *   - precision / recall / F1 at any IoU threshold (sweepable for a curve)
 *   - global area IoU, mean matched IoU, boundary F1, matched area error
 *
 * Geometry work happens once in `buildValidationContext`; thresholds are then
 * cheap, so the whole sweep costs a single geometric pass.
 */

import * as turf from '@turf/turf'

export type FieldValidationCounts = {
  pred: number
  gt: number
  tp: number
  fp: number
  fn: number
}

export type FieldValidationMetrics = {
  counts: FieldValidationCounts
  /** Global area IoU over both sets. */
  iou: number
  meanMatchedIou: number
  precision: number
  recall: number
  f1: number
  /** Null when either set is too large to buffer boundaries in the browser. */
  boundaryF1: number | null
  /** Mean absolute relative area error over matched pairs (%). */
  areaErrorPct: number | null
  iouThreshold: number
  boundaryBufferM: number
}

export type IouSweepPoint = {
  threshold: number
  precision: number
  recall: number
  f1: number
  tp: number
  fp: number
  fn: number
}

type Pair = { pred: number; gt: number; iou: number; interM2: number }

export type ValidationContext = {
  predCount: number
  gtCount: number
  predAreaM2: number
  gtAreaM2: number
  predAreas: number[]
  gtAreas: number[]
  pairs: Pair[]
  boundaryF1: number | null
  boundaryBufferM: number
}

/** Polygons above this count skip boundary F1 — buffering every ring is too slow. */
const BOUNDARY_F1_MAX_POLYGONS = 600
export const DEFAULT_IOU_THRESHOLD = 0.5
export const DEFAULT_BOUNDARY_BUFFER_M = 5
export const DEFAULT_SWEEP_THRESHOLDS = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
]

/** Keep only polygon / multipolygon features for validation reference layers. */
export function polygonFeaturesFromCollection(
  input: GeoJSON.FeatureCollection | GeoJSON.Feature | null | undefined,
): GeoJSON.FeatureCollection | null {
  if (!input) return null
  const features: GeoJSON.Feature[] =
    input.type === 'FeatureCollection' ? (input.features || []) : [input as GeoJSON.Feature]
  const polys = features.filter(
    f => f?.geometry?.type === 'Polygon' || f?.geometry?.type === 'MultiPolygon',
  )
  return polys.length ? { type: 'FeatureCollection', features: polys } : null
}

/** Explode a collection into simple polygons, dropping empty / invalid parts. */
export function toPolygonParts(
  input: GeoJSON.FeatureCollection | GeoJSON.Feature | null | undefined,
): Array<GeoJSON.Feature<GeoJSON.Polygon>> {
  if (!input) return []
  const features: GeoJSON.Feature[] =
    input.type === 'FeatureCollection' ? (input.features || []) : [input as GeoJSON.Feature]
  const out: Array<GeoJSON.Feature<GeoJSON.Polygon>> = []
  for (const f of features) {
    const g = f?.geometry
    if (!g) continue
    if (g.type === 'Polygon') {
      if (g.coordinates?.length) {
        out.push({ type: 'Feature', properties: { ...(f.properties || {}) }, geometry: g })
      }
      continue
    }
    if (g.type === 'MultiPolygon') {
      for (const coords of g.coordinates || []) {
        if (!coords?.length) continue
        out.push({
          type: 'Feature',
          properties: { ...(f.properties || {}) },
          geometry: { type: 'Polygon', coordinates: coords },
        })
      }
    }
  }
  return out
}

function bboxesOverlap(a: number[], b: number[]): boolean {
  return !(a[2]! < b[0]! || b[2]! < a[0]! || a[3]! < b[1]! || b[3]! < a[1]!)
}

function intersectionAreaM2(
  a: GeoJSON.Feature<GeoJSON.Polygon>,
  b: GeoJSON.Feature<GeoJSON.Polygon>,
): number {
  try {
    const inter = turf.intersect(turf.featureCollection([a as any, b as any]))
    if (!inter?.geometry) return 0
    const area = Math.abs(turf.area(inter as any))
    return Number.isFinite(area) ? area : 0
  } catch {
    return 0
  }
}

function safeArea(f: GeoJSON.Feature): number {
  try {
    const area = Math.abs(turf.area(f as any))
    return Number.isFinite(area) ? area : 0
  } catch {
    return 0
  }
}

/**
 * Boundary F1: overlap between buffered prediction rings and buffered reference
 * rings. Rewards edges that land in the right place even when instance matching
 * splits or merges parcels.
 */
function boundaryF1(
  pred: Array<GeoJSON.Feature<GeoJSON.Polygon>>,
  gt: Array<GeoJSON.Feature<GeoJSON.Polygon>>,
  bufferM: number,
): number | null {
  if (!pred.length || !gt.length) return null
  if (pred.length > BOUNDARY_F1_MAX_POLYGONS || gt.length > BOUNDARY_F1_MAX_POLYGONS) return null
  const ribbon = (parts: Array<GeoJSON.Feature<GeoJSON.Polygon>>) => {
    const buffered: GeoJSON.Feature[] = []
    for (const part of parts) {
      try {
        const line = turf.polygonToLine(part as any) as GeoJSON.Feature
        const buf = turf.buffer(line as any, bufferM, { units: 'meters' })
        if (buf?.geometry) buffered.push(buf as GeoJSON.Feature)
      } catch {
        /* skip unbufferable ring */
      }
    }
    if (!buffered.length) return null
    if (buffered.length === 1) return buffered[0]!
    try {
      return (turf.union(turf.featureCollection(buffered as any)) as GeoJSON.Feature) || null
    } catch {
      return null
    }
  }
  try {
    const pb = ribbon(pred)
    const gb = ribbon(gt)
    if (!pb?.geometry || !gb?.geometry) return null
    const pbArea = safeArea(pb)
    const gbArea = safeArea(gb)
    if (!(pbArea > 0) || !(gbArea > 0)) return null
    const inter = turf.intersect(turf.featureCollection([pb as any, gb as any]))
    const interArea = inter?.geometry ? safeArea(inter as GeoJSON.Feature) : 0
    if (!(interArea > 0)) return 0
    const precision = interArea / pbArea
    const recall = interArea / gbArea
    if (!(precision + recall > 0)) return 0
    return (2 * precision * recall) / (precision + recall)
  } catch {
    return null
  }
}

/** One geometric pass: pairwise overlaps, areas, and the boundary ribbon score. */
export function buildValidationContext(
  predicted: GeoJSON.FeatureCollection | null | undefined,
  reference: GeoJSON.FeatureCollection | null | undefined,
  opts?: { boundaryBufferM?: number },
): ValidationContext | null {
  const pred = toPolygonParts(predicted)
  const gt = toPolygonParts(reference)
  if (!gt.length) return null

  const bufferM = opts?.boundaryBufferM ?? DEFAULT_BOUNDARY_BUFFER_M
  const predAreas = pred.map(safeArea)
  const gtAreas = gt.map(safeArea)
  const predBoxes = pred.map(f => turf.bbox(f as any))
  const gtBoxes = gt.map(f => turf.bbox(f as any))

  const pairs: Pair[] = []
  for (let i = 0; i < pred.length; i++) {
    const areaA = predAreas[i]!
    if (!(areaA > 0)) continue
    for (let j = 0; j < gt.length; j++) {
      const areaB = gtAreas[j]!
      if (!(areaB > 0)) continue
      if (!bboxesOverlap(predBoxes[i]!, gtBoxes[j]!)) continue
      const interM2 = intersectionAreaM2(pred[i]!, gt[j]!)
      if (!(interM2 > 0)) continue
      const union = areaA + areaB - interM2
      if (!(union > 0)) continue
      pairs.push({ pred: i, gt: j, iou: interM2 / union, interM2 })
    }
  }
  pairs.sort((a, b) => b.iou - a.iou)

  return {
    predCount: pred.length,
    gtCount: gt.length,
    predAreaM2: predAreas.reduce((a, b) => a + b, 0),
    gtAreaM2: gtAreas.reduce((a, b) => a + b, 0),
    predAreas,
    gtAreas,
    pairs,
    boundaryF1: boundaryF1(pred, gt, bufferM),
    boundaryBufferM: bufferM,
  }
}

function greedyMatch(ctx: ValidationContext, threshold: number): Pair[] {
  const usedPred = new Set<number>()
  const usedGt = new Set<number>()
  const matches: Pair[] = []
  for (const pair of ctx.pairs) {
    if (pair.iou < threshold) break
    if (usedPred.has(pair.pred) || usedGt.has(pair.gt)) continue
    usedPred.add(pair.pred)
    usedGt.add(pair.gt)
    matches.push(pair)
  }
  return matches
}

/** Confusion counts and derived scores at one IoU match threshold. */
export function metricsAtThreshold(
  ctx: ValidationContext,
  threshold = DEFAULT_IOU_THRESHOLD,
): FieldValidationMetrics {
  const matches = greedyMatch(ctx, threshold)
  const tp = matches.length
  const fp = ctx.predCount - tp
  const fn = ctx.gtCount - tp
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
  const meanMatchedIou = tp ? matches.reduce((a, m) => a + m.iou, 0) / tp : 0

  // Fields inside one set do not overlap, so summing pairwise overlaps gives the
  // exact global intersection without an expensive union.
  const interTotal = ctx.pairs.reduce((a, p) => a + p.interM2, 0)
  const unionTotal = ctx.predAreaM2 + ctx.gtAreaM2 - interTotal
  const iou = unionTotal > 0 ? Math.min(1, interTotal / unionTotal) : 0

  const errors: number[] = []
  for (const m of matches) {
    const gtArea = ctx.gtAreas[m.gt] ?? 0
    const predArea = ctx.predAreas[m.pred] ?? 0
    if (gtArea > 0) errors.push((Math.abs(predArea - gtArea) / gtArea) * 100)
  }

  return {
    counts: { pred: ctx.predCount, gt: ctx.gtCount, tp, fp, fn },
    iou,
    meanMatchedIou,
    precision,
    recall,
    f1,
    boundaryF1: ctx.boundaryF1,
    areaErrorPct: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
    iouThreshold: threshold,
    boundaryBufferM: ctx.boundaryBufferM,
  }
}

/** Precision / recall / F1 across IoU thresholds — the validation curve. */
export function sweepIouThresholds(
  ctx: ValidationContext,
  thresholds: number[] = DEFAULT_SWEEP_THRESHOLDS,
): IouSweepPoint[] {
  return thresholds.map(threshold => {
    const m = metricsAtThreshold(ctx, threshold)
    return {
      threshold,
      precision: m.precision,
      recall: m.recall,
      f1: m.f1,
      tp: m.counts.tp,
      fp: m.counts.fp,
      fn: m.counts.fn,
    }
  })
}

export function evaluateFieldBoundaries(
  predicted: GeoJSON.FeatureCollection | null | undefined,
  reference: GeoJSON.FeatureCollection | null | undefined,
  opts?: { iouThreshold?: number; boundaryBufferM?: number },
): FieldValidationMetrics | null {
  const ctx = buildValidationContext(predicted, reference, opts)
  if (!ctx) return null
  return metricsAtThreshold(ctx, opts?.iouThreshold ?? DEFAULT_IOU_THRESHOLD)
}

/* ------------------------------------------------------------------ */
/* Reference-free analysis: shape class × size distribution           */
/* ------------------------------------------------------------------ */

export type FieldShapeClass = 'pivot' | 'rectangle' | 'right-angles' | 'irregular'

export const FIELD_SHAPE_CLASS_LABEL: Record<FieldShapeClass, string> = {
  pivot: 'Pivot circle',
  rectangle: 'Oriented rectangle',
  'right-angles': 'Right-angle parcel',
  irregular: 'Irregular / kept',
}

export type FieldSizeBucket = { label: string; minHa: number; maxHa: number }

export const FIELD_SIZE_BUCKETS: FieldSizeBucket[] = [
  { label: '<1 ha', minHa: 0, maxHa: 1 },
  { label: '1–5 ha', minHa: 1, maxHa: 5 },
  { label: '5–20 ha', minHa: 5, maxHa: 20 },
  { label: '20–50 ha', minHa: 20, maxHa: 50 },
  { label: '≥50 ha', minHa: 50, maxHa: Number.POSITIVE_INFINITY },
]

export type GeometrySummaryRow = {
  shape: FieldShapeClass
  counts: number[]
  total: number
  areaHa: number
}

export type FieldGeometrySummary = {
  buckets: FieldSizeBucket[]
  rows: GeometrySummaryRow[]
  totalCount: number
  totalAreaHa: number
  /** Fields whose footprint was rebuilt by the regularizer. */
  regularizedCount: number
  meanAreaHa: number
  medianAreaHa: number
}

export function classifyFieldShape(feature: GeoJSON.Feature): FieldShapeClass {
  const props = (feature.properties || {}) as Record<string, unknown>
  const method = String(props.footprint_method || '')
  if (method.startsWith('pivot') || props.field_shape === 'pivot') return 'pivot'
  if (method === 'obb' || method === 'envelope') return 'rectangle'
  // ArcGIS Regularize Building Footprint methods → right-angle family.
  if (
    method === 'right-angles' ||
    method === 'right-angles-and-diagonals' ||
    method === 'cadastral' ||
    method === 'any-angles'
  ) {
    return 'right-angles'
  }
  return 'irregular'
}

function bucketIndex(areaHa: number): number {
  for (let i = 0; i < FIELD_SIZE_BUCKETS.length; i++) {
    const b = FIELD_SIZE_BUCKETS[i]!
    if (areaHa >= b.minHa && areaHa < b.maxHa) return i
  }
  return FIELD_SIZE_BUCKETS.length - 1
}

/** Shape class × size matrix for the current detection — no reference needed. */
export function summarizeFieldGeometry(
  fc: GeoJSON.FeatureCollection | null | undefined,
): FieldGeometrySummary {
  const shapes: FieldShapeClass[] = ['pivot', 'rectangle', 'right-angles', 'irregular']
  const rows: GeometrySummaryRow[] = shapes.map(shape => ({
    shape,
    counts: FIELD_SIZE_BUCKETS.map(() => 0),
    total: 0,
    areaHa: 0,
  }))
  const areasHa: number[] = []
  let regularizedCount = 0

  for (const feature of fc?.features || []) {
    const g = feature?.geometry
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue
    const props = (feature.properties || {}) as Record<string, unknown>
    const propArea = Number(props.area_ha)
    const areaHa = Number.isFinite(propArea) && propArea > 0 ? propArea : safeArea(feature) / 10_000
    if (!(areaHa > 0)) continue
    if (props.footprint_regularized === true) regularizedCount += 1
    const row = rows.find(r => r.shape === classifyFieldShape(feature))!
    const idx = bucketIndex(areaHa)
    row.counts[idx] = (row.counts[idx] ?? 0) + 1
    row.total += 1
    row.areaHa += areaHa
    areasHa.push(areaHa)
  }

  const sorted = [...areasHa].sort((a, b) => a - b)
  const totalAreaHa = areasHa.reduce((a, b) => a + b, 0)
  return {
    buckets: FIELD_SIZE_BUCKETS,
    rows,
    totalCount: areasHa.length,
    totalAreaHa,
    regularizedCount,
    meanAreaHa: areasHa.length ? totalAreaHa / areasHa.length : 0,
    medianAreaHa: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0,
  }
}

/** Flatten metrics + sweep into CSV for the report / clipboard. */
export function validationMetricsCsv(
  metrics: FieldValidationMetrics,
  sweep: IouSweepPoint[],
): string {
  const lines = [
    'metric,value',
    `predicted,${metrics.counts.pred}`,
    `reference,${metrics.counts.gt}`,
    `true_positive,${metrics.counts.tp}`,
    `false_positive,${metrics.counts.fp}`,
    `false_negative,${metrics.counts.fn}`,
    `iou,${metrics.iou.toFixed(4)}`,
    `mean_matched_iou,${metrics.meanMatchedIou.toFixed(4)}`,
    `precision,${metrics.precision.toFixed(4)}`,
    `recall,${metrics.recall.toFixed(4)}`,
    `f1,${metrics.f1.toFixed(4)}`,
    `boundary_f1,${metrics.boundaryF1 == null ? '' : metrics.boundaryF1.toFixed(4)}`,
    `field_area_error_pct,${metrics.areaErrorPct == null ? '' : metrics.areaErrorPct.toFixed(2)}`,
    `iou_match_threshold,${metrics.iouThreshold}`,
    `boundary_buffer_m,${metrics.boundaryBufferM}`,
    '',
    'iou_threshold,precision,recall,f1,tp,fp,fn',
  ]
  for (const p of sweep) {
    lines.push(
      `${p.threshold},${p.precision.toFixed(4)},${p.recall.toFixed(4)},${p.f1.toFixed(4)},${p.tp},${p.fp},${p.fn}`,
    )
  }
  return lines.join('\n')
}
