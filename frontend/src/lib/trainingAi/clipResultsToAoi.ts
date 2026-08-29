/**
 * Clip Training & AI inference GeoJSON to Active AOI (Edit sketch / Layers mask).
 */

import * as turf from '@turf/turf'
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'

function asPolyFeature(geom: GeoJSON.Geometry): Feature<Polygon | MultiPolygon> | null {
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return null
  return { type: 'Feature', properties: {}, geometry: geom }
}

function aoiClipParts(aoi: FeatureCollection | null | undefined): Feature<Polygon | MultiPolygon>[] {
  if (!aoi?.features?.length) return []
  const out: Feature<Polygon | MultiPolygon>[] = []
  for (const f of aoi.features) {
    const g = f?.geometry
    if (!g) continue
    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      out.push({ type: 'Feature', properties: {}, geometry: g })
      continue
    }
    if (g.type === 'GeometryCollection') {
      for (const part of g.geometries || []) {
        const pf = asPolyFeature(part)
        if (pf) out.push(pf)
      }
    }
  }
  return out
}

/** Normalize Geometry | Feature | FeatureCollection into a clip mask FC. */
export function geometryToAoiFeatureCollection(
  aoi: GeoJSON.Geometry | GeoJSON.Feature | FeatureCollection | null | undefined,
): FeatureCollection {
  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
  if (!aoi) return empty
  if (aoi.type === 'FeatureCollection') {
    return { type: 'FeatureCollection', features: [...(aoi.features || [])] }
  }
  if (aoi.type === 'Feature') {
    return { type: 'FeatureCollection', features: [aoi as Feature] }
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: aoi as GeoJSON.Geometry }],
  }
}

/** Stable signature for AOI change detection (bbox rounded to ~0.1 m). */
export function aoiFeatureCollectionSignature(
  aoi: FeatureCollection | null | undefined,
): string {
  const bbox = aoiFeatureCollectionBbox(aoi)
  if (!bbox) return 'empty'
  return bbox.map(v => v.toFixed(6)).join(',')
}

function clipPolygonFeatureToPart(
  feat: Feature,
  src: Feature<Polygon | MultiPolygon>,
  clip: Feature<Polygon | MultiPolygon>,
): Feature<Polygon | MultiPolygon> | null {
  const attempts: Feature<Polygon | MultiPolygon>[] = [src]
  try {
    const cleaned = turf.cleanCoords(src) as Feature<Polygon | MultiPolygon>
    if (cleaned?.geometry) attempts.push(cleaned)
  } catch {
    /* ignore */
  }

  for (const candidate of attempts) {
    try {
      const hit = turf.intersect(turf.featureCollection([candidate, clip]))
      if (
        hit?.geometry &&
        (hit.geometry.type === 'Polygon' || hit.geometry.type === 'MultiPolygon')
      ) {
        return {
          type: 'Feature',
          properties: { ...(feat.properties || {}) },
          geometry: hit.geometry,
        }
      }
    } catch {
      /* next attempt */
    }
  }

  return null
}

/** Clip one polygon feature against all AOI parts; may return multiple pieces. */
function clipPolygonFeatureToAoi(
  feat: Feature,
  src: Feature<Polygon | MultiPolygon>,
  clips: Feature<Polygon | MultiPolygon>[],
): Feature[] {
  for (const clip of clips) {
    try {
      if (turf.booleanWithin(src, clip)) {
        return [
          {
            type: 'Feature',
            properties: { ...(feat.properties || {}) },
            geometry: src.geometry,
          },
        ]
      }
    } catch {
      /* try intersect per clip */
    }
  }

  const pieces: Feature[] = []
  for (const clip of clips) {
    const hit = clipPolygonFeatureToPart(feat, src, clip)
    if (hit) pieces.push(hit)
  }
  return pieces
}

/** Bbox [west, south, east, north] from AOI FeatureCollection, or null. */
export function aoiFeatureCollectionBbox(
  aoi: FeatureCollection | null | undefined,
): [number, number, number, number] | null {
  if (!aoi?.features?.length) return null
  try {
    const b = turf.bbox(aoi as any)
    if (!b || b.length < 4) return null
    const [w, s, e, n] = b
    if (![w, s, e, n].every(Number.isFinite) || e <= w || n <= s) return null
    return [w, s, e, n]
  } catch {
    return null
  }
}

/**
 * Keep only the portions of `features` that intersect the AOI polygons.
 * Points: keep if inside any AOI part. Polygons/lines: turf.intersect / boolean-within.
 */
export function clipFeatureCollectionToAoi(
  features: FeatureCollection | null | undefined,
  aoi: FeatureCollection | null | undefined,
): FeatureCollection {
  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
  if (!features?.features?.length) return empty
  const clips = aoiClipParts(aoi)
  if (!clips.length) {
    return { type: 'FeatureCollection', features: [...features.features] }
  }

  const out: Feature[] = []
  for (const feat of features.features) {
    if (!feat?.geometry) continue
    const gtype = feat.geometry.type
    try {
      if (gtype === 'Point' || gtype === 'MultiPoint') {
        const pts =
          gtype === 'Point'
            ? [feat.geometry.coordinates as [number, number]]
            : (feat.geometry.coordinates as [number, number][])
        const keep = pts.some(pt =>
          clips.some(clip => {
            try {
              return turf.booleanPointInPolygon(pt, clip)
            } catch {
              return false
            }
          }),
        )
        if (keep) out.push(feat)
        continue
      }

      const src = asPolyFeature(feat.geometry)
      if (!src) {
        // LineString etc. — keep if centroid in AOI
        try {
          const c = turf.centroid(feat as any)
          const inside = clips.some(clip => turf.booleanPointInPolygon(c, clip))
          if (inside) out.push(feat)
        } catch {
          /* drop */
        }
        continue
      }

      out.push(...clipPolygonFeatureToAoi(feat, src, clips))
    } catch {
      /* skip feature */
    }
  }

  return { type: 'FeatureCollection', features: out }
}

export function aoiSourceLabel(
  source: 'draw' | 'layers' | 'agro' | null | undefined,
): string {
  if (source === 'draw') return 'Active AOI (Edit)'
  if (source === 'layers') return 'Layers AOI'
  if (source === 'agro') return 'Layer Source mask'
  return 'Current map extent'
}
