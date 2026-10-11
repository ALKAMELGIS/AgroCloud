import FloodWorker from './floodSimulation.worker?worker'
import type {
  FloodWorkerError,
  FloodWorkerPreview,
  FloodWorkerProgress,
  FloodWorkerResult,
  FloodWorkerRunRequest,
} from './floodSimulation.worker'
import type { SimulationConfig } from './floodTypes'
import type { FloodTerrainGrid } from './terrainProvider'

export type FloodWorkerCallbacks = {
  onProgress?: (pct: number, phase: 'preview' | 'refine') => void
  onPreviewFrame?: (depth: Float32Array, vx: Float32Array, vy: Float32Array, timeSec: number, w: number, h: number) => void
}

export function runFloodSimulationInWorker(
  terrain: FloodTerrainGrid,
  config: SimulationConfig,
  opts: { previewOnly?: boolean; signal?: AbortSignal; jobId: number; callbacks?: FloodWorkerCallbacks },
): Promise<FloodWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new FloodWorker()
    const onAbort = () => {
      worker.terminate()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    worker.onmessage = (ev: MessageEvent<FloodWorkerProgress | FloodWorkerPreview | FloodWorkerResult | FloodWorkerError>) => {
      const data = ev.data
      if (data.type === 'progress') {
        opts.callbacks?.onProgress?.(data.pct, data.phase)
        return
      }
      if (data.type === 'preview') {
        opts.callbacks?.onPreviewFrame?.(data.depth, data.vx, data.vy, data.timeSec, data.width, data.height)
        return
      }
      if (data.type === 'error') {
        worker.terminate()
        opts.signal?.removeEventListener('abort', onAbort)
        reject(new Error(data.message))
        return
      }
      if (data.type === 'result') {
        worker.terminate()
        opts.signal?.removeEventListener('abort', onAbort)
        resolve(data)
      }
    }

    const req: FloodWorkerRunRequest = {
      type: 'run',
      jobId: opts.jobId,
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
      previewOnly: opts.previewOnly,
    }
    worker.postMessage(req)
  })
}
