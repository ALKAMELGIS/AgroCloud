import {
  demGridForWorkerPostMessage,
  type CutFillComputeInput,
  type CutFillComputeOutput,
} from './cutFillEngine'
import CutFillWorker from './cutFillAnalysis.worker?worker'

let jobSeq = 0

export function runCutFillInWorker(
  input: CutFillComputeInput,
  onProgress?: (rowsDone: number, rowsTotal: number) => void,
  signal?: AbortSignal,
): Promise<CutFillComputeOutput> {
  return new Promise((resolve, reject) => {
    const jobId = ++jobSeq
    const worker = new CutFillWorker()
    const onAbort = () => {
      worker.terminate()
      reject(new DOMException('Cut/fill analysis cancelled', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data
      if (data.jobId !== jobId) return
      if (data.type === 'progress') {
        onProgress?.(data.rowsDone, data.rowsTotal)
        return
      }
      if (data.type === 'error') {
        worker.terminate()
        signal?.removeEventListener('abort', onAbort)
        reject(new Error(data.message))
        return
      }
      if (data.type === 'result') {
        worker.terminate()
        signal?.removeEventListener('abort', onAbort)
        resolve({
          difference: data.difference,
          classification: data.classification,
          summary: data.summary,
          rows: data.rows,
        })
      }
    }
    worker.onerror = e => {
      worker.terminate()
      signal?.removeEventListener('abort', onAbort)
      reject(e.error ?? new Error('Cut/fill worker failed'))
    }

    worker.postMessage({
      type: 'run',
      jobId,
      payload: {
        dem: demGridForWorkerPostMessage(input.dem),
        existingElev: input.existingElev,
        designElev: input.designElev,
        aoiMask: input.aoiMask,
        verticalToleranceM: input.verticalToleranceM,
        maxTableRows: input.maxTableRows,
      },
    })
  })
}
