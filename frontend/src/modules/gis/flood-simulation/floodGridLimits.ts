import { geodesicAreaM2 } from '@/modules/remote-sensing/classification/siLayerClassAreaEngine'
import type { FloodGridResolutionM } from './floodTypes'

/** Hard cap on raster cells for browser memory (~32MB depth alone at 4 bytes). */
export const FLOOD_MAX_CELLS = 420_000

export function bboxFromGeometry(geometry: GeoJSON.Geometry | GeoJSON.Feature): {
  west: number
  south: number
  east: number
  north: number
} | null {
  const g =
    (geometry as GeoJSON.Feature).type === 'Feature'
      ? (geometry as GeoJSON.Feature).geometry
      : (geometry as GeoJSON.Geometry)
  if (!g) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const visit = (coords: number[]) => {
    const lng = coords[0]
    const lat = coords[1]
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  const walk = (geom: GeoJSON.Geometry) => {
    if (geom.type === 'Point') visit(geom.coordinates as number[])
    else if (geom.type === 'LineString' || geom.type === 'MultiPoint')
      (geom.coordinates as number[][]).forEach(visit)
    else if (geom.type === 'Polygon' || geom.type === 'MultiLineString')
      (geom.coordinates as number[][][]).forEach(ring => ring.forEach(visit))
    else if (geom.type === 'MultiPolygon')
      (geom.coordinates as number[][][][]).forEach(poly => poly.forEach(ring => ring.forEach(visit)))
  }
  walk(g)
  if (!Number.isFinite(west)) return null
  return { west, south, east, north }
}

export function estimateGridDimensions(
  bbox: { west: number; south: number; east: number; north: number },
  cellM: FloodGridResolutionM,
): { width: number; height: number; cellCount: number } {
  const latMid = (bbox.south + bbox.north) / 2
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos((latMid * Math.PI) / 180)
  const widthM = Math.max(1, (bbox.east - bbox.west) * mPerDegLng)
  const heightM = Math.max(1, (bbox.north - bbox.south) * mPerDegLat)
  const width = Math.max(2, Math.ceil(widthM / cellM))
  const height = Math.max(2, Math.ceil(heightM / cellM))
  return { width, height, cellCount: width * height }
}

export function estimateCellCountForGeometry(
  geometry: GeoJSON.Geometry | GeoJSON.Feature,
  cellM: FloodGridResolutionM,
): { cellCount: number; width: number; height: number; tooLarge: boolean } {
  const bbox = bboxFromGeometry(geometry)
  if (!bbox) return { cellCount: 0, width: 0, height: 0, tooLarge: true }
  const { width, height, cellCount } = estimateGridDimensions(bbox, cellM)
  return { cellCount, width, height, tooLarge: cellCount > FLOOD_MAX_CELLS }
}

export function floodGridWarning(
  geometry: GeoJSON.Geometry | GeoJSON.Feature,
  cellM: FloodGridResolutionM,
): string | null {
  const est = estimateCellCountForGeometry(geometry, cellM)
  if (est.cellCount === 0) return 'Draw or select a simulation area first.'
  if (est.tooLarge) {
    const ha = geodesicAreaM2(geometry) / 10_000
    return `Grid would be ${est.width}×${est.height} (${est.cellCount.toLocaleString()} cells). Use a smaller area, coarser grid, or zoom in (max ${FLOOD_MAX_CELLS.toLocaleString()} cells). Current AOI ≈ ${ha.toFixed(1)} ha.`
  }
  return null
}
