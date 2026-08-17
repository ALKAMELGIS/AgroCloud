/**
 * Post-process Detect Fields polygons:
 * - clip strictly inside the drawn AOI
 * - drop stacked overlays (prefer drop over carve — carving creates stray black strokes)
 * - keep exterior rings only (holes draw as black lines through fills)
 */

import * as turf from '@turf/turf'
import { clipFeatureCollectionToAoi } from '../trainingAi/clipResultsToAoi'

export type RefineFieldPolygonsOptions = {
  /** Drop pieces smaller than this after clip (m²). Default 5. */
  minAreaM2?: number
  /**
   * Drop lower-priority polygon when intersect/area ≥ this (no carve).
   * Lower → fewer overlays / fewer parallel black edges. Default 0.18.
   */
  dropIou?: number
}

function featureAreaM2(f: GeoJSON.Feature): number {
  try {
    const a = turf.area(f as any)
    return Number.isFinite(a) ? a : 0
  } catch {
    return 0
  }
}

function featureConfidence(f: GeoJSON.Feature): number {
  const p = (f.properties || {}) as Record<string, unknown>
  const c = Number(p.confidence ?? p.score ?? p.conf ?? 0)
  return Number.isFinite(c) ? c : 0
}

/** Keep only the outer ring — interior rings become stray black strokes on Mapbox line layers. */
export function exteriorRingOnly(
  f: GeoJSON.Feature,
): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  const g = f?.geometry
  if (!g) return null
  if (g.type === 'Polygon') {
    const outer = g.coordinates?.[0]
    if (!outer || outer.length < 4) return null
    return {
      type: 'Feature',
      properties: { ...(f.properties || {}) },
      geometry: { type: 'Polygon', coordinates: [outer] },
    }
  }
  if (g.type === 'MultiPolygon') {
    const polys: GeoJSON.Position[][][] = []
    for (const poly of g.coordinates || []) {
      const outer = poly?.[0]
      if (outer && outer.length >= 4) polys.push([outer])
    }
    if (!polys.length) return null
    if (polys.length === 1) {
      return {
        type: 'Feature',
        properties: { ...(f.properties || {}) },
        geometry: { type: 'Polygon', coordinates: polys[0]! },
      }
    }
    return {
      type: 'Feature',
      properties: { ...(f.properties || {}) },
      geometry: { type: 'MultiPolygon', coordinates: polys },
    }
  }
  return null
}

/** Drop LineStrings / points and strip holes / tiny slivers for clean map strokes. */
export function sanitizeFieldDisplayGeometry(
  fc: GeoJSON.FeatureCollection | null | undefined,
  opts?: { minAreaM2?: number },
): GeoJSON.FeatureCollection {
  const minArea = Math.max(0, opts?.minAreaM2 ?? 5)
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  if (!fc?.features?.length) return empty

  const out: GeoJSON.Feature[] = []
  for (const raw of fc.features) {
    const ext = exteriorRingOnly(raw)
    if (!ext) continue
    let cleaned: GeoJSON.Feature = ext
    try {
      cleaned = turf.cleanCoords(ext as any) as GeoJSON.Feature
    } catch {
      cleaned = ext
    }
    // Fix self-intersections that create crossing strokes.
    try {
      const buff = turf.buffer(cleaned as any, 0, { units: 'meters' })
      if (buff?.geometry && (buff.geometry.type === 'Polygon' || buff.geometry.type === 'MultiPolygon')) {
        const again = exteriorRingOnly({
          type: 'Feature',
          properties: cleaned.properties || {},
          geometry: buff.geometry,
        })
        if (again) cleaned = again
      }
    } catch {
      /* keep cleaned */
    }

    const g = cleaned.geometry
    if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue

    if (g.type === 'Polygon') {
      const a = featureAreaM2(cleaned)
      if (a < minArea) continue
      // Reject extremely skinny leftovers (look like black sticks, not fields).
      try {
        const len = turf.length(turf.polygonToLine(cleaned as any) as any, { units: 'meters' })
        if (len > 0 && a / (len * len) < 0.0008) continue
      } catch {
        /* keep */
      }
      out.push({
        ...cleaned,
        properties: {
          ...(cleaned.properties || {}),
          area_m2: Math.round(a * 10) / 10,
        },
      })
      continue
    }

    for (const coords of g.coordinates || []) {
      const part: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: 'Feature',
        properties: { ...(cleaned.properties || {}) },
        geometry: { type: 'Polygon', coordinates: coords },
      }
      const a = featureAreaM2(part)
      if (a < minArea) continue
      try {
        const len = turf.length(turf.polygonToLine(part as any) as any, { units: 'meters' })
        if (len > 0 && a / (len * len) < 0.0008) continue
      } catch {
        /* keep */
      }
      out.push({
        ...part,
        properties: {
          ...(part.properties || {}),
          area_m2: Math.round(a * 10) / 10,
        },
      })
    }
  }

  return { type: 'FeatureCollection', features: out }
}

/**
 * Resolve overlapping field polygons by dropping lower-priority overlaps
 * (no difference carve — carving spawns stray/parallel black edge artifacts).
 */
export function resolveFieldPolygonOverlaps(
  fc: GeoJSON.FeatureCollection | null | undefined,
  opts?: RefineFieldPolygonsOptions,
): GeoJSON.FeatureCollection {
  const minArea = Math.max(0, opts?.minAreaM2 ?? 5)
  const dropIou = Math.min(0.95, Math.max(0.05, opts?.dropIou ?? 0.18))
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  const sanitized = sanitizeFieldDisplayGeometry(fc, { minAreaM2: minArea })
  if (!sanitized.features.length) return empty

  const ranked = sanitized.features
    .map(f => ({
      f: f as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
      area: featureAreaM2(f),
      conf: featureConfidence(f),
    }))
    .sort((a, b) => b.conf - a.conf || b.area - a.area)

  const kept: GeoJSON.Feature[] = []

  for (const { f, area } of ranked) {
    let overlaps = false
    for (const winner of kept) {
      try {
        if (!turf.booleanIntersects(f as any, winner as any)) continue
      } catch {
        continue
      }
      let interArea = 0
      try {
        const inter = turf.intersect(turf.featureCollection([f as any, winner as any]))
        if (inter) interArea = turf.area(inter as any)
      } catch {
        interArea = 0
      }
      const winArea = featureAreaM2(winner)
      const ratioCur = area > 0 ? interArea / area : 1
      const ratioWin = winArea > 0 ? interArea / winArea : 1
      const iou = interArea / Math.max(1e-6, area + winArea - interArea)
      // Any meaningful intersect → drop duplicate/stack (avoids parallel black borders).
      if (ratioCur >= dropIou || ratioWin >= dropIou || iou >= dropIou) {
        overlaps = true
        break
      }
      // Near-touching edges only: still drop if centroid of smaller sits inside winner.
      try {
        const c = turf.centroid(f as any)
        if (turf.booleanPointInPolygon(c, winner as any)) {
          overlaps = true
          break
        }
      } catch {
        /* ignore */
      }
    }
    if (!overlaps) kept.push(f)
  }

  return { type: 'FeatureCollection', features: kept }
}

/** Clip to AOI then remove overlays and stray-stroke geometry. */
export function refineFieldPolygonsToAoi(
  fc: GeoJSON.FeatureCollection | null | undefined,
  aoi: GeoJSON.FeatureCollection | null | undefined,
  opts?: RefineFieldPolygonsOptions,
): GeoJSON.FeatureCollection {
  const clipped = clipFeatureCollectionToAoi(fc, aoi)
  const resolved = resolveFieldPolygonOverlaps(clipped, opts)
  return sanitizeFieldDisplayGeometry(resolved, { minAreaM2: opts?.minAreaM2 ?? 5 })
}

/**
 * Merge recall passes: add polygons from `extra` that do not heavily overlap `base`.
 */
export function mergeFieldDetections(
  base: GeoJSON.FeatureCollection,
  extra: GeoJSON.FeatureCollection,
  opts?: RefineFieldPolygonsOptions,
): GeoJSON.FeatureCollection {
  const combined: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [...(base.features || []), ...(extra.features || [])],
  }
  return resolveFieldPolygonOverlaps(combined, opts)
}
