import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'

export type XyzPoint = { lng: number; lat: number; z: number }

export function parseXyzCsvText(text: string): XyzPoint[] {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  const out: XyzPoint[] = []
  for (const line of lines) {
    if (/^(x|lon|lng|easting)/i.test(line) && /z|elev|height/i.test(line)) continue
    const parts = line.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean)
    if (parts.length < 3) continue
    const a = Number(parts[0])
    const b = Number(parts[1])
    const z = Number(parts[2])
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(z)) continue
    const lng = Math.abs(a) <= 180 && Math.abs(b) <= 90 ? a : b
    const lat = Math.abs(a) <= 180 && Math.abs(b) <= 90 ? b : a
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) continue
    out.push({ lng, lat, z })
  }
  return out
}

/**
 * A flat design outside the existing surface paints only Cut or only Fill.
 * When the requested elevation misses the terrain, use the mean so both appear.
 */
export function designConstantOnTerrain(existingElev: ArrayLike<number>, requestedM: number): number {
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let n = 0
  for (let i = 0; i < existingElev.length; i += 1) {
    const z = existingElev[i]!
    if (!Number.isFinite(z)) continue
    if (z < min) min = z
    if (z > max) max = z
    sum += z
    n += 1
  }
  if (!n || !Number.isFinite(requestedM)) return Number.isFinite(requestedM) ? requestedM : 0
  if (requestedM >= min && requestedM <= max) return requestedM
  return sum / n
}

export function buildDesignGridConstant(dem: DemGrid, elevationM: number): Float32Array {
  const grid = new Float32Array(dem.width * dem.height)
  grid.fill(elevationM)
  return grid
}

function haversineM(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const r = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Inverse-distance weighting (k nearest) onto the DEM grid. */
export function buildDesignGridFromXyz(dem: DemGrid, points: XyzPoint[], k = 8): Float32Array {
  const { width: w, height: h } = dem
  const grid = new Float32Array(w * h)
  if (!points.length) {
    grid.fill(NaN)
    return grid
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const [lng, lat] = dem.pxToLngLat(x + 0.5, y + 0.5)
      const nearest = [...points]
        .map(p => ({ p, d: haversineM(lng, lat, p.lng, p.lat) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, Math.min(k, points.length))
      if (nearest[0]!.d < 1e-6) {
        grid[i] = nearest[0]!.p.z
        continue
      }
      let wSum = 0
      let zSum = 0
      for (const { p, d } of nearest) {
        const wgt = 1 / Math.max(d * d, 1)
        wSum += wgt
        zSum += wgt * p.z
      }
      grid[i] = wSum > 0 ? zSum / wSum : NaN
    }
  }
  return grid
}

/** Bilinear resample a same-layout elevation grid (e.g. from GeoTIFF aligned to DEM). */
export function copyElevGridAligned(
  dem: DemGrid,
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
): Float32Array {
  if (sourceWidth === dem.width && sourceHeight === dem.height && source.length === dem.width * dem.height) {
    return new Float32Array(source)
  }
  const out = new Float32Array(dem.width * dem.height)
  for (let y = 0; y < dem.height; y += 1) {
    for (let x = 0; x < dem.width; x += 1) {
      const fx = (x / Math.max(1, dem.width - 1)) * (sourceWidth - 1)
      const fy = (y / Math.max(1, dem.height - 1)) * (sourceHeight - 1)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(sourceWidth - 1, x0 + 1)
      const y1 = Math.min(sourceHeight - 1, y0 + 1)
      const tx = fx - x0
      const ty = fy - y0
      const v00 = source[y0 * sourceWidth + x0]!
      const v10 = source[y0 * sourceWidth + x1]!
      const v01 = source[y1 * sourceWidth + x0]!
      const v11 = source[y1 * sourceWidth + x1]!
      const v0 = v00 + (v10 - v00) * tx
      const v1 = v01 + (v11 - v01) * tx
      out[y * dem.width + x] = v0 + (v1 - v0) * ty
    }
  }
  return out
}
