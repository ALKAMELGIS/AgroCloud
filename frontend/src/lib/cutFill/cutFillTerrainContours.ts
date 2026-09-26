import { computeContours, type HydroComputeContext } from '../hydroWatershed/hydroEngine'
import type { DemGrid } from '../hydroWatershed/terrainTiles'
import { demGridWithElev } from './cutFillEngine'

export function contoursForElevationGrid(
  dem: DemGrid,
  elev: Float32Array,
  aoiMask: Uint8Array | null,
  contourIntervalM: number,
): GeoJSON.FeatureCollection {
  const demElev = demGridWithElev(dem, elev)
  const ctx: HydroComputeContext = {
    dem: demElev,
    aoiMask,
    sensitivity: 0.5,
    contourInterval: contourIntervalM > 0 ? contourIntervalM : undefined,
  }
  const res = computeContours(ctx)
  if (res.kind === 'vector') return res.data
  return { type: 'FeatureCollection', features: [] }
}
