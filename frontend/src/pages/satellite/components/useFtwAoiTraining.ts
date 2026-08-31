/**
 * Per-AOI FTW training session — dataset, LR finder, train, live poll.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as turf from '@turf/turf'
import type { SiActiveAoi } from '../../../lib/siAoiManager'
import { aoiFeatureCollectionBbox } from '../../../lib/trainingAi/clipResultsToAoi'
import {
  cancelFtwTrainingJob,
  exportFtwModelUrl,
  fetchFtwTrainingJob,
  lrFinderFromJob,
  sampleFtwDataset,
  startFtwLrFinder,
  startFtwTraining,
  type FtwTrainingJobResponse,
} from '../../../lib/agriFieldBoundary/ftwTrainingClient'
import {
  loadFtwAoiSession,
  saveFtwAoiSession,
} from '../../../lib/agriFieldBoundary/ftwAoiTrainingPersistence'
import {
  isFtwAoiSessionChartable,
  type FtwAoiTrainingSession,
} from '../../../lib/agriFieldBoundary/ftwAoiTrainingTypes'
import type { TrainingEpochRecord } from '../../../lib/trainingAi/trainingAiClient'

export type UseFtwAoiTrainingOptions = {
  activeAoi: SiActiveAoi
  aoiLabel?: string
  ftwYear?: number
  enabled?: boolean
}

function aoiAreaHa(aoi: SiActiveAoi): number {
  if (!aoi.geometry?.features?.length) return 0
  try {
    const m2 = turf.area(aoi.geometry as turf.AllGeoJSON)
    return m2 / 10_000
  } catch {
    return 0
  }
}

function aoiAsFeatureCollection(aoi: SiActiveAoi): GeoJSON.FeatureCollection | null {
  if (!aoi.geometry?.features?.length) return null
  return aoi.geometry as GeoJSON.FeatureCollection
}

function applyTrainingJob(session: FtwAoiTrainingSession, job: FtwTrainingJobResponse): FtwAoiTrainingSession {
  const history = (job.loss_history || []) as TrainingEpochRecord[]
  const last = history[history.length - 1]
  const metrics = job.metrics || (last?.metrics as { iou?: number; f1?: number } | undefined)
  return {
    ...session,
    trainingStatus:
      job.status === 'done'
        ? 'done'
        : job.status === 'error'
          ? 'error'
          : job.status === 'cancelled'
            ? 'cancelled'
            : job.status === 'running' || job.status === 'queued'
              ? 'running'
              : session.trainingStatus,
    trainingError: job.error ?? null,
    epoch: Number(job.epoch ?? history.length ?? 0),
    epochs: Number(job.epochs ?? session.epochs),
    trainLoss: job.train_loss ?? last?.train_loss ?? session.trainLoss,
    valLoss: job.val_loss ?? last?.val_loss ?? session.valLoss,
    iou: metrics?.iou ?? (last?.metrics as { iou?: number } | undefined)?.iou ?? session.iou,
    f1: metrics?.f1 ?? (last?.metrics as { f1?: number } | undefined)?.f1 ?? session.f1,
    lossHistory: history.length ? history : session.lossHistory,
    modelExportId: job.model?.model_id ?? session.modelExportId,
    updatedAt: new Date().toISOString(),
  }
}

export function useFtwAoiTraining({
  activeAoi,
  aoiLabel,
  ftwYear = 2025,
  enabled = true,
}: UseFtwAoiTrainingOptions) {
  const [session, setSession] = useState<FtwAoiTrainingSession>(() =>
    loadFtwAoiSession(activeAoi.key, aoiLabel),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session

  const persist = useCallback((next: FtwAoiTrainingSession) => {
    sessionRef.current = next
    setSession(next)
    if (isFtwAoiSessionChartable(next)) {
      saveFtwAoiSession(next)
    }
  }, [])

  useEffect(() => {
    if (!enabled || !activeAoi.key) return
    const loaded = loadFtwAoiSession(activeAoi.key, aoiLabel)
    const next = {
      ...loaded,
      aoiKey: activeAoi.key,
      aoiLabel: aoiLabel || loaded.aoiLabel,
      areaHa: aoiAreaHa(activeAoi),
      ftwYear,
    }
    sessionRef.current = next
    setSession(next)
    if (isFtwAoiSessionChartable(next)) {
      saveFtwAoiSession(next)
    }
  }, [activeAoi.key, aoiLabel, ftwYear, enabled, activeAoi, persist])

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const pollJob = useCallback(
    (jobId: string, kind: 'lr-finder' | 'train') => {
      stopPoll()
      pollRef.current = window.setInterval(async () => {
        try {
          const job = await fetchFtwTrainingJob(jobId)
          const cur = sessionRef.current
          if (kind === 'lr-finder') {
            const lr = lrFinderFromJob(job)
            if (lr) {
              persist({
                ...cur,
                lrFinder: lr,
                optimalLr: lr.optimal_lr,
                lrFinderJobId: jobId,
              })
            }
            if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
              stopPoll()
              setBusy(false)
            }
            return
          }
          persist(applyTrainingJob(cur, job))
          if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
            stopPoll()
            setBusy(false)
          }
        } catch (err) {
          setError(String((err as Error)?.message || err))
          stopPoll()
          setBusy(false)
        }
      }, 900)
    },
    [persist, stopPoll],
  )

  useEffect(() => () => stopPoll(), [stopPoll])

  const buildDataset = useCallback(async () => {
    if (!activeAoi.key) {
      setError('Draw or select an AOI first.')
      return null
    }
    const fc = aoiAsFeatureCollection(activeAoi)
    const bbox = aoiFeatureCollectionBbox(fc)
    if (!fc || !bbox) {
      setError('AOI geometry is invalid.')
      return null
    }
    setBusy(true)
    setError(null)
    try {
      const resp = await sampleFtwDataset({
        aoi_key: activeAoi.key,
        aoi_label: aoiLabel || sessionRef.current.aoiLabel,
        aoi: fc,
        bbox,
        area_ha: aoiAreaHa(activeAoi),
        year: ftwYear,
      })
      const next: FtwAoiTrainingSession = {
        ...sessionRef.current,
        aoiKey: activeAoi.key,
        aoiLabel: resp.aoi_label || aoiLabel || sessionRef.current.aoiLabel,
        areaHa: resp.area_ha,
        datasetId: resp.dataset_id,
        dataset: resp.splits,
        ftwYear,
        updatedAt: new Date().toISOString(),
      }
      persist(next)
      return next
    } catch (err) {
      setError(String((err as Error)?.message || err))
      return null
    } finally {
      setBusy(false)
    }
  }, [activeAoi.key, aoiLabel, ftwYear, persist])

  const runLrFinder = useCallback(async () => {
    let cur = sessionRef.current
    if (!cur.datasetId) {
      const built = await buildDataset()
      if (!built?.datasetId) return
      cur = built
    }
    setBusy(true)
    setError(null)
    try {
      const { job_id } = await startFtwLrFinder({
        dataset_id: cur.datasetId!,
        aoi_key: cur.aoiKey,
        model: cur.model,
      })
      persist({
        ...cur,
        lrFinderJobId: job_id,
        lrFinder: { lrs: [], losses: [], optimal_lr: 0, status: 'running' },
      })
      pollJob(job_id, 'lr-finder')
    } catch (err) {
      setError(String((err as Error)?.message || err))
      setBusy(false)
    }
  }, [buildDataset, persist, pollJob])

  const runTraining = useCallback(async () => {
    let cur = sessionRef.current
    if (!cur.datasetId) {
      const built = await buildDataset()
      if (!built?.datasetId) return
      cur = built
    }
    const lr = cur.optimalLr ?? cur.lrFinder?.optimal_lr
    if (!lr || lr <= 0) {
      setError('Run LR Finder first to pick an optimal learning rate.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { job_id } = await startFtwTraining({
        dataset_id: cur.datasetId!,
        aoi_key: cur.aoiKey,
        learning_rate: lr,
        epochs: cur.epochs,
        model: cur.model,
        scheduler: 'cosine',
      })
      persist({
        ...cur,
        trainingJobId: job_id,
        trainingStatus: 'running',
        trainingError: null,
        lossHistory: [],
        epoch: 0,
      })
      pollJob(job_id, 'train')
    } catch (err) {
      setError(String((err as Error)?.message || err))
      setBusy(false)
    }
  }, [buildDataset, persist, pollJob])

  const cancelTraining = useCallback(async () => {
    const jobId = sessionRef.current.trainingJobId || sessionRef.current.lrFinderJobId
    if (!jobId) return
    try {
      await cancelFtwTrainingJob(jobId)
    } catch {
      /* ignore */
    }
    stopPoll()
    setBusy(false)
  }, [stopPoll])

  const exportModel = useCallback(() => {
    const jobId = sessionRef.current.trainingJobId
    if (!jobId) return
    window.open(exportFtwModelUrl(jobId), '_blank', 'noopener,noreferrer')
  }, [])

  const runFullPipeline = useCallback(async () => {
    await buildDataset()
    await runLrFinder()
  }, [buildDataset, runLrFinder])

  return {
    session,
    busy,
    error,
    buildDataset,
    runLrFinder,
    runTraining,
    runFullPipeline,
    cancelTraining,
    exportModel,
    hasAoi: Boolean(activeAoi.key && activeAoi.geometry),
  }
}
