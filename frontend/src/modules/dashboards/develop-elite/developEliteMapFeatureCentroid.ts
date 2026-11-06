import { centroid } from '@turf/turf'

export function developEliteFeaturePopupLngLat(
  feature: GeoJSON.Feature,
): [number, number] | null {
  if (!feature.geometry) return null
  try {
    const c = centroid(feature)
    const coords = c.geometry.coordinates
    if (coords.length < 2) return null
    return [coords[0]!, coords[1]!]
  } catch {
    return null
  }
}
