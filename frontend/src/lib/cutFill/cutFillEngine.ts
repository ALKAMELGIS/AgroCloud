import type { DemGrid } from '../hydroWatershed/terrainTiles'
import { worldPxToLngLat } from '../treeDetection/webMercatorTiles'
import { cellAreaM2 } from './cutFillCrs'
import type { CutFillCellType, CutFillSummary, CutFillTableRow } from './cutFillTypes'

export const CUT_FILL_CLASS_CUT = 1
export const CUT_FILL_CLASS_FILL = 2
export const CUT_FILL_CLASS_NONE = 0

export type CutFillComputeInput = {
  dem: DemGrid
  existingElev: Float32Array
  designElev: Float32Array
  aoiMask: Uint8Array | null
  verticalToleranceM: number
  /** Cap detail rows returned (CUT/FILL cells only). */
  maxTableRows?: number
}

export type CutFillComputeOutput = {
  difference: Float32Array
  classification: Uint8Array
  summary: CutFillSummary
  rows: CutFillTableRow[]
}

function cellTypeFromClass(c: number): CutFillCellType {
  if (c === CUT_FILL_CLASS_CUT) return 'CUT'
  if (c === CUT_FILL_CLASS_FILL) return 'FILL'
  return 'NO_CHANGE'
}

/** Grid cut/fill volumes (dz = existing − design; positive = cut). */
export function computeCutFillGrid(
  input: CutFillComputeInput,
  opts?: {
    onRowProgress?: (rowsDone: number, rowsTotal: number) => void
    shouldAbort?: () => boolean
  },
): CutFillComputeOutput {
  const { dem, existingElev, designElev, aoiMask, verticalToleranceM } = input
  const maxTableRows = input.maxTableRows ?? 4_000
  const { width: w, height: h } = dem
  const n = w * h
  const area = cellAreaM2(dem.metersPerPixel)
  const tol = Math.max(0, verticalToleranceM)

  let maskedCells = 0
  if (aoiMask) {
    for (let i = 0; i < n; i += 1) if (aoiMask[i]) maskedCells += 1
  } else {
    maskedCells = n
  }
  const detailStride = Math.max(1, Math.ceil(maskedCells / Math.max(1, maxTableRows)))
  let detailCandidates = 0

  const difference = new Float32Array(n)
  const classification = new Uint8Array(n)

  let cutVol = 0
  let fillVol = 0
  let cutArea = 0
  let fillArea = 0
  let noChangeArea = 0
  let maxCut = 0
  let maxFill = 0
  let absSum = 0
  let absCount = 0
  let activeCells = 0

  const rows: CutFillTableRow[] = []
  let nextId = 1

  for (let y = 0; y < h; y += 1) {
    if (opts?.shouldAbort?.()) break
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x
      if (aoiMask && !aoiMask[i]) {
        difference[i] = NaN
        classification[i] = CUT_FILL_CLASS_NONE
        continue
      }
      const ze = existingElev[i]!
      const zd = designElev[i]!
      if (!Number.isFinite(ze) || !Number.isFinite(zd)) {
        difference[i] = NaN
        classification[i] = CUT_FILL_CLASS_NONE
        continue
      }
      activeCells += 1
      const dz = ze - zd
      difference[i] = dz
      let cls = CUT_FILL_CLASS_NONE
      if (dz > tol) {
        cls = CUT_FILL_CLASS_CUT
        cutVol += dz * area
        cutArea += area
        maxCut = Math.max(maxCut, dz)
      } else if (dz < -tol) {
        cls = CUT_FILL_CLASS_FILL
        fillVol += -dz * area
        fillArea += area
        maxFill = Math.max(maxFill, -dz)
      } else {
        noChangeArea += area
      }
      classification[i] = cls
      if (cls !== CUT_FILL_CLASS_NONE) {
        absSum += Math.abs(dz)
        absCount += 1
        detailCandidates += 1
        if (rows.length < maxTableRows && detailCandidates % detailStride === 0) {
          const [lng, lat] = dem.pxToLngLat(x + 0.5, y + 0.5)
          const vol = cls === CUT_FILL_CLASS_CUT ? dz * area : -dz * area
          rows.push({
            id: nextId,
            lng,
            lat,
            existingZ: ze,
            designZ: zd,
            difference: dz,
            type: cellTypeFromClass(cls),
            areaM2: area,
            volumeM3: vol,
          })
          nextId += 1
        }
      }
    }
    opts?.onRowProgress?.(y + 1, h)
  }

  const summary: CutFillSummary = {
    cutVolumeM3: cutVol,
    fillVolumeM3: fillVol,
    netVolumeM3: cutVol - fillVol,
    cutAreaM2: cutArea,
    fillAreaM2: fillArea,
    noChangeAreaM2: noChangeArea,
    maxCutM: maxCut,
    maxFillM: maxFill,
    avgAbsDiffM: absCount > 0 ? absSum / absCount : 0,
    cellAreaM2: area,
    activeCellCount: activeCells,
  }

  return { difference, classification, summary, rows }
}

/** Build a synthetic DemGrid sharing georef but with custom elevation band. */
export function demGridWithElev(dem: DemGrid, elev: Float32Array): DemGrid {
  return { ...dem, elev: new Float32Array(elev) }
}

/** Restore `pxToLngLat` after structured-clone / worker transfer. */
export function ensureDemPxToLngLat(dem: DemGrid): DemGrid {
  if (typeof dem.pxToLngLat === 'function') return dem
  const { originWorldPxX, originWorldPxY, zoom } = dem
  return {
    ...dem,
    pxToLngLat: (cx: number, cy: number): [number, number] =>
      worldPxToLngLat(originWorldPxX + cx, originWorldPxY + cy, zoom),
  }
}

/** Serializable DEM for `worker.postMessage` (functions cannot be structured-cloned). */
export function demGridForWorkerPostMessage(
  dem: DemGrid,
): Omit<DemGrid, 'pxToLngLat'> & { pxToLngLat?: undefined } {
  const {
    pxToLngLat: _drop,
    width,
    height,
    elev,
    bbox,
    zoom,
    originWorldPxX,
    originWorldPxY,
    metersPerPixel,
    cornerCoords,
    tilesLoaded,
    tilesTotal,
  } = dem
  return {
    width,
    height,
    elev,
    bbox,
    zoom,
    originWorldPxX,
    originWorldPxY,
    metersPerPixel,
    cornerCoords,
    tilesLoaded,
    tilesTotal,
  }
}
