import {
  OPEN_METEO_FORECAST_MAX_DAYS,
  OpenMeteoDailyForecast,
  OpenMeteoHourlyPoint,
  OpenMeteoWeatherSnapshot,
  parseHourlySeries,
  wmoWeatherLabel,
  windDirectionLabel,
} from '@/modules/remote-sensing/weather/openMeteoWeather'
import { apiUrl, noteApiResponse } from '@/core/api/apiOrigin'
import {
  addDaysToYmd,
  daysBetweenYmdInclusive,
  filterHourlyByDateRange,
  getWeatherChartTodayYmd,
  type WeatherChartDateRange,
} from '../config/weatherChartDateRange'

export type OpenMeteoDashboardHourlyPoint = OpenMeteoHourlyPoint & {
  apparentTemperatureC: number | null
  dewPointC: number | null
  cloudCoverPct: number | null
  visibilityKm: number | null
  precipitationProbabilityPct: number | null
  rainMm: number | null
}

export type OpenMeteoDashboardBundle = {
  snapshot: OpenMeteoWeatherSnapshot
  hourly: OpenMeteoDashboardHourlyPoint[]
  hourlyForecast: OpenMeteoDashboardHourlyPoint[]
  daily7: OpenMeteoDailyForecast[]
  fetchedAt: string
  sourceLabel: string
  resolutionLabel: string
}

export type WeatherKpiTrend = {
  temperatureC: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  pressureHpa: number | null
  precipProbabilityPct: number | null
}

function parseDashboardHourly(data: Record<string, unknown>): OpenMeteoDashboardHourlyPoint[] {
  const hourly = data.hourly as
    | {
        time?: string[]
        temperature_2m?: number[]
        apparent_temperature?: number[]
        weather_code?: number[]
        precipitation?: number[]
        precipitation_probability?: number[]
        et0_fao_evapotranspiration?: number[]
        rain?: number[]
        snowfall?: number[]
        relative_humidity_2m?: number[]
        dew_point_2m?: number[]
        cloud_cover?: number[]
        visibility?: number[]
        wind_speed_10m?: number[]
        wind_direction_10m?: number[]
        surface_pressure?: number[]
      }
    | undefined
  const out: OpenMeteoDashboardHourlyPoint[] = []
  if (!hourly?.time?.length) return out
  for (let i = 0; i < hourly.time.length; i++) {
    out.push({
      time: hourly.time[i],
      temperatureC: hourly.temperature_2m?.[i] ?? null,
      apparentTemperatureC: hourly.apparent_temperature?.[i] ?? null,
      weatherCode: hourly.weather_code?.[i] ?? null,
      precipitationMm: hourly.precipitation?.[i] ?? null,
      precipitationProbabilityPct: hourly.precipitation_probability?.[i] ?? null,
      rainMm: hourly.rain?.[i] ?? null,
      snowfallCm: hourly.snowfall?.[i] ?? null,
      humidityPct: hourly.relative_humidity_2m?.[i] ?? null,
      dewPointC: hourly.dew_point_2m?.[i] ?? null,
      cloudCoverPct: hourly.cloud_cover?.[i] ?? null,
      visibilityKm:
        hourly.visibility?.[i] != null && Number.isFinite(hourly.visibility[i])
          ? hourly.visibility[i]! / 1000
          : null,
      windSpeedKmh: hourly.wind_speed_10m?.[i] ?? null,
      windDirectionDeg: hourly.wind_direction_10m?.[i] ?? null,
      pressureHpa: hourly.surface_pressure?.[i] ?? null,
      et0Mm: hourly.et0_fao_evapotranspiration?.[i] ?? null,
      shortwaveRadiationWm2: null,
    })
  }
  return out
}

export function sliceHourlyFromAnchor(
  points: OpenMeteoDashboardHourlyPoint[],
  fromIso: string,
  max: number,
): OpenMeteoDashboardHourlyPoint[] {
  return sliceFromNow(points, fromIso, max)
}

function sliceFromNow(points: OpenMeteoDashboardHourlyPoint[], fromIso: string, max: number): OpenMeteoDashboardHourlyPoint[] {
  if (!points.length) return []
  const fromMs = new Date(fromIso).getTime()
  if (!Number.isFinite(fromMs)) return points.slice(0, max)

  const forward = points.filter(p => new Date(p.time).getTime() >= fromMs).slice(0, max)
  if (forward.length) return forward

  let anchor = 0
  let bestDiff = Infinity
  for (let i = 0; i < points.length; i++) {
    const t = new Date(points[i].time).getTime()
    if (!Number.isFinite(t)) continue
    const d = Math.abs(t - fromMs)
    if (d < bestDiff) {
      bestDiff = d
      anchor = i
    }
  }
  return points.slice(anchor, anchor + max)
}

function pickNearestHourly(
  hourly: OpenMeteoDashboardHourlyPoint[],
  timeIso: string,
): OpenMeteoDashboardHourlyPoint | null {
  if (!hourly.length) return null
  const fromMs = new Date(timeIso).getTime()
  if (!Number.isFinite(fromMs)) return hourly[0]
  let best = hourly[0]
  let bestDiff = Infinity
  for (const h of hourly) {
    const t = new Date(h.time).getTime()
    if (!Number.isFinite(t)) continue
    const d = Math.abs(t - fromMs)
    if (d < bestDiff) {
      bestDiff = d
      best = h
    }
  }
  return best
}

function buildSnapshotFromApi(
  lat: number,
  lng: number,
  data: Record<string, unknown>,
  daily: OpenMeteoDailyForecast[],
  nextHours: OpenMeteoHourlyPoint[],
  hourlyAll: OpenMeteoDashboardHourlyPoint[] = [],
): OpenMeteoWeatherSnapshot {
  const tz = typeof data.timezone === 'string' ? data.timezone : 'UTC'
  const elev = typeof data.elevation === 'number' ? data.elevation : null
  const cur = data.current as Record<string, unknown> | undefined
  const time = typeof cur?.time === 'string' ? cur.time : new Date().toISOString()
  let temp = typeof cur?.temperature_2m === 'number' ? cur.temperature_2m : null
  let code = typeof cur?.weather_code === 'number' ? cur.weather_code : null
  let wind = typeof cur?.wind_speed_10m === 'number' ? cur.wind_speed_10m : null
  let windDir = typeof cur?.wind_direction_10m === 'number' ? cur.wind_direction_10m : null
  let rh = typeof cur?.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null
  let precip = typeof cur?.precipitation === 'number' ? cur.precipitation : null

  const nearest = pickNearestHourly(hourlyAll, time)
  if (nearest) {
    if (temp == null) temp = nearest.temperatureC
    if (code == null) code = nearest.weatherCode
    if (wind == null) wind = nearest.windSpeedKmh
    if (windDir == null) windDir = nearest.windDirectionDeg
    if (rh == null) rh = nearest.humidityPct
    if (precip == null) precip = nearest.precipitationMm
  }

  return {
    lat,
    lng,
    timezone: tz,
    elevationM: elev,
    observedAt: time,
    temperatureC: temp,
    weatherCode: code,
    conditionLabel: wmoWeatherLabel(code),
    windSpeedKmh: wind,
    windDirectionDeg: windDir,
    windDirectionLabel: windDirectionLabel(windDir),
    humidityPct: rh,
    precipMm: precip,
    daily,
    nextHours,
  }
}

export function parseOpenMeteoDashboardBundle(
  lat: number,
  lng: number,
  data: Record<string, unknown>,
  fetchedAt?: string,
): OpenMeteoDashboardBundle {
  const dailyRaw = data.daily as
    | {
        time?: string[]
        weather_code?: number[]
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        precipitation_sum?: number[]
        et0_fao_evapotranspiration?: number[]
      }
    | undefined

  const daily: OpenMeteoDailyForecast[] = []
  if (dailyRaw?.time?.length) {
    for (let i = 0; i < dailyRaw.time.length; i++) {
      const wc = dailyRaw.weather_code?.[i] ?? null
      daily.push({
        date: dailyRaw.time[i],
        tempMaxC: dailyRaw.temperature_2m_max?.[i] ?? null,
        tempMinC: dailyRaw.temperature_2m_min?.[i] ?? null,
        precipMm: dailyRaw.precipitation_sum?.[i] ?? null,
        et0Mm: dailyRaw.et0_fao_evapotranspiration?.[i] ?? null,
        weatherCode: wc,
        conditionLabel: wmoWeatherLabel(wc),
      })
    }
  }

  const hourlyAll = parseDashboardHourly(data)
  const cur = data.current as Record<string, unknown> | undefined
  const time = typeof cur?.time === 'string' ? cur.time : new Date().toISOString()
  const legacyHourly = parseHourlySeries(data)
  const snapshot = buildSnapshotFromApi(
    lat,
    lng,
    data,
    daily,
    parseHourlySlice(legacyHourly, time, 24),
    hourlyAll,
  )

  return {
    snapshot,
    hourly: hourlyAll,
    hourlyForecast: sliceFromNow(hourlyAll, time, 72),
    daily7: daily.slice(0, 7),
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    sourceLabel: 'Open-Meteo',
    resolutionLabel: '~11 km (ECMWF IFS)',
  }
}

async function fetchOpenMeteoDirect(lat: number, lng: number): Promise<OpenMeteoDashboardBundle> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation',
      'rain',
      'snowfall',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'surface_pressure',
      'wind_speed_10m',
      'wind_direction_10m',
      'visibility',
    ].join(','),
  )
  url.searchParams.set('hourly', [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'dew_point_2m',
    'precipitation',
    'precipitation_probability',
    'rain',
    'snowfall',
    'weather_code',
    'cloud_cover',
    'visibility',
    'wind_speed_10m',
    'wind_direction_10m',
    'surface_pressure',
    'et0_fao_evapotranspiration',
  ].join(','))
  url.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'et0_fao_evapotranspiration',
    'precipitation_probability_max',
    'wind_speed_10m_max',
    'wind_direction_10m_dominant',
  ].join(','))
  url.searchParams.set('past_days', '3')
  url.searchParams.set('forecast_days', String(Math.min(7, OPEN_METEO_FORECAST_MAX_DAYS)))
  url.searchParams.set('wind_speed_unit', 'kmh')

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = new Error(`Open-Meteo HTTP ${res.status}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  const data = (await res.json()) as Record<string, unknown>
  return parseOpenMeteoDashboardBundle(lat, lng, data)
}

async function fetchOpenMeteoDirectLite(lat: number, lng: number): Promise<OpenMeteoDashboardBundle> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('wind_speed_unit', 'kmh')
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
  )
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,weather_code',
  )
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code')
  url.searchParams.set('forecast_days', '3')

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = new Error(`Open-Meteo HTTP ${res.status}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  const data = (await res.json()) as Record<string, unknown>
  return parseOpenMeteoDashboardBundle(lat, lng, data)
}

function parseHourlySlice(points: OpenMeteoHourlyPoint[], fromIso: string, max: number): OpenMeteoHourlyPoint[] {
  const fromMs = new Date(fromIso).getTime()
  return points.filter(p => new Date(p.time).getTime() >= fromMs).slice(0, max)
}

export type LocationWeatherPatch = {
  temperatureC: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  precipMm: number | null
  weatherCode: number | null
}

export function weatherBundleHasSnapshot(bundle: OpenMeteoDashboardBundle | null | undefined): boolean {
  if (!bundle?.snapshot) return false
  const s = bundle.snapshot
  return (
    s.temperatureC != null ||
    s.weatherCode != null ||
    s.windSpeedKmh != null ||
    s.humidityPct != null
  )
}

export function mergeLocationPatchIntoBundle(
  bundle: OpenMeteoDashboardBundle | null,
  lat: number,
  lng: number,
  patch: LocationWeatherPatch | null | undefined,
): OpenMeteoDashboardBundle | null {
  if (!patch || (patch.temperatureC == null && patch.weatherCode == null)) return bundle
  if (weatherBundleHasSnapshot(bundle)) return bundle

  const now = new Date().toISOString()
  const code = patch.weatherCode
  const snapshot: OpenMeteoWeatherSnapshot = {
    lat,
    lng,
    timezone: bundle?.snapshot?.timezone ?? 'UTC',
    elevationM: bundle?.snapshot?.elevationM ?? null,
    observedAt: bundle?.snapshot?.observedAt ?? now,
    temperatureC: patch.temperatureC,
    weatherCode: code,
    conditionLabel: wmoWeatherLabel(code),
    windSpeedKmh: patch.windSpeedKmh,
    windDirectionDeg: bundle?.snapshot?.windDirectionDeg ?? null,
    windDirectionLabel: bundle?.snapshot?.windDirectionLabel ?? '—',
    humidityPct: patch.humidityPct,
    precipMm: patch.precipMm,
    daily: bundle?.snapshot?.daily ?? bundle?.daily7 ?? [],
    nextHours: bundle?.snapshot?.nextHours ?? [],
  }

  if (!bundle) {
    return {
      snapshot,
      hourly: [],
      hourlyForecast: [],
      daily7: snapshot.daily.slice(0, 7),
      fetchedAt: now,
      sourceLabel: 'Open-Meteo',
      resolutionLabel: '~11 km',
    }
  }

  return { ...bundle, snapshot }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

async function fetchWith429Retry<T>(run: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await run()
    } catch (e) {
      lastError = e
      const msg = e instanceof Error ? e.message : String(e)
      const is429 = msg.includes('429') || (e as { status?: number }).status === 429
      if (!is429 || i >= attempts - 1) break
      await sleep(800 * (i + 1))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Weather fetch failed')
}

export function weatherBundleHasUsableData(bundle: OpenMeteoDashboardBundle | null | undefined): boolean {
  if (!bundle) return false
  return (
    weatherBundleHasSnapshot(bundle) ||
    bundle.hourlyForecast.length > 0 ||
    bundle.hourly.length > 0 ||
    bundle.daily7.length > 0
  )
}

async function fetchOpenMeteoViaApi(lat: number, lng: number): Promise<OpenMeteoDashboardBundle | null> {
  try {
    const url = `${apiUrl('/api/weather/dashboard')}?lat=${lat}&lng=${lng}`
    const res = await fetch(url, { credentials: 'same-origin' })
    noteApiResponse(res.status)
    if (!res.ok) return null
    const payload = (await res.json()) as {
      openMeteo?: Record<string, unknown>
      fetchedAt?: string
    }
    if (!payload.openMeteo) return null
    return parseOpenMeteoDashboardBundle(lat, lng, payload.openMeteo, payload.fetchedAt)
  } catch {
    return null
  }
}

export async function fetchOpenMeteoDashboardBundle(
  lat: number,
  lng: number,
): Promise<OpenMeteoDashboardBundle> {
  const errors: string[] = []
  for (const fetcher of [fetchOpenMeteoDirectLite, fetchOpenMeteoDirect]) {
    try {
      const bundle = await fetchWith429Retry(() => fetcher(lat, lng))
      if (weatherBundleHasUsableData(bundle)) return bundle
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'fetch failed')
    }
  }

  const proxied = await fetchOpenMeteoViaApi(lat, lng)
  if (weatherBundleHasUsableData(proxied)) return proxied!

  if (proxied) return proxied
  throw new Error(errors[0] ?? 'Unable to load Open-Meteo dashboard data')
}

export function computeWeatherKpiTrend(hourly: OpenMeteoDashboardHourlyPoint[]): WeatherKpiTrend {
  if (hourly.length < 2) {
    return {
      temperatureC: null,
      humidityPct: null,
      windSpeedKmh: null,
      pressureHpa: null,
      precipProbabilityPct: null,
    }
  }
  const a = hourly[0]
  const b = hourly[1]
  const delta = (x: number | null, y: number | null) =>
    x != null && y != null ? y - x : null
  return {
    temperatureC: delta(a.temperatureC, b.temperatureC),
    humidityPct: delta(a.humidityPct, b.humidityPct),
    windSpeedKmh: delta(a.windSpeedKmh, b.windSpeedKmh),
    pressureHpa: delta(a.pressureHpa, b.pressureHpa),
    precipProbabilityPct: delta(a.precipitationProbabilityPct, b.precipitationProbabilityPct),
  }
}

const CHART_RANGE_HOURLY_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'precipitation_probability',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
].join(',')

async function fetchOpenMeteoHourlyJson(
  url: URL,
  signal?: AbortSignal,
): Promise<OpenMeteoDashboardHourlyPoint[]> {
  const res = await fetch(url.toString(), { signal })
  if (!res.ok) {
    const err = new Error(`Open-Meteo HTTP ${res.status}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  const data = (await res.json()) as Record<string, unknown>
  return parseDashboardHourly(data)
}

const HOURLY_RANGE_CACHE_TTL_MS = 10 * 60_000
const hourlyRangeCache = new Map<
  string,
  { at: number; rows: OpenMeteoDashboardHourlyPoint[] }
>()

function hourlyRangeCacheKey(
  lat: number,
  lng: number,
  range: WeatherChartDateRange,
): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}|${range.startDate}|${range.endDate}`
}

/** Synchronous read of a recent hourly-range response (for instant tab paint). */
export function peekOpenMeteoHourlyRangeCache(
  lat: number,
  lng: number,
  range: WeatherChartDateRange,
): OpenMeteoDashboardHourlyPoint[] | null {
  const key = hourlyRangeCacheKey(lat, lng, range)
  const hit = hourlyRangeCache.get(key)
  if (!hit || Date.now() - hit.at > HOURLY_RANGE_CACHE_TTL_MS) return null
  return hit.rows
}

async function fetchHourlyRangeViaApi(
  lat: number,
  lng: number,
  range: WeatherChartDateRange,
  signal?: AbortSignal,
): Promise<OpenMeteoDashboardHourlyPoint[] | null> {
  try {
    const q = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      start_date: range.startDate,
      end_date: range.endDate,
    })
    const res = await fetch(`${apiUrl('/api/weather/hourly-range')}?${q}`, {
      credentials: 'same-origin',
      signal,
    })
    noteApiResponse(res.status)
    if (!res.ok) return null
    const payload = (await res.json()) as { hourly?: OpenMeteoDashboardHourlyPoint[] }
    if (!payload.hourly?.length) return null
    return payload.hourly
  } catch {
    return null
  }
}

async function fetchForecastHourlyWindow(
  lat: number,
  lng: number,
  signal?: AbortSignal,
  opts?: { startDate?: string; endDate?: string; pastDays?: number; forecastDays?: number },
): Promise<OpenMeteoDashboardHourlyPoint[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('wind_speed_unit', 'kmh')
  url.searchParams.set('hourly', CHART_RANGE_HOURLY_VARS)
  if (opts?.startDate && opts?.endDate) {
    url.searchParams.set('start_date', opts.startDate)
    url.searchParams.set('end_date', opts.endDate)
  } else {
    url.searchParams.set('past_days', String(Math.max(1, opts?.pastDays ?? 7)))
    url.searchParams.set('forecast_days', String(Math.max(1, opts?.forecastDays ?? 7)))
  }
  return fetchOpenMeteoHourlyJson(url, signal)
}

/** Hourly series for ArcGIS chart date range (forecast API; archive only for older history). */
export async function fetchOpenMeteoHourlyForDateRange(
  lat: number,
  lng: number,
  range: WeatherChartDateRange,
  signal?: AbortSignal,
): Promise<OpenMeteoDashboardHourlyPoint[]> {
  const startDate = range.startDate
  const endDate = range.endDate
  if (!startDate || !endDate || startDate > endDate) return []

  const cacheKey = hourlyRangeCacheKey(lat, lng, range)
  const cached = hourlyRangeCache.get(cacheKey)
  if (cached && Date.now() - cached.at <= HOURLY_RANGE_CACHE_TTL_MS) {
    return cached.rows
  }

  const proxied = await fetchHourlyRangeViaApi(lat, lng, range, signal)
  if (proxied?.length) {
    const rows = filterHourlyByDateRange(proxied, range)
    hourlyRangeCache.set(cacheKey, { at: Date.now(), rows })
    return rows
  }

  const today = getWeatherChartTodayYmd()
  let merged: OpenMeteoDashboardHourlyPoint[] = []

  try {
    merged = await fetchWith429Retry(() =>
      fetchForecastHourlyWindow(lat, lng, signal, { startDate, endDate }),
    )
  } catch {
    merged = []
  }

  if (!merged.length) {
    const pastDays = Math.min(92, daysBetweenYmdInclusive(startDate, today) + 1)
    const forecastDays = Math.min(16, daysBetweenYmdInclusive(today, endDate) + 1)
    try {
      merged = await fetchWith429Retry(() =>
        fetchForecastHourlyWindow(lat, lng, signal, { pastDays, forecastDays }),
      )
    } catch {
      merged = []
    }
  }

  const archiveLagDays = 5
  const archiveThrough = addDaysToYmd(today, -archiveLagDays)
  if (!merged.length && startDate < archiveThrough) {
    const archiveEnd = endDate < archiveThrough ? endDate : archiveThrough
    const url = new URL('https://archive-api.open-meteo.com/v1/archive')
    url.searchParams.set('latitude', String(lat))
    url.searchParams.set('longitude', String(lng))
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('wind_speed_unit', 'kmh')
    url.searchParams.set('start_date', startDate)
    url.searchParams.set('end_date', archiveEnd)
    url.searchParams.set('hourly', CHART_RANGE_HOURLY_VARS)
    try {
      merged = await fetchOpenMeteoHourlyJson(url, signal)
    } catch {
      /* ignore */
    }
  }

  if (!merged.length) return []

  const rows = filterHourlyByDateRange(merged, range)
  hourlyRangeCache.set(cacheKey, { at: Date.now(), rows })
  return rows
}
