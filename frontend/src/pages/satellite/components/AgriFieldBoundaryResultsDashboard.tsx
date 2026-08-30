/**
 * Optimal Learning Rate Finder — six KPIs, AOI-scoped training charts, Epochs Details.
 * Pop-out (variant="float") is that layout only. Inline Results also includes Validation Detection.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { normalizeEpochHistory } from '../../../lib/trainingAi/analyzeTrainingHistory'
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
import {
  AOI_TRAINING_ANALYTICS_CHANGED_EVENT,
  listAoiTrainingAnalytics,
  loadAoiTrainingAnalytics,
  saveAoiTrainingAnalytics,
} from '../../../lib/agriFieldBoundary/aoiTrainingAnalyticsPersistence'
import { GisFloatingWorkspacePanel } from './GisFloatingWorkspacePanel'
import { EpochDetailsTable, type EpochDetailRow } from './EpochDetailsTable'
import { AgriFieldBoundaryValidatePanel } from './AgriFieldBoundaryValidatePanel'
import {
  AoiTrainingChartsWorkspace,
  analyticsToChartBundle,
  estimateAoiDatasetSplit,
  resolveLrFinderForAoi,
  type AoiChartBundle,
} from './AoiTrainingChartsGrid'
import './AgriFieldBoundaryResultsDashboard.css'
import './AgriFieldBoundaryValidatePanel.css'
import './AoiTrainingChartsGrid.css'

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
  /** Validation reference load status shown above Validation Detection. */
  referenceNotice?: string | null
  referenceBusy?: boolean
  /** Inline embed in the Field Boundary dock tab (no map portal). */
  variant?: 'float' | 'inline'
  /** Active map AOI — scopes charts and persistence per polygon. */
  activeAoiKey?: string
  aoiLabel?: string
  approvedSamples?: number
  draftSamples?: number
}

function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(digits)}%`
}

/** Pretrained field engines never emit epoch curves. */
export function isPretrainedFieldEngine(engine: string | null | undefined): boolean {
  const e = String(engine || '').toLowerCase()
  return e.includes('delineate') || e.includes('agricultural-field')
}

function trainingEmptyCopy(
  engine: string | null,
  serviceOnline: boolean | null,
  mentionValidation: boolean,
): ReactNode {
  if (isPretrainedFieldEngine(engine)) {
    return mentionValidation ? (
      <>
        Pretrained engine — use <strong>Validation</strong> below for IoU metrics, or run{' '}
        <strong>TRAIN MODEL</strong> for epoch curves.
      </>
    ) : (
      <>
        Pretrained engine — run <strong>TRAIN MODEL</strong> for epoch curves.
      </>
    )
  }
  if (serviceOnline === false) {
    return (
      <>
        Training offline — confirm the AgroCloud API is running.
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
  activeAoiKey = '',
  aoiLabel = 'AOI',
  approvedSamples = 0,
  draftSamples = 0,
}: AgriFieldBoundaryResultsDashboardProps) {
  const isInline = variant === 'inline'
  const panelOpen = isInline ? true : open
  const { rows: epochRows, serviceOnline } = useLiveEpochRows(epochHistory, panelOpen)
  const summary = useMemo(() => summarizeFieldGeometry(geojson), [geojson])
  const emptyCopy = trainingEmptyCopy(engine, serviceOnline, isInline)
  const fallbackHostRef = useRef<HTMLElement | null>(null)
  const [viewAoiKey, setViewAoiKey] = useState(activeAoiKey || 'current-aoi')
  const [analyticsTick, setAnalyticsTick] = useState(0)

  const resolvedAoiKey = activeAoiKey || 'current-aoi'
  const datasetSplit = useMemo(
    () =>
      estimateAoiDatasetSplit({
        fieldCount,
        approvedSamples,
        draftSamples,
      }),
    [fieldCount, approvedSamples, draftSamples],
  )

  const sampleCount = useMemo(
    () => Math.max(approvedSamples + draftSamples, datasetSplit?.total ?? 0),
    [approvedSamples, draftSamples, datasetSplit?.total],
  )

  useEffect(() => {
    if (!resolvedAoiKey) return
    const prev = loadAoiTrainingAnalytics(resolvedAoiKey)
    const lrFinder = resolveLrFinderForAoi({
      stored: prev?.lrFinder,
      fieldCount,
      sampleCount,
      score,
    })
    if (!epochRows.length && !lrFinder && !datasetSplit) return
    saveAoiTrainingAnalytics({
      aoiKey: resolvedAoiKey,
      aoiLabel: aoiLabel || prev?.aoiLabel || 'AOI',
      epochHistory: epochRows.length ? epochRows : prev?.epochHistory ?? [],
      lrFinder: lrFinder ?? prev?.lrFinder ?? null,
      dataset: datasetSplit ?? prev?.dataset ?? null,
      updatedAt: new Date().toISOString(),
    })
  }, [resolvedAoiKey, aoiLabel, epochRows, datasetSplit, fieldCount, sampleCount, score])

  useEffect(() => {
    if (!panelOpen) return
    const bump = () => setAnalyticsTick(n => n + 1)
    window.addEventListener(AOI_TRAINING_ANALYTICS_CHANGED_EVENT, bump)
    return () => window.removeEventListener(AOI_TRAINING_ANALYTICS_CHANGED_EVENT, bump)
  }, [panelOpen])

  useEffect(() => {
    setViewAoiKey(resolvedAoiKey)
  }, [resolvedAoiKey])

  const chartBundles = useMemo((): AoiChartBundle[] => {
    void analyticsTick
    const byKey = new Map<string, AoiChartBundle>()
    for (const row of listAoiTrainingAnalytics()) {
      const bundle = analyticsToChartBundle(row)
      const lrFinder = resolveLrFinderForAoi({
        stored: row.lrFinder,
        fieldCount: row.aoiKey === resolvedAoiKey ? fieldCount : 0,
        sampleCount: row.dataset?.total ?? 0,
        score: row.aoiKey === resolvedAoiKey ? score : null,
      })
      byKey.set(row.aoiKey, {
        ...bundle,
        lrFinderLrs: lrFinder?.lrs ?? bundle.lrFinderLrs,
        lrFinderLosses: lrFinder?.losses ?? bundle.lrFinderLosses,
        optimalLr: lrFinder?.optimal_lr ?? bundle.optimalLr ?? null,
      })
    }
    const prev = byKey.get(resolvedAoiKey)
    const lrFinder = resolveLrFinderForAoi({
      stored:
        prev?.lrFinderLrs?.length && prev?.lrFinderLosses?.length
          ? {
              lrs: prev.lrFinderLrs,
              losses: prev.lrFinderLosses,
              optimal_lr: prev.optimalLr ?? null,
            }
          : loadAoiTrainingAnalytics(resolvedAoiKey)?.lrFinder,
      fieldCount,
      sampleCount,
      score,
    })
    byKey.set(resolvedAoiKey, {
      aoiKey: resolvedAoiKey,
      aoiLabel: aoiLabel || prev?.aoiLabel || 'AOI',
      epochHistory: epochRows,
      lrFinderLrs: lrFinder?.lrs ?? prev?.lrFinderLrs,
      lrFinderLosses: lrFinder?.losses ?? prev?.lrFinderLosses,
      optimalLr: lrFinder?.optimal_lr ?? prev?.optimalLr ?? null,
      dataset: datasetSplit ?? prev?.dataset ?? null,
    })
    return [...byKey.values()]
  }, [analyticsTick, resolvedAoiKey, aoiLabel, epochRows, datasetSplit, fieldCount, sampleCount, score])

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

  const mapHost = isInline ? null : mapContainerRef.current
  const host =
    isInline || typeof document === 'undefined'
      ? null
      : mapHost ||
        (document.querySelector('.si-map-container') as HTMLElement | null) ||
        document.body
  fallbackHostRef.current = host
  const panelContainerRef = mapHost ? mapContainerRef : fallbackHostRef
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
    <div className={`si-afb-dash${isInline ? ' si-afb-dash--inline' : ' si-afb-dash--float'}`}>
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
        <div className="si-afb-dash__kpi">
          <span>Quality</span>
          <strong>{typeof score === 'number' ? pct(score, 0) : '—'}</strong>
        </div>
      </div>

      <div className="si-afb-dash__charts">
        <AoiTrainingChartsWorkspace
          bundles={chartBundles}
          activeAoiKey={viewAoiKey || resolvedAoiKey}
          onActiveAoiChange={setViewAoiKey}
          inline={isInline}
          emptyLossCopy={emptyCopy}
          emptyLrFinderCopy={
            isPretrainedFieldEngine(engine) ? (
              <>
                Run <strong>TRAIN MODEL</strong> in Training &amp; AI, or use LR Finder on FTW AOI
                training.
              </>
            ) : (
              <>
                No LR sweep yet — run <strong>TRAIN MODEL</strong> or FTW LR Finder for this AOI.
              </>
            )
          }
        />
      </div>

      <section className="si-afb-dash__card si-afb-dash__card--table" style={{ animationDelay: '200ms' }}>
        <EpochDetailsTable rows={epochRows} showEmpty emptyMessage={emptyCopy} />
      </section>

      {isInline ? (
        <section className="si-afb-dash__card si-afb-dash__card--validate">
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
      ) : null}
    </div>
  )

  if (isInline) {
    return dashBody
  }

  const body = (
    <GisFloatingWorkspacePanel
      open={open}
      onClose={onClose}
      containerRef={panelContainerRef}
      storageKey="si.afb.resultsDashboard.v2"
      panelId="si-afb-results-dashboard"
      title="Optimal Learning Rate Finder"
      subtitle={subtitle || 'AOI-scoped training analytics'}
      layerIcon={<i className="fa-solid fa-chart-line" aria-hidden />}
      defaultDock="float"
      defaultWidth={920}
      defaultHeight={640}
      minWidth={560}
      maxWidth={1280}
      minHeight={420}
      maxHeight={920}
    >
      {dashBody}
    </GisFloatingWorkspacePanel>
  )

  if (!host) return null
  return createPortal(body, host)
}
