import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'

import type { WeatherFarmSite } from './weatherFarmService'

import { fetchCurrentGridBatch } from './openMeteoGridProxy'

import { apiUrl, noteApiResponse } from '@/core/api/apiOrigin'

import { peekLocationLiveRow } from './locationLiveWeatherCache'

const CURRENT_VARS = [

  'temperature_2m',

  'relative_humidity_2m',

  'precipitation',

  'weather_code',

  'wind_speed_10m',

  'wind_direction_10m',

]



const CHUNK_SIZE = 5

const CHUNK_GAP_MS = 1600

const SITE_PICK_GAP_MS = 140



function sleep(ms: number, signal?: AbortSignal): Promise<void> {

  if (!ms) return Promise.resolve()

  return new Promise((resolve, reject) => {

    const t = window.setTimeout(resolve, ms)

    signal?.addEventListener(

      'abort',

      () => {

        window.clearTimeout(t)

        reject(new DOMException('Aborted', 'AbortError'))

      },

      { once: true },

    )

  })

}



function emptyRow(site: WeatherFarmSite): WeatherLocationRow {

  return {

    id: site.id,

    label: site.label,

    temperatureC: null,

    humidityPct: null,

    windSpeedKmh: null,

    windDirectionDeg: null,

    precipMm: null,

    weatherCode: null,

    dailyMinC: null,

    dailyMaxC: null,

  }

}



function readDailyMinMax(entry: Record<string, unknown> | undefined): {

  dailyMinC: number | null

  dailyMaxC: number | null

} {

  const daily = entry?.daily as

    | { temperature_2m_min?: number[]; temperature_2m_max?: number[] }

    | undefined

  const min = daily?.temperature_2m_min?.[0]

  const max = daily?.temperature_2m_max?.[0]

  return {

    dailyMinC: typeof min === 'number' && Number.isFinite(min) ? min : null,

    dailyMaxC: typeof max === 'number' && Number.isFinite(max) ? max : null,

  }

}



function rowFromCurrent(
  site: WeatherFarmSite,
  cur: Record<string, unknown> | undefined,
  daily?: { dailyMinC?: number | null; dailyMaxC?: number | null },
): WeatherLocationRow {
  const num = (k: string) => {
    const v = cur?.[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const code = num('weather_code')
  return {
    id: site.id,
    label: site.label,
    temperatureC: num('temperature_2m'),
    humidityPct: num('relative_humidity_2m'),
    windSpeedKmh: num('wind_speed_10m'),
    windDirectionDeg: num('wind_direction_10m'),
    precipMm: num('precipitation'),
    weatherCode: code != null ? Math.round(code) : null,
    dailyMinC: daily?.dailyMinC ?? null,
    dailyMaxC: daily?.dailyMaxC ?? null,
  }
}

function applyHourlyFallback(row: WeatherLocationRow, entry: Record<string, unknown> | undefined): WeatherLocationRow {
  if (rowHasLiveTemp(row) || !entry) return row
  const hourly = entry.hourly as
    | {
        temperature_2m?: number[]
        relative_humidity_2m?: number[]
        weather_code?: number[]
        wind_speed_10m?: number[]
        wind_direction_10m?: number[]
        precipitation?: number[]
      }
    | undefined
  const t = hourly?.temperature_2m?.[0]
  if (typeof t !== 'number' || !Number.isFinite(t)) return row
  const code = hourly?.weather_code?.[0]
  return {
    ...row,
    temperatureC: t,
    humidityPct: hourly?.relative_humidity_2m?.[0] ?? row.humidityPct,
    windSpeedKmh: hourly?.wind_speed_10m?.[0] ?? row.windSpeedKmh,
    windDirectionDeg: hourly?.wind_direction_10m?.[0] ?? row.windDirectionDeg,
    precipMm: hourly?.precipitation?.[0] ?? row.precipMm,
    weatherCode:
      typeof code === 'number' && Number.isFinite(code) ? Math.round(code) : row.weatherCode,
  }
}

function rowFromOpenMeteoEntry(site: WeatherFarmSite, entry: Record<string, unknown> | undefined): WeatherLocationRow {
  if (!entry || (entry as { error?: boolean }).error) return emptyRow(site)
  const cur = entry.current as Record<string, unknown> | undefined
  let row = { ...rowFromCurrent(site, cur), ...readDailyMinMax(entry) }
  return applyHourlyFallback(row, entry)
}



export function rowHasLiveTemp(row: WeatherLocationRow): boolean {

  return row.temperatureC != null && Number.isFinite(row.temperatureC)

}



export function seedLocationRowsFromLiveCache(sites: WeatherFarmSite[]): WeatherLocationRow[] {

  return sites.map(site => {

    const hit = peekLocationLiveRow(site.lat, site.lng)

    if (!hit || !rowHasLiveTemp(hit)) return emptyRow(site)

    return {

      ...hit,

      id: site.id,

      label: site.label,

    }

  })

}



function countLiveTemps(rows: WeatherLocationRow[]): number {

  return rows.filter(rowHasLiveTemp).length

}



export function mapSitesToRowsFromApiEntries(
  sites: WeatherFarmSite[],
  entries: Record<string, unknown>[],
): WeatherLocationRow[] {
  return sites.map((site, i) => rowFromOpenMeteoEntry(site, entries[i] ?? entries[0]))
}



function mapSitesToRowsFromProxyPoints(

  sites: WeatherFarmSite[],

  points: Array<{ current?: Record<string, number | null> }>,

): WeatherLocationRow[] {

  return sites.map((site, i) => {

    const cur = points[i]?.current ?? {}

    const normalized: Record<string, unknown> = {}

    for (const [k, v] of Object.entries(cur)) normalized[k] = v

    return rowFromCurrent(site, normalized)

  })

}



async function fetchLocationsCurrentViaApi(

  sites: WeatherFarmSite[],

  signal?: AbortSignal,

): Promise<WeatherLocationRow[] | null> {

  try {

    const res = await fetch(apiUrl('/api/weather/locations-current'), {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      credentials: 'same-origin',

      body: JSON.stringify({

        locations: sites.map(s => ({ id: s.id, lat: s.lat, lng: s.lng })),

      }),

      signal,

    })

    noteApiResponse(res.status)

    if (!res.ok) return null

    const payload = (await res.json()) as {

      rows?: Array<{
        id: string
        current?: Record<string, number | null>
        dailyMinC?: number | null
        dailyMaxC?: number | null
      }>

    }

    if (!payload.rows?.length) return null

    const byId = new Map(payload.rows.map(r => [r.id, r]))

    return sites.map(site => {
      const hit = byId.get(site.id) ?? byId.get(String(site.id))
      return rowFromCurrent(site, hit?.current ?? {}, {
        dailyMinC: hit?.dailyMinC ?? null,
        dailyMaxC: hit?.dailyMaxC ?? null,
      })
    })

  } catch {

    return null

  }

}



async function fetchChunkDirect(sites: WeatherFarmSite[], signal?: AbortSignal): Promise<WeatherLocationRow[]> {

  const url = new URL('https://api.open-meteo.com/v1/forecast')

  url.searchParams.set('latitude', sites.map(s => s.lat.toFixed(4)).join(','))

  url.searchParams.set('longitude', sites.map(s => s.lng.toFixed(4)).join(','))

  url.searchParams.set('timezone', 'auto')

  url.searchParams.set('wind_speed_unit', 'kmh')

  url.searchParams.set('current', CURRENT_VARS.join(','))
  url.searchParams.set(
    'hourly',
    'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation',
  )
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min')
  url.searchParams.set('forecast_days', '1')



  const res = await fetch(url.toString(), { signal })

  if (!res.ok) {

    const err = new Error(`Open-Meteo HTTP ${res.status}`)

    ;(err as Error & { status?: number }).status = res.status

    throw err

  }



  const raw = (await res.json()) as Record<string, unknown> | Record<string, unknown>[]

  if (!Array.isArray(raw) && raw && typeof raw === 'object' && (raw as { error?: boolean }).error) {

    throw new Error('Open-Meteo rate limited')

  }

  const entries = Array.isArray(raw) ? raw : [raw]

  return mapSitesToRowsFromApiEntries(sites, entries)

}



async function fetchChunkDirectWithRetry(

  sites: WeatherFarmSite[],

  signal?: AbortSignal,

  attempt = 0,

): Promise<WeatherLocationRow[]> {

  try {

    return await fetchChunkDirect(sites, signal)

  } catch (e) {

    if (signal?.aborted) throw e

    const status = (e as Error & { status?: number }).status

    const is429 = status === 429 || (e instanceof Error && e.message.includes('429'))

    if (is429 && attempt < 3) {

      await sleep(1200 * (attempt + 1), signal)

      return fetchChunkDirectWithRetry(sites, signal, attempt + 1)

    }

    throw e

  }

}



async function fillMissingWithMapPick(

  sites: WeatherFarmSite[],

  rows: WeatherLocationRow[],

  signal?: AbortSignal,

): Promise<WeatherLocationRow[]> {

  const byId = new Map(rows.map(r => [r.id, r]))

  const out: WeatherLocationRow[] = []

  for (const site of sites) {

    if (signal?.aborted) break

    const existing = byId.get(site.id) ?? emptyRow(site)

    if (rowHasLiveTemp(existing)) {

      out.push(existing)

      continue

    }

    try {

      await sleep(SITE_PICK_GAP_MS, signal)

      const [row] = await fetchChunkDirectWithRetry([site], signal)

      out.push(rowHasLiveTemp(row) ? row : existing)

    } catch {

      out.push(existing)

    }

  }

  return out.length ? out : rows

}



async function fetchCurrentViaGetApi(
  site: WeatherFarmSite,
  signal?: AbortSignal,
): Promise<WeatherLocationRow | null> {
  try {
    const q = new URLSearchParams({
      lat: String(site.lat),
      lng: String(site.lng),
    })
    const res = await fetch(apiUrl(`/api/weather/current?${q}`), {
      signal,
      credentials: 'same-origin',
    })
    noteApiResponse(res.status)
    if (!res.ok) return null
    const payload = (await res.json()) as { current?: Record<string, number | null> }
    const row = rowFromCurrent(site, payload.current ?? {})
    return rowHasLiveTemp(row) ? row : null
  } catch {
    return null
  }
}

async function fetchChunkRows(sites: WeatherFarmSite[], signal?: AbortSignal): Promise<WeatherLocationRow[]> {
  const proxied = await fetchCurrentGridBatch(
    sites.map(s => ({ lat: s.lat, lng: s.lng })),
    CURRENT_VARS,
    signal,
  )
  if (proxied?.points?.length === sites.length) {
    const mapped = mapSitesToRowsFromProxyPoints(sites, proxied.points)
    if (countLiveTemps(mapped) > 0) return mapped
  }

  try {
    const direct = await fetchChunkDirectWithRetry(sites, signal)
    if (countLiveTemps(direct) > 0) return direct
  } catch {
    /* try per-site API */
  }

  const out: WeatherLocationRow[] = []
  for (const site of sites) {
    if (signal?.aborted) break
    const hit = await fetchCurrentViaGetApi(site, signal)
    out.push(hit ?? emptyRow(site))
    await sleep(90, signal)
  }
  return out.length ? out : sites.map(emptyRow)
}



export function coalesceLocationRow(base: WeatherLocationRow, r: WeatherLocationRow): WeatherLocationRow {
  const preferR = rowHasLiveTemp(r)
  const preferBase = rowHasLiveTemp(base) && !preferR
  return {
    ...base,
    ...r,
    label: base.label,
    temperatureC: preferR ? r.temperatureC : preferBase ? base.temperatureC : r.temperatureC ?? base.temperatureC,
    humidityPct: r.humidityPct ?? base.humidityPct,
    windSpeedKmh: r.windSpeedKmh ?? base.windSpeedKmh,
    windDirectionDeg: r.windDirectionDeg ?? base.windDirectionDeg,
    precipMm: r.precipMm ?? base.precipMm,
    weatherCode: r.weatherCode ?? base.weatherCode,
    dailyMinC: r.dailyMinC ?? base.dailyMinC,
    dailyMaxC: r.dailyMaxC ?? base.dailyMaxC,
  }
}

function mergeLocationRows(

  sites: WeatherFarmSite[],

  parts: WeatherLocationRow[],

): WeatherLocationRow[] {

  const byId = new Map(sites.map(s => [s.id, emptyRow(s)]))

  for (const r of parts) {

    const base = byId.get(r.id)

    if (!base) continue

    byId.set(r.id, coalesceLocationRow(base, r))

  }

  return sites.map(s => byId.get(s.id)!)

}



async function fetchAllSitesViaGridBatch(

  sites: WeatherFarmSite[],

  signal?: AbortSignal,

): Promise<WeatherLocationRow[] | null> {

  const proxied = await fetchCurrentGridBatch(

    sites.map(s => ({ lat: s.lat, lng: s.lng })),

    CURRENT_VARS,

    signal,

  )

  if (!proxied?.points?.length) return null

  const mapped = mapSitesToRowsFromProxyPoints(sites, proxied.points)

  return countLiveTemps(mapped) > 0 ? mapped : null

}



/** Batched current weather for the locations sidebar (API → grid → targeted direct). */

export async function fetchOpenMeteoLocationRowsBatch(

  sites: WeatherFarmSite[],

  signal?: AbortSignal,

  onProgress?: (rows: WeatherLocationRow[]) => void,

): Promise<WeatherLocationRow[]> {

  if (!sites.length) return []



  let acc: WeatherLocationRow[] = seedLocationRowsFromLiveCache(sites)



  const publish = (parts: WeatherLocationRow[]) => {

    acc = mergeLocationRows(sites, [...acc, ...parts])

    onProgress?.(acc)

    return acc

  }



  publish([])

  const gridRows = await fetchAllSitesViaGridBatch(sites, signal)
  if (gridRows?.length) {
    let merged = publish(gridRows)
    if (countLiveTemps(merged) >= sites.length) return merged
  }

  let merged = acc

  const missingSites = sites.filter(s => !rowHasLiveTemp(merged.find(r => r.id === s.id)!))

  for (let i = 0; i < missingSites.length; i += CHUNK_SIZE) {

    if (signal?.aborted) break

    const chunk = missingSites.slice(i, i + CHUNK_SIZE)

    const chunkRows = await fetchChunkRows(chunk, signal)

    merged = publish(chunkRows)

    if (i + CHUNK_SIZE < missingSites.length) {

      await sleep(CHUNK_GAP_MS, signal)

    }

  }



  const stillMissing = sites.filter(s => !rowHasLiveTemp(merged.find(r => r.id === s.id)!))

  if (stillMissing.length > 0) {
    const fromApi = await fetchLocationsCurrentViaApi(stillMissing, signal)
    if (fromApi?.length) {
      merged = publish(fromApi)
    }
  }

  const stillMissingAfterApi = sites.filter(s => !rowHasLiveTemp(merged.find(r => r.id === s.id)!))

  if (stillMissingAfterApi.length > 0 && stillMissingAfterApi.length <= 12) {

    const missingRows = merged.filter(r => stillMissingAfterApi.some(m => m.id === r.id))

    const filled = await fillMissingWithMapPick(stillMissingAfterApi, missingRows, signal)

    merged = publish([
      ...merged.filter(r => !stillMissingAfterApi.some(m => m.id === r.id)),
      ...filled,
    ])
  }



  return merged

}


