export type FloodSimulationPhase = 'EMPTY' | 'SETUP' | 'RUNNING' | 'PAUSED' | 'COMPLETE' | 'ERROR'

export type FloodGridResolutionM = 1 | 2 | 5 | 10

export type FloodVisualizationMode = 'depthTime' | 'maxDepth' | 'flowSpeed' | 'flowPaths'

export type FloodWaterSource = 'rainfall'

export type SimulationConfig = {
  rainfallMm: number
  durationMin: number
  gridM: FloodGridResolutionM
  waterSource: FloodWaterSource
  manningN: number
  depthThresholdM: number
  timestepSec: number
  frameIntervalSec: number
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  rainfallMm: 89,
  durationMin: 110,
  gridM: 5,
  waterSource: 'rainfall',
  manningN: 0.035,
  depthThresholdM: 0.01,
  timestepSec: 2,
  frameIntervalSec: 60,
}

export type FloodFineTune = {
  waterOpacity: number
  flowLineDensity: number
  flowLineThickness: number
  particleCount: number
  animationSpeed: number
  depthExaggeration: number
  velocityExaggeration: number
}

export const DEFAULT_FLOOD_FINE_TUNE: FloodFineTune = {
  waterOpacity: 0.96,
  flowLineDensity: 1,
  flowLineThickness: 1.35,
  particleCount: 1000,
  animationSpeed: 1,
  depthExaggeration: 4,
  velocityExaggeration: 2.5,
}

export type FloodSimulationFrame = {
  depth: Float32Array
  vx: Float32Array
  vy: Float32Array
  floodedAreaHa: number
  maxDepthM: number
  volumeM3: number
  timeSec: number
}

export type FloodSimulationResult = {
  width: number
  height: number
  cellSizeM: number
  bbox: { west: number; south: number; east: number; north: number }
  elevation: Float32Array
  mask: Uint8Array
  frames: FloodSimulationFrame[]
  maxDepthGrid: Float32Array
  arrivalTimeSec: Float32Array
  rainHyetographMmH: number[]
  config: SimulationConfig
  backend: 'webgpu' | 'worker'
}

export type FloodMapInspectHit = {
  lat: number
  lng: number
  depthM: number
  velocityMs: number
  arrivalSec: number | null
  elevationM: number
}

export type FloodSimulationProgress = {
  pct: number
  label: string
  phase: 'terrain' | 'preview' | 'refine' | 'done'
}
