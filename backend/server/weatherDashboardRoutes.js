/**
 * Weather Monitoring Dashboard — Open-Meteo proxy with short TTL cache.
 */

const CACHE_TTL_MS = 20 * 60_000
const CURRENT_CACHE_TTL_MS = 10 * 60_000
const GRID_CACHE_TTL_MS = 12 * 60_000
const HOURLY_RANGE_CACHE_TTL_MS = 10 * 60_000
const GRID_CHUNK = 50
const cache = new Map()
const currentCache = new Map()
const gridCache = new Map()
const hourlyRangeCache = new Map()

const CHART_HOURLY_VARS =
  'temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m'

function parseChartHourlySeries(data) {
  const hourly = data?.hourly
  if (!hourly?.time?.length) return []
  const out = []
  for (let i = 0; i < hourly.time.length; i++) {
    out.push({
      time: hourly.time[i],
      temperatureC: hourly.temperature_2m?.[i] ?? null,
      humidityPct: hourly.relative_humidity_2m?.[i] ?? null,
      precipitationMm: hourly.precipitation?.[i] ?? null,
      precipitationProbabilityPct: hourly.precipitation_probability?.[i] ?? null,
      weatherCode: hourly.weather_code?.[i] ?? null,
      windSpeedKmh: hourly.wind_speed_10m?.[i] ?? null,
      windDirectionDeg: hourly.wind_direction_10m?.[i] ?? null,
    })
  }
  return out
}

function daysBetweenYmdInclusive(fromYmd, toYmd) {
  const a = Date.parse(`${fromYmd}T12:00:00`)
  const b = Date.parse(`${toYmd}T12:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

function todayYmdUtc() {
  return new Date().toISOString().slice(0, 10)
}

async function openMeteoForecastHourly(lat, lng, params) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('wind_speed_unit', 'kmh')
  url.searchParams.set('hourly', CHART_HOURLY_VARS)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }
  const omRes = await fetch(url.toString())
  if (!omRes.ok) {
    const err = new Error(`Open-Meteo HTTP ${omRes.status}`)
    err.status = omRes.status
    throw err
  }
  return omRes.json()
}

async function fetchHourlyRangeOpenMeteo(lat, lng, startDate, endDate) {
  const key = `${cacheKey(lat, lng)}|${startDate}|${endDate}`
  const hit = hourlyRangeCache.get(key)
  if (hit && Date.now() - hit.at < HOURLY_RANGE_CACHE_TTL_MS) {
    return hit.rows
  }

  const today = todayYmdUtc()
  let rows = []

  try {
    const data = await openMeteoForecastHourly(lat, lng, {
      start_date: startDate,
      end_date: endDate,
    })
    rows = parseChartHourlySeries(data)
  } catch {
    rows = []
  }

  if (!rows.length) {
    const pastDays = Math.min(92, daysBetweenYmdInclusive(startDate, today) + 1)
    const forecastDays = Math.min(16, daysBetweenYmdInclusive(today, endDate) + 1)
    try {
      const data = await openMeteoForecastHourly(lat, lng, {
        past_days: Math.max(1, pastDays),
        forecast_days: Math.max(1, forecastDays),
      })
      rows = parseChartHourlySeries(data).filter(p => {
        const day = String(p.time).slice(0, 10)
        return day >= startDate && day <= endDate
      })
    } catch {
      rows = []
    }
  }

  hourlyRangeCache.set(key, { at: Date.now(), rows })
  return rows
}

function pickHourlyIndex(times, timeIso) {
  if (!Array.isArray(times) || !times.length) return 0
  if (!timeIso) return 0
  const target = String(timeIso).slice(0, 16)
  const exact = times.findIndex(t => String(t).slice(0, 16) === target)
  if (exact >= 0) return exact
  let best = 0
  let bestDiff = Infinity
  const ts = Date.parse(String(timeIso).replace(' ', 'T'))
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(Date.parse(String(times[i]).replace(' ', 'T')) - ts)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  return best
}

function readHourlyCell(raw, timeIndex) {
  if (!Array.isArray(raw)) return null
  const v = raw[timeIndex]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function gridBatchCacheKey(payload) {
  return JSON.stringify(payload)
}

async function openMeteoMultiFetch(points, params) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', points.map(p => Number(p.lat).toFixed(4)).join(','))
  url.searchParams.set('longitude', points.map(p => Number(p.lng).toFixed(4)).join(','))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('wind_speed_unit', 'kmh')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const omRes = await fetch(url.toString())
  if (!omRes.ok) {
    const err = new Error(`Open-Meteo HTTP ${omRes.status}`)
    err.status = omRes.status
    throw err
  }
  const data = await omRes.json()
  return Array.isArray(data) ? data : [data]
}

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`
}

const CURRENT_PICK_VARS = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_direction_10m',
]

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function readCurrentFields(openMeteo) {
  const cur = openMeteo?.current ?? {}
  const current = {}
  for (const v of CURRENT_PICK_VARS) {
    const n = cur[v]
    current[v] = typeof n === 'number' && Number.isFinite(n) ? n : null
  }
  if (current.temperature_2m == null) {
    const hourly = openMeteo?.hourly ?? {}
    const t = hourly.temperature_2m?.[0]
    if (typeof t === 'number' && Number.isFinite(t)) {
      current.temperature_2m = t
      const h = hourly.relative_humidity_2m?.[0]
      const w = hourly.wind_speed_10m?.[0]
      const d = hourly.wind_direction_10m?.[0]
      const c = hourly.weather_code?.[0]
      const p = hourly.precipitation?.[0]
      if (current.relative_humidity_2m == null && typeof h === 'number') current.relative_humidity_2m = h
      if (current.wind_speed_10m == null && typeof w === 'number') current.wind_speed_10m = w
      if (current.wind_direction_10m == null && typeof d === 'number') current.wind_direction_10m = d
      if (current.weather_code == null && typeof c === 'number') current.weather_code = c
      if (current.precipitation == null && typeof p === 'number') current.precipitation = p
    }
  }
  return current
}

function readDailyMinMax(openMeteo) {
  const daily = openMeteo?.daily ?? {}
  const min = daily.temperature_2m_min?.[0]
  const max = daily.temperature_2m_max?.[0]
  return {
    dailyMinC: typeof min === 'number' && Number.isFinite(min) ? min : null,
    dailyMaxC: typeof max === 'number' && Number.isFinite(max) ? max : null,
  }
}

async function fetchOpenMeteoCurrentOnly(lat, lng) {
  const key = cacheKey(lat, lng)
  const hit = currentCache.get(key)
  if (hit && Date.now() - hit.at < CURRENT_CACHE_TTL_MS) {
    return hit.data
  }
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('wind_speed_unit', 'kmh')
  url.searchParams.set('current', CURRENT_PICK_VARS.join(','))
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation',
  )
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min')
  url.searchParams.set('forecast_days', '1')
  const omRes = await fetch(url.toString())
  if (!omRes.ok) {
    const err = new Error(`Open-Meteo HTTP ${omRes.status}`)
    err.status = omRes.status
    throw err
  }
  const data = await omRes.json()
  currentCache.set(key, { at: Date.now(), data })
  return data
}

async function fetchDashboardOpenMeteo(lat, lng) {
  const key = cacheKey(lat, lng)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.body
  }
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('wind_speed_unit', 'kmh')
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,snowfall,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m,visibility',
  )
  url.searchParams.set(
    'hourly',
    'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,rain,snowfall,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,surface_pressure',
  )
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant',
  )
  url.searchParams.set('past_days', '3')
  url.searchParams.set('forecast_days', '7')
  const omRes = await fetch(url.toString())
  if (!omRes.ok) {
    const err = new Error(`Open-Meteo HTTP ${omRes.status}`)
    err.status = omRes.status
    throw err
  }
  const data = await omRes.json()
  const body = {
    openMeteo: data,
    fetchedAt: new Date().toISOString(),
    sourceLabel: 'Open-Meteo',
    resolutionLabel: '~11 km (ECMWF IFS)',
  }
  cache.set(key, { at: Date.now(), body })
  return body
}

export function registerWeatherDashboardRoutes(app) {
  app.get('/api/weather/current', async (req, res) => {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng required' })
    }
    try {
      const openMeteo = await fetchOpenMeteoCurrentOnly(lat, lng)
      res.json({
        lat,
        lng,
        current: readCurrentFields(openMeteo),
        source: 'Open-Meteo',
      })
    } catch (e) {
      const status = e?.status === 429 ? 429 : 502
      res.status(status).json({ error: e instanceof Error ? e.message : 'Current weather failed' })
    }
  })

  app.get('/api/weather/dashboard', async (req, res) => {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng required' })
    }
    try {
      const body = await fetchDashboardOpenMeteo(lat, lng)
      res.json(body)
    } catch (e) {
      const status = e?.status === 429 ? 429 : 502
      res.status(status).json({ error: e instanceof Error ? e.message : 'Weather proxy failed' })
    }
  })

  app.get('/api/weather/hourly-range', async (req, res) => {
    const lat = Number(req.query.lat)
    const lng = Number(req.query.lng)
    const startDate = String(req.query.start_date || '').slice(0, 10)
    const endDate = String(req.query.end_date || '').slice(0, 10)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat and lng required' })
    }
    if (!startDate || !endDate || startDate > endDate) {
      return res.status(400).json({ error: 'start_date and end_date required' })
    }
    try {
      const hourly = await fetchHourlyRangeOpenMeteo(lat, lng, startDate, endDate)
      res.json({ hourly, source: 'Open-Meteo' })
    } catch (e) {
      const status = e?.status === 429 ? 429 : 502
      res.status(status).json({ error: e instanceof Error ? e.message : 'Hourly range failed' })
    }
  })

  /** Cached per-site current weather for location lists (sequential upstream calls). */
  app.post('/api/weather/locations-current', async (req, res) => {
    const locations = Array.isArray(req.body?.locations) ? req.body.locations : []
    if (!locations.length || locations.length > 80) {
      return res.status(400).json({ error: 'locations array required (max 80)' })
    }
    for (const loc of locations) {
      if (!Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) {
        return res.status(400).json({ error: 'invalid location' })
      }
    }

    const rows = []
    try {
      for (let i = 0; i < locations.length; i++) {
        const loc = locations[i]
        const lat = Number(loc.lat)
        const lng = Number(loc.lng)
        const id = loc.id != null ? String(loc.id) : `${lat},${lng}`
        try {
          const openMeteo = await fetchOpenMeteoCurrentOnly(lat, lng)
          rows.push({
            id,
            lat,
            lng,
            current: readCurrentFields(openMeteo),
            ...readDailyMinMax(openMeteo),
          })
        } catch {
          rows.push({ id, lat, lng, current: {} })
        }
        if (i + 1 < locations.length) await sleepMs(110)
      }
      res.json({ rows })
    } catch (e) {
      const status = e?.status === 429 ? 429 : 502
      res.status(status).json({ error: e instanceof Error ? e.message : 'Locations weather failed' })
    }
  })

  app.post('/api/weather/grid-batch', async (req, res) => {
    const mode = req.body?.mode === 'current' ? 'current' : 'hourly'
    const points = Array.isArray(req.body?.points) ? req.body.points : []
    const timeIso = req.body?.timeIso ? String(req.body.timeIso) : undefined
    if (!points.length || points.length > 120) {
      return res.status(400).json({ error: 'points array required (max 120)' })
    }
    for (const p of points) {
      if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng))) {
        return res.status(400).json({ error: 'invalid point' })
      }
    }

    const hourlyVars =
      mode === 'hourly'
        ? (Array.isArray(req.body?.hourly) ? req.body.hourly : [req.body?.hourly]).filter(Boolean)
        : []
    const currentVars =
      mode === 'current'
        ? (Array.isArray(req.body?.current) ? req.body.current : [req.body?.current]).filter(Boolean)
        : []

    if (mode === 'hourly' && !hourlyVars.length) {
      return res.status(400).json({ error: 'hourly variable(s) required' })
    }
    if (mode === 'current' && !currentVars.length) {
      return res.status(400).json({ error: 'current variable(s) required' })
    }

    const cachePayload = { mode, points, hourlyVars, currentVars, timeIso }
    const cKey = gridBatchCacheKey(cachePayload)
    const hit = gridCache.get(cKey)
    if (hit && Date.now() - hit.at < GRID_CACHE_TTL_MS) {
      return res.json(hit.body)
    }

    try {
      const outPoints = []
      for (let i = 0; i < points.length; i += GRID_CHUNK) {
        const chunk = points.slice(i, i + GRID_CHUNK)
        const entries =
          mode === 'hourly'
            ? await openMeteoMultiFetch(chunk, {
                hourly: hourlyVars.join(','),
                forecast_days: '2',
              })
            : await openMeteoMultiFetch(chunk, {
                current: currentVars.join(','),
                hourly:
                  'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation',
                daily: 'temperature_2m_max,temperature_2m_min',
                forecast_days: '1',
              })

        for (let j = 0; j < chunk.length; j++) {
          const pt = chunk[j]
          const entry = entries[j] ?? entries[0]
          if (!entry || typeof entry !== 'object') continue
          if (mode === 'hourly') {
            const hourly = entry.hourly ?? {}
            const times = hourly.time ?? []
            const tIdx = pickHourlyIndex(times, timeIso)
            const values = {}
            for (const v of hourlyVars) {
              values[v] = readHourlyCell(hourly[v], tIdx)
            }
            outPoints.push({ lat: pt.lat, lng: pt.lng, values })
          } else {
            const normalized = readCurrentFields(entry)
            const current = {}
            for (const v of currentVars) {
              const n = normalized[v]
              current[v] = typeof n === 'number' && Number.isFinite(n) ? n : null
            }
            outPoints.push({ lat: pt.lat, lng: pt.lng, current })
          }
        }
      }

      const body = { points: outPoints }
      gridCache.set(cKey, { at: Date.now(), body })
      res.json(body)
    } catch (e) {
      const status = e?.status === 429 ? 429 : 502
      res.status(status).json({ error: e instanceof Error ? e.message : 'Grid proxy failed' })
    }
  })
}
