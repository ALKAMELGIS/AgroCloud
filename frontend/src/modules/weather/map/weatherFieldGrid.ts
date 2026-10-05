import type { WeatherMapLayerDef } from '../config/weatherLayerCatalog'
import { fetchHourlyGridBatch } from '../services/openMeteoGridProxy'

export type FieldGridPoint = { lat: number; lng: number; value: number }

export type WindGridPoint = { lat: number; lng: number; u: number; v: number }

/** Meteorological degrees → east/north components (m/s scale). */
export function windDegSpeedToUv(speedKmh: number, directionDeg: number): { u: number; v: number } {
  const rad = (directionDeg * Math.PI) / 180
  const speedMs = Math.max(0, speedKmh) / 3.6
  return {
    u: -speedMs * Math.sin(rad),
    v: -speedMs * Math.cos(rad),
  }
}

export type LngLatBBox = { west: number; south: number; east: number; north: number }

/** Build a lat/lng sample lattice for the viewport (max 120 points — grid-batch limit). */
export function buildViewportGrid(bbox: LngLatBBox, targetCells: number): Array<{ lat: number; lng: number }> {
  const latSpan = Math.max(bbox.north - bbox.south, 1e-6)
  const lngSpan = Math.max(bbox.east - bbox.west, 1e-6)
  const aspect = lngSpan / latSpan
  const maxPoints = 120
  const nBase = Math.max(4, Math.min(targetCells, 14))
  let cols = Math.max(4, Math.round(nBase * Math.sqrt(aspect)))
  let rows = Math.max(4, Math.round(nBase / Math.sqrt(aspect)))
  while (cols * rows > maxPoints) {
    if (cols >= rows && cols > 4) cols -= 1
    else if (rows > 4) rows -= 1
    else break
  }
  const pts: Array<{ lat: number; lng: number }> = []
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const lng = bbox.west + (lngSpan * (j + 0.5)) / cols
      const lat = bbox.south + (latSpan * (i + 0.5)) / rows
      pts.push({ lat, lng })
    }
  }
  return pts
}

function pickHourlyIndex(times: string[], timeIso?: string): number {
  if (!times.length) return 0
  if (!timeIso) return 0
  const target = timeIso.slice(0, 16)
  const exact = times.findIndex(t => t.slice(0, 16) === target)
  if (exact >= 0) return exact
  let best = 0
  let bestDiff = Infinity
  const ts = Date.parse(timeIso.replace(' ', 'T'))
  for (let i = 0; i < times.length; i++) {
    const d = Math.abs(Date.parse(times[i].replace(' ', 'T')) - ts)
    if (d < bestDiff) {
      bestDiff = d
      best = i
    }
  }
  return best
}

function readHourlyCell(raw: unknown, locIndex: number, timeIndex: number): number | null {
  if (!Array.isArray(raw)) return null
  const first = raw[0]
  if (typeof first === 'number') {
    const v = raw[timeIndex]
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }
  const row = raw[locIndex]
  if (!Array.isArray(row)) return null
  const v = row[timeIndex]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Batch hourly forecast for many points (one Open-Meteo request).
 * @see https://open-meteo.com/en/docs
 */
async function fetchOpenMeteoFieldGridDirect(
  points: Array<{ lat: number; lng: number }>,
  variable: string,
  timeIso?: string,
  signal?: AbortSignal,
): Promise<FieldGridPoint[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', points.map(p => p.lat.toFixed(4)).join(','))
  url.searchParams.set('longitude', points.map(p => p.lng.toFixed(4)).join(','))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('hourly', variable)
  url.searchParams.set('forecast_days', '2')
  url.searchParams.set('wind_speed_unit', 'kmh')

  const res = await fetch(url.toString(), { signal })
  if (!res.ok) throw new Error(`Open-Meteo grid HTTP ${res.status}`)

  const raw = (await res.json()) as Record<string, unknown> | Record<string, unknown>[]
  const entries = Array.isArray(raw) ? raw : [raw]

  const out: FieldGridPoint[] = []
  for (let i = 0; i < points.length; i++) {
    const entry = entries[i] ?? entries[0]
    if (!entry || typeof entry !== 'object') continue
    const hourly = (entry as Record<string, unknown>).hourly as Record<string, unknown> | undefined
    const times = (hourly?.time as string[]) ?? []
    const tIdx = pickHourlyIndex(times, timeIso)
    const series = hourly?.[variable]
    const value = readHourlyCell(series, 0, tIdx)
    if (value == null) continue
    out.push({ ...points[i], value })
  }
  return out
}

export async function fetchOpenMeteoFieldGrid(
  points: Array<{ lat: number; lng: number }>,
  layer: WeatherMapLayerDef,
  timeIso?: string,
  signal?: AbortSignal,
): Promise<FieldGridPoint[]> {
  if (!points.length) return []
  const variable = layer.openMeteoVariable
  const proxied = await fetchHourlyGridBatch(points, variable, timeIso, signal)
  if (proxied?.points?.length) {
    const out: FieldGridPoint[] = []
    for (const row of proxied.points) {
      const value = row.values[variable]
      if (value == null || !Number.isFinite(value)) continue
      out.push({ lat: row.lat, lng: row.lng, value })
    }
    if (out.length) return out
  }
  return fetchOpenMeteoFieldGridDirect(points, variable, timeIso, signal)
}

export async function fetchOpenMeteoWindGrid(
  points: Array<{ lat: number; lng: number }>,
  timeIso?: string,
  signal?: AbortSignal,
): Promise<WindGridPoint[]> {
  if (!points.length) return []
  const proxied = await fetchHourlyGridBatch(
    points,
    ['wind_speed_10m', 'wind_direction_10m'],
    timeIso,
    signal,
  )
  if (proxied?.points?.length) {
    const out: WindGridPoint[] = []
    for (const row of proxied.points) {
      const speed = row.values.wind_speed_10m
      const dir = row.values.wind_direction_10m
      if (speed == null || dir == null) continue
      const { u, v } = windDegSpeedToUv(speed, dir)
      out.push({ lat: row.lat, lng: row.lng, u, v })
    }
    if (out.length) return out
  }

  const fieldRows = await fetchOpenMeteoFieldGridDirect(
    points,
    'wind_speed_10m',
    timeIso,
    signal,
  )
  const dirRows = await fetchOpenMeteoFieldGridDirect(
    points,
    'wind_direction_10m',
    timeIso,
    signal,
  )
  const out: WindGridPoint[] = []
  for (let i = 0; i < points.length; i++) {
    const speed = fieldRows.find(r => r.lat === points[i].lat && r.lng === points[i].lng)?.value
    const dir = dirRows.find(r => r.lat === points[i].lat && r.lng === points[i].lng)?.value
    if (speed == null || dir == null) continue
    const { u, v } = windDegSpeedToUv(speed, dir)
    out.push({ ...points[i], u, v })
  }
  return out
}

export function idwInterpolate(
  lat: number,
  lng: number,
  samples: FieldGridPoint[],
  power = 2,
): number | null {
  if (!samples.length) return null
  let num = 0
  let den = 0
  const cosLat = Math.cos((lat * Math.PI) / 180)
  for (const s of samples) {
    const dx = (s.lng - lng) * cosLat
    const dy = s.lat - lat
    const d2 = dx * dx + dy * dy
    if (d2 < 1e-12) return s.value
    const w = 1 / Math.pow(d2, power / 2)
    num += w * s.value
    den += w
  }
  return den > 0 ? num / den : null
}
