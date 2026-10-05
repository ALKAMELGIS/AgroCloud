import type { WeatherMapLayerId } from './weatherLayerCatalog'

/** ArcGIS / live map raster layers backed by NOAA GFS (0.25° via Open-Meteo tiles). */
export const WEATHER_GFS_RASTER_LAYER_OPTIONS: Array<{
  id: WeatherMapLayerId
  label: string
  gfsVariable: string
}> = [
  { id: 'temperature', label: 'Temperature at 2 m', gfsVariable: 'temperature_2m' },
  { id: 'precipitation', label: 'Rainfall / Precipitation', gfsVariable: 'precipitation' },
  { id: 'wind_speed', label: 'Wind Speed', gfsVariable: 'wind_speed_10m' },
  { id: 'wind_direction', label: 'Wind Direction', gfsVariable: 'wind_direction_10m' },
  { id: 'humidity', label: 'Relative Humidity', gfsVariable: 'relative_humidity_2m' },
  { id: 'cloud_cover', label: 'Cloud Cover', gfsVariable: 'cloud_cover' },
  { id: 'shortwave_radiation', label: 'Solar Radiation', gfsVariable: 'shortwave_radiation' },
  { id: 'dew_point', label: 'Dew Point', gfsVariable: 'dew_point_2m' },
]

export function gfsVariableForLayer(layerId: WeatherMapLayerId): string {
  const row = WEATHER_GFS_RASTER_LAYER_OPTIONS.find(o => o.id === layerId)
  if (row) return row.gfsVariable
  if (layerId === 'rain') return 'rain'
  return 'temperature_2m'
}
