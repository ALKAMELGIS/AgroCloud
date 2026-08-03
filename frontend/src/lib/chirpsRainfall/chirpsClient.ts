import type { ChirpsAggregation, ChirpsSeriesPoint } from './chirpsIndices'
import { CHIRPS_NODATA } from './chirpsIndices'

export type ChirpsRasterResponse = {
  source: string
  product: string
  date: string
  requestedDate?: string
  lookbackSteps?: number
  aggregation: string
  unit: string
  nodata: number
  width: number
  height: number
  west: number
  south: number
  east: number
  north: number
  stats: { min: number | null; max: number | null; mean: number | null; validCount: number }
  values: number[]
  previewDataUrl: string
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
}

export type ChirpsTimeseriesResponse = {
  source: string
  unit: string
  aggregation: string
  start: string
  end: string
  points: ChirpsSeriesPoint[]
  summary: {
    totalMm: number | null
    meanMm: number | null
    stdMm: number | null
    n: number
  }
}

function apiBase(): string {
  const env = (import.meta as { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE
  if (env && String(env).trim()) return String(env).replace(/\/$/, '')
  return ''
}

export function geometryBbox(
  geometry: GeoJSON.Geometry,
): [number, number, number, number] {
  const pts: number[][] = []
  const walk = (c: unknown): void => {
    if (!c) return
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      pts.push(c as number[])
      return
    }
    if (Array.isArray(c)) c.forEach(walk)
  }
  walk((geometry as { coordinates?: unknown }).coordinates)
  if (!pts.length) throw new Error('AOI has no coordinates')
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

export async function fetchChirpsRaster(input: {
  geometry: GeoJSON.Geometry
  date: string
  aggregation?: ChirpsAggregation
  signal?: AbortSignal
}): Promise<ChirpsRasterResponse> {
  const [west, south, east, north] = geometryBbox(input.geometry)
  const res = await fetch(`${apiBase()}/api/chirps/raster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      west,
      south,
      east,
      north,
      date: input.date,
      aggregation: input.aggregation ?? 'daily',
    }),
    signal: input.signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `CHIRPS raster failed (${res.status})`)
  }
  return res.json()
}

export async function fetchChirpsTimeseries(input: {
  geometry: GeoJSON.Geometry
  start: string
  end: string
  aggregation?: ChirpsAggregation
  signal?: AbortSignal
}): Promise<ChirpsTimeseriesResponse> {
  const [west, south, east, north] = geometryBbox(input.geometry)
  const agg =
    input.aggregation === 'daily'
      ? 'daily'
      : input.aggregation === 'monthly' ||
          input.aggregation === 'seasonal' ||
          input.aggregation === 'annual'
        ? 'monthly'
        : 'daily'
  const res = await fetch(`${apiBase()}/api/chirps/timeseries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      west,
      south,
      east,
      north,
      start: input.start,
      end: input.end,
      aggregation: agg,
    }),
    signal: input.signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `CHIRPS timeseries failed (${res.status})`)
  }
  return res.json()
}

export { CHIRPS_NODATA }
