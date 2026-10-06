import type { WeatherMapLayerId } from './weatherLayerCatalog'
import {
  WEATHER_MAP_PORTFOLIO_CENTER,
  WEATHER_WINDY_PORTFOLIO_MAX_ZOOM,
  WEATHER_WINDY_SITE_ZOOM,
  estimateMapZoomForBounds,
} from './weatherMapView'
import { agriLocationLatLng } from '../map/weatherLocationPoint'
import type { WeatherLocationId } from './weatherFarmIds'
import { windyOverlayFromLayer } from '../utils/buildWindyEmbedUrl'
import { buildWindyEmbedUrl, type WindyEmbedOverlay } from '../utils/buildWindyEmbedUrl'

export type WindyMapView = {
  lat: number
  lon: number
  detailLat: number
  detailLon: number
  zoom: number
}

function portfolioBounds(agriLocations: GeoJSON.FeatureCollection | null | undefined): {
  south: number
  north: number
  west: number
  east: number
} | null {
  const features = agriLocations?.features ?? []
  let south = Infinity
  let north = -Infinity
  let west = Infinity
  let east = -Infinity
  for (const f of features) {
    const g = f.geometry
    if (!g || g.type !== 'Point') continue
    const [lng, lat] = g.coordinates
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    south = Math.min(south, lat)
    north = Math.max(north, lat)
    west = Math.min(west, lng)
    east = Math.max(east, lng)
  }
  if (!Number.isFinite(south)) return null
  const pad = 0.35
  return {
    south: south - pad,
    north: north + pad,
    west: west - pad,
    east: east + pad,
  }
}

/** Default Windy framing: portfolio bounds for “All”, exact pin for one site. */
export function resolveWindyMapView(input: {
  farmId: string
  lat: number
  lon: number
  agriLocations?: GeoJSON.FeatureCollection | null
}): WindyMapView {
  const fallbackLat = Number.isFinite(input.lat) ? input.lat : WEATHER_MAP_PORTFOLIO_CENTER[0]
  const fallbackLon = Number.isFinite(input.lon) ? input.lon : WEATHER_MAP_PORTFOLIO_CENTER[1]

  if (input.farmId !== 'all') {
    const pin = agriLocationLatLng(input.agriLocations, input.farmId as WeatherLocationId)
    const lat = pin?.[0] ?? fallbackLat
    const lon = pin?.[1] ?? fallbackLon
    return {
      lat,
      lon,
      detailLat: lat,
      detailLon: lon,
      zoom: WEATHER_WINDY_SITE_ZOOM,
    }
  }

  const bounds = portfolioBounds(input.agriLocations)
  if (!bounds) {
    return {
      lat: fallbackLat,
      lon: fallbackLon,
      detailLat: fallbackLat,
      detailLon: fallbackLon,
      zoom: WEATHER_WINDY_PORTFOLIO_MAX_ZOOM,
    }
  }

  const lat = (bounds.south + bounds.north) / 2
  const lon = (bounds.west + bounds.east) / 2
  const zoom = Math.min(
    WEATHER_WINDY_PORTFOLIO_MAX_ZOOM,
    estimateMapZoomForBounds(bounds.west, bounds.south, bounds.east, bounds.north),
  )
  return {
    lat,
    lon,
    detailLat: lat,
    detailLon: lon,
    zoom,
  }
}

export function windyOverlayForMapDisplayView(
  _mapDisplayView: string,
  activeLayerId: WeatherMapLayerId,
): WindyEmbedOverlay {
  return windyOverlayFromLayer(activeLayerId)
}

export function buildWindyEmbed2Url(input: {
  lat: number
  lon: number
  overlay: WindyEmbedOverlay
  zoom: number
  locationLabel?: string
  detailLat?: number
  detailLon?: number
}): string {
  const detailLat = input.detailLat ?? input.lat
  const detailLon = input.detailLon ?? input.lon
  return buildWindyEmbedUrl({
    lat: input.lat,
    lng: input.lon,
    detailLat,
    detailLon,
    zoom: input.zoom,
    overlay: input.overlay,
  })
}
