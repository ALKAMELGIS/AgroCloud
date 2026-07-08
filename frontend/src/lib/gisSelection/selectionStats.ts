import { geometryBBox } from '../geoAiGeoJsonSpatial'
import type { GisSelectionHit, GisSelectionLayerSource, GisSelectionStats } from './types'

function ringAreaHa(ring: [number, number][]): number {
  if (ring.length < 3) return 0
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!
    const [x2, y2] = ring[i + 1]!
    sum += x1 * y2 - x2 * y1
  }
  const m2 = Math.abs(sum / 2) * (111_320 * 111_320 * Math.cos(((ring[0]?.[1] ?? 0) * Math.PI) / 180))
  return m2 / 10_000
}

function featureAreaHa(geometry: { type?: string; coordinates?: unknown } | undefined): number {
  if (!geometry) return 0
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates?.[0])) {
    return ringAreaHa(geometry.coordinates[0] as [number, number][])
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    let total = 0
    for (const poly of geometry.coordinates as unknown[]) {
      if (Array.isArray(poly) && Array.isArray(poly[0])) total += ringAreaHa(poly[0] as [number, number][])
    }
    return total
  }
  const bb = geometryBBox(geometry)
  if (!bb) return 0
  const w = bb[2] - bb[0]
  const h = bb[3] - bb[1]
  return (w * 111_320 * h * 110_540) / 10_000
}

export function computeSelectionStats(
  hits: GisSelectionHit[],
  layers: GisSelectionLayerSource[],
): GisSelectionStats {
  let areaHa = 0
  let lengthKm = 0
  const numeric: Record<string, number[]> = {}

  for (const hit of hits) {
    const layer = layers.find(l => String(l.id) === hit.layerId)
    const arr = layer?.geojson?.features
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i] as { geometry?: { type?: string; coordinates?: unknown }; properties?: Record<string, unknown> }
      const props = hit.properties
      if (f.geometry) {
        const t = f.geometry.type
        if (t === 'LineString' || t === 'MultiLineString') lengthKm += 0.5
        else areaHa += featureAreaHa(f.geometry)
      }
      for (const [k, v] of Object.entries(props)) {
        const n = Number(v)
        if (!Number.isFinite(n)) continue
        if (!numeric[k]) numeric[k] = []
        numeric[k].push(n)
      }
    }
  }

  const numericSummaries = Object.entries(numeric).map(([field, vals]) => {
    const sum = vals.reduce((a, b) => a + b, 0)
    return {
      field,
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: sum / vals.length,
      sum,
    }
  })

  return {
    featureCount: hits.length,
    areaHa: hits.length ? areaHa : null,
    lengthKm: hits.length ? lengthKm : null,
    numericSummaries: numericSummaries.slice(0, 8),
  }
}
