import L from 'leaflet'
import { flyToGeoJsonExtent, flyToLatLng } from '@/modules/dashboard/develop-elite/developEliteMapFly'
import type { WeatherLocationId } from '../config/weatherFarmIds'
import {
  WEATHER_MAP_PORTFOLIO_MAX_ZOOM,
  WEATHER_MAP_WORLD_CENTER,
  WEATHER_MAP_WORLD_ZOOM,
} from '../config/weatherMapView'
import type { WeatherFarmSite } from '../services/weatherFarmService'
import { agriLocationLatLng } from './weatherLocationPoint'
import { pulseWeatherMapLocation } from './weatherMapLocationPulse'

export type WeatherMapFocusOptions = {
  pulse?: boolean
  zoom?: number
}

/** Fly map to a portfolio location (table double-click, selection, markers). */
export function focusWeatherFarmOnMap(
  map: L.Map,
  farmId: WeatherLocationId,
  site: WeatherFarmSite | null,
  agriLocations: GeoJSON.FeatureCollection | null | undefined,
  options: WeatherMapFocusOptions = {},
): void {
  const pulse = options.pulse ?? false
  const pinZoom = options.zoom ?? 16

  if (farmId === 'all') {
    const locFeatures = agriLocations?.features ?? []
    if (locFeatures.length) {
      const layer = L.geoJSON({ type: 'FeatureCollection', features: locFeatures })
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: [48, 48],
          maxZoom: WEATHER_MAP_PORTFOLIO_MAX_ZOOM,
        })
        return
      }
    }
    map.setView(WEATHER_MAP_WORLD_CENTER, WEATHER_MAP_WORLD_ZOOM)
    return
  }

  const pin = agriLocationLatLng(agriLocations, farmId)
  const focusLat = pin?.[0] ?? site?.lat
  const focusLng = pin?.[1] ?? site?.lng

  if (pin) {
    flyToLatLng(map, pin[0], pin[1], pinZoom)
    if (pulse) pulseWeatherMapLocation(map, pin[0], pin[1])
    return
  }

  if (!site) {
    map.setView(WEATHER_MAP_WORLD_CENTER, WEATHER_MAP_WORLD_ZOOM)
    return
  }

  if (site.featureCollection.features.length) {
    const flew = flyToGeoJsonExtent(map, site.featureCollection, {
      padding: [40, 40],
      maxZoom: 14,
    })
    if (flew && pulse && Number.isFinite(focusLat) && Number.isFinite(focusLng)) {
      pulseWeatherMapLocation(map, focusLat!, focusLng!)
    }
    if (flew) return
  }

  if (Number.isFinite(site.lat) && Number.isFinite(site.lng)) {
    flyToLatLng(map, site.lat, site.lng, options.zoom ?? 14)
    if (pulse) pulseWeatherMapLocation(map, site.lat, site.lng)
  }
}
