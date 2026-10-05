import { weatherLocationIdFromFeature, type WeatherLocationId } from '../config/weatherFarmIds'

export function readFeaturePointLatLng(feature: GeoJSON.Feature): [number, number] | null {
  const g = feature.geometry
  if (!g || g.type !== 'Point') return null
  const [lng, lat] = g.coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return [lat, lng]
}

export function agriLocationLatLng(
  agriLocations: GeoJSON.FeatureCollection | null | undefined,
  locationId: WeatherLocationId,
): [number, number] | null {
  if (!agriLocations?.features?.length || locationId === 'all') return null
  for (const feature of agriLocations.features) {
    if (weatherLocationIdFromFeature(feature) !== locationId) continue
    return readFeaturePointLatLng(feature)
  }
  return null
}
