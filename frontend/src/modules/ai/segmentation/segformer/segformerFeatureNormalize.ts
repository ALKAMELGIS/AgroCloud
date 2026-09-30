/**
 * Normalize SegFormer detection features to the GIS attribute schema
 * (Feature_ID, Class_Name, …) while keeping camelCase aliases for map paint.
 */

import type { SegFormerCategoryId } from './segformerCatalog'
import { getSegFormerClass } from './segformerCatalog'

/** Canonical export / layer attribute names from the workspace plan. */
export const SEGFORMER_FEATURE_SCHEMA_KEYS = [
  'Feature_ID',
  'Class_Name',
  'Confidence',
  'Area_m2',
  'Area_Hectare',
  'Perimeter',
  'Date',
  'Provider',
  'Crop_Type',
  'Crop_Confidence',
] as const

export type SegFormerFeatureSchemaKey = (typeof SEGFORMER_FEATURE_SCHEMA_KEYS)[number]

export type SegFormerNormalizedProps = {
  Feature_ID: string
  Class_Name: string
  Confidence: number
  Area_m2: number
  Area_Hectare: number
  Perimeter: number
  Date: string
  Provider: string
  Crop_Type?: string
  Crop_Confidence?: number
  /** Internal aliases used by map paint / result table. */
  objectId: string
  object_id: string
  className: string
  class_name: string
  classId: number
  class_id: number
  confidence: number
  areaM2: number
  area_m2: number
  areaHa: number
  area_ha: number
  perimeterM: number
  perimeter_m: number
  date: string
  provider: string
  source: string
  cropType?: string
  cropConfidence?: number
}

export type SegFormerNormalizeContext = {
  classId: number
  className: string
  index: number
  /** Scene / acquisition date (ISO or YYYY-MM-DD). */
  date?: string | null
  /** Imagery provider label (e.g. Sentinel Hub, Mapbox basemap). */
  provider?: string | null
}

function propNum(props: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = props[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  }
  return 0
}

function propStr(props: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = props[k]
    if (v != null && String(v).trim()) return String(v)
  }
  return ''
}

/** Build the dual PascalCase + camelCase property bag for one detection feature. */
export function buildSegFormerFeatureProps(
  raw: Record<string, unknown>,
  ctx: SegFormerNormalizeContext,
): SegFormerNormalizedProps {
  const objectId =
    propStr(raw, 'Feature_ID', 'objectId', 'object_id', 'OBJECTID', 'id', 'field_id') ||
    `SF-${String(ctx.index + 1).padStart(5, '0')}`
  const classId = propNum(raw, 'classId', 'class_id') || ctx.classId
  const className =
    propStr(raw, 'Class_Name', 'className', 'class_name', 'class') || ctx.className
  const confidence = propNum(raw, 'Confidence', 'confidence', 'score', 'conf')
  const areaM2 = propNum(raw, 'Area_m2', 'areaM2', 'area_m2', 'area')
  const areaHa =
    propNum(raw, 'Area_Hectare', 'areaHa', 'area_ha') || (areaM2 > 0 ? areaM2 / 10_000 : 0)
  const perimeterM = propNum(raw, 'Perimeter', 'perimeterM', 'perimeter_m', 'perimeter')
  const date =
    propStr(raw, 'Date', 'date', 'detection_date', 'detectionDate') ||
    (ctx.date?.trim() || '') ||
    new Date().toISOString()
  const provider =
    propStr(raw, 'Provider', 'provider') ||
    (ctx.provider?.trim() || '') ||
    propStr(raw, 'source') ||
    'segformer-ade20k'
  const source = propStr(raw, 'source') || 'segformer-ade20k'
  const cropType = propStr(raw, 'Crop_Type', 'cropType', 'crop_type')
  const cropConfidenceRaw = propNum(raw, 'Crop_Confidence', 'cropConfidence', 'crop_confidence')
  const cropConfidence = cropType ? cropConfidenceRaw : 0

  return {
    Feature_ID: objectId,
    Class_Name: className,
    Confidence: confidence,
    Area_m2: areaM2,
    Area_Hectare: areaHa,
    Perimeter: perimeterM,
    Date: date,
    Provider: provider,
    Crop_Type: cropType,
    Crop_Confidence: cropConfidence,
    cropType,
    cropConfidence,
    objectId,
    object_id: objectId,
    className,
    class_name: className,
    classId,
    class_id: classId,
    confidence,
    areaM2,
    area_m2: areaM2,
    areaHa,
    area_ha: areaHa,
    perimeterM,
    perimeter_m: perimeterM,
    date,
    provider,
    source,
  }
}

/** Normalize one GeoJSON feature onto the SegFormer GIS attribute schema. */
export function normalizeSegFormerFeatureProperties(
  feature: GeoJSON.Feature,
  ctx: SegFormerNormalizeContext,
): GeoJSON.Feature {
  const raw = (feature.properties || {}) as Record<string, unknown>
  const props = buildSegFormerFeatureProps(raw, ctx)
  return {
    ...feature,
    id: props.Feature_ID,
    properties: {
      ...raw,
      ...props,
    },
  }
}

/** Normalize an entire FeatureCollection (detect response or pre-export). */
export function normalizeSegFormerFeatureCollection(
  fc: GeoJSON.FeatureCollection | null | undefined,
  ctx: Omit<SegFormerNormalizeContext, 'index'> & { index?: number },
): GeoJSON.FeatureCollection {
  const features = (fc?.features || []).map((f, i) =>
    normalizeSegFormerFeatureProperties(f, {
      classId: ctx.classId,
      className: ctx.className,
      date: ctx.date,
      provider: ctx.provider,
      index: ctx.index ?? i,
    }),
  )
  return { type: 'FeatureCollection', features }
}

/** Outline / fill colors for Prediction Layer symbology by category. */
export function getSegFormerPredictionLayerStyle(categoryId?: SegFormerCategoryId | null): {
  color: string
  fillColor: string
  polygonFillAlpha: number
  weight: number
} {
  switch (categoryId) {
    case 'agriculture':
      return { color: '#a3e635', fillColor: '#65a30d', polygonFillAlpha: 0.42, weight: 2 }
    case 'trees':
      return { color: '#4ade80', fillColor: '#15803d', polygonFillAlpha: 0.4, weight: 2 }
    case 'water':
      return { color: '#38bdf8', fillColor: '#0369a1', polygonFillAlpha: 0.45, weight: 2 }
    case 'buildings':
      return { color: '#fb923c', fillColor: '#c2410c', polygonFillAlpha: 0.4, weight: 2 }
    case 'roads':
      return { color: '#fbbf24', fillColor: '#b45309', polygonFillAlpha: 0.35, weight: 2 }
    case 'vehicles':
      return { color: '#f472b6', fillColor: '#be185d', polygonFillAlpha: 0.4, weight: 2 }
    case 'land-surface':
      return { color: '#d6d3d1', fillColor: '#78716c', polygonFillAlpha: 0.4, weight: 2 }
    default:
      return { color: '#38bdf8', fillColor: '#0ea5e9', polygonFillAlpha: 0.4, weight: 2 }
  }
}

export function getSegFormerPredictionLayerStyleForClass(classId: number) {
  const def = getSegFormerClass(classId)
  return getSegFormerPredictionLayerStyle(def?.categoryId)
}

/** Stable display name for the auto-published GIS layer. */
export function buildSegFormerPredictionLayerName(className?: string | null): string {
  const cls = (className || '').trim()
  return cls ? `SegFormer Prediction Layer · ${cls}` : 'SegFormer Prediction Layer'
}

/** Field-pipeline layer name after SAM2 / temporal enrichment. */
export function buildSegFormerFieldFeatureClassName(opts?: {
  className?: string | null
  withCropType?: boolean
}): string {
  const cls = (opts?.className || 'Agricultural Field').trim() || 'Agricultural Field'
  if (opts?.withCropType) return `Field Feature Class · ${cls} · Crop`
  return `Field Feature Class · ${cls}`
}
