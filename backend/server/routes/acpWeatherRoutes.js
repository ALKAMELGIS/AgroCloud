/**
 * Agro Cloud Platform — field weather proxy (Open-Meteo) with server-side cache.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.join(SERVER_DIR, 'acp_weather_layer_config.json')

const WEATHER_CACHE_TTL_MS = 30 * 60_000
const MAX_FIELDS = 48
const FETCH_CONCURRENCY = 4

const weatherCache = new Map()

const WMO_LABELS = {
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

function wmoWeatherLabel(code) {
  if (code == null || !Number.isFinite(code)) return '—'
  const c = Math.round(code)
  return WMO_LABELS[c] ?? `Code ${c}`
}

function windDirectionLabel(deg) {
  if (deg == null || !Number.isFinite(deg)) return '—'
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

function weatherGridKey(lat, lng, precision = 2) {
  return `${Number(lat).toFixed(precision)},${Number(lng).toFixed(precision)}`
}

function readLayerConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { weatherAlertsVisible: false }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      weatherAlertsVisible: parsed?.weatherAlertsVisible === true,
    }
  } catch {
    return { weatherAlertsVisible: false }
  }
}

function writeLayerConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

async function fetchOpenMeteoSnapshot(lat, lng) {
  const key = weatherGridKey(lat, lng)
  const hit = weatherCache.get(key)
  if (hit && Date.now() - hit.at < WEATHER_CACHE_TTL_MS) return hit.snapshot

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lng))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set(
    'current',
    'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
  )

  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
  const data = await res.json()
  const cur = data.current ?? {}
  const snapshot = {
    lat,
    lng,
    observedAt: typeof cur.time === 'string' ? cur.time : new Date().toISOString(),
    temperatureC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : null,
    weatherCode: typeof cur.weather_code === 'number' ? cur.weather_code : null,
    conditionLabel: wmoWeatherLabel(cur.weather_code),
    windSpeedKmh: typeof cur.wind_speed_10m === 'number' ? cur.wind_speed_10m : null,
    windDirectionLabel: windDirectionLabel(cur.wind_direction_10m),
    humidityPct: typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null,
    precipMm: typeof cur.precipitation === 'number' ? cur.precipitation : null,
  }
  weatherCache.set(key, { at: Date.now(), snapshot })
  return snapshot
}

export function registerAcpWeatherRoutes(app) {
  app.get('/api/acp/weather/layer-config', (_req, res) => {
    res.json(readLayerConfig())
  })

  app.patch('/api/acp/weather/layer-config', (req, res) => {
    const visible = req.body?.weatherAlertsVisible
    if (typeof visible !== 'boolean') {
      return res.status(400).json({ error: 'weatherAlertsVisible boolean required' })
    }
    const config = { weatherAlertsVisible: visible }
    writeLayerConfig(config)
    res.json(config)
  })

  app.post('/api/acp/weather/fields', async (req, res) => {
    try {
      const fields = Array.isArray(req.body?.fields) ? req.body.fields : []
      if (!fields.length) return res.status(400).json({ error: 'fields array required' })

      const capped = fields.slice(0, MAX_FIELDS)
      const groups = new Map()
      for (const field of capped) {
        const lat = Number(field.lat)
        const lng = Number(field.lng)
        const fieldKey = String(field.fieldKey || '')
        if (!fieldKey || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
        const gridKey = weatherGridKey(lat, lng)
        const list = groups.get(gridKey) ?? []
        list.push({ fieldKey, lat, lng })
        groups.set(gridKey, list)
      }

      const jobs = [...groups.values()]
      const snapshotsByGrid = new Map()

      for (let i = 0; i < jobs.length; i += FETCH_CONCURRENCY) {
        const batch = jobs.slice(i, i + FETCH_CONCURRENCY)
        const results = await Promise.all(
          batch.map(async group => {
            const { lat, lng } = group[0]
            try {
              const snapshot = await fetchOpenMeteoSnapshot(lat, lng)
              return { group, snapshot }
            } catch {
              return { group, snapshot: null }
            }
          }),
        )
        for (const { group, snapshot } of results) {
          if (!snapshot) continue
          snapshotsByGrid.set(weatherGridKey(group[0].lat, group[0].lng), snapshot)
        }
      }

      const out = []
      for (const group of jobs) {
        const snapshot = snapshotsByGrid.get(weatherGridKey(group[0].lat, group[0].lng))
        if (!snapshot) continue
        for (const field of group) {
          out.push({
            fieldKey: field.fieldKey,
            lat: field.lat,
            lng: field.lng,
            ...snapshot,
          })
        }
      }

      res.json({
        updatedAt: new Date().toISOString(),
        fields: out,
      })
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Weather fields fetch failed',
      })
    }
  })
}
