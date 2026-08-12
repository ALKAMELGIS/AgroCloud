/**
 * Merge FTW agricultural field polygons with tree instances
 * for Training & AI "Fields + Trees" extraction.
 */

import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { isFieldBoundarySampleClass } from './trainingSampleStore'

export { isFieldBoundarySampleClass } from './trainingSampleStore'

export type MergedExtractStats = {
  fields: number
  trees: number
  other: number
  total: number
  engine: string
}

/** Defaults for post-FTW field cleanup (area / NMS / sample proximity). */
export const FIELD_CLEANUP_DEFAULTS = {
  minAreaM2: 200,
  overlapIou: 0.6,
  /** Midpoint of the 40–80 m band from the Fields+Trees plan. */
  sampleBufferM: 60,
  minSamplePolygons: 3,
  /** Large fields kept when they intersect the sample hull (even if off buffer). */
  largeFieldAreaM2: 5_000,
  largeFieldMinConfidence: 0.6,
} as const

export type FieldCleanupOptions = {
  minAreaM2?: number
  overlapIou?: number
  sampleBufferM?: number
  minSamplePolygons?: number
  largeFieldAreaM2?: number
  largeFieldMinConfidence?: number
  /** Training samples used for proximity filtering (Field Boundaries class). */
  fieldBoundarySamples?: Array<{ class_name?: string; geometry?: GeoJSON.Geometry | null }>
}

function propsOf(f: GeoJSON.Feature): Record<string, unknown> {
  return (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<
    string,
    unknown
  >
}

function classNameOf(f: GeoJSON.Feature): string {
  const p = propsOf(f)
  return String(p.class_name || p.className || p.class || p.label || '').trim()
}

function asPolyFeature(geom: GeoJSON.Geometry): Feature<Polygon | MultiPolygon> | null {
  if (!geom) return null
  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    return { type: 'Feature', properties: {}, geometry: geom }
  }
  return null
}

/** Polygon / MultiPolygon training samples labeled as Field Boundaries. */
export function extractFieldBoundarySamplePolygons(
  samples: Array<{ class_name?: string; geometry?: GeoJSON.Geometry | null }> | null | undefined,
): Feature<Polygon | MultiPolygon>[] {
  const out: Feature<Polygon | MultiPolygon>[] = []
  for (const s of samples || []) {
    if (!isFieldBoundarySampleClass(s?.class_name)) continue
    const pf = s?.geometry ? asPolyFeature(s.geometry) : null
    if (pf) out.push(pf)
  }
  return out
}

export function fieldAreaM2(f: GeoJSON.Feature): number {
  const p = propsOf(f)
  const propsArea = Number(p.area_m2 ?? p.Area_m2)
  if (Number.isFinite(propsArea) && propsArea > 0) return propsArea
  try {
    if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) {
      return 0
    }
    return turf.area(f as Feature<Polygon | MultiPolygon>)
  } catch {
    return 0
  }
}

export function fieldConfidence(f: GeoJSON.Feature): number {
  const conf = Number(propsOf(f).confidence)
  return Number.isFinite(conf) ? conf : 0
}

/** Intersection-over-union for two polygonal features (0 when disjoint / invalid). */
export function polygonIou(a: GeoJSON.Feature, b: GeoJSON.Feature): number {
  try {
    if (
      !a?.geometry ||
      !b?.geometry ||
      (a.geometry.type !== 'Polygon' && a.geometry.type !== 'MultiPolygon') ||
      (b.geometry.type !== 'Polygon' && b.geometry.type !== 'MultiPolygon')
    ) {
      return 0
    }
    const fa = a as Feature<Polygon | MultiPolygon>
    const fb = b as Feature<Polygon | MultiPolygon>
    const inter = turf.intersect(turf.featureCollection([fa, fb]))
    if (!inter?.geometry) return 0
    const areaA = turf.area(fa)
    const areaB = turf.area(fb)
    const areaI = turf.area(inter)
    const union = areaA + areaB - areaI
    if (!(union > 0) || !(areaI >= 0)) return 0
    return areaI / union
  } catch {
    return 0
  }
}

/**
 * Greedy NMS: sort by confidence desc, drop polygons whose IoU with a kept
 * polygon exceeds `overlapIou`.
 */
export function nmsFieldFeatures(
  features: GeoJSON.Feature[],
  overlapIou = FIELD_CLEANUP_DEFAULTS.overlapIou,
): GeoJSON.Feature[] {
  const sorted = [...features].sort((a, b) => fieldConfidence(b) - fieldConfidence(a))
  const kept: GeoJSON.Feature[] = []
  for (const cand of sorted) {
    const overlaps = kept.some(k => polygonIou(cand, k) > overlapIou)
    if (!overlaps) kept.push(cand)
  }
  return kept
}

function featuresIntersect(
  a: Feature<Polygon | MultiPolygon>,
  b: Feature<Polygon | MultiPolygon>,
): boolean {
  try {
    return turf.booleanIntersects(a, b)
  } catch {
    try {
      return Boolean(turf.intersect(turf.featureCollection([a, b]))?.geometry)
    } catch {
      return false
    }
  }
}

/**
 * When enough Field Boundary samples exist, prefer FTW fields near those labels:
 * intersect buffered sample union, or large+high-conf fields that hit the sample hull.
 */
export function filterFieldsNearSamples(
  features: GeoJSON.Feature[],
  samplePolys: Feature<Polygon | MultiPolygon>[],
  opts?: Pick<
    FieldCleanupOptions,
    'sampleBufferM' | 'minSamplePolygons' | 'largeFieldAreaM2' | 'largeFieldMinConfidence'
  >,
): GeoJSON.Feature[] {
  const minSamples = opts?.minSamplePolygons ?? FIELD_CLEANUP_DEFAULTS.minSamplePolygons
  if (samplePolys.length < minSamples) return features

  const bufferM = opts?.sampleBufferM ?? FIELD_CLEANUP_DEFAULTS.sampleBufferM
  const largeArea = opts?.largeFieldAreaM2 ?? FIELD_CLEANUP_DEFAULTS.largeFieldAreaM2
  const largeConf = opts?.largeFieldMinConfidence ?? FIELD_CLEANUP_DEFAULTS.largeFieldMinConfidence

  const buffered: Feature<Polygon | MultiPolygon>[] = []
  for (const s of samplePolys) {
    try {
      const b = turf.buffer(s, bufferM, { units: 'meters' })
      if (b?.geometry && (b.geometry.type === 'Polygon' || b.geometry.type === 'MultiPolygon')) {
        buffered.push(b as Feature<Polygon | MultiPolygon>)
      }
    } catch {
      buffered.push(s)
    }
  }
  if (!buffered.length) return features

  let unionMask: Feature<Polygon | MultiPolygon> | null = null
  try {
    const u = turf.union(turf.featureCollection(buffered))
    if (u?.geometry && (u.geometry.type === 'Polygon' || u.geometry.type === 'MultiPolygon')) {
      unionMask = u as Feature<Polygon | MultiPolygon>
    }
  } catch {
    unionMask = null
  }

  let hull: Feature<Polygon | MultiPolygon> | null = null
  try {
    const h = turf.convex(turf.featureCollection(samplePolys))
    if (h?.geometry && (h.geometry.type === 'Polygon' || h.geometry.type === 'MultiPolygon')) {
      hull = h as Feature<Polygon | MultiPolygon>
    }
  } catch {
    hull = null
  }

  return features.filter(f => {
    if (!f.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) {
      return false
    }
    const ff = f as Feature<Polygon | MultiPolygon>
    if (unionMask && featuresIntersect(ff, unionMask)) return true
    if (!unionMask && buffered.some(b => featuresIntersect(ff, b))) return true
    if (
      hull &&
      fieldAreaM2(f) >= largeArea &&
      fieldConfidence(f) >= largeConf &&
      featuresIntersect(ff, hull)
    ) {
      return true
    }
    return false
  })
}

/**
 * Drop tiny shards, NMS overlapping fields, optionally prefer polygons near Field Boundary samples.
 */
export function cleanupFtwFieldFeatures(
  features: GeoJSON.Feature[],
  opts?: FieldCleanupOptions,
): GeoJSON.Feature[] {
  const minArea = opts?.minAreaM2 ?? FIELD_CLEANUP_DEFAULTS.minAreaM2
  const iou = opts?.overlapIou ?? FIELD_CLEANUP_DEFAULTS.overlapIou

  let next = features.filter(f => {
    if (!f?.geometry || (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon')) {
      return false
    }
    return fieldAreaM2(f) >= minArea
  })

  next = nmsFieldFeatures(next, iou)

  const samplePolys = extractFieldBoundarySamplePolygons(opts?.fieldBoundarySamples)
  next = filterFieldsNearSamples(next, samplePolys, opts)

  return next
}

/** Keep SegFormer blobs that look like trees (or vegetation crowns). */
export function filterTreeFeatures(fc: FeatureCollection | null | undefined): GeoJSON.Feature[] {
  const feats = fc?.features || []
  return feats.filter(f => {
    if (!f?.geometry) return false
    const name = classNameOf(f).toLowerCase()
    return /\btree\b|trees|crown|canopy|orchard|mangrove|vegetation/i.test(name)
  })
}

export function normalizeFtwFieldFeatures(
  fc: FeatureCollection | null | undefined,
  cleanup?: FieldCleanupOptions | false,
): GeoJSON.Feature[] {
  const feats = fc?.features || []
  const normalized = feats
    .filter(f => f?.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'))
    .map((f, i) => {
      const p = propsOf(f)
      const conf = Number(p.confidence)
      const area = fieldAreaM2(f)
      return {
        type: 'Feature' as const,
        properties: {
          ...p,
          class_id: 1,
          class_name: 'Field',
          label: 'Agricultural field',
          confidence: Number.isFinite(conf) ? conf : 0.85,
          area_m2: area > 0 ? Math.round(area * 100) / 100 : p.area_m2,
          color: String(p.fill_color || p.color || '#eab308'),
          output_type: 'fields_trees',
          source: 'ftw',
          instance_id: Number(p.field_id) || i + 1,
        },
        geometry: f.geometry,
      }
    })

  if (cleanup === false) return normalized
  return cleanupFtwFieldFeatures(normalized, cleanup)
}

export function normalizeTreeFeatures(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  return features.map((f, i) => {
    const p = propsOf(f)
    return {
      type: 'Feature' as const,
      properties: {
        ...p,
        class_name: 'Tree',
        label: 'Tree',
        confidence: Number.isFinite(Number(p.confidence)) ? Number(p.confidence) : 0.7,
        color: String(p.color || '#22c55e'),
        output_type: 'fields_trees',
        source: String(p.source || 'crown'),
        instance_id: Number(p.instance_id) || i + 1,
      },
      geometry: f.geometry,
    }
  })
}

export function mergeFieldsAndTrees(opts: {
  fields?: FeatureCollection | null
  trees?: FeatureCollection | null
  engine?: string
  /** Field post-filter / NMS / sample proximity. Pass `false` to skip cleanup. */
  fieldCleanup?: FieldCleanupOptions | false
}): { geojson: FeatureCollection; stats: MergedExtractStats; primary_class: string } {
  const fieldFeats = normalizeFtwFieldFeatures(opts.fields, opts.fieldCleanup)
  // Accept crown polygons already labeled as Tree (YOLO / local / samples),
  // not only SegFormer OD blobs.
  const rawTrees = opts.trees?.features || []
  const treeLike =
    rawTrees.length && rawTrees.every(f => /\btree\b/i.test(classNameOf(f)))
      ? rawTrees
      : filterTreeFeatures(opts.trees || undefined)
  const treeFeats = normalizeTreeFeatures(treeLike)
  const features = [...fieldFeats, ...treeFeats]
  const stats: MergedExtractStats = {
    fields: fieldFeats.length,
    trees: treeFeats.length,
    other: 0,
    total: features.length,
    engine: opts.engine || 'ftw+crowns',
  }
  const primary =
    fieldFeats.length >= treeFeats.length && fieldFeats.length > 0
      ? 'Field'
      : treeFeats.length > 0
        ? 'Tree'
        : 'Result'
  return {
    geojson: { type: 'FeatureCollection', features },
    stats,
    primary_class: primary,
  }
}
