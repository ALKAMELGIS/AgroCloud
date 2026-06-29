import { fetchOpenMeteoWeather, type OpenMeteoWeatherSnapshot } from '../../../../lib/openMeteoWeather'
import { apiUrl, ensureBackendAvailable, noteApiResponse } from '../../../../lib/apiOrigin'
import {
  groupWeatherTickerFieldsByGrid,
  weatherGridKey,
  type AcpWeatherTickerField,
} from './acpWeatherAlertTickerModel'

export const ACP_WEATHER_FETCH_DEBOUNCE_MS = 800
export const ACP_WEATHER_REFRESH_MS = 30 * 60_000
export const ACP_WEATHER_CACHE_TTL_MS = 30 * 60_000
export const ACP_WEATHER_FETCH_CONCURRENCY = 4

const weatherCache = new Map<string, { at: number; snapshot: OpenMeteoWeatherSnapshot }>()

type ApiWeatherFieldSnapshot = {
  fieldKey: string
  lat: number
  lng: number
  observedAt: string
  temperatureC: number | null
  weatherCode: number | null
  conditionLabel: string
  windSpeedKmh: number | null
  windDirectionLabel: string
  humidityPct: number | null
  precipMm: number | null
}

function snapshotFromApi(row: ApiWeatherFieldSnapshot): OpenMeteoWeatherSnapshot {
  return {
    lat: row.lat,
    lng: row.lng,
    timezone: 'UTC',
    elevationM: null,
    observedAt: row.observedAt,
    temperatureC: row.temperatureC,
    weatherCode: row.weatherCode,
    conditionLabel: row.conditionLabel,
    windSpeedKmh: row.windSpeedKmh,
    windDirectionDeg: null,
    windDirectionLabel: row.windDirectionLabel,
    humidityPct: row.humidityPct,
    precipMm: row.precipMm,
    daily: [],
    nextHours: [],
  }
}

async function fetchWeatherCached(lat: number, lng: number): Promise<OpenMeteoWeatherSnapshot> {
  const key = weatherGridKey(lat, lng)
  const hit = weatherCache.get(key)
  if (hit && Date.now() - hit.at < ACP_WEATHER_CACHE_TTL_MS) return hit.snapshot
  const snapshot = await fetchOpenMeteoWeather(lat, lng)
  weatherCache.set(key, { at: Date.now(), snapshot })
  return snapshot
}

async function fetchWeatherViaApi(
  fields: AcpWeatherTickerField[],
): Promise<Map<string, OpenMeteoWeatherSnapshot> | null> {
  // Static deployments have no co-located backend; probe once up-front and skip the doomed
  // POST entirely so the client-side Open-Meteo path handles it (avoids 404/405 console errors).
  if (!(await ensureBackendAvailable())) return null
  try {
    const res = await fetch(apiUrl('/api/acp/weather/fields'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        fields: fields.map(f => ({
          fieldKey: f.fieldKey,
          lat: f.lat,
          lng: f.lng,
        })),
      }),
    })
    noteApiResponse(res.status)
    if (!res.ok) return null
    const data = (await res.json()) as {
      fields?: ApiWeatherFieldSnapshot[]
    }
    if (!Array.isArray(data.fields)) return null
    const out = new Map<string, OpenMeteoWeatherSnapshot>()
    for (const row of data.fields) {
      if (!row?.fieldKey) continue
      out.set(row.fieldKey, snapshotFromApi(row))
      weatherCache.set(weatherGridKey(row.lat, row.lng), {
        at: Date.now(),
        snapshot: snapshotFromApi(row),
      })
    }
    return out.size ? out : null
  } catch {
    return null
  }
}

async function fetchWeatherClientSide(
  fields: AcpWeatherTickerField[],
): Promise<Map<string, OpenMeteoWeatherSnapshot>> {
  const out = new Map<string, OpenMeteoWeatherSnapshot>()
  if (!fields.length) return out

  const groups = groupWeatherTickerFieldsByGrid(fields)
  const gridJobs = [...groups.entries()].map(([, groupFields]) => ({
    lat: groupFields[0]!.lat,
    lng: groupFields[0]!.lng,
    fieldKeys: groupFields.map(f => f.fieldKey),
  }))

  for (let i = 0; i < gridJobs.length; i += ACP_WEATHER_FETCH_CONCURRENCY) {
    const batch = gridJobs.slice(i, i + ACP_WEATHER_FETCH_CONCURRENCY)
    const results = await Promise.all(
      batch.map(async job => {
        try {
          const snapshot = await fetchWeatherCached(job.lat, job.lng)
          return { job, snapshot }
        } catch {
          return { job, snapshot: null }
        }
      }),
    )
    for (const { job, snapshot } of results) {
      if (!snapshot) continue
      for (const fieldKey of job.fieldKeys) {
        out.set(fieldKey, snapshot)
      }
    }
  }

  return out
}

export async function fetchAcpWeatherByFieldKeys(
  fields: AcpWeatherTickerField[],
): Promise<Map<string, OpenMeteoWeatherSnapshot>> {
  if (!fields.length) return new Map()

  const fromApi = await fetchWeatherViaApi(fields)
  if (fromApi && fromApi.size > 0) return fromApi

  return fetchWeatherClientSide(fields)
}

export type AcpWeatherLayerConfig = {
  weatherAlertsVisible: boolean
}

export async function fetchAcpWeatherLayerConfig(): Promise<AcpWeatherLayerConfig | null> {
  if (!(await ensureBackendAvailable())) return null
  try {
    const res = await fetch(apiUrl('/api/acp/weather/layer-config'), {
      headers: { Accept: 'application/json' },
    })
    noteApiResponse(res.status)
    if (!res.ok) return null
    const data = (await res.json()) as AcpWeatherLayerConfig
    if (typeof data.weatherAlertsVisible !== 'boolean') return null
    return data
  } catch {
    return null
  }
}
