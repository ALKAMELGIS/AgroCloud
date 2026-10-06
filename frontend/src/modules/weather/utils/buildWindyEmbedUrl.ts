import type { WeatherMapLayerId } from '../config/weatherLayerCatalog'

export type WindyEmbedOverlay =
  | 'wind'
  | 'temp'
  | 'rain'
  | 'clouds'
  | 'pressure'
  | 'rh'
  | 'gust'
  | 'waves'

export function windyOverlayFromLayer(layerId: WeatherMapLayerId): WindyEmbedOverlay {
  if (layerId === 'wind_speed' || layerId === 'wind_direction') return 'wind'
  if (layerId === 'temperature' || layerId === 'apparent_temperature' || layerId === 'dew_point') return 'temp'
  if (layerId === 'precipitation' || layerId === 'rain' || layerId === 'snowfall') return 'rain'
  if (layerId === 'cloud_cover') return 'clouds'
  if (layerId === 'pressure') return 'pressure'
  if (layerId === 'humidity') return 'rh'
  return 'wind'
}

export type BuildWindyEmbedUrlInput = {
  lat: number
  lng: number
  detailLat?: number
  detailLon?: number
  zoom?: number
  overlay?: WindyEmbedOverlay
}

/** Windy.com embed URL (ECMWF). Coordinates follow header location selection. */
export function buildWindyEmbedUrl(input: BuildWindyEmbedUrlInput): string {
  const lat = input.lat
  const lng = input.lng
  const detailLat = input.detailLat ?? lat
  const detailLon = input.detailLon ?? lng
  const url = new URL('https://embed.windy.com/embed2.html')
  url.searchParams.set('lat', lat.toFixed(3))
  url.searchParams.set('lon', lng.toFixed(3))
  url.searchParams.set('detailLat', detailLat.toFixed(3))
  url.searchParams.set('detailLon', detailLon.toFixed(3))
  url.searchParams.set('zoom', String(input.zoom ?? 10))
  url.searchParams.set('level', 'surface')
  url.searchParams.set('overlay', input.overlay ?? 'temp')
  url.searchParams.set('product', 'ecmwf')
  url.searchParams.set('menu', '')
  url.searchParams.set('message', 'true')
  url.searchParams.set('marker', '')
  url.searchParams.set('calendar', '24')
  url.searchParams.set('pressure', 'true')
  url.searchParams.set('type', 'map')
  url.searchParams.set('location', 'coordinates')
  url.searchParams.set('detail', '')
  url.searchParams.set('metricWind', 'km/h')
  url.searchParams.set('metricTemp', 'default')
  url.searchParams.set('radarRange', '-1')
  return url.toString()
}
