import type { FloodMapInspectHit, FloodSimulationResult, FloodVisualizationMode } from './floodTypes'

function lngLatToGridIndex(
  result: FloodSimulationResult,
  lng: number,
  lat: number,
): { i: number; j: number } | null {
  const { bbox, width, height } = result
  if (lng < bbox.west || lng > bbox.east || lat < bbox.south || lat > bbox.north) return null
  const fx = (lng - bbox.west) / (bbox.east - bbox.west)
  const fy = (bbox.north - lat) / (bbox.north - bbox.south)
  const i = Math.min(width - 1, Math.max(0, Math.floor(fx * width)))
  const j = Math.min(height - 1, Math.max(0, Math.floor(fy * height)))
  return { i, j }
}

export function sampleFloodAtLngLat(
  result: FloodSimulationResult | null,
  frameIndex: number,
  mode: FloodVisualizationMode,
  lng: number,
  lat: number,
): FloodMapInspectHit | null {
  if (!result) return null
  const ij = lngLatToGridIndex(result, lng, lat)
  if (!ij) return null
  const idx = ij.j * result.width + ij.i
  if (!result.mask[idx]) return null
  const frame = result.frames[Math.min(frameIndex, result.frames.length - 1)]
  if (!frame) return null
  let depthM = frame.depth[idx]
  if (mode === 'maxDepth') depthM = result.maxDepthGrid[idx]
  const vx = frame.vx[idx]
  const vy = frame.vy[idx]
  const velocityMs = Math.hypot(vx, vy)
  const arrival = result.arrivalTimeSec[idx]
  return {
    lat,
    lng,
    depthM,
    velocityMs,
    arrivalSec: arrival >= 0 ? arrival : null,
    elevationM: result.elevation[idx],
  }
}
