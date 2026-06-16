/**
 * Open-Meteo forecast API for Weather Intelligence UI (no API key).
 * @see https://open-meteo.com/en/docs
 */

export type OpenMeteoDailyForecast = {
  date: string
  tempMaxC: number | null
  tempMinC: number | null
  precipMm: number | null
  weatherCode: number | null
  conditionLabel: string
}

export type OpenMeteoHourlyPoint = {
  time: string
  temperatureC: number | null
  weatherCode: number | null
  precipitationMm: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  windDirectionDeg: number | null
  pressureHpa: number | null
}

export type OpenMeteoWeatherSnapshot = {
  lat: number
  lng: number
  timezone: string
  elevationM: number | null
  observedAt: string
  temperatureC: number | null
  weatherCode: number | null
  conditionLabel: string
  windSpeedKmh: number | null
  windDirectionDeg: number | null
  windDirectionLabel: string
  humidityPct: number | null
  precipMm: number | null
  daily: OpenMeteoDailyForecast[]
  /** Next ~24 hours from forecast hourly (for strip UI). */
  nextHours: OpenMeteoHourlyPoint[]
}

const WMO_LABELS: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
}

export function wmoWeatherLabel(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return '—'
  const c = Math.round(code)
  return WMO_LABELS[c] ?? `Code ${c}`
}

export type WmoWeatherTone = 'clear' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm' | 'neutral'

export function wmoWeatherTone(code: number | null | undefined): WmoWeatherTone {
  if (code == null || !Number.isFinite(code)) return 'neutral'
  const c = Math.round(code)
  if (c === 0 || c === 1) return 'clear'
  if (c === 2) return 'partly'
  if (c === 3) return 'cloud'
  if (c === 45 || c === 48) return 'fog'
  if (c >= 51 && c <= 55) return 'drizzle'
  if (c >= 61 && c <= 67) return 'rain'
  if (c >= 71 && c <= 77) return 'snow'
  if (c >= 80 && c <= 82) return 'rain'
  if (c >= 95) return 'storm'
  return 'cloud'
}

export function wmoWeatherIconClass(code: number | null | undefined): string {
  if (code == null || !Number.isFinite(code)) return 'fa-solid fa-cloud'
  const c = Math.round(code)
  if (c === 0 || c === 1) return 'fa-solid fa-sun'
  if (c === 2) return 'fa-solid fa-cloud-sun'
  if (c === 3) return 'fa-solid fa-cloud'
  if (c === 45 || c === 48) return 'fa-solid fa-smog'
  if (c >= 51 && c <= 55) return 'fa-solid fa-cloud-rain'
  if (c >= 61 && c <= 67) return 'fa-solid fa-cloud-showers-heavy'
  if (c >= 71 && c <= 77) return 'fa-solid fa-snowflake'
  if (c >= 80 && c <= 82) return 'fa-solid fa-cloud-bolt'
  if (c >= 95) return 'fa-solid fa-bolt'
  return 'fa-solid fa-cloud'
}

/** CSS modifier for colored weather glyphs (`si-wx-tone--{tone}`). */
export function wmoWeatherToneClass(code: number | null | undefined): string {
  return `si-wx-tone--${wmoWeatherTone(code)}`
}

export function windDirectionLabel(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return '—'
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
  const i = Math.round(deg / 45) % 8
  return dirs[i]
}

/** Parse "lat,lng" or "lng lat" style queries. Returns [lat, lng] or null. */
export function parseLatLngQuery(raw: string): { lat: number; lng: number } | null {
  const t = raw.trim()
  if (!t) return null
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b }
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a }
  return null
}

export async function geocodePlaceQuery(
  query: string,
  mapboxToken?: string,
): Promise<Array<{ lat: number; lng: number; label: string }>> {
  const q = query.trim()
  if (!q) return []
  const direct = parseLatLngQuery(q)
  if (direct) {
    return [{ ...direct, label: `${direct.lat.toFixed(4)}, ${direct.lng.toFixed(4)}` }]
  }
  const token = (mapboxToken || '').trim()
  try {
    if (token) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(token)}&limit=5`
      const res = await fetch(url)
      if (res.ok) {
        const data = (await res.json()) as { features?: Array<{ center?: [number, number]; place_name?: string }> }
        return (data.features ?? [])
          .filter(f => Array.isArray(f.center) && f.center.length >= 2)
          .map(f => ({
            lng: f.center![0],
            lat: f.center![1],
            label: f.place_name || `${f.center![1]}, ${f.center![0]}`,
          }))
      }
    }
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=geojson&limit=5&q=${encodeURIComponent(q)}`,
      { headers: { Accept: 'application/json', 'Accept-Language': 'en', 'User-Agent': 'AgroCloud/1.0 (Weather Intelligence)' } },
    )
    if (!res.ok) return []
    const data = (await res.json()) as {
      features?: Array<{ geometry?: { coordinates?: [number, number] }; properties?: { display_name?: string } }>
    }
    return (data.features ?? [])
      .filter(f => Array.isArray(f.geometry?.coordinates) && f.geometry!.coordinates!.length >= 2)
      .map(f => {
        const [lng, lat] = f.geometry!.coordinates!
        return {
          lat,
          lng,
          label: f.properties?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        }
      })
  } catch {
    return []
  }
}

export async function reversePlaceLabel(
  lat: number,
  lng: number,
  mapboxToken?: string,
): Promise<string> {
  const token = (mapboxToken || '').trim()
  try {
    if (token) {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${encodeURIComponent(token)}&limit=1`
      const res = await fetch(url)
      if (res.ok) {
        const j = (await res.json()) as { features?: Array<{ place_name?: string }> }
        const name = j.features?.[0]?.place_name
        if (name) return name
      }
    }
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&zoom=12&addressdetails=0`,
      { headers: { Accept: 'application/json', 'User-Agent': 'AgroCloud/1.0 (Weather Intelligence)' } },
    )
    if (res.ok) {
      const j = (await res.json()) as { display_name?: string }
      if (j.display_name) return j.display_name
    }
  } catch {
    /* ignore */
  }
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

export type OpenMeteoTemporalCard = {
  key: string
  title: string
  date: string
  tempC: number | null
  weatherCode: number | null
  conditionLabel: string
  windSpeedKmh: number | null
  windDirectionLabel: string
  humidityPct: number | null
  precipMm: number | null
}

export type WeatherHistoryMetric = 'temp' | 'rain' | 'humid' | 'wind' | 'press'

export type OpenMeteoTimeHistory = {
  timezone: string
  startDate: string
  endDate: string
  points: OpenMeteoHourlyPoint[]
}

function shiftIsoDate(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  let ny = y - years
  let nm = m
  let nd = d
  if (m === 2 && d === 29) {
    const leap = (yy: number) => (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0
    if (!leap(ny)) nd = 28
  }
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`
}

function parseHourlySeries(data: Record<string, unknown>): OpenMeteoHourlyPoint[] {
  const hourly = data.hourly as
    | {
        time?: string[]
        temperature_2m?: number[]
        weather_code?: number[]
        precipitation?: number[]
        relative_humidity_2m?: number[]
        wind_speed_10m?: number[]
        wind_direction_10m?: number[]
        surface_pressure?: number[]
      }
    | undefined
  const out: OpenMeteoHourlyPoint[] = []
  if (!hourly?.time?.length) return out
  for (let i = 0; i < hourly.time.length; i++) {
    out.push({
      time: hourly.time[i],
      temperatureC: hourly.temperature_2m?.[i] ?? null,
      weatherCode: hourly.weather_code?.[i] ?? null,
      precipitationMm: hourly.precipitation?.[i] ?? null,
      humidityPct: hourly.relative_humidity_2m?.[i] ?? null,
      windSpeedKmh: hourly.wind_speed_10m?.[i] ?? null,
      windDirectionDeg: hourly.wind_direction_10m?.[i] ?? null,
      pressureHpa: hourly.surface_pressure?.[i] ?? null,
    })
  }
  return out
}

function parseNextHours(points: OpenMeteoHourlyPoint[], fromIso: string, max = 24): OpenMeteoHourlyPoint[] {
  const fromMs = new Date(fromIso).getTime()
  return points.filter(p => new Date(p.time).getTime() >= fromMs).slice(0, max)
}

async function fetchArchiveDailyPoint(lat: number, lng: number, dateIso: string): Promise<OpenMeteoTemporalCard | null> {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('start_date', dateIso)
  url.searchParams.set('end_date', dateIso)
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean',
  )
  url.searchParams.set('timezone', 'auto')
  const res = await fetch(url.toString())
  if (!res.ok) return null
  const data = (await res.json()) as Record<string, unknown>
  const daily = data.daily as
    | {
        time?: string[]
        weather_code?: number[]
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        precipitation_sum?: number[]
        wind_speed_10m_max?: number[]
        relative_humidity_2m_mean?: number[]
      }
    | undefined
  if (!daily?.time?.length) return null
  const wc = daily.weather_code?.[0] ?? null
  const tMax = daily.temperature_2m_max?.[0] ?? null
  const tMin = daily.temperature_2m_min?.[0] ?? null
  const tempC =
    tMax != null && tMin != null ? Math.round((tMax + tMin) / 2) : tMax ?? tMin ?? null
  return {
    key: dateIso,
    title: '',
    date: dateIso,
    tempC,
    weatherCode: wc,
    conditionLabel: wmoWeatherLabel(wc),
    windSpeedKmh: daily.wind_speed_10m_max?.[0] ?? null,
    windDirectionLabel: '—',
    humidityPct: daily.relative_humidity_2m_mean?.[0] ?? null,
    precipMm: daily.precipitation_sum?.[0] ?? null,
  }
}

export async function fetchOpenMeteoTemporalComparison(
  lat: number,
  lng: number,
  refDateIso: string,
  todayIso: string,
  current: {
    tempC: number | null
    weatherCode: number | null
    conditionLabel: string
    windSpeedKmh: number | null
    windDirectionLabel: string
    humidityPct: number | null
    precipMm: number | null
  },
): Promise<OpenMeteoTemporalCard[]> {
  const lastYearDate = shiftIsoDate(refDateIso, 1)
  const fiveYearDate = shiftIsoDate(refDateIso, 5)
  const lastYearYear = lastYearDate.slice(0, 4)
  const fiveYearYear = fiveYearDate.slice(0, 4)

  const [lastYear, fiveYear] = await Promise.all([
    fetchArchiveDailyPoint(lat, lng, lastYearDate),
    fetchArchiveDailyPoint(lat, lng, fiveYearDate),
  ])

  const cards: OpenMeteoTemporalCard[] = [
    {
      key: 'current',
      title: refDateIso === todayIso ? 'Today' : refDateIso,
      date: refDateIso,
      tempC: current.tempC,
      weatherCode: current.weatherCode,
      conditionLabel: current.conditionLabel,
      windSpeedKmh: current.windSpeedKmh,
      windDirectionLabel: current.windDirectionLabel,
      humidityPct: current.humidityPct,
      precipMm: current.precipMm,
    },
  ]

  if (lastYear) {
    cards.push({
      ...lastYear,
      title: `Last year · ${lastYearYear}`,
    })
  }
  if (fiveYear) {
    cards.push({
      ...fiveYear,
      title: `5 years ago · ${fiveYearYear}`,
    })
  }
  return cards
}

export async function fetchOpenMeteoTimeHistory(
  lat: number,
  lng: number,
  pastDays: 7 | 14 | 30,
): Promise<OpenMeteoTimeHistory> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('past_days', String(pastDays))
  url.searchParams.set('forecast_days', '1')
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,surface_pressure,weather_code',
  )
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo hourly HTTP ${res.status}`)
  const data = (await res.json()) as Record<string, unknown>
  const tz = typeof data.timezone === 'string' ? data.timezone : 'UTC'
  const points = parseHourlySeries(data)
  const startDate = points[0]?.time.slice(0, 10) ?? ''
  const endDate = points[points.length - 1]?.time.slice(0, 10) ?? ''
  return { timezone: tz, startDate, endDate, points }
}

export function metricValueFromHourly(point: OpenMeteoHourlyPoint, metric: WeatherHistoryMetric): number | null {
  switch (metric) {
    case 'temp':
      return point.temperatureC
    case 'rain':
      return point.precipitationMm
    case 'humid':
      return point.humidityPct
    case 'wind':
      return point.windSpeedKmh
    case 'press':
      return point.pressureHpa
    default:
      return null
  }
}

export function metricLabel(metric: WeatherHistoryMetric): string {
  switch (metric) {
    case 'temp':
      return 'Temp'
    case 'rain':
      return 'Rain'
    case 'humid':
      return 'Humid'
    case 'wind':
      return 'Wind'
    case 'press':
      return 'Press'
    default:
      return metric
  }
}

export function metricUnit(metric: WeatherHistoryMetric): string {
  switch (metric) {
    case 'temp':
      return '°C'
    case 'rain':
      return 'mm'
    case 'humid':
      return '%'
    case 'wind':
      return 'km/h'
    case 'press':
      return 'hPa'
    default:
      return ''
  }
}

export async function fetchOpenMeteoWeather(lat: number, lng: number): Promise<OpenMeteoWeatherSnapshot> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m')
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum')
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation,relative_humidity_2m,wind_speed_10m,surface_pressure')

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)

  const data = (await res.json()) as Record<string, unknown>
  const tz = typeof data.timezone === 'string' ? data.timezone : 'UTC'
  const elev = typeof data.elevation === 'number' ? data.elevation : null

  const cur = data.current as Record<string, unknown> | undefined
  const time = typeof cur?.time === 'string' ? cur.time : new Date().toISOString()
  const temp = typeof cur?.temperature_2m === 'number' ? cur.temperature_2m : null
  const code = typeof cur?.weather_code === 'number' ? cur.weather_code : null
  const wind = typeof cur?.wind_speed_10m === 'number' ? cur.wind_speed_10m : null
  const windDir = typeof cur?.wind_direction_10m === 'number' ? cur.wind_direction_10m : null
  const rh = typeof cur?.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null
  const precip = typeof cur?.precipitation === 'number' ? cur.precipitation : null

  const dailyRaw = data.daily as
    | {
        time?: string[]
        weather_code?: number[]
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        precipitation_sum?: number[]
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
        weatherCode: wc,
        conditionLabel: wmoWeatherLabel(wc),
      })
    }
  }

  const hourlyAll = parseHourlySeries(data)
  const nextHours = parseNextHours(hourlyAll, time, 24)

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
