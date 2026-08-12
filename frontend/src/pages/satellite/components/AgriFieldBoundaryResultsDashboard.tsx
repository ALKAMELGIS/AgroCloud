/**
 * Floating Field Results Dashboard — KPIs, Validation Detection, then
 * Training Performance (loss/accuracy charts + Epochs Details).
 */

import { useEffect, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  normalizeEpochHistory,
  readEpochTrainAccuracy,
  readEpochValAccuracy,
} from '../../../lib/trainingAi/analyzeTrainingHistory'
import { summarizeFieldGeometry } from '../../../lib/agriFieldBoundary/fieldValidationMetrics'
import {
  fetchBestEpochHistory,
  fetchTrainingHealth,
  fetchTrainingModel,
  type TrainingEpochRecord,
} from '../../../lib/trainingAi/trainingAiClient'
import {
  EPOCH_HISTORY_CHANGED_EVENT,
  loadPersistedEpochHistory,
  loadPersistedTrainingModel,
  savePersistedEpochHistory,
} from '../../../lib/trainingAi/trainingModelPersistence'
import { GisFloatingWorkspacePanel } from './GisFloatingWorkspacePanel'
import { EpochDetailsTable, type EpochDetailRow } from './EpochDetailsTable'
import { AgriFieldBoundaryValidatePanel } from './AgriFieldBoundaryValidatePanel'
import { ValidationLinePlot, type PlotSeries } from './ValidationLinePlot'
import './AgriFieldBoundaryResultsDashboard.css'
import './AgriFieldBoundaryValidatePanel.css'

/** Pic 1 style: Training = blue, Validation = orange. */
const TRAIN_COLOR = '#1f77b4'
const VAL_COLOR = '#ff7f0e'

export type AgriFieldBoundaryResultsDashboardProps = {
  open: boolean
  onClose: () => void
  mapContainerRef: RefObject<HTMLElement | null>
  geojson: GeoJSON.FeatureCollection | null
  fieldCount: number
  totalAreaHa: number
  engine: string | null
  score?: number | null
  epochHistory?: EpochDetailRow[] | null
  /** Training & AI polygon samples used as validation reference when available. */
  initialReference?: GeoJSON.FeatureCollection | null
  initialReferenceName?: string | null
  /** FoW load status shown above Validation Detection. */
  referenceNotice?: string | null
  referenceBusy?: boolean
  /** Inline embed in the Field Boundary dock tab (no map portal). */
  variant?: 'float' | 'inline'
}

function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

/** FTW and Delineate Anything are pretrained inference — they never emit epoch curves. */
export function isPretrainedFieldEngine(engine: string | null | undefined): boolean {
  const e = (engine || '').toLowerCase()
  return e.includes('ftw') || e.includes('delineate')
}

function trainingEmptyCopy(engine: string | null, serviceOnline: boolean | null): ReactNode {
  if (isPretrainedFieldEngine(engine)) {
    return (
      <>
        Pretrained engine — use <strong>Validation</strong> below for IoU metrics, or run{' '}
        <strong>TRAIN MODEL</strong> for epoch curves.
      </>
    )
  }
  if (serviceOnline === false) {
    return (
      <>
        Training offline — start <code>segformer-detection</code> (:8095).
      </>
    )
  }
  return (
    <>
      No curve yet — run <strong>TRAIN MODEL</strong> in Training &amp; AI.
    </>
  )
}

const EPOCH_HYDRATE_IDLE_MS = 8000
const EPOCH_HYDRATE_TRAINING_MS = 2000

type LiveEpochState = {
  rows: EpochDetailRow[]
  serviceOnline: boolean | null
}

function useLiveEpochRows(
  epochHistory: EpochDetailRow[] | null | undefined,
  open: boolean,
): LiveEpochState {
  const [state, setState] = useState<LiveEpochState>(() => ({
    rows: normalizeEpochHistory(epochHistory?.length ? epochHistory : loadPersistedEpochHistory()),
    serviceOnline: null,
  }))

  useEffect(() => {
    if (epochHistory?.length) {
      setState(prev => ({
        ...prev,
        rows: normalizeEpochHistory(epochHistory),
      }))
      return
    }
    if (!open) return

    const setRows = (updater: (prev: EpochDetailRow[]) => EpochDetailRow[]) => {
      setState(prev => ({ ...prev, rows: updater(prev.rows) }))
    }

    /** Live Training & AI events replace; disk hydrate keeps the longer curve. */
    const apply = (list: TrainingEpochRecord[], mode: 'merge' | 'replace') => {
      const next = normalizeEpochHistory(list)
      if (!next.length) return
      setRows(prev => {
        if (mode === 'replace') return next
        return prev.length > next.length ? prev : next
      })
      if (mode === 'replace') {
        savePersistedEpochHistory(next)
        return
      }
      const stored = loadPersistedEpochHistory()
      if (stored.length > next.length) return
      savePersistedEpochHistory(next)
    }

    const fromStorage = loadPersistedEpochHistory()
    if (fromStorage.length) setRows(() => fromStorage)

    const onLocal = (ev: Event) => {
      const detail = (ev as CustomEvent<{ rows?: TrainingEpochRecord[] }>).detail
      if (detail?.rows?.length) apply(detail.rows, 'replace')
      else {
        const stored = loadPersistedEpochHistory()
        if (stored.length) setRows(() => stored)
      }
    }
    const onStorage = (ev: StorageEvent) => {
      if (ev.key && ev.key !== 'agrocloud.trainingAi.lastEpochHistory.v1') return
      const stored = loadPersistedEpochHistory()
      if (stored.length) setRows(() => stored)
    }
    window.addEventListener(EPOCH_HISTORY_CHANGED_EVENT, onLocal)
    window.addEventListener('storage', onStorage)

    const ac = new AbortController()
    let timeoutId = 0

    const hydrate = async () => {
      try {
        const persistedModel = loadPersistedTrainingModel()
        if (persistedModel?.model_id) {
          const detail = await fetchTrainingModel(persistedModel.model_id, ac.signal)
          if (detail?.loss_history?.length) apply(detail.loss_history, 'merge')
        }
        const best = await fetchBestEpochHistory(ac.signal)
        if (best.length) apply(best, 'merge')
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
      }
    }

    const loop = async () => {
      if (ac.signal.aborted) return
      const stored = loadPersistedEpochHistory()
      if (stored.length) setRows(() => stored)
      await hydrate()
      let delay = EPOCH_HYDRATE_IDLE_MS
      try {
        const health = await fetchTrainingHealth(ac.signal)
        setState(prev => ({ ...prev, serviceOnline: true }))
        if (health.training) delay = EPOCH_HYDRATE_TRAINING_MS
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setState(prev => ({ ...prev, serviceOnline: false }))
      }
      if (ac.signal.aborted) return
      timeoutId = window.setTimeout(() => {
        void loop()
      }, delay)
    }

    void loop()

    return () => {
      ac.abort()
      window.clearTimeout(timeoutId)
      window.removeEventListener(EPOCH_HISTORY_CHANGED_EVENT, onLocal)
      window.removeEventListener('storage', onStorage)
    }
  }, [epochHistory, open])

  return state
}

export function AgriFieldBoundaryResultsDashboard({
  open,
  onClose,
  mapContainerRef,
  geojson,
  fieldCount,
  totalAreaHa,
  engine,
  score = null,
  epochHistory = null,
  initialReference = null,
  initialReferenceName = null,
  referenceNotice = null,
  referenceBusy = false,
  variant = 'float',
}: AgriFieldBoundaryResultsDashboardProps) {
  const isInline = variant === 'inline'
  const panelOpen = isInline ? true : open
  const { rows: epochRows, serviceOnline } = useLiveEpochRows(epochHistory, panelOpen)
  const summary = useMemo(() => summarizeFieldGeometry(geojson), [geojson])
  const emptyCopy = trainingEmptyCopy(engine, serviceOnline)

  const lossSeries = useMemo<PlotSeries[]>(() => {
    if (!epochRows.length) return []
    return [
      {
        id: 'train_loss',
        label: 'Training',
        color: TRAIN_COLOR,
        markers: epochRows.length <= 40,
        points: epochRows.map(r => ({ x: r.epoch, y: r.train_loss })),
      },
      {
        id: 'val_loss',
        label: 'Validation',
        color: VAL_COLOR,
        markers: epochRows.length <= 40,
        points: epochRows.map(r => ({ x: r.epoch, y: r.val_loss })),
      },
    ]
  }, [epochRows])

  const accuracySeries = useMemo<PlotSeries[]>(() => {
    const trainPts = epochRows
      .map(r => {
        const y = readEpochTrainAccuracy(r)
        return y == null ? null : { x: r.epoch, y }
      })
      .filter((p): p is { x: number; y: number } => p != null)
    const valPts = epochRows
      .map(r => {
        const y = readEpochValAccuracy(r)
        return y == null ? null : { x: r.epoch, y }
      })
      .filter((p): p is { x: number; y: number } => p != null)
    const series: PlotSeries[] = []
    if (trainPts.length) {
      series.push({
        id: 'train_acc',
        label: 'Training',
        color: TRAIN_COLOR,
        markers: trainPts.length <= 40,
        points: trainPts,
      })
    }
    if (valPts.length) {
      series.push({
        id: 'val_acc',
        label: 'Validation',
        color: VAL_COLOR,
        markers: valPts.length <= 40,
        points: valPts,
      })
    }
    return series
  }, [epochRows])

  // Re-render once the map host mounts so createPortal has a target.
  const [hostTick, setHostTick] = useState(0)
  useEffect(() => {
    if (!panelOpen || isInline) return
    if (mapContainerRef.current) {
      if (hostTick === 0) setHostTick(1)
      return
    }
    const id = window.requestAnimationFrame(() => setHostTick(n => n + 1))
    return () => window.cancelAnimationFrame(id)
  }, [panelOpen, mapContainerRef, hostTick, isInline])

  const host = isInline ? null : mapContainerRef.current
  if (!panelOpen) return null
  if (!isInline && !host) return null

  const subtitle = [
    fieldCount ? `${fieldCount} fields` : null,
    totalAreaHa > 0 ? `${totalAreaHa.toFixed(2)} ha` : null,
    engine || null,
  ]
    .filter(Boolean)
    .join(' · ')

  const dashBody = (
    <div className={`si-afb-dash${isInline ? ' si-afb-dash--inline' : ''}`}>
      <div className="si-afb-dash__kpis" aria-label="Detection summary">
        <div className="si-afb-dash__kpi">
          <span>Fields</span>
          <strong>{fieldCount}</strong>
        </div>
        <div className="si-afb-dash__kpi">
          <span>Area</span>
          <strong>{totalAreaHa.toFixed(2)} ha</strong>
        </div>
        <div className="si-afb-dash__kpi">
          <span>Mean</span>
          <strong>{summary.meanAreaHa.toFixed(2)} ha</strong>
        </div>
        <div className="si-afb-dash__kpi">
          <span>Median</span>
          <strong>{summary.medianAreaHa.toFixed(2)} ha</strong>
        </div>
        <div className="si-afb-dash__kpi">
          <span>Regularized</span>
          <strong>{summary.regularizedCount}</strong>
        </div>
        {typeof score === 'number' ? (
          <div className="si-afb-dash__kpi">
            <span>Quality</span>
            <strong>{pct(score, 0)}</strong>
          </div>
        ) : null}
      </div>

      <div className="si-afb-dash__charts">
        <section className="si-afb-dash__card" style={{ animationDelay: '80ms' }}>
          <header className="si-afb-dash__card-head">
            <h4>Training loss</h4>
            <span>{epochRows.length ? `${epochRows.length} epochs` : 'No history'}</span>
          </header>
          {lossSeries.length ? (
            <ValidationLinePlot
              series={lossSeries}
              xLabel="Epochs"
              yLabel="Loss"
              ariaLabel="Training and validation loss per epoch"
              height={isInline ? 140 : 168}
            />
          ) : (
            <p className="si-afb-dash__empty">{emptyCopy}</p>
          )}
        </section>
        <section className="si-afb-dash__card" style={{ animationDelay: '120ms' }}>
          <header className="si-afb-dash__card-head">
            <h4>Training accuracy</h4>
            <span>{accuracySeries.length ? 'Train vs val' : 'No accuracy'}</span>
          </header>
          {accuracySeries.length ? (
            <ValidationLinePlot
              series={accuracySeries}
              xLabel="Epochs"
              yLabel="Accuracy"
              yDomain={[0, 1]}
              formatY={v => `${(v * 100).toFixed(0)}%`}
              ariaLabel="Training and validation accuracy per epoch"
              height={isInline ? 140 : 168}
            />
          ) : (
            <p className="si-afb-dash__empty">
              {isPretrainedFieldEngine(engine)
                ? emptyCopy
                : 'Accuracy appears after TRAIN MODEL reports per-epoch accuracy.'}
            </p>
          )}
        </section>
      </div>

      <section className="si-afb-dash__card si-afb-dash__card--table" style={{ animationDelay: '160ms' }}>
        <EpochDetailsTable rows={epochRows} showEmpty emptyMessage={emptyCopy} />
      </section>

      <section className="si-afb-dash__card si-afb-dash__card--validate" style={{ animationDelay: '200ms' }}>
        <AgriFieldBoundaryValidatePanel
          variant="dashboard"
          geojson={geojson}
          fieldCount={fieldCount}
          totalAreaHa={totalAreaHa}
          engine={engine}
          score={score}
          epochHistory={epochRows}
          initialReference={initialReference}
          initialReferenceName={initialReferenceName}
          referenceNotice={referenceNotice}
          referenceBusy={referenceBusy}
        />
      </section>
    </div>
  )

  if (isInline) {
    return dashBody
  }

  const body = (
    <GisFloatingWorkspacePanel
      open={open}
      onClose={onClose}
      containerRef={mapContainerRef}
      storageKey="si.afb.resultsDashboard.v1"
      panelId="si-afb-results-dashboard"
      title="Field Results Dashboard"
      subtitle={subtitle || 'Detection & training analysis'}
      layerIcon={<i className="fa-solid fa-chart-line" aria-hidden />}
      defaultDock="float"
      defaultWidth={760}
      defaultHeight={560}
      minWidth={420}
      maxWidth={1100}
      minHeight={360}
      maxHeight={900}
    >
      {dashBody}
    </GisFloatingWorkspacePanel>
  )

  return createPortal(body, host!)
}
