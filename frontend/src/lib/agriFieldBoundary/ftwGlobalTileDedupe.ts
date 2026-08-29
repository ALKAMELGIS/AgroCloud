/**
 * Remove duplicate FTW polygons re-introduced when adjacent PMTiles/MVT tiles
 * are flattened into one GeoJSON source (tile-boundary stacking / seam lines).
 */

import * as turf from '@turf/turf'
import { resolveFieldPolygonOverlaps } from './fieldResultRefine'

/** Cap turf overlap pass — keeps pan/zoom responsive in dense views. */
export const FTW_TILE_DEDUPE_MAX_OVERLAP_RESOLVE = 5000

/** Tile duplicates are near-identical copies — aggressive IoU drop. */
export const FTW_TILE_OVERLAP_DROP_IOU = 0.88

function featureConfidenceMean(f: GeoJSON.Feature): number {
  const p = (f.properties ?? {}) as Record<string, unknown>
  const c = Number(p.confidence_mean ?? p.confidence ?? p.score ?? 0)
  return Number.isFinite(c) ? c : 0
}

function ringSignature(f: GeoJSON.Feature): string | null {
  const g = f.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null
  try {
    const bbox = turf.bbox(f)
    return bbox.map(v => v.toFixed(5)).join(',')
  } catch {
    return null
  }
}

export function ftwFeatureStableKey(f: GeoJSON.Feature): string {
  const p = (f.properties ?? {}) as Record<string, unknown>
  const id = String(p.field_id ?? p.id ?? p.fid ?? '').trim()
  if (id) return `id:${id}`
  const sig = ringSignature(f)
  if (sig) return `geom:${sig}`
  return `anon:${Math.random().toString(36).slice(2)}`
}

/** Drop stacked tile-boundary duplicates; keep highest-confidence copy per key. */
export function dedupeFtwTileFeatures(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  if (features.length <= 1) return features

  const byKey = new Map<string, GeoJSON.Feature>()
  for (const f of features) {
    const key = ftwFeatureStableKey(f)
    const prev = byKey.get(key)
    if (!prev || featureConfidenceMean(f) >= featureConfidenceMean(prev)) {
      byKey.set(key, f)
    }
  }

  const keyed = [...byKey.values()]
  if (keyed.length <= 1) return keyed

  const resolved = resolveFieldPolygonOverlaps(
    { type: 'FeatureCollection', features: keyed },
    { dropIou: FTW_TILE_OVERLAP_DROP_IOU },
  )
  return resolved.features
}
