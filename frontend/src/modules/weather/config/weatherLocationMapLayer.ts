import type { WeatherMapLayerId } from './weatherLayerCatalog'
import {
  type OpenMeteoWeatherSnapshot,
  windDirectionLabel,
} from '@/modules/remote-sensing/weather/openMeteoWeather'
import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'
import { WEATHER_GFS_RASTER_LAYER_OPTIONS } from './weatherGfsRaster'

const STORAGE_KEY = 'agrocloud.weather.mapLayerByLocation.v1'

type LayerStore = Record<string, WeatherMapLayerId>

function readStore(): LayerStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as LayerStore
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: LayerStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    /* quota */
  }
}

export function readLocationMapLayer(locationId: string): WeatherMapLayerId | null {
  const id = readStore()[locationId]
  return id ?? null
}

export function writeLocationMapLayer(locationId: string, layerId: WeatherMapLayerId) {
  const store = readStore()
  store[locationId] = layerId
  writeStore(store)
}

export type LocationWeatherReading = {
  temperatureC?: number | null
  humidityPct?: number | null
  windSpeedKmh?: number | null
  windDirectionLabel?: string | null
  precipMm?: number | null
}

export function weatherReadingFromSnapshot(
  snap: OpenMeteoWeatherSnapshot | null | undefined,
): LocationWeatherReading | null {
  if (!snap) return null
  return {
    temperatureC: snap.temperatureC,
    humidityPct: snap.humidityPct,
    windSpeedKmh: snap.windSpeedKmh,
    windDirectionLabel: snap.windDirectionLabel,
    precipMm: snap.precipMm,
  }
}

export function weatherReadingFromRow(row: WeatherLocationRow | null | undefined): LocationWeatherReading | null {
  if (!row) return null
  return {
    temperatureC: row.temperatureC,
    humidityPct: row.humidityPct,
    windSpeedKmh: row.windSpeedKmh,
    windDirectionLabel:
      row.windDirectionDeg != null ? windDirectionLabel(row.windDirectionDeg) : null,
    precipMm: row.precipMm,
  }
}

export function mergeWeatherReadings(
  primary: LocationWeatherReading | null,
  fallback: LocationWeatherReading | null,
): LocationWeatherReading | null {
  if (!primary && !fallback) return null
  return {
    temperatureC: primary?.temperatureC ?? fallback?.temperatureC ?? null,
    humidityPct: primary?.humidityPct ?? fallback?.humidityPct ?? null,
    windSpeedKmh: primary?.windSpeedKmh ?? fallback?.windSpeedKmh ?? null,
    windDirectionLabel: primary?.windDirectionLabel ?? fallback?.windDirectionLabel ?? null,
    precipMm: primary?.precipMm ?? fallback?.precipMm ?? null,
  }
}

export function suggestMapLayerForWeather(reading: LocationWeatherReading | null): WeatherMapLayerId {
  if (!reading) return 'temperature'
  if (reading.precipMm != null && reading.precipMm >= 0.4) return 'precipitation'
  if (reading.humidityPct != null && reading.humidityPct >= 78) return 'humidity'
  if (reading.windSpeedKmh != null && reading.windSpeedKmh >= 35) return 'wind_speed'
  return 'temperature'
}

export function formatMapLayerLiveReading(
  layerId: WeatherMapLayerId,
  reading: LocationWeatherReading | null,
): string | null {
  if (!reading) return null
  switch (layerId) {
    case 'temperature':
    case 'apparent_temperature':
      return reading.temperatureC != null ? `${Math.round(reading.temperatureC)}°C` : null
    case 'dew_point':
      return reading.temperatureC != null ? `~${Math.round(reading.temperatureC - 4)}°C` : null
    case 'humidity':
      return reading.humidityPct != null ? `${Math.round(reading.humidityPct)}%` : null
    case 'wind_speed':
      return reading.windSpeedKmh != null ? `${Math.round(reading.windSpeedKmh)} km/h` : null
    case 'wind_direction':
      return reading.windDirectionLabel?.trim() || null
    case 'precipitation':
    case 'rain':
      return reading.precipMm != null ? `${reading.precipMm.toFixed(1)} mm` : null
    default:
      return null
  }
}

export function mapViewSelectLabel(
  layerId: WeatherMapLayerId,
  reading: LocationWeatherReading | null,
): string {
  const base = WEATHER_GFS_RASTER_LAYER_OPTIONS.find(o => o.id === layerId)?.label ?? layerId
  const live = formatMapLayerLiveReading(layerId, reading)
  return live ? `${base} (${live})` : base
}
