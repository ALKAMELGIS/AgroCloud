const R = 6378137
const D2R = Math.PI / 180

export type ElevationProfileSample = {
  distanceM: number
  elevationM: number
  slopePct: number
  lng: number
  lat: number
}

export type ElevationProfileStats = {
  distanceM: number
  minM: number
  avgM: number
  maxM: number
  gainM: number
  lossM: number
  slopeMaxPct: number
  slopeMinPct: number
  slopeAvgPct: number
}

export type ElevationProfile = {
  samples: ElevationProfileSample[]
  stats: ElevationProfileStats
}

export function haversineMeters(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * D2R
  const dLng = (b[0] - a[0]) * D2R
  const lat1 = a[1] * D2R
  const lat2 = b[1] * D2R
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export function lineLengthM(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i += 1) total += haversineMeters(coords[i - 1]!, coords[i]!)
  return total
}

/** Evenly spaced coordinates along a polyline, including the first and last vertex. */
export function densifyLine(coords: [number, number][], spacingM: number): [number, number][] {
  if (coords.length < 2) return coords.slice()
  const step = Math.max(5, spacingM)
  const out: [number, number][] = [coords[0]!]
  let carried = 0
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1]!
    const b = coords[i]!
    const seg = haversineMeters(a, b)
    if (seg <= 0.01) continue
    let walked = step - carried
    while (walked < seg) {
      const t = walked / seg
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
      walked += step
    }
    carried = seg - (walked - step)
    out.push(b)
  }
  return out
}

function statsOf(samples: ElevationProfileSample[]): ElevationProfileStats {
  let minM = Infinity
  let maxM = -Infinity
  let sum = 0
  let gainM = 0
  let lossM = 0
  let slopeMaxPct = 0
  let slopeMinPct = 0
  let slopeSum = 0
  for (let i = 0; i < samples.length; i += 1) {
    const z = samples[i]!.elevationM
    minM = Math.min(minM, z)
    maxM = Math.max(maxM, z)
    sum += z
    if (i === 0) continue
    const rise = z - samples[i - 1]!.elevationM
    if (rise > 0) gainM += rise
    else lossM += rise
    const slope = samples[i - 1]!.slopePct
    slopeMaxPct = Math.max(slopeMaxPct, slope)
    slopeMinPct = Math.min(slopeMinPct, slope)
    slopeSum += slope
  }
  const n = samples.length
  return {
    distanceM: samples[n - 1]!.distanceM,
    minM,
    avgM: sum / n,
    maxM,
    gainM,
    lossM,
    slopeMaxPct,
    slopeMinPct,
    slopeAvgPct: n > 1 ? slopeSum / (n - 1) : 0,
  }
}

/**
 * Build a station-elevation profile. `sample` returns metres, or null where elevation is unknown.
 * Unknown stations are filled from the nearest known samples.
 */
export function buildElevationProfile(
  vertices: [number, number][],
  sample: (lng: number, lat: number) => number | null,
  spacingM = 20,
): ElevationProfile | null {
  if (vertices.length < 2) return null
  const length = lineLengthM(vertices)
  if (length < 1) return null
  const spacing = Math.min(80, Math.max(8, length / 180))
  const pts = densifyLine(vertices, Number.isFinite(spacingM) ? Math.min(spacing, spacingM) : spacing)
  const raw = pts.map(p => sample(p[0], p[1]))
  const known = raw.some(v => v != null && Number.isFinite(v))
  if (!known) return null
  const elev = raw.map((v, i) => {
    if (v != null && Number.isFinite(v)) return v
    let prev = i - 1
    while (prev >= 0 && !(raw[prev] != null && Number.isFinite(raw[prev]!))) prev -= 1
    let next = i + 1
    while (next < raw.length && !(raw[next] != null && Number.isFinite(raw[next]!))) next += 1
    if (prev >= 0 && next < raw.length) {
      const t = (i - prev) / (next - prev)
      return raw[prev]! + (raw[next]! - raw[prev]!) * t
    }
    if (prev >= 0) return raw[prev]!
    if (next < raw.length) return raw[next]!
    return NaN
  })
  const samples: ElevationProfileSample[] = []
  let distance = 0
  for (let i = 0; i < pts.length; i += 1) {
    if (i > 0) distance += haversineMeters(pts[i - 1]!, pts[i]!)
    const z = elev[i]!
    if (!Number.isFinite(z)) continue
    const run = i < pts.length - 1 ? haversineMeters(pts[i]!, pts[i + 1]!) : 0
    const rise = i < pts.length - 1 && Number.isFinite(elev[i + 1]!) ? elev[i + 1]! - z : 0
    const slopePct = run > 0.05 ? (rise / run) * 100 : 0
    samples.push({
      distanceM: distance,
      elevationM: z,
      slopePct,
      lng: pts[i]![0],
      lat: pts[i]![1],
    })
  }
  if (samples.length < 2) return null
  samples[samples.length - 1]!.slopePct = samples[samples.length - 2]!.slopePct
  return { samples, stats: statsOf(samples) }
}

/** Longest line from a drawn sketch: LineString, or a polygon outer ring opened into a path. */
export function lineFromGeometry(
  input: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
): [number, number][] | null {
  if (!input) return null
  const geom = input.type === 'Feature' ? input.geometry : input
  if (!geom) return null
  if (geom.type === 'LineString') {
    const coords = geom.coordinates.filter(c => c.length >= 2).map(c => [c[0]!, c[1]!] as [number, number])
    return coords.length >= 2 ? coords : null
  }
  if (geom.type === 'MultiLineString') {
    let best: [number, number][] | null = null
    let bestLen = 0
    for (const line of geom.coordinates) {
      const coords = line.filter(c => c.length >= 2).map(c => [c[0]!, c[1]!] as [number, number])
      const len = lineLengthM(coords)
      if (len > bestLen) {
        best = coords
        bestLen = len
      }
    }
    return best && best.length >= 2 ? best : null
  }
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0]
    if (!ring || ring.length < 4) return null
    const coords = ring.slice(0, -1).map(c => [c[0]!, c[1]!] as [number, number])
    return coords.length >= 2 ? coords : null
  }
  return null
}

export function formatProfileDistance(m: number): string {
  const n = Math.round(m)
  return `${n.toLocaleString('en-US')} m`
}

export function formatProfileElevation(m: number): string {
  return `${m.toFixed(Math.abs(m) >= 100 ? 1 : 2)} m`
}

export function formatProfileSlope(pct: number): string {
  return `${pct.toFixed(2)}%`
}
