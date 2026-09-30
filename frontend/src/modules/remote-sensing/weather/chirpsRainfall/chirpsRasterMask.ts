/**
 * Mask a CHIRPS AOI raster so only cells inside the drawn polygon stay visible.
 * Outside cells become transparent NoData — Mapbox image overlay then matches the AOI.
 */
import type { ChirpsRasterResponse } from './chirpsClient'
import { CHIRPS_NODATA } from './chirpsIndices'

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
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

function pointInPolygon(lng: number, lat: number, geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates
    if (!rings[0]?.length || !pointInRing(lng, lat, rings[0]!)) return false
    for (let h = 1; h < rings.length; h += 1) {
      if (pointInRing(lng, lat, rings[h]!)) return false
    }
    return true
  }
  for (const poly of geom.coordinates) {
    if (pointInPolygon(lng, lat, { type: 'Polygon', coordinates: poly })) return true
  }
  return false
}

function colorAt(mm: number): [number, number, number] {
  // Absolute mm ramp — matches CHIRPS_PRECIP_RAMP (tan dry → blue wet).
  const stops: Array<[number, [number, number, number]]> = [
    [0, [196, 164, 132]],
    [2, [245, 240, 230]],
    [5, [200, 224, 244]],
    [15, [107, 174, 214]],
    [30, [33, 113, 181]],
    [60, [8, 48, 107]],
    [100, [4, 30, 66]],
  ]
  const x = Math.max(0, Number(mm) || 0)
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [a, ca] = stops[i]!
    const [b, cb] = stops[i + 1]!
    if (x >= a && x <= b) {
      const u = (x - a) / (b - a || 1)
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * u),
        Math.round(ca[1] + (cb[1] - ca[1]) * u),
        Math.round(ca[2] + (cb[2] - ca[2]) * u),
      ]
    }
  }
  if (x > stops[stops.length - 1]![0]) return stops[stops.length - 1]![1]
  return stops[0]![1]
}

function rebuildPreviewDataUrl(
  width: number,
  height: number,
  values: number[],
  nodata: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(width, height)
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i]!
    const o = i * 4
    if (!Number.isFinite(v) || v === nodata || v <= -9000) {
      img.data[o] = 0
      img.data[o + 1] = 0
      img.data[o + 2] = 0
      img.data[o + 3] = 0
      continue
    }
    const [r, g, b] = colorAt(v)
    img.data[o] = r
    img.data[o + 1] = g
    img.data[o + 2] = b
    img.data[o + 3] = 220
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Returns a copy of the raster with cells outside the polygon cleared (transparent). */
export function maskChirpsRasterToPolygon(
  raster: ChirpsRasterResponse,
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): ChirpsRasterResponse {
  const { width, height, west, south, east, north, values, nodata } = raster
  if (!width || !height || !values?.length) return raster
  const dx = (east - west) / width
  const dy = (north - south) / height
  const masked = new Array<number>(values.length)
  let sum = 0
  let n = 0
  let min = Infinity
  let max = -Infinity
  for (let row = 0; row < height; row += 1) {
    const lat = north - (row + 0.5) * dy
    for (let col = 0; col < width; col += 1) {
      const i = row * width + col
      const lng = west + (col + 0.5) * dx
      const v = values[i]!
      if (!pointInPolygon(lng, lat, geometry) || !Number.isFinite(v) || v === nodata || v <= -9000) {
        masked[i] = CHIRPS_NODATA
        continue
      }
      masked[i] = v
      sum += v
      n += 1
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  const stats = n
    ? { min, max, mean: sum / n, validCount: n }
    : { min: null, max: null, mean: null, validCount: 0 }
  const previewDataUrl = rebuildPreviewDataUrl(width, height, masked, CHIRPS_NODATA)
  return {
    ...raster,
    values: masked,
    nodata: CHIRPS_NODATA,
    stats,
    previewDataUrl: previewDataUrl || raster.previewDataUrl,
  }
}

export function unwrapPolygonGeometry(
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
