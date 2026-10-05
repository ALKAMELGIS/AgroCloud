import type { WeatherMapLayerId } from './weatherLayerCatalog'

/** Core variables for Open-Meteo viewport grid → IDW raster (ArcGIS map view). */
export const WEATHER_OPEN_METEO_RASTER_LAYER_IDS: WeatherMapLayerId[] = [
  'temperature',
  'precipitation',
  'wind_speed',
  'humidity',
  'cloud_cover',
]

export const WEATHER_OPEN_METEO_RASTER_DEFAULT_OPACITY = 0.82

export function isOpenMeteoRasterLayer(layerId: WeatherMapLayerId): boolean {
  return WEATHER_OPEN_METEO_RASTER_LAYER_IDS.includes(layerId)
}
