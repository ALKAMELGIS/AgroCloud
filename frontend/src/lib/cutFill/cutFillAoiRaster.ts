import type { DemGrid } from '../hydroWatershed/terrainTiles'
import { CUT_FILL_CLASS_CUT, CUT_FILL_CLASS_FILL, ensureDemPxToLngLat } from './cutFillEngine'

export type CutFillAoiRasterVisibility = {
  cut: boolean
  fill: boolean
  noChange: boolean
}

export type CutFillAoiRaster = {
  width: number
  height: number
  rgba: Uint8Array
  coordinates: DemGrid['cornerCoords']
}

const OUT_EDGE = 720

function unwrapPolygon(
  input: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!input) return null
  if (input.type === 'Feature') return unwrapPolygon(input.geometry)
  if (input.type === 'Polygon' || input.type === 'MultiPolygon') return input
  return null
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i]![0]!
    const yi = ring[i]![1]!
    const xj = ring[j]![0]!
    const yj = ring[j]![1]!
    if (yi === yj) continue
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInAoi(lng: number, lat: number, geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates
    if (!rings[0]?.length || !pointInRing(lng, lat, rings[0] as number[][])) return false
    for (let h = 1; h < rings.length; h += 1) {
      if (pointInRing(lng, lat, rings[h] as number[][])) return false
    }
    return true
  }
  for (const poly of geom.coordinates) {
    if (pointInAoi(lng, lat, { type: 'Polygon', coordinates: poly })) return true
  }
  return false
}

function sampleDz(difference: Float32Array, width: number, height: number, fx: number, fy: number): number {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(fx)))
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(fy)))
  const x1 = Math.min(width - 1, x0 + 1)
  const y1 = Math.min(height - 1, y0 + 1)
  const tx = Math.max(0, Math.min(1, fx - x0))
  const ty = Math.max(0, Math.min(1, fy - y0))
  const v00 = difference[y0 * width + x0]!
  const v10 = difference[y0 * width + x1]!
  const v01 = difference[y1 * width + x0]!
  const v11 = difference[y1 * width + x1]!
  let sum = 0
  let w = 0
  const acc = (v: number, weight: number) => {
    if (!Number.isFinite(v) || weight <= 0) return
    sum += v * weight
    w += weight
  }
  acc(v00, (1 - tx) * (1 - ty))
  acc(v10, tx * (1 - ty))
  acc(v01, (1 - tx) * ty)
  acc(v11, tx * ty)
  return w > 0 ? sum / w : NaN
}

/** Continuous cut (red/orange) → fill (green) ramp. `scale` is the |ΔZ| that reaches full color. */
export function cutFillRampRgba(engineDz: number, scale: number): [number, number, number, number] {
  const s = Math.max(0.05, scale)
  const t = Math.max(-1, Math.min(1, engineDz / s))
  if (t > 0.02) {
    const u = Math.min(1, (t - 0.02) / 0.98)
    return [
      Math.round(251 - 30 * (1 - u)),
      Math.round(146 * (1 - u) + 42 * u),
      Math.round(60 * (1 - u)),
      Math.round(168 + 70 * u),
    ]
  }
  if (t < -0.02) {
    const u = Math.min(1, (-t - 0.02) / 0.98)
    return [
      Math.round(52 * (1 - u) + 16 * u),
      Math.round(168 + 60 * u),
      Math.round(96 * (1 - u) + 64 * u),
      Math.round(168 + 70 * u),
    ]
  }
  return [186, 186, 176, 70]
}

function rampScale(difference: Float32Array): number {
  const abs: number[] = []
  for (let i = 0; i < difference.length; i += 1) {
    const z = difference[i]!
    if (Number.isFinite(z) && Math.abs(z) > 0.02) abs.push(Math.abs(z))
  }
  if (!abs.length) return 1
  abs.sort((a, b) => a - b)
  const p = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.9))]!
  return Math.max(0.15, p)
}

/**
 * Smooth ΔZ image georeferenced to the analysis grid.
 * Pixels outside the drawn AOI are transparent, so the overlay stops on that boundary.
 */
function classAllowed(
  classification: Uint8Array | null | undefined,
  index: number,
  visible: CutFillAoiRasterVisibility,
): boolean {
  if (!classification) return visible.cut || visible.fill || visible.noChange
  const code = classification[index] ?? 0
  if (code === CUT_FILL_CLASS_CUT) return visible.cut
  if (code === CUT_FILL_CLASS_FILL) return visible.fill
  return visible.noChange
}

export function buildCutFillAoiRaster(
  dem: DemGrid,
  difference: Float32Array,
  aoi: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
  classification?: Uint8Array | null,
  visible: CutFillAoiRasterVisibility = { cut: true, fill: true, noChange: true },
  outEdge = OUT_EDGE,
): CutFillAoiRaster | null {
  const geom = unwrapPolygon(aoi)
  if (!geom) return null
  const grid = ensureDemPxToLngLat(dem)
  const longest = Math.max(grid.width, grid.height)
  const width = Math.max(2, Math.round((grid.width / longest) * outEdge))
  const height = Math.max(2, Math.round((grid.height / longest) * outEdge))
  const rgba = new Uint8Array(width * height * 4)
  const scale = rampScale(difference)
  for (let y = 0; y < height; y += 1) {
    const fy = ((y + 0.5) * grid.height) / height - 0.5
    for (let x = 0; x < width; x += 1) {
      const fx = ((x + 0.5) * grid.width) / width - 0.5
      const [lng, lat] = grid.pxToLngLat(fx + 0.5, fy + 0.5)
      const p = (y * width + x) * 4
      if (!pointInAoi(lng, lat, geom)) continue
      const sx = Math.max(0, Math.min(grid.width - 1, Math.round(fx)))
      const sy = Math.max(0, Math.min(grid.height - 1, Math.round(fy)))
      if (!classAllowed(classification, sy * grid.width + sx, visible)) continue
      const dz = sampleDz(difference, grid.width, grid.height, fx, fy)
      if (!Number.isFinite(dz)) continue
      const [r, g, b, a] = cutFillRampRgba(dz, scale)
      rgba[p] = r
      rgba[p + 1] = g
      rgba[p + 2] = b
      rgba[p + 3] = a
    }
  }
  const coordinates =
    grid.cornerCoords?.length === 4
      ? grid.cornerCoords
      : ([
          grid.pxToLngLat(0, 0),
          grid.pxToLngLat(grid.width, 0),
          grid.pxToLngLat(grid.width, grid.height),
          grid.pxToLngLat(0, grid.height),
        ] as DemGrid['cornerCoords'])
  return { width, height, rgba, coordinates }
}
