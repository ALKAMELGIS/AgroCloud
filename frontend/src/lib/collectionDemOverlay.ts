/**
 * Copernicus DEM collection indices → AOI-clipped Mapbox image overlays.
 * Uses open Terrarium DEM tiles (same source as Hydro Watershed).
 */

import { INDEX_10_CLASS_COLORS } from './collectionIndexCatalog'
import {
  buildAoiMask,
  getDemHydrologyModel,
} from './hydroWatershed/hydroEngine'
import { buildDemGrid, geometryBBox, type DemGrid } from './hydroWatershed/terrainTiles'

export const DEM_COLLECTION_INDEX_IDS = [
  'DEM_SLOPE',
  'DEM_ASPECT',
  'DEM_HILLSHADE',
  'DEM_TPI',
  'DEM_TRI',
  'DEM_TWI',
  'DEM_WATERSHED',
] as const

export type DemCollectionIndexId = (typeof DEM_COLLECTION_INDEX_IDS)[number]

export function isDemCollectionIndexId(id?: string | null): id is DemCollectionIndexId {
  const u = String(id || '').trim().toUpperCase()
  return (DEM_COLLECTION_INDEX_IDS as readonly string[]).includes(u)
}

export type DemIndexOverlayResult = {
  indexId: DemCollectionIndexId
  dataUrl: string
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  opacity: number
  mean: number | null
  min: number | null
  max: number | null
  unit: string
  label: string
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = Number.parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const CLASS_RGB = INDEX_10_CLASS_COLORS.map(hexToRgb)

/** Map normalized 0–1 value → 10-class RGB (class 1..10). */
export function classColor10(t01: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, t01))
  const idx = Math.min(9, Math.max(0, Math.floor(t * 10 - 1e-9)))
  const [r, g, b] = CLASS_RGB[idx]!
  return [r, g, b, 220]
}

function paintBandToDataUrl(
  dem: DemGrid,
  aoiMask: Uint8Array | null,
  values: Float32Array,
  normalize: (v: number, mn: number, mx: number) => number,
): { dataUrl: string; min: number | null; max: number | null; mean: number | null } {
  const { width: w, height: h } = dem
  let mn = Infinity
  let mx = -Infinity
  let sum = 0
  let n = 0
  for (let i = 0; i < values.length; i += 1) {
    if (aoiMask && !aoiMask[i]) continue
    const v = values[i]!
    if (!Number.isFinite(v)) continue
    if (v < mn) mn = v
    if (v > mx) mx = v
    sum += v
    n += 1
  }
  if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
    mn = 0
    mx = 1
  }
  if (mx === mn) mx = mn + 1

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { dataUrl: '', min: null, max: null, mean: null }
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < values.length; i += 1) {
    const o = i * 4
    if (aoiMask && !aoiMask[i]) {
      img.data[o + 3] = 0
      continue
    }
    const v = values[i]!
    if (!Number.isFinite(v)) {
      img.data[o + 3] = 0
      continue
    }
    const [r, g, b, a] = classColor10(normalize(v, mn, mx))
    img.data[o] = r
    img.data[o + 1] = g
    img.data[o + 2] = b
    img.data[o + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  return {
    dataUrl: canvas.toDataURL('image/png'),
    min: n ? mn : null,
    max: n ? mx : null,
    mean: n ? sum / n : null,
  }
}

function computeSlopeDeg(dem: DemGrid): Float32Array {
  const { width: w, height: h, elev, metersPerPixel: cs } = dem
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)
      const dzdx = (elev[y * w + xp]! - elev[y * w + xm]!) / ((xp - xm) * cs || cs)
      const dzdy = (elev[yp * w + x]! - elev[ym * w + x]!) / ((yp - ym) * cs || cs)
      out[i] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
    }
  }
  return out
}

function computeHillshade01(dem: DemGrid): Float32Array {
  const { width: w, height: h, elev, metersPerPixel: cs } = dem
  const azRad = (315 * Math.PI) / 180
  const altRad = (45 * Math.PI) / 180
  const cosAlt = Math.cos(altRad)
  const sinAlt = Math.sin(altRad)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)
      const dzdx = (elev[y * w + xp]! - elev[y * w + xm]!) / ((xp - xm) * cs || cs)
      const dzdy = (elev[yp * w + x]! - elev[ym * w + x]!) / ((yp - ym) * cs || cs)
      const slope = Math.atan(Math.hypot(dzdx, dzdy))
      const aspect = Math.atan2(dzdy, -dzdx)
      out[i] = Math.max(0, cosAlt * Math.cos(slope) + sinAlt * Math.sin(slope) * Math.cos(azRad - aspect))
    }
  }
  return out
}

function computeAspectDeg(dem: DemGrid): Float32Array {
  const { width: w, height: h, elev, metersPerPixel: cs } = dem
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)
      const dzdx = (elev[y * w + xp]! - elev[y * w + xm]!) / ((xp - xm) * cs || cs)
      const dzdy = (elev[yp * w + x]! - elev[ym * w + x]!) / ((yp - ym) * cs || cs)
      let deg = (Math.atan2(dzdx, -dzdy) * 180) / Math.PI
      if (deg < 0) deg += 360
      out[i] = deg
    }
  }
  return out
}

function computeTpi(dem: DemGrid, radiusPx = 3): Float32Array {
  const { width: w, height: h, elev } = dem
  const out = new Float32Array(w * h)
  const r = Math.max(1, radiusPx)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      let sum = 0
      let n = 0
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          sum += elev[yy * w + xx]!
          n += 1
        }
      }
      out[i] = n ? elev[i]! - sum / n : 0
    }
  }
  return out
}

function computeTri(dem: DemGrid): Float32Array {
  const { width: w, height: h, elev } = dem
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const z = elev[i]!
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const d = elev[yy * w + xx]! - z
          sum += d * d
          n += 1
        }
      }
      out[i] = n ? Math.sqrt(sum / n) : 0
    }
  }
  return out
}

function computeTwi(dem: DemGrid): Float32Array {
  const { width: w, height: h, elev, metersPerPixel: cs } = dem
  const { accum } = getDemHydrologyModel(dem)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const ym = Math.max(0, y - 1)
      const yp = Math.min(h - 1, y + 1)
      const dzdx = (elev[y * w + xp]! - elev[y * w + xm]!) / ((xp - xm) * cs || cs)
      const dzdy = (elev[yp * w + x]! - elev[ym * w + x]!) / ((yp - ym) * cs || cs)
      const slope = Math.atan(Math.hypot(dzdx, dzdy))
      const tanS = Math.max(Math.tan(slope), 1e-4)
      const a = (accum[i]! + 1) * cs * cs
      out[i] = Math.log(a / tanS)
    }
  }
  return out
}

function unwrapGeom(
  input: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (!input) return null
  if ((input as GeoJSON.FeatureCollection).type === 'FeatureCollection') {
    const polys = (input as GeoJSON.FeatureCollection).features
      .map(f => f.geometry)
      .filter((g): g is GeoJSON.Polygon | GeoJSON.MultiPolygon => !!g && (g.type === 'Polygon' || g.type === 'MultiPolygon'))
    if (!polys.length) return null
    if (polys.length === 1) return polys[0]!
    const coords: number[][][][] = []
    for (const g of polys) {
      if (g.type === 'Polygon') coords.push(g.coordinates)
      else coords.push(...g.coordinates)
    }
    return { type: 'MultiPolygon', coordinates: coords }
  }
  if ((input as GeoJSON.Feature).type === 'Feature') {
    const g = (input as GeoJSON.Feature).geometry
    if (g && (g.type === 'Polygon' || g.type === 'MultiPolygon')) return g
    return null
  }
  const g = input as GeoJSON.Geometry
  if (g.type === 'Polygon' || g.type === 'MultiPolygon') return g
  return null
}

const META: Record<DemCollectionIndexId, { label: string; unit: string }> = {
  DEM_SLOPE: { label: 'Slope', unit: '°' },
  DEM_ASPECT: { label: 'Aspect', unit: '°' },
  DEM_HILLSHADE: { label: 'Hillshade', unit: '' },
  DEM_TPI: { label: 'TPI', unit: 'm' },
  DEM_TRI: { label: 'TRI', unit: 'm' },
  DEM_TWI: { label: 'TWI', unit: '' },
  DEM_WATERSHED: { label: 'Watershed Index', unit: '' },
}

/**
 * Build an AOI-clipped DEM index overlay (10-class colour ramp) for Mapbox image source.
 */
export async function buildDemCollectionIndexOverlay(input: {
  aoi: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection
  indexId: DemCollectionIndexId
  signal?: AbortSignal
}): Promise<DemIndexOverlayResult | null> {
  const geom = unwrapGeom(input.aoi)
  if (!geom) throw new Error('Draw an AOI polygon first')
  const bbox = geometryBBox(geom)
  if (!bbox) throw new Error('AOI has no extent')

  const dem = await buildDemGrid({
    bbox,
    maxTiles: 20,
    maxZoom: 14,
    signal: input.signal,
  })
  if (!dem) throw new Error('Could not load DEM terrain for this AOI')
  if (input.signal?.aborted) return null

  const aoiMask = buildAoiMask(dem, geom)
  const indexId = input.indexId
  const meta = META[indexId]

  let values: Float32Array
  let normalize: (v: number, mn: number, mx: number) => number = (v, mn, mx) => (v - mn) / (mx - mn || 1)

  if (indexId === 'DEM_SLOPE') {
    values = computeSlopeDeg(dem)
    normalize = v => Math.min(1, Math.max(0, v / 35))
  } else if (indexId === 'DEM_HILLSHADE') {
    values = computeHillshade01(dem)
  } else if (indexId === 'DEM_ASPECT') {
    values = computeAspectDeg(dem)
    normalize = v => (v % 360) / 360
  } else if (indexId === 'DEM_TPI') {
    values = computeTpi(dem, 3)
  } else if (indexId === 'DEM_TRI') {
    values = computeTri(dem)
  } else if (indexId === 'DEM_TWI') {
    values = computeTwi(dem)
  } else {
    const { accum } = getDemHydrologyModel(dem)
    values = new Float32Array(accum.length)
    for (let i = 0; i < accum.length; i += 1) values[i] = Math.log(accum[i]! + 1)
  }

  const painted = paintBandToDataUrl(dem, aoiMask, values, normalize)
  if (!painted.dataUrl) throw new Error('Failed to render DEM index preview')

  return {
    indexId,
    dataUrl: painted.dataUrl,
    coordinates: dem.cornerCoords,
    opacity: 0.88,
    mean: painted.mean,
    min: painted.min,
    max: painted.max,
    unit: meta.unit,
    label: meta.label,
  }
}
