/**
 * Hide PMTiles tile-boundary artifacts while keeping native FTW field geometries.
 * - Mosaic mask validates presence (display/export filter only).
 * - Union fragments sharing field_id removes internal tile cut lines.
 */

import * as turf from '@turf/turf'
import { dedupeFtwTileFeatures, ftwFeatureStableKey } from './ftwGlobalTileDedupe'
import { applyFtwFieldBoundaryMaskExport } from './ftwTileSeamFilter'
import type { FtwRasterMosaic } from './ftwAoiMosaicVectorize'

const TILE_SEAM_EPS = 1.2e-4
const MAX_SEAM_MERGE_PASSES = 10
const MAX_SEAM_MERGE_FEATURES = 6000

function lonToTileXFloat(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z
}

function latToTileYFloat(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z
}

function nearTileGridLine(value: number): boolean {
  const frac = value - Math.floor(value)
  return frac < TILE_SEAM_EPS || frac > 1 - TILE_SEAM_EPS
}

/** Fraction of outer-ring edges that lie on PMTiles grid lines at zoom z. */
export function ftwTileSeamEdgeRatio(feature: GeoJSON.Feature, zoom: number): number {
  const g = feature.geometry
  if (!g || g.type !== 'Polygon') return 0
  const ring = g.coordinates[0]
  if (!ring || ring.length < 4) return 0

  let seamEdges = 0
  let total = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i]!
    const [lon2, lat2] = ring[i + 1]!
    if (lon1 == null || lat1 == null || lon2 == null || lat2 == null) continue
    total++
    const x1 = lonToTileXFloat(lon1, zoom)
    const x2 = lonToTileXFloat(lon2, zoom)
    const y1 = latToTileYFloat(lat1, zoom)
    const y2 = latToTileYFloat(lat2, zoom)
    const verticalSeam = nearTileGridLine(x1) && nearTileGridLine(x2)
    const horizontalSeam = nearTileGridLine(y1) && nearTileGridLine(y2)
    if (verticalSeam || horizontalSeam) seamEdges++
  }
  return total > 0 ? seamEdges / total : 0
}

function featureAreaSafe(f: GeoJSON.Feature): number {
  try {
    return turf.area(f as turf.AllGeoJSON)
  } catch {
    return 0
  }
}

function overlapRatio(a: GeoJSON.Feature, b: GeoJSON.Feature): number {
  const areaA = featureAreaSafe(a)
  const areaB = featureAreaSafe(b)
  const minArea = Math.min(areaA, areaB)
  if (minArea <= 0) return 0
  try {
    const inter = turf.intersect(turf.featureCollection([a as any, b as any]))
    if (!inter) return 0
    return turf.area(inter as turf.AllGeoJSON) / minArea
  } catch {
    return 0
  }
}

function touchesOrOverlaps(a: GeoJSON.Feature, b: GeoJSON.Feature): boolean {
  try {
    if (overlapRatio(a, b) > 0.001) return true
    return turf.booleanTouches(a as any, b as any) || turf.booleanOverlap(a as any, b as any)
  } catch {
    return false
  }
}

function canUnionSeamPair(a: GeoJSON.Feature, b: GeoJSON.Feature): boolean {
  const areaA = featureAreaSafe(a)
  const areaB = featureAreaSafe(b)
  if (areaA <= 0 || areaB <= 0) return false
  try {
    const u = turf.union(turf.featureCollection([a as any, b as any]))
    if (!u?.geometry) return false
    const uArea = turf.area(u as turf.AllGeoJSON)
    return uArea <= (areaA + areaB) * 1.02
  } catch {
    return false
  }
}

/** True when a and b are tile-split fragments of the same field (safe to union on export). */
export function shouldMergeFtwSeamPair(
  a: GeoJSON.Feature,
  b: GeoJSON.Feature,
  zoom: number,
): boolean {
  const keyA = fieldUnionKey(a)
  const keyB = fieldUnionKey(b)
  if (keyA === keyB && keyA.startsWith('id:')) return canUnionSeamPair(a, b)

  const iou = overlapRatio(a, b)
  if (iou >= 0.88) return canUnionSeamPair(a, b)

  if (!touchesOrOverlaps(a, b)) return false

  try {
    const cSmall = turf.centroid((featureAreaSafe(a) <= featureAreaSafe(b) ? a : b) as turf.AllGeoJSON)
    const larger = featureAreaSafe(a) >= featureAreaSafe(b) ? a : b
    if (turf.booleanPointInPolygon(cSmall, larger as any)) return canUnionSeamPair(a, b)
  } catch {
    /* ignore */
  }

  if (iou > 0.08) return canUnionSeamPair(a, b)

  const seamA = ftwTileSeamEdgeRatio(a, zoom)
  const seamB = ftwTileSeamEdgeRatio(b, zoom)
  if (seamA >= 0.18 && seamB >= 0.18 && iou < 0.05) return canUnionSeamPair(a, b)

  return false
}

function bboxesTouch(a: GeoJSON.Feature, b: GeoJSON.Feature, pad = 1e-6): boolean {
  try {
    const [aw, as, ae, an] = turf.bbox(a as turf.AllGeoJSON)
    const [bw, bs, be, bn] = turf.bbox(b as turf.AllGeoJSON)
    return !(ae + pad < bw || be + pad < aw || an + pad < bs || bn + pad < as)
  } catch {
    return false
  }
}

/**
 * Iteratively union touching PMTiles fragments split at tile grid lines (export only).
 */
export function mergeFtwSeamTouchingFragments(
  features: GeoJSON.Feature[],
  zoom: number,
): GeoJSON.Feature[] {
  if (features.length <= 1) return features
  if (features.length > MAX_SEAM_MERGE_FEATURES) return unionFtwFragmentsByFieldId(features)

  let remaining = [...features]
  for (let pass = 0; pass < MAX_SEAM_MERGE_PASSES; pass++) {
    let mergedAny = false
    outer: for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        if (!bboxesTouch(remaining[i]!, remaining[j]!)) continue
        if (!shouldMergeFtwSeamPair(remaining[i]!, remaining[j]!, zoom)) continue
        try {
          const u = turf.union(
            turf.featureCollection([remaining[i] as any, remaining[j] as any]),
          )
          if (!u?.geometry) continue
          const merged: GeoJSON.Feature = {
            type: 'Feature',
            properties: {
              ...((remaining[i]!.properties ?? {}) as object),
              ...((remaining[j]!.properties ?? {}) as object),
            },
            geometry: u.geometry,
          }
          remaining[i] = merged
          remaining.splice(j, 1)
          mergedAny = true
          break outer
        } catch {
          /* try next pair */
        }
      }
    }
    if (!mergedAny) break
  }
  return remaining
}

function lonLatToMaskPixel(
  lon: number,
  lat: number,
  bbox: [number, number, number, number],
  width: number,
  height: number,
): [number, number] {
  const [west, south, east, north] = bbox
  const col = Math.round(((lon - west) / Math.max(east - west, 1e-12)) * Math.max(width - 1, 1))
  const row = Math.round(((north - lat) / Math.max(north - south, 1e-12)) * Math.max(height - 1, 1))
  return [
    Math.max(0, Math.min(width - 1, col)),
    Math.max(0, Math.min(height - 1, row)),
  ]
}

function maskSample(mosaic: FtwRasterMosaic, lon: number, lat: number): boolean {
  const [col, row] = lonLatToMaskPixel(lon, lat, mosaic.bbox, mosaic.width, mosaic.height)
  return mosaic.mask[row * mosaic.width + col]! > 0
}

function ringSamplePoints(ring: GeoJSON.Position[]): GeoJSON.Position[] {
  if (ring.length <= 8) return ring
  const step = Math.max(1, Math.floor(ring.length / 8))
  const pts: GeoJSON.Position[] = []
  for (let i = 0; i < ring.length; i += step) pts.push(ring[i]!)
  return pts
}

/** True when any centroid / ring sample hits the union mosaic mask. */
export function featureOverlapsMosaicMask(
  feature: GeoJSON.Feature,
  mosaic: FtwRasterMosaic,
): boolean {
  try {
    const c = turf.centroid(feature as turf.AllGeoJSON)
    const [lon, lat] = c.geometry.coordinates
    if (lon != null && lat != null && maskSample(mosaic, lon, lat)) return true
  } catch {
    /* fall through */
  }

  const g = feature.geometry
  if (!g) return false
  const rings: GeoJSON.Position[][] = []
  if (g.type === 'Polygon') rings.push(g.coordinates[0] ?? [])
  else if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates ?? []) rings.push(poly?.[0] ?? [])
  }
  for (const ring of rings) {
    for (const [lon, lat] of ringSamplePoints(ring)) {
      if (lon != null && lat != null && maskSample(mosaic, lon, lat)) return true
    }
  }
  return false
}

export function filterFtwFeaturesByMosaicMask(
  features: GeoJSON.Feature[],
  mosaic: FtwRasterMosaic,
): GeoJSON.Feature[] {
  return features.filter(f => featureOverlapsMosaicMask(f, mosaic))
}

function fieldUnionKey(feature: GeoJSON.Feature): string {
  const p = (feature.properties ?? {}) as Record<string, unknown>
  const id = String(p.field_id ?? p.id ?? p.fid ?? '').trim()
  if (id) return `id:${id}`
  return ftwFeatureStableKey(feature)
}

/** Merge tile fragments that belong to the same FTW field (removes internal tile edges). */
export function unionFtwFragmentsByFieldId(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  if (features.length <= 1) return features

  const groups = new Map<string, GeoJSON.Feature[]>()
  for (const f of features) {
    const key = fieldUnionKey(f)
    const list = groups.get(key) ?? []
    list.push(f)
    groups.set(key, list)
  }

  const out: GeoJSON.Feature[] = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]!)
      continue
    }
    let merged: GeoJSON.Feature = group[0]!
    let ok = true
    for (let i = 1; i < group.length; i++) {
      try {
        const next = group[i]!
        const u = turf.union(turf.featureCollection([merged as any, next as any]))
        if (!u?.geometry) {
          ok = false
          break
        }
        merged = {
          type: 'Feature',
          properties: { ...(merged.properties ?? {}), ...(next.properties ?? {}) },
          geometry: u.geometry,
        }
      } catch {
        ok = false
        break
      }
    }
    if (ok) out.push(merged)
    else out.push(...group)
  }
  return out
}

/**
 * Hide tile boundaries for export/display: mosaic validate → union by field id → merge tile seams.
 */
export function hideFtwTileBoundaries(
  features: GeoJSON.Feature[],
  mosaic: FtwRasterMosaic,
  zoom: number,
): GeoJSON.Feature[] {
  const validated = filterFtwFeaturesByMosaicMask(features, mosaic)
  const byId = unionFtwFragmentsByFieldId(validated)
  return mergeFtwSeamTouchingFragments(byId, zoom)
}

/**
 * Hide tile seams on vectors only (dedupe + union + seam merge) — used before raster mosaic.
 */
export function hideFtwTileBoundariesOnly(
  features: GeoJSON.Feature[],
  zoom = 14,
): GeoJSON.Feature[] {
  const masked = applyFtwFieldBoundaryMaskExport(features)
  const merged = unionFtwFragmentsByFieldId(masked)
  const seamsMerged = mergeFtwSeamTouchingFragments(merged, zoom)
  return dedupeFtwTileFeatures(seamsMerged)
}
