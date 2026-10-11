import { runShallowWaterSimulation } from './shallowWaterStep'
import type { SimulationConfig } from './floodTypes'
import type { FloodTerrainGrid } from './terrainProvider'

export function isFloodWebGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

/**
 * WebGPU path: runs the same CPU stepping on a micro-task queue after optional adapter probe.
 * Full WGSL ping-pong can replace the inner loop when profiling demands it; worker remains fallback.
 */
export async function runFloodWebGpuSimulation(
  terrain: FloodTerrainGrid,
  config: SimulationConfig,
  opts: {
    signal?: AbortSignal
    onProgress?: (pct: number) => void
    onPreviewFrame?: (depth: Float32Array, vx: Float32Array, vy: Float32Array, timeSec: number) => void
  },
): Promise<ReturnType<typeof runShallowWaterSimulation>> {
  if (!isFloodWebGpuAvailable()) {
    throw new Error('WebGPU unavailable')
  }
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
  if (!gpu) throw new Error('WebGPU unavailable')
  const adapter = await gpu.requestAdapter()
  if (!adapter || typeof (adapter as { requestDevice?: () => Promise<unknown> }).requestDevice !== 'function') {
    throw new Error('WebGPU adapter unavailable')
  }
  await (adapter as { requestDevice: () => Promise<unknown> }).requestDevice()
  return runShallowWaterSimulation({
    width: terrain.width,
    height: terrain.height,
    cellSizeM: terrain.cellSizeM,
    elevation: terrain.elevation,
    mask: terrain.mask,
    config: {
      rainfallMm: config.rainfallMm,
      durationMin: config.durationMin,
      manningN: config.manningN,
      depthThresholdM: config.depthThresholdM,
      timestepSec: config.timestepSec,
      frameIntervalSec: config.frameIntervalSec,
    },
    onProgress: opts.onProgress,
    onPreviewFrame: opts.onPreviewFrame,
    signal: opts.signal,
  })
}
