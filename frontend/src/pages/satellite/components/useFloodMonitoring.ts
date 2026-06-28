import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchFloodMonitoringConfig,
  pollFloodJob,
  startFloodJob,
  type FloodMonitoringConfig,
  type FloodMonitoringJob,
  type FloodMonitoringJobStatus,
  type FloodMonitoringResult,
  type RunFloodInput,
} from '../../../lib/floodMonitoringPipeline'

export type FloodPhase = FloodMonitoringJobStatus | 'idle'

export type UseFloodMonitoring = {
  config: FloodMonitoringConfig | null
  phase: FloodPhase
  busy: boolean
  progress: number
  message: string
  result: FloodMonitoringResult | null
  error: string | null
  run: (input: RunFloodInput) => void
  reset: () => void
}

/**
 * Orchestrates the SAR flood-monitoring async job (start → poll → result).
 * RUN-triggered (the user picks dates then runs), unlike the auto-running detectors.
 */
export function useFloodMonitoring(): UseFloodMonitoring {
  const [config, setConfig] = useState<FloodMonitoringConfig | null>(null)
  const [job, setJob] = useState<FloodMonitoringJob | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    void fetchFloodMonitoringConfig().then(c => {
      if (alive) setConfig(c)
    })
    return () => {
      alive = false
      abortRef.current?.abort()
    }
  }, [])

  const run = useCallback((input: RunFloodInput) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setError(null)
    setJob(null)
    setBusy(true)
    void (async () => {
      try {
        const jobId = await startFloodJob(input)
        await pollFloodJob(jobId, snap => setJob(snap), ctrl.signal)
      } catch (e) {
        if ((e as { name?: string })?.name !== 'AbortError') {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (abortRef.current === ctrl) setBusy(false)
      }
    })()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setJob(null)
    setError(null)
    setBusy(false)
  }, [])

  const status = job?.status
  const phase: FloodPhase = busy && !status ? 'fetching' : status ?? 'idle'
  const result = status === 'done' ? job?.result ?? null : null

  return {
    config,
    phase,
    busy,
    progress: job?.progress ?? (busy ? 0.05 : 0),
    message: job?.message ?? '',
    result,
    error: error ?? job?.error ?? null,
    run,
    reset,
  }
}
