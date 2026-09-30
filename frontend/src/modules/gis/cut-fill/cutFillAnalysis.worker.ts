import { computeCutFillGrid, ensureDemPxToLngLat, type CutFillComputeInput } from './cutFillEngine'

export type CutFillWorkerRequest = {
  type: 'run'
  jobId: number
  payload: CutFillComputeInput & {
    existingElev: Float32Array
    designElev: Float32Array
    aoiMask: Uint8Array | null
  }
}

export type CutFillWorkerProgress = {
  type: 'progress'
  jobId: number
  rowsDone: number
  rowsTotal: number
}

export type CutFillWorkerResult = {
  type: 'result'
  jobId: number
  difference: Float32Array
  classification: Uint8Array
  summary: ReturnType<typeof computeCutFillGrid>['summary']
  rows: ReturnType<typeof computeCutFillGrid>['rows']
}

export type CutFillWorkerError = {
  type: 'error'
  jobId: number
  message: string
}

self.onmessage = (ev: MessageEvent<CutFillWorkerRequest>) => {
  const msg = ev.data
  if (msg.type !== 'run') return
  try {
    const { existingElev, designElev, aoiMask, verticalToleranceM, maxTableRows } = msg.payload
    const dem = ensureDemPxToLngLat(msg.payload.dem)
    const out = computeCutFillGrid(
      { dem, existingElev, designElev, aoiMask, verticalToleranceM, maxTableRows },
      {
        onRowProgress: (rowsDone, rowsTotal) => {
          const progress: CutFillWorkerProgress = { type: 'progress', jobId: msg.jobId, rowsDone, rowsTotal }
          self.postMessage(progress)
        },
      },
    )
    const result: CutFillWorkerResult = {
      type: 'result',
      jobId: msg.jobId,
      difference: out.difference,
      classification: out.classification,
      summary: out.summary,
      rows: out.rows,
    }
    self.postMessage(result, [out.difference.buffer, out.classification.buffer])
  } catch (e) {
    const err: CutFillWorkerError = {
      type: 'error',
      jobId: msg.jobId,
      message: e instanceof Error ? e.message : String(e),
    }
    self.postMessage(err)
  }
}
