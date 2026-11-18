import L from 'leaflet'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'

export function geoJsonBounds(geojson: GeoJSON.FeatureCollection): L.LatLngBounds | null {
  if (!geojson.features.length) return null
  try {
    const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject)
    const b = layer.getBounds()
    return b.isValid() ? b : null
  } catch {
    return null
  }
}

export function flyToGeoJsonExtent(
  map: L.Map,
  geojson: GeoJSON.FeatureCollection,
  options?: { padding?: [number, number]; maxZoom?: number },
): boolean {
  const b = geoJsonBounds(geojson)
  if (!b) return false
  map.flyToBounds(b, {
    padding: options?.padding ?? [24, 24],
    maxZoom: options?.maxZoom ?? 14,
    duration: 0.85,
  })
  return true
}

export function flyToFieldKey(
  map: L.Map,
  geojson: GeoJSON.FeatureCollection,
  fieldKey: string,
): boolean {
  const hit = geojson.features.find(
    (f, i) => computeStableGisFeatureKey(f, i) === fieldKey,
  )
  if (!hit?.geometry) return false
  try {
    const layer = L.geoJSON(hit as GeoJSON.GeoJsonObject)
    const b = layer.getBounds()
    if (!b.isValid()) return false
    map.flyToBounds(b, { padding: [48, 48], maxZoom: 16, duration: 0.8 })
    return true
  } catch {
    return false
  }
}

export function flyToLatLng(
  map: L.Map,
  lat: number,
  lng: number,
  zoom = 14,
): void {
  map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.85 })
}

export function flyToGeoJsonFeatureIndex(
  map: L.Map,
  geojson: GeoJSON.FeatureCollection,
  featureIndex: number,
): boolean {
  const hit = geojson.features[featureIndex]
  if (!hit?.geometry) return false
  try {
    const layer = L.geoJSON(hit as GeoJSON.GeoJsonObject)
    const b = layer.getBounds()
    if (!b.isValid()) return false
    const isPoint =
      hit.geometry.type === 'Point' ||
      (hit.geometry.type === 'MultiPoint' && hit.geometry.coordinates.length === 1)
    if (isPoint) {
      const center = b.getCenter()
      map.flyTo(center, Math.max(map.getZoom(), 16), { duration: 0.85 })
    } else {
      map.flyToBounds(b, { padding: [48, 48], maxZoom: 16, duration: 0.8 })
    }
    return true
  } catch {
    return false
  }
}
