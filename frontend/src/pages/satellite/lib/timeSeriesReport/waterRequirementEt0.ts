/**
 * Batch ET0 fetch for water requirement calculations.
 * Groups field centroids into ~2 km grid cells to minimize Open-Meteo requests.
 */

import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import { fetchOpenMeteoEt0Batch } from '../../../../lib/openMeteoEt0Api'
import { fetchOpenMeteoHistoryRange } from '../../../../lib/openMeteoWeather'

export type Et0BatchContext = {
  /** Mean ET0 mm/day keyed by `${lat.toFixed(2)}_${lon.toFixed(2)}`. */
  et0MmDayByGridKey: Map<string, number>
  weatherSource: string
}

const et0Cache = new Map<string, { et0MmDay: number; fetchedAt: number }>()
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FETCH_CONCURRENCY = 6

function gridKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)}_${lon.toFixed(2)}`
}

function cacheKey(grid: string, date: string): string {
  return `${grid}|${date}`
}

function ringCentroid(ring: number[][]): [number, number] {
  let sx = 0
  let sy = 0
  let n = 0
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue
    sx += pt[0]!
    sy += pt[1]!
    n += 1
  }
  if (!n) return [0, 0]
  return [sx / n, sy / n]
}

function geometryCentroid(geometry: GeoJSON.Geometry): [number, number] | null {
  if (geometry.type === 'Point') {
    return [geometry.coordinates[0]!, geometry.coordinates[1]!]
  }
  if (geometry.type === 'Polygon' && geometry.coordinates[0]?.length) {
    return ringCentroid(geometry.coordinates[0] as number[][])
  }
  if (geometry.type === 'MultiPolygon' && geometry.coordinates[0]?.[0]?.length) {
    return ringCentroid(geometry.coordinates[0]![0] as number[][])
  }
  return null
}

/** Resolve plot centroid as GeoJSON [lon, lat], computing from geometry when needed. */
export function resolvePlotCentroidLonLat(plot: CropAlertFieldInput): { lon: number; lat: number } | null {
  const tryPair = (lon: number, lat: number): { lon: number; lat: number } | null => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
    if (Math.abs(lon) < 0.001 && Math.abs(lat) < 0.001) return null
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    return { lon, lat }
  }

  const c = plot.centroid
  if (Array.isArray(c) && c.length >= 2) {
    const fromCentroid = tryPair(c[0]!, c[1]!)
    if (fromCentroid) return fromCentroid
  }

  const geom = plot.geometry
  if (geom) {
    const computed = geometryCentroid(geom)
    if (computed) {
      const fromGeom = tryPair(computed[0], computed[1])
      if (fromGeom) return fromGeom
    }
  }

  return null
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (!items.length) return
  let index = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++
      await fn(items[i]!)
    }
  })
  await Promise.all(workers)
}

/**
 * Mean ET0 mm/day for a single date from Open-Meteo hourly archive.
 */
async function fetchEt0MmDayForGrid(
  lat: number,
  lon: number,
  observationDate: string,
  fromDate: string,
  toDate: string,
): Promise<number | null> {
  const grid = gridKey(lat, lon)
  const ck = cacheKey(grid, observationDate)
  const cached = et0Cache.get(ck)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.et0MmDay
  }

  try {
    const hist = await fetchOpenMeteoHistoryRange(lat, lon, fromDate, toDate)
    const dayPoints = hist.points.filter(p => p.time.slice(0, 10) === observationDate)
    const et0Vals = dayPoints
      .map(p => p.et0Mm)
      .filter((v): v is number => v != null && Number.isFinite(v))
    if (!et0Vals.length) {
      const allEt = hist.points
        .map(p => p.et0Mm)
        .filter((v): v is number => v != null && Number.isFinite(v))
      if (!allEt.length) return null
      const days = new Set(hist.points.map(p => p.time.slice(0, 10))).size || 1
      const mean = allEt.reduce((a, b) => a + b, 0) / days
      et0Cache.set(ck, { et0MmDay: mean, fetchedAt: Date.now() })
      return Number(mean.toFixed(3))
    }
    const mean = et0Vals.reduce((a, b) => a + b, 0) / et0Vals.length
    et0Cache.set(ck, { et0MmDay: mean, fetchedAt: Date.now() })
    return Number(mean.toFixed(3))
  } catch {
    return null
  }
}

/** Mean ET0 (mm/day) for each scene date — used for ETc = Kc × ET0 in water-loss timeline. */
export async function fetchEt0MmDayByDateForSceneDates(input: {
  lat: number
  lon: number
  fromDate: string
  toDate: string
  sceneDates: string[]
  signal?: AbortSignal
}): Promise<Record<string, number>> {
  const unique = [...new Set(input.sceneDates.map(d => d.trim().slice(0, 10)).filter(Boolean))]
  const out: Record<string, number> = {}
  await mapPool(unique, FETCH_CONCURRENCY, async date => {
    if (input.signal?.aborted) return
    const et0 = await fetchEt0MmDayForGrid(
      input.lat,
      input.lon,
      date,
      input.fromDate,
      input.toDate,
    )
    if (et0 != null && Number.isFinite(et0) && et0 > 0) {
      out[date] = et0
    }
  })
  return out
}

async function fetchEt0DirectBatch(
  entries: FieldEt0Entry[],
  fromDate: string,
  toDate: string,
): Promise<Map<string, number>> {
  const uniqueRequests = new Map<string, { lat: number; lon: number; date: string }>()
  const fieldToRequestKey = new Map<string, string>()

  for (const entry of entries) {
    const point = resolvePlotCentroidLonLat(entry.plot)
    const obs = entry.observationDate.trim().slice(0, 10)
    if (!point || !obs) continue
    const { lon, lat } = point
    const reqKey = `${gridKey(lat, lon)}|${obs}`
    if (!uniqueRequests.has(reqKey)) {
      uniqueRequests.set(reqKey, { lat, lon, date: obs })
    }
    fieldToRequestKey.set(entry.fieldKey, reqKey)
  }

  const et0ByRequestKey = new Map<string, number>()
  const requestEntries = [...uniqueRequests.entries()]

  await mapPool(requestEntries, FETCH_CONCURRENCY, async ([reqKey, job]) => {
    const et0 = await fetchEt0MmDayForGrid(job.lat, job.lon, job.date, fromDate, toDate)
    if (et0 != null) et0ByRequestKey.set(reqKey, et0)
  })

  const et0ByFieldKey = new Map<string, number>()
  for (const [fieldKey, reqKey] of fieldToRequestKey) {
    const et0 = et0ByRequestKey.get(reqKey)
    if (et0 != null) et0ByFieldKey.set(fieldKey, et0)
  }
  return et0ByFieldKey
}

async function fetchEt0ProxyBatch(
  entries: FieldEt0Entry[],
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  const batch = entries
    .map(entry => {
      const point = resolvePlotCentroidLonLat(entry.plot)
      const obs = entry.observationDate.trim().slice(0, 10)
      if (!point || !obs) return null
      return {
        fieldKey: entry.fieldKey,
        lat: point.lat,
        lon: point.lon,
        observationDate: obs,
      }
    })
    .filter((e): e is NonNullable<typeof e> => e != null)

  if (!batch.length) return new Map()
  try {
    return await fetchOpenMeteoEt0Batch(batch, fromDate, toDate, signal)
  } catch {
    return new Map()
  }
}

function applyFallbackEt0(
  et0ByFieldKey: Map<string, number>,
  entries: FieldEt0Entry[],
  fromDate: string,
  toDate: string,
): Promise<void> {
  if (et0ByFieldKey.size > 0) return Promise.resolve()

  const anchor = entries.find(e => resolvePlotCentroidLonLat(e.plot))
  if (!anchor) return Promise.resolve()

  const point = resolvePlotCentroidLonLat(anchor.plot)!
  const obs = anchor.observationDate.trim().slice(0, 10)
  return fetchEt0MmDayForGrid(point.lat, point.lon, obs, fromDate, toDate).then(fallback => {
    if (fallback == null) return
    for (const entry of entries) {
      if (!et0ByFieldKey.has(entry.fieldKey)) {
        et0ByFieldKey.set(entry.fieldKey, fallback)
      }
    }
  })
}

/**
 * Fetch ET0 for unique grid cells (~1 Open-Meteo call per cell, not per field).
 */
export async function fetchBatchEt0Context(
  plots: CropAlertFieldInput[],
  observationDate: string,
  fromDate: string,
  toDate: string,
): Promise<Et0BatchContext> {
  const obs = observationDate.trim().slice(0, 10)
  const uniqueGrids = new Map<string, { lat: number; lon: number }>()

  for (const plot of plots) {
    const point = resolvePlotCentroidLonLat(plot)
    if (!point) continue
    const key = gridKey(point.lat, point.lon)
    if (!uniqueGrids.has(key)) uniqueGrids.set(key, point)
  }

  const et0MmDayByGridKey = new Map<string, number>()
  const entries = [...uniqueGrids.entries()]

  await mapPool(entries, FETCH_CONCURRENCY, async ([key, { lat, lon }]) => {
    const et0 = await fetchEt0MmDayForGrid(lat, lon, obs, fromDate, toDate)
    if (et0 != null) et0MmDayByGridKey.set(key, et0)
  })

  return {
    et0MmDayByGridKey,
    weatherSource:
      et0MmDayByGridKey.size > 0
        ? `Open-Meteo ERA5 ET0 (${et0MmDayByGridKey.size} grid cell(s), date ${obs})`
        : 'Open-Meteo ET0 unavailable',
  }
}

export function resolveEt0ForPlot(
  plot: CropAlertFieldInput,
  context: Et0BatchContext | null | undefined,
): number | null {
  if (!context?.et0MmDayByGridKey.size) return null
  const point = resolvePlotCentroidLonLat(plot)
  if (!point) return null
  return context.et0MmDayByGridKey.get(gridKey(point.lat, point.lon)) ?? null
}

export type FieldEt0Entry = {
  fieldKey: string
  plot: CropAlertFieldInput
  observationDate: string
}

/**
 * Fetch ET0 for unique (grid × date) pairs — backend proxy first, browser fallback.
 */
export async function fetchBatchEt0ByField(
  entries: FieldEt0Entry[],
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
): Promise<Map<string, number>> {
  if (!entries.length) return new Map()

  let et0ByFieldKey = await fetchEt0ProxyBatch(entries, fromDate, toDate, signal)
  if (!et0ByFieldKey.size) {
    et0ByFieldKey = await fetchEt0DirectBatch(entries, fromDate, toDate)
  }
  await applyFallbackEt0(et0ByFieldKey, entries, fromDate, toDate)
  return et0ByFieldKey
}

export function clearEt0Cache(): void {
  et0Cache.clear()
}
