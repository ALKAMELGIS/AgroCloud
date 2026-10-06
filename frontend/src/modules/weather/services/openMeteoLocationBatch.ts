import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'

import type { WeatherFarmSite } from './weatherFarmService'

import { fetchCurrentGridBatch } from './openMeteoGridProxy'

import { fetchOpenMeteoWeatherMapPick } from '@/modules/remote-sensing/weather/openMeteoWeather'

import { apiUrl, configuredApiOrigin, ensureBackendAvailable, noteApiResponse } from '@/core/api/apiOrigin'

import { peekLocationLiveRow } from './locationLiveWeatherCache'

const CURRENT_VARS = [

  'temperature_2m',

  'relative_humidity_2m',

  'precipitation',

  'weather_code',

  'wind_speed_10m',

  'wind_direction_10m',

]



const CHUNK_SIZE = 10

const CHUNK_GAP_MS = 700

const SITE_PICK_GAP_MS = 200

const ROWS_SESSION_KEY = 'agrocloud.weatherLocationRows.v2'

const ROWS_SESSION_TTL_MS = 20 * 60_000

async function weatherApiReachable(): Promise<boolean> {
  if (import.meta.env.DEV) return true
  if (configuredApiOrigin()) return true
  return ensureBackendAvailable()
}

function sitesFingerprint(sites: WeatherFarmSite[]): string {
  return sites.map(s => `${s.id}:${s.lat.toFixed(3)},${s.lng.toFixed(3)}`).join('|')
}

export function readPersistedLocationRows(sites: WeatherFarmSite[]): WeatherLocationRow[] | null {
  try {
    const raw = sessionStorage.getItem(ROWS_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; fp: string; rows: WeatherLocationRow[] }
    if (Date.now() - parsed.at > ROWS_SESSION_TTL_MS) return null
    if (parsed.fp !== sitesFingerprint(sites)) return null
    if (!parsed.rows?.some(rowHasLiveTemp)) return null
    return parsed.rows
  } catch {
    return null
  }
}

function writePersistedLocationRows(sites: WeatherFarmSite[], rows: WeatherLocationRow[]): void {
  try {
    if (!rows.some(rowHasLiveTemp)) return
    sessionStorage.setItem(
      ROWS_SESSION_KEY,
      JSON.stringify({ at: Date.now(), fp: sitesFingerprint(sites), rows }),
    )
  } catch {
    /* quota / private mode */
  }
}



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

function rowNeedsDaily(row: WeatherLocationRow | undefined): boolean {
  return Boolean(row && rowHasLiveTemp(row) && (row.dailyMinC == null || row.dailyMaxC == null))
}

async function fetchOneSiteBestEffort(
  site: WeatherFarmSite,
  signal?: AbortSignal,
): Promise<WeatherLocationRow> {
  const viaApi = await fetchCurrentViaGetApi(site, signal)
  if (viaApi && rowHasLiveTemp(viaApi)) return viaApi
  try {
    const [direct] = await fetchChunkDirectWithRetry([site], signal)
    if (rowHasLiveTemp(direct)) return direct
  } catch {
    /* next */
  }
  try {
    const snap = await fetchOpenMeteoWeatherMapPick(site.lat, site.lng, signal)
    const row = rowFromCurrent(site, {
      temperature_2m: snap.temperatureC,
      relative_humidity_2m: snap.humidityPct,
      wind_speed_10m: snap.windSpeedKmh,
      wind_direction_10m: snap.windDirectionDeg,
      precipitation: snap.precipMm,
      weather_code: snap.weatherCode,
    })
    const d0 = snap.daily?.[0]
    return {
      ...row,
      dailyMinC: d0?.tempMinC ?? row.dailyMinC,
      dailyMaxC: d0?.tempMaxC ?? row.dailyMaxC,
    }
  } catch {
    return emptyRow(site)
  }
}

/** Fill today's min/max °C when current conditions exist but daily arrays were omitted. */
export async function enrichDailyForRows(
  sites: WeatherFarmSite[],
  merged: WeatherLocationRow[],
  signal?: AbortSignal,
): Promise<WeatherLocationRow[]> {
  let out = merged
  const need = sites.filter(s => rowNeedsDaily(out.find(r => r.id === s.id)))
  if (!need.length) return out

  if (await weatherApiReachable()) {
    const fromApi = await fetchLocationsCurrentViaApi(need, signal)
    if (fromApi?.length) out = mergeLocationRows(sites, [...out, ...fromApi])
  }

  const stillNeed = sites.filter(s => rowNeedsDaily(out.find(r => r.id === s.id)))
  for (let i = 0; i < stillNeed.length; i += CHUNK_SIZE) {
    if (signal?.aborted) break
    const chunk = stillNeed.slice(i, i + CHUNK_SIZE)
    try {
      const rows = await fetchChunkDirectWithRetry(chunk, signal)
      out = mergeLocationRows(sites, [...out, ...rows])
    } catch {
      /* rate limit — keep partial */
    }
    if (i + CHUNK_SIZE < stillNeed.length) await sleep(CHUNK_GAP_MS, signal)
  }
  return out
}

async function retryMissingTemperatureSites(
  sites: WeatherFarmSite[],
  merged: WeatherLocationRow[],
  signal?: AbortSignal,
): Promise<WeatherLocationRow[]> {
  let out = merged
  const missing = sites.filter(s => !rowHasLiveTemp(out.find(r => r.id === s.id)!))
  for (const site of missing) {
    if (signal?.aborted) break
    const row = await fetchOneSiteBestEffort(site, signal)
    if (rowHasLiveTemp(row)) out = mergeLocationRows(sites, [...out, row])
    await sleep(100, signal)
  }
  return out
}

/** Portfolio "All locations" when direct fetch fails — average from loaded sites. */
export function synthesizeAllLocationsRow(
  label: string,
  peers: WeatherLocationRow[],
): WeatherLocationRow | null {
  const live = peers.filter(r => r.id !== 'all' && rowHasLiveTemp(r))
  if (!live.length) return null
  const mean = (pick: (r: WeatherLocationRow) => number | null | undefined) => {
    const vals = live
      .map(pick)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    if (!vals.length) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }
  const minOf = (pick: (r: WeatherLocationRow) => number | null | undefined) => {
    const vals = live
      .map(pick)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    return vals.length ? Math.min(...vals) : null
  }
  const maxOf = (pick: (r: WeatherLocationRow) => number | null | undefined) => {
    const vals = live
      .map(pick)
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    return vals.length ? Math.max(...vals) : null
  }
  const temperatureC = mean(r => r.temperatureC)
  if (temperatureC == null) return null
  return {
    id: 'all',
    label,
    temperatureC,
    humidityPct: mean(r => r.humidityPct),
    windSpeedKmh: mean(r => r.windSpeedKmh),
    windDirectionDeg: mean(r => r.windDirectionDeg),
    precipMm: mean(r => r.precipMm),
    weatherCode: live[0]?.weatherCode ?? null,
    dailyMinC: minOf(r => r.dailyMinC),
    dailyMaxC: maxOf(r => r.dailyMaxC),
  }
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
  points: Array<{
    current?: Record<string, number | null>
    dailyMinC?: number | null
    dailyMaxC?: number | null
  }>,
): WeatherLocationRow[] {
  return sites.map((site, i) => {
    const pt = points[i]
    const cur = pt?.current ?? {}
    const normalized: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(cur)) normalized[k] = v
    return rowFromCurrent(site, normalized, {
      dailyMinC: pt?.dailyMinC ?? null,
      dailyMaxC: pt?.dailyMaxC ?? null,
    })
  })
}



async function fetchLocationsCurrentViaApi(

  sites: WeatherFarmSite[],

  signal?: AbortSignal,

): Promise<WeatherLocationRow[] | null> {

  try {
    if (!(await weatherApiReachable())) return null

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

  const entries = (Array.isArray(raw) ? raw : [raw]).map((entry, i) => {
    if (entry && typeof entry === 'object' && (entry as { error?: boolean }).error) {
      return {}
    }
    return entry
  })

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

    const is429 =
      status === 429 ||
      (e instanceof Error && (e.message.includes('429') || e.message.includes('rate limit')))

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
      const row = await fetchOneSiteBestEffort(site, signal)
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
    const payload = (await res.json()) as {
      current?: Record<string, number | null>
      dailyMinC?: number | null
      dailyMaxC?: number | null
    }
    const row = rowFromCurrent(site, payload.current ?? {}, {
      dailyMinC: payload.dailyMinC ?? null,
      dailyMaxC: payload.dailyMaxC ?? null,
    })
    return rowHasLiveTemp(row) ? row : null
  } catch {
    return null
  }
}

async function fetchDirectChunksForSites(
  sites: WeatherFarmSite[],
  signal?: AbortSignal,
): Promise<WeatherLocationRow[]> {
  let merged = sites.map(emptyRow)
  for (let i = 0; i < sites.length; i += CHUNK_SIZE) {
    if (signal?.aborted) break
    const chunk = sites.slice(i, i + CHUNK_SIZE)
    try {
      const rows = await fetchChunkDirectWithRetry(chunk, signal)
      merged = mergeLocationRows(sites, [...merged, ...rows])
    } catch {
      /* rate limit — try next chunk */
    }
    if (i + CHUNK_SIZE < sites.length) await sleep(CHUNK_GAP_MS, signal)
  }
  return merged
}

async function fetchChunkRows(sites: WeatherFarmSite[], signal?: AbortSignal): Promise<WeatherLocationRow[]> {
  let merged = sites.map(emptyRow)

  if (await weatherApiReachable()) {
    for (const site of sites) {
      if (signal?.aborted) break
      const hit = await fetchCurrentViaGetApi(site, signal)
      if (hit) merged = mergeLocationRows(sites, [...merged, hit])
      await sleep(80, signal)
    }
  }

  const stillMissing = sites.filter(s => !rowHasLiveTemp(merged.find(r => r.id === s.id)!))
  if (stillMissing.length) {
    try {
      const direct = await fetchDirectChunksForSites(stillMissing, signal)
      merged = mergeLocationRows(sites, [...merged, ...direct])
    } catch {
      /* fall through */
    }
  }

  return merged
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

  const persisted = readPersistedLocationRows(sites)
  let acc: WeatherLocationRow[] = mergeLocationRows(sites, [
    ...seedLocationRowsFromLiveCache(sites),
    ...(persisted ?? []),
  ])

  const publish = (parts: WeatherLocationRow[]) => {
    acc = mergeLocationRows(sites, [...acc, ...parts])
    onProgress?.(acc)
    if (acc.some(rowHasLiveTemp)) writePersistedLocationRows(sites, acc)
    return acc
  }

  publish([])
  let merged = acc

  const missingAfterSeed = sites.filter(s => !rowHasLiveTemp(merged.find(r => r.id === s.id)!))
  if (missingAfterSeed.length) {
    try {
      const directFirst = await fetchDirectChunksForSites(missingAfterSeed, signal)
      merged = publish(directFirst)
      merged = await enrichDailyForRows(sites, merged, signal)
      publish(merged)
      if (countLiveTemps(merged) >= sites.length) {
        writePersistedLocationRows(sites, merged)
        return merged
      }
    } catch {
      /* backend/API path may still fill gaps */
    }
  }

  if (await weatherApiReachable()) {
    const gridRows = await fetchAllSitesViaGridBatch(sites, signal)
    if (gridRows?.length) {
      merged = publish(gridRows)
      merged = await enrichDailyForRows(sites, merged, signal)
      publish(merged)
      if (countLiveTemps(merged) >= sites.length) {
        writePersistedLocationRows(sites, merged)
        return merged
      }
    }

    const missingForApi = sites.filter(s => !rowHasLiveTemp(merged.find(r => r.id === s.id)!))
    if (missingForApi.length) {
      const fromApi = await fetchLocationsCurrentViaApi(missingForApi, signal)
      if (fromApi?.length) {
        merged = publish(fromApi)
        if (countLiveTemps(merged) >= sites.length) {
          merged = await enrichDailyForRows(sites, merged, signal)
          publish(merged)
          writePersistedLocationRows(sites, merged)
          return merged
        }
      }
    }
  }

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



  const stillMissingAfterApi = sites.filter(s => !rowHasLiveTemp(merged.find(r => r.id === s.id)!))

  if (stillMissingAfterApi.length > 0) {
    const missingRows = merged.filter(r => stillMissingAfterApi.some(m => m.id === r.id))
    const filled = await fillMissingWithMapPick(stillMissingAfterApi, missingRows, signal)
    merged = publish([
      ...merged.filter(r => !stillMissingAfterApi.some(m => m.id === r.id)),
      ...filled,
    ])
  }

  merged = await enrichDailyForRows(sites, merged, signal)
  merged = await retryMissingTemperatureSites(sites, merged, signal)
  const allSite = sites.find(s => s.id === 'all')
  if (allSite && !rowHasLiveTemp(merged.find(r => r.id === 'all')!)) {
    const synth = synthesizeAllLocationsRow(allSite.label, merged)
    if (synth) merged = mergeLocationRows(sites, [...merged, synth])
  }
  publish(merged)

  writePersistedLocationRows(sites, merged)
  return merged
}


