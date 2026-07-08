import { computeStableGisFeatureKey } from '../gisFeatureStableKey'
import {
  bboxesIntersect,
  featureIntersectsMask,
  featureWithinMask,
  geometryBBox,
  pointInPolygonGeometry,
} from '../geoAiGeoJsonSpatial'
import type { GisSelectionHit, GisSelectionLayerSource, GisSpatialRelationship } from './types'

type GeoFeature = {
  id?: unknown
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: unknown }
}

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const r = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(a))
}

function bboxWithin(inner: [number, number, number, number], outer: [number, number, number, number]): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3]
}

function lineBufferPolygon(
  coords: [number, number][],
  bufferDeg: number,
): { type: 'Polygon'; coordinates: [number, number][][] } | null {
  if (coords.length < 2) return null
  const rings: [number, number][] = []
  for (const [lng, lat] of coords) {
    rings.push([lng - bufferDeg, lat - bufferDeg], [lng + bufferDeg, lat - bufferDeg], [lng + bufferDeg, lat + bufferDeg], [lng - bufferDeg, lat + bufferDeg])
  }
  const bb = geometryBBox({ type: 'LineString', coordinates: coords })
  if (!bb) return null
  const [minLng, minLat, maxLng, maxLat] = bb
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLng - bufferDeg, minLat - bufferDeg],
        [maxLng + bufferDeg, minLat - bufferDeg],
        [maxLng + bufferDeg, maxLat + bufferDeg],
        [minLng - bufferDeg, maxLat + bufferDeg],
        [minLng - bufferDeg, minLat - bufferDeg],
      ],
    ],
  }
}

export function featureMatchesSpatialRelationship(
  feature: GeoFeature,
  maskGeometries: Array<{ type?: string; coordinates?: unknown }>,
  relationship: GisSpatialRelationship,
  distanceM = 0,
): boolean {
  const g = feature.geometry
  if (!g) return false
  const bbFeature = geometryBBox(g)
  if (!bbFeature) return false

  if (relationship === 'within_distance' && distanceM > 0) {
    const bufferDeg = distanceM / 111_320
    for (const m of maskGeometries) {
      const bbMask = geometryBBox(m)
      if (!bbMask) continue
      const cx = (bbFeature[0] + bbFeature[2]) / 2
      const cy = (bbFeature[1] + bbFeature[3]) / 2
      const mx = (bbMask[0] + bbMask[2]) / 2
      const my = (bbMask[1] + bbMask[3]) / 2
      if (haversineM(cx, cy, mx, my) <= distanceM) return true
      if (featureIntersectsMask(feature, [m])) return true
    }
    return false
  }

  if (relationship === 'within' || relationship === 'completely_contains') {
    return featureWithinMask(feature, maskGeometries)
  }

  if (relationship === 'contains') {
    const cx = (bbFeature[0] + bbFeature[2]) / 2
    const cy = (bbFeature[1] + bbFeature[3]) / 2
    for (const m of maskGeometries) {
      if (pointInPolygonGeometry(cx, cy, m)) {
        const bbMask = geometryBBox(m)
        if (bbMask && bboxWithin(bbMask, bbFeature)) return true
      }
    }
    return false
  }

  if (relationship === 'overlaps' || relationship === 'touches' || relationship === 'intersects') {
    return featureIntersectsMask(feature, maskGeometries)
  }

  return featureIntersectsMask(feature, maskGeometries)
}

export function selectFeaturesAtPoint(
  layers: GisSelectionLayerSource[],
  selectableLayerIds: Set<string>,
  lng: number,
  lat: number,
): GisSelectionHit[] {
  const hits: GisSelectionHit[] = []
  const seen = new Set<string>()

  for (const layer of layers) {
    if (!selectableLayerIds.has(String(layer.id))) continue
    const arr = layer.geojson?.features
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i] as GeoFeature
      const g = f?.geometry
      if (!g || !pointInPolygonGeometry(lng, lat, g)) continue
      const featureKey = computeStableGisFeatureKey(f, i)
      const k = `${layer.id}::${featureKey}`
      if (seen.has(k)) continue
      seen.add(k)
      hits.push({
        layerId: String(layer.id),
        featureKey,
        layerName: layer.name,
        properties: (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<string, unknown>,
      })
    }
  }
  return hits
}

export function selectFeaturesByMask(
  layers: GisSelectionLayerSource[],
  selectableLayerIds: Set<string>,
  maskGeometries: Array<{ type?: string; coordinates?: unknown }>,
  relationship: GisSpatialRelationship = 'intersects',
  distanceM = 0,
): GisSelectionHit[] {
  const hits: GisSelectionHit[] = []
  const seen = new Set<string>()

  for (const layer of layers) {
    if (!selectableLayerIds.has(String(layer.id))) continue
    const arr = layer.geojson?.features
    if (!Array.isArray(arr)) continue
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i] as GeoFeature
      if (!f?.geometry) continue
      if (!featureMatchesSpatialRelationship(f, maskGeometries, relationship, distanceM)) continue
      const featureKey = computeStableGisFeatureKey(f, i)
      const k = `${layer.id}::${featureKey}`
      if (seen.has(k)) continue
      seen.add(k)
      hits.push({
        layerId: String(layer.id),
        featureKey,
        layerName: layer.name,
        properties: (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<string, unknown>,
      })
    }
  }
  return hits
}

export function lineSelectionMask(lineCoords: [number, number][], bufferM = 25): GeoJSON.Geometry[] {
  const bufferDeg = bufferM / 111_320
  const poly = lineBufferPolygon(lineCoords, bufferDeg)
  return poly ? [poly] : []
}

export function hitsToSelectionKeys(hits: GisSelectionHit[]): Set<string> {
  return new Set(hits.map(h => `${h.layerId}::${h.featureKey}`))
}

export function mergeSelectionHits(
  current: GisSelectionHit[],
  incoming: GisSelectionHit[],
  mode: 'new' | 'add' | 'remove' | 'subset',
): GisSelectionHit[] {
  const byKey = new Map(current.map(h => [`${h.layerId}::${h.featureKey}`, h]))
  const incomingKeys = new Set(incoming.map(h => `${h.layerId}::${h.featureKey}`))

  if (mode === 'new') return [...incoming]

  if (mode === 'add') {
    for (const h of incoming) byKey.set(`${h.layerId}::${h.featureKey}`, h)
    return [...byKey.values()]
  }

  if (mode === 'remove') {
    for (const k of incomingKeys) byKey.delete(k)
    return [...byKey.values()]
  }

  return incoming.filter(h => byKey.has(`${h.layerId}::${h.featureKey}`))
}
