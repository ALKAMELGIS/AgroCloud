import { runShallowWaterSimulation } from './shallowWaterStep'

export type FloodWorkerRunRequest = {
  type: 'run'
  jobId: number
  width: number
  height: number
  cellSizeM: number
  elevation: Float32Array
  mask: Uint8Array
  config: {
    rainfallMm: number
    durationMin: number
    manningN: number
    depthThresholdM: number
    timestepSec: number
    frameIntervalSec: number
  }
  previewOnly?: boolean
}

export type FloodWorkerProgress = {
  type: 'progress'
  jobId: number
  pct: number
  phase: 'preview' | 'refine'
}

export type FloodWorkerPreview = {
  type: 'preview'
  jobId: number
  depth: Float32Array
  vx: Float32Array
  vy: Float32Array
  timeSec: number
  width: number
  height: number
}

export type FloodWorkerResult = {
  type: 'result'
  jobId: number
  frames: Array<{
    depth: Float32Array
    vx: Float32Array
    vy: Float32Array
    floodedAreaHa: number
    maxDepthM: number
    volumeM3: number
    timeSec: number
  }>
  maxDepthGrid: Float32Array
  arrivalTimeSec: Float32Array
}

export type FloodWorkerError = {
  type: 'error'
  jobId: number
  message: string
}

self.onmessage = (ev: MessageEvent<FloodWorkerRunRequest>) => {
  const msg = ev.data
  if (msg.type !== 'run') return
  try {
    const phase = msg.previewOnly ? 'preview' : 'refine'
    const out = runShallowWaterSimulation({
      width: msg.width,
      height: msg.height,
      cellSizeM: msg.cellSizeM,
      elevation: msg.elevation,
      mask: msg.mask,
      config: msg.config,
      onProgress: pct => {
        const progress: FloodWorkerProgress = { type: 'progress', jobId: msg.jobId, pct, phase }
        self.postMessage(progress)
      },
      onPreviewFrame: (depth, vx, vy, timeSec) => {
        const preview: FloodWorkerPreview = {
          type: 'preview',
          jobId: msg.jobId,
          depth,
          vx,
          vy,
          timeSec,
          width: msg.width,
          height: msg.height,
        }
        self.postMessage(preview)
      },
    })
    const result: FloodWorkerResult = {
      type: 'result',
      jobId: msg.jobId,
      frames: out.frames,
      maxDepthGrid: out.maxDepthGrid,
      arrivalTimeSec: out.arrivalTimeSec,
    }
    self.postMessage(result)
  } catch (e) {
    const err: FloodWorkerError = {
      type: 'error',
      jobId: msg.jobId,
      message: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(err)
  }
}
