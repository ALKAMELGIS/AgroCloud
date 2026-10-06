import { fetchOpenMeteoWeatherMapPick } from '@/modules/remote-sensing/weather/openMeteoWeather'
import type { WeatherLocationId } from '../config/weatherFarmIds'
import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'

const cache = new Map<string, WeatherLocationRow>()

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`
}

export function peekLocationLiveRow(lat: number, lng: number): WeatherLocationRow | null {
  return cache.get(cacheKey(lat, lng)) ?? null
}

export async function fetchLocationLiveRow(
  id: WeatherLocationId,
  label: string,
  lat: number,
  lng: number,
  signal?: AbortSignal,
): Promise<WeatherLocationRow> {
  const key = cacheKey(lat, lng)
  const hit = cache.get(key)
  if (hit?.temperatureC != null) return { ...hit, id, label }

  const snap = await fetchOpenMeteoWeatherMapPick(lat, lng, signal)
  const d0 = snap.daily?.[0]
  const row: WeatherLocationRow = {
    id,
    label,
    temperatureC: snap.temperatureC,
    humidityPct: snap.humidityPct,
    windSpeedKmh: snap.windSpeedKmh,
    windDirectionDeg: snap.windDirectionDeg ?? null,
    precipMm: snap.precipMm,
    weatherCode: snap.weatherCode,
    dailyMinC: d0?.tempMinC ?? null,
    dailyMaxC: d0?.tempMaxC ?? null,
  }
  cache.set(key, row)
  try {
    window.dispatchEvent(new CustomEvent('weather-location-live-cache'))
  } catch {
    /* ignore */
  }
  return row
}

