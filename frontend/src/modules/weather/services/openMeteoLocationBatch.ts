import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'

import type { WeatherFarmSite } from './weatherFarmService'

import { fetchCurrentGridBatch } from './openMeteoGridProxy'

import { apiUrl, noteApiResponse } from '@/core/api/apiOrigin'

import { fetchLocationLiveRow } from './locationLiveWeatherCache'



const CURRENT_VARS = [

  'temperature_2m',

  'relative_humidity_2m',

  'precipitation',

  'weather_code',

  'wind_speed_10m',

  'wind_direction_10m',

]



const CHUNK_SIZE = 8

const CHUNK_GAP_MS = 900

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

  }

}



function rowFromCurrent(site: WeatherFarmSite, cur: Record<string, unknown> | undefined): WeatherLocationRow {

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

  }

}



function rowHasLiveTemp(row: WeatherLocationRow): boolean {

  return row.temperatureC != null && Number.isFinite(row.temperatureC)

}



function countLiveTemps(rows: WeatherLocationRow[]): number {

  return rows.filter(rowHasLiveTemp).length

}



export function mapSitesToRowsFromApiEntries(

  sites: WeatherFarmSite[],

  entries: Record<string, unknown>[],

): WeatherLocationRow[] {

  return sites.map((site, i) => {

    const entry = entries[i] ?? entries[0]

    if (entry && typeof entry === 'object' && (entry as { error?: boolean }).error) {

      return emptyRow(site)

    }

    const cur =

      entry && typeof entry === 'object'

        ? (entry as Record<string, unknown>).current as Record<string, unknown> | undefined

        : undefined

    let row = rowFromCurrent(site, cur)

    if (!rowHasLiveTemp(row) && entry && typeof entry === 'object') {

      const hourly = (entry as Record<string, unknown>).hourly as

        | { temperature_2m?: number[]; relative_humidity_2m?: number[]; weather_code?: number[] }

        | undefined

      const t = hourly?.temperature_2m?.[0]

      if (typeof t === 'number' && Number.isFinite(t)) {

        row = {

          ...row,

          temperatureC: t,

          humidityPct: hourly?.relative_humidity_2m?.[0] ?? row.humidityPct,

          weatherCode: hourly?.weather_code?.[0] ?? row.weatherCode,

        }

      }

    }

    return row

  })

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

      rows?: Array<{ id: string; current?: Record<string, number | null> }>

    }

    if (!payload.rows?.length) return null

    const byId = new Map(payload.rows.map(r => [r.id, r.current ?? {}]))

    return sites.map(site => rowFromCurrent(site, byId.get(site.id) ?? byId.get(String(site.id))))

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

      const row = await fetchLocationLiveRow(site.id, site.label, site.lat, site.lng, signal)

      out.push(row)

    } catch {

      out.push(existing)

    }

  }

  return out.length ? out : rows

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

    return await fetchChunkDirectWithRetry(sites, signal)

  } catch {

    return sites.map(emptyRow)

  }

}



/** Batched current weather for the locations sidebar (server cache first). */

export async function fetchOpenMeteoLocationRowsBatch(

  sites: WeatherFarmSite[],

  signal?: AbortSignal,

): Promise<WeatherLocationRow[]> {

  if (!sites.length) return []



  const fromApi = await fetchLocationsCurrentViaApi(sites, signal)

  const rows: WeatherLocationRow[] = []

  for (let i = 0; i < sites.length; i += CHUNK_SIZE) {

    if (signal?.aborted) break

    const chunk = sites.slice(i, i + CHUNK_SIZE)

    rows.push(...(await fetchChunkRows(chunk, signal)))

    if (i + CHUNK_SIZE < sites.length) {

      await sleep(CHUNK_GAP_MS, signal)

    }

  }



  const merged = fromApi?.length

    ? sites.map(site => {

        const pick = rows.find(r => r.id === site.id)

        const api = fromApi.find(r => r.id === site.id)

        const base = pick ?? api ?? emptyRow(site)

        if (rowHasLiveTemp(base)) return base

        if (api && rowHasLiveTemp(api)) return api

        return base

      })

    : rows



  if (countLiveTemps(merged) < sites.length) {

    return fillMissingWithMapPick(sites, merged, signal)

  }

  return merged

}


