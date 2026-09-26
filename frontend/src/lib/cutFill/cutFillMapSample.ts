import { lngLatToWorldPx } from '../treeDetection/webMercatorTiles'
import { ensureDemPxToLngLat } from './cutFillEngine'
import type { CutFillAnalysisResult, CutFillCellType } from './cutFillTypes'

export type CutFillMapHit = {
  type: CutFillCellType
  lng: number
  lat: number
  existingZ: number
  designZ: number
  difference: number
  areaM2: number
  volumeM3: number
  ring: [number, number][]
}

function cellType(code: number): CutFillCellType {
  if (code === 1) return 'CUT'
  if (code === 2) return 'FILL'
  return 'NO_CHANGE'
}

/** Sample the cut/fill grid at a map click. Returns null outside the analysed AOI. */
export function sampleCutFillAtLngLat(
  result: CutFillAnalysisResult,
  lng: number,
  lat: number,
): CutFillMapHit | null {
  const dem = ensureDemPxToLngLat(result.dem)
  if (!result.difference || !result.classification || !result.existingElev || !result.designElev) return null
  const [wx, wy] = lngLatToWorldPx(lng, lat, dem.zoom)
  const x = Math.floor(wx - dem.originWorldPxX)
  const y = Math.floor(wy - dem.originWorldPxY)
  if (x < 0 || y < 0 || x >= dem.width || y >= dem.height) return null
  const i = y * dem.width + x
  const dz = result.difference[i]
  if (dz == null || !Number.isFinite(dz)) return null
  const existingZ = result.existingElev[i]
  const designZ = result.designElev[i]
  if (existingZ == null || designZ == null || !Number.isFinite(existingZ) || !Number.isFinite(designZ)) return null
  const type = cellType(result.classification[i] ?? 0)
  const areaM2 = result.summary.cellAreaM2
  const volumeM3 = type === 'CUT' ? dz * areaM2 : type === 'FILL' ? -dz * areaM2 : 0
  const ring: [number, number][] = [
    dem.pxToLngLat(x, y),
    dem.pxToLngLat(x + 1, y),
    dem.pxToLngLat(x + 1, y + 1),
    dem.pxToLngLat(x, y + 1),
    dem.pxToLngLat(x, y),
  ]
  const [cx, cy] = dem.pxToLngLat(x + 0.5, y + 0.5)
  return {
    type,
    lng: cx,
    lat: cy,
    existingZ,
    designZ,
    difference: dz,
    areaM2,
    volumeM3,
    ring,
  }
}
