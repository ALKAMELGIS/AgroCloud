import { buildRainHyetographMmH } from './floodGridMetrics'
import { runFloodSimulationInWorker } from './runFloodSimulationInWorker'
import { isFloodWebGpuAvailable, runFloodWebGpuSimulation } from './floodWebGpuBackend'
import { simulationConfigForCellCount } from './simulationStepping'
import type { FloodSimulationProgress, FloodSimulationResult, SimulationConfig } from './floodTypes'
import { buildFloodTerrainGrid, resampleTerrainGrid, type FloodTerrainGrid } from './terrainProvider'

export type FloodEngineCallbacks = {
  onProgress?: (p: FloodSimulationProgress) => void
  onPreviewTexture?: (
    depth: Float32Array,
    vx: Float32Array,
    vy: Float32Array,
    width: number,
    height: number,
    timeSec: number,
  ) => void
}

export async function runFloodSimulationEngine(input: {
  geometry: GeoJSON.Geometry | GeoJSON.Feature
  config: SimulationConfig
  signal?: AbortSignal
  callbacks?: FloodEngineCallbacks
  preferWebGpu?: boolean
}): Promise<FloodSimulationResult> {
  const { geometry, config, signal, callbacks } = input
  let jobId = 1

  callbacks?.onProgress?.({ pct: 2, label: 'Loading terrain…', phase: 'terrain' })
  const fullTerrain = await buildFloodTerrainGrid(geometry, config.gridM, signal)
  const previewTerrain = resampleTerrainGrid(fullTerrain, 4)

  const previewConfig: SimulationConfig = {
    ...config,
    durationMin: Math.min(config.durationMin, 30),
    frameIntervalSec: Math.max(30, config.frameIntervalSec),
  }

  const fullCellCount = fullTerrain.width * fullTerrain.height
  const refineConfig = simulationConfigForCellCount(config, fullCellCount)
  const previewCellCount = previewTerrain.width * previewTerrain.height
  const previewSimConfig = simulationConfigForCellCount(previewConfig, previewCellCount)

  let backend: 'webgpu' | 'worker' = 'worker'
  const useGpu = Boolean(
    input.preferWebGpu && isFloodWebGpuAvailable() && fullCellCount <= 100_000,
  )

  const mergePreview = async (terrain: FloodTerrainGrid, phase: 'preview' | 'refine') => {
    const onPreview = (depth: Float32Array, vx: Float32Array, vy: Float32Array, timeSec: number) => {
      callbacks?.onPreviewTexture?.(depth, vx, vy, terrain.width, terrain.height, timeSec)
    }
    if (useGpu && phase === 'refine') {
      backend = 'webgpu'
      callbacks?.onProgress?.({ pct: 10, label: 'Simulating on GPU…', phase: 'refine' })
      const out = await runFloodWebGpuSimulation(terrain, refineConfig, {
        signal,
        onProgress: pct => callbacks?.onProgress?.({ pct, label: 'Simulating…', phase: 'refine' }),
        onPreviewFrame: onPreview,
      })
      return out
    }
    callbacks?.onProgress?.({
      pct: phase === 'preview' ? 15 : 40,
      label: phase === 'preview' ? 'Preview simulation…' : 'Refining simulation…',
      phase,
    })
    const simConfig = phase === 'preview' ? previewSimConfig : refineConfig
    const workerOut = await runFloodSimulationInWorker(terrain, simConfig, {
      previewOnly: phase === 'preview',
      jobId: jobId++,
      signal,
      callbacks: {
        onProgress: (pct, ph) =>
          callbacks?.onProgress?.({
            pct: phase === 'preview' ? 15 + pct * 0.25 : 40 + pct * 0.55,
            label: ph === 'preview' ? 'Preview…' : 'Refining…',
            phase: ph,
          }),
        onPreviewFrame: (d, vx, vy, t, w, h) => callbacks?.onPreviewTexture?.(d, vx, vy, w, h, t),
      },
    })
    return {
      frames: workerOut.frames,
      maxDepthGrid: workerOut.maxDepthGrid,
      arrivalTimeSec: workerOut.arrivalTimeSec,
    }
  }

  await mergePreview(previewTerrain, 'preview')
  const refined = await mergePreview(fullTerrain, 'refine')

  callbacks?.onProgress?.({ pct: 100, label: 'Complete', phase: 'done' })

  const steps = refined.frames.length
  const rainHyetographMmH = buildRainHyetographMmH(config.rainfallMm, config.durationMin, steps)

  return {
    width: fullTerrain.width,
    height: fullTerrain.height,
    cellSizeM: fullTerrain.cellSizeM,
    bbox: fullTerrain.bbox,
    elevation: fullTerrain.elevation,
    mask: fullTerrain.mask,
    frames: refined.frames,
    maxDepthGrid: refined.maxDepthGrid,
    arrivalTimeSec: refined.arrivalTimeSec,
    rainHyetographMmH,
    config,
    backend,
  }
}
