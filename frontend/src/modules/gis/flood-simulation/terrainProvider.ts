import { buildAoiMask } from '@/modules/gis/spatial-analysis/hydro-watershed/hydroEngine'
import {
  buildDemGrid,
  geometryBBox,
  type DemGrid,
  type LngLatBBox,
} from '@/modules/gis/spatial-analysis/hydro-watershed/terrainTiles'
import { resolveCutFillDemBuildOptions } from '@/modules/gis/cut-fill/cutFillDemBudget'
import type { FloodGridResolutionM } from './floodTypes'
import { estimateGridDimensions } from './floodGridLimits'

function sampleDemBilinear(dem: DemGrid, lng: number, lat: number): number {
  const [px, py] = demPxFromLngLat(dem, lng, lat)
  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  const x1 = Math.min(dem.width - 1, x0 + 1)
  const y1 = Math.min(dem.height - 1, y0 + 1)
  const fx = px - x0
  const fy = py - y0
  const v00 = dem.elev[y0 * dem.width + x0]
  const v10 = dem.elev[y0 * dem.width + x1]
  const v01 = dem.elev[y1 * dem.width + x0]
  const v11 = dem.elev[y1 * dem.width + x1]
  const v0 = v00 * (1 - fx) + v10 * fx
  const v1 = v01 * (1 - fx) + v11 * fx
  return v0 * (1 - fy) + v1 * fy
}

function demPxFromLngLat(dem: DemGrid, lng: number, lat: number): [number, number] {
  const [wx, wy] = lngLatToWorldPx(lng, lat, dem.zoom)
  const px = wx - dem.originWorldPxX
  const py = wy - dem.originWorldPxY
  return [px, py]
}

function lngLatToWorldPx(lng: number, lat: number, zoom: number): [number, number] {
  const scale = 256 * 2 ** zoom
  const x = ((lng + 180) / 360) * scale
  const sin = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale
  return [x, y]
}

export type FloodTerrainGrid = {
  width: number
  height: number
  cellSizeM: number
  bbox: LngLatBBox
  elevation: Float32Array
  mask: Uint8Array
  cornerCoords: [[number, number], [number, number], [number, number], [number, number]]
}

export async function buildFloodTerrainGrid(
  geometry: GeoJSON.Geometry | GeoJSON.Feature,
  cellM: FloodGridResolutionM,
  signal?: AbortSignal,
): Promise<FloodTerrainGrid> {
  const bbox = geometryBBox(geometry)
  const demOpts = resolveCutFillDemBuildOptions(geometry)
  const dem = await buildDemGrid({ bbox, ...demOpts, signal })
  if (!dem) throw new Error('Terrain elevation could not be loaded for this area.')
  const { width, height } = estimateGridDimensions(bbox, cellM)
  const elev = new Float32Array(width * height)
  const mask = new Uint8Array(width * height)

  const west = bbox.west
  const north = bbox.north
  const latMid = (bbox.south + bbox.north) / 2
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos((latMid * Math.PI) / 180)
  const dLng = (bbox.east - bbox.west) / width
  const dLat = (bbox.north - bbox.south) / height

  const aoiMask = buildAoiMask(dem, geometry)

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const lng = west + (i + 0.5) * dLng
      const lat = north - (j + 0.5) * dLat
      const idx = j * width + i
      const [px, py] = demPxFromLngLat(dem, lng, lat)
      const xi = Math.round(px)
      const yi = Math.round(py)
      const insideDem = xi >= 0 && yi >= 0 && xi < dem.width && yi < dem.height
      const demIdx = yi * dem.width + xi
      const inAoi = insideDem && aoiMask != null && aoiMask[demIdx] > 0
      mask[idx] = inAoi ? 1 : 0
      elev[idx] = insideDem ? sampleDemBilinear(dem, lng, lat) : 0
    }
  }

  const cornerCoords: FloodTerrainGrid['cornerCoords'] = [
    [west, north],
    [bbox.east, north],
    [bbox.east, bbox.south],
    [west, bbox.south],
  ]

  return {
    width,
    height,
    cellSizeM: cellM,
    bbox,
    elevation: elev,
    mask,
    cornerCoords,
  }
}

export function resampleTerrainGrid(
  grid: FloodTerrainGrid,
  factor: number,
): FloodTerrainGrid {
  if (factor <= 1) return grid
  const w = Math.max(2, Math.ceil(grid.width / factor))
  const h = Math.max(2, Math.ceil(grid.height / factor))
  const elev = new Float32Array(w * h)
  const mask = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const si = Math.min(grid.width - 1, Math.round((i / w) * grid.width))
      const sj = Math.min(grid.height - 1, Math.round((j / h) * grid.height))
      const src = sj * grid.width + si
      const idx = j * w + i
      elev[idx] = grid.elevation[src]
      mask[idx] = grid.mask[src]
    }
  }
  return {
    ...grid,
    width: w,
    height: h,
    cellSizeM: grid.cellSizeM * factor,
    elevation: elev,
    mask,
  }
}
