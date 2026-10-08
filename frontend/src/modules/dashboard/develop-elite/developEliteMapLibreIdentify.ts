import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import distance from '@turf/distance'
import { point as turfPoint } from '@turf/helpers'
import type { DevelopEliteMapDataLayerId } from './developEliteMapDataLayers'
import { isDevelopEliteMapDataLayerVisible } from './developEliteMapDataLayers'
import {
  computeStableGisFeatureKey,
  findFeatureIndexByStableKey,
} from '@/modules/gis/layers/gisFeatureStableKey'
import type { DevelopEliteMapSearchSources } from './developEliteMapSearch'
import { developEliteMapGeoJsonForLayer } from './developEliteMapSearch'

const FALLBACK_LAYER_ORDER: DevelopEliteMapDataLayerId[] = [
  'irrigation-valves',
  'trees',
  'agri-location',
  'irrigation-main-pipe',
  'agro-structures',
]

function readProp(props: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(props, key)) return props[key]
  const lower = key.toLowerCase()
  for (const k of Object.keys(props)) {
    if (k.toLowerCase() === lower) return props[k]
  }
  return undefined
}

function featureTouchesLngLat(feature: GeoJSON.Feature, lngLat: [number, number], maxKm: number): boolean {
  const geometry = feature.geometry
  if (!geometry) return false
  const pt = turfPoint(lngLat)

  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    try {
      return booleanPointInPolygon(pt, feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>)
    } catch {
      return false
    }
  }

  if (geometry.type === 'Point') {
    const coords = geometry.coordinates
    if (coords.length < 2) return false
    return distance(pt, turfPoint([coords[0], coords[1]]), { units: 'kilometers' }) <= maxKm
  }

  if (geometry.type === 'MultiPoint') {
    for (const c of geometry.coordinates) {
      if (c.length < 2) continue
      if (distance(pt, turfPoint([c[0], c[1]]), { units: 'kilometers' }) <= maxKm) return true
    }
    return false
  }

  if (geometry.type === 'LineString') {
    for (const c of geometry.coordinates) {
      if (c.length < 2) continue
      if (distance(pt, turfPoint([c[0], c[1]]), { units: 'kilometers' }) <= maxKm) return true
    }
    return false
  }

  if (geometry.type === 'MultiLineString') {
    for (const line of geometry.coordinates) {
      for (const c of line) {
        if (c.length < 2) continue
        if (distance(pt, turfPoint([c[0], c[1]]), { units: 'kilometers' }) <= maxKm) return true
      }
    }
  }

  return false
}

export function matchDevelopEliteMapSourceFeature(
  collection: GeoJSON.FeatureCollection | null | undefined,
  hit: GeoJSON.Feature,
): GeoJSON.Feature | null {
  if (!collection?.features?.length) return null
  const props = (hit.properties ?? {}) as Record<string, unknown>
  const oid = readProp(props, 'OBJECTID') ?? readProp(props, 'ObjectID')
  if (oid != null) {
    const match = collection.features.find(f => {
      const p = (f.properties ?? {}) as Record<string, unknown>
      const candidate = readProp(p, 'OBJECTID') ?? readProp(p, 'ObjectID')
      return candidate != null && String(candidate) === String(oid)
    })
    if (match) return match
  }
  const key = computeStableGisFeatureKey(hit)
  if (key) {
    const idx = findFeatureIndexByStableKey(collection.features, key)
    if (idx >= 0) return collection.features[idx] ?? null
  }
  return null
}

export function enrichDevelopEliteMapIdentifyFeature(
  hit: GeoJSON.Feature,
  layerKey: DevelopEliteMapDataLayerId,
  sources?: DevelopEliteMapSearchSources | null,
): GeoJSON.Feature {
  const fc = sources ? developEliteMapGeoJsonForLayer(sources, layerKey) : null
  const matched = matchDevelopEliteMapSourceFeature(fc, hit)
  if (!matched) return hit
  return {
    type: 'Feature',
    geometry: hit.geometry ?? matched.geometry,
    properties: { ...(matched.properties ?? {}), ...(hit.properties ?? {}) },
  }
}

export function fallbackDevelopEliteMapIdentifyAtLngLat(
  lngLat: [number, number],
  sources: DevelopEliteMapSearchSources | null | undefined,
  viewMode3d: boolean,
): { layerKey: DevelopEliteMapDataLayerId; feature: GeoJSON.Feature } | null {
  if (!sources) return null
  const pointKm = viewMode3d ? 0.08 : 0.035

  for (const layerKey of FALLBACK_LAYER_ORDER) {
    if (!isDevelopEliteMapDataLayerVisible(sources.mapLayerVisibility, layerKey)) continue
    const fc = developEliteMapGeoJsonForLayer(sources, layerKey)
    if (!fc?.features?.length) continue
    for (const feature of fc.features) {
      if (featureTouchesLngLat(feature, lngLat, pointKm)) {
        return { layerKey, feature }
      }
    }
  }
  return null
}
