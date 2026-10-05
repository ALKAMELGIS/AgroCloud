import type { WeatherMapLayerId } from './weatherLayerCatalog'

/** Primary Windy-style parameters shown on the map layer strip. */
export const WEATHER_WINDY_LAYER_IDS: WeatherMapLayerId[] = [
  'temperature',
  'precipitation',
  'wind_speed',
  'wind_direction',
  'humidity',
  'cloud_cover',
  'pressure',
]

export function isPrecipLayer(id: WeatherMapLayerId): boolean {
  return id === 'precipitation' || id === 'rain'
}
