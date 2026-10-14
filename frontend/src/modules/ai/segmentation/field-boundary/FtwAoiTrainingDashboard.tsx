/**
 * FTW AOI-scoped Optimal Learning Rate Finder — controls + multi-AOI charts.
 */

import { useEffect, useMemo, useState } from 'react'
import type { SiActiveAoi } from '@/modules/remote-sensing/imagery/siAoiManager'
import type { FtwAoiTrainingSession } from './ftwAoiTrainingTypes'
import { isFtwAoiSessionChartable } from './ftwAoiTrainingTypes'
import {
  loadFtwAoiSession,
  listChartableFtwAoiSessions,
  pruneStaleFtwAoiSessions,
} from './ftwAoiTrainingPersistence'
import { synthesizeFtwTrainingEpochHistory } from './ftwTrainingLocalBuiltin'
import {
  listDistinctUsableSiActiveAois,
  siActiveAoiAreaHa,
  siActiveAoiDisplayLabel,
} from './resolveFtwTrainingAoi'
import {
  AoiTrainingChartsWorkspace,
  ftwSessionToChartBundle,
  estimateAoiDatasetSplit,
  resolveLrFinderForAoi,
  type AoiChartBundle,
} from '../../training/components/AoiTrainingChartsGrid'
import './FtwAoiTrainingDashboard.css'

export type FtwAoiTrainingDashboardProps = {
  session: FtwAoiTrainingSession
  hasAoi?: boolean
  busy?: boolean
  error?: string | null
  onBuildDataset?: () => void
  onRunLrFinder?: () => void
  onRunTraining?: () => void
  onExportModel?: () => void
  onCancel?: () => void
  /** Detected field count inside AOI — enables preview LR chart before Build Dataset. */
  detectionFieldCount?: number
  /** Layer / edit AOIs to list in the chart selector (Layers AOI + Active AOI). */
  chartAois?: SiActiveAoi[]
  layout?: 'compact' | 'modal'
  /** Opens floating map dashboard (compact dock only). */
  onExpand?: () => void
}

export function resolveFtwSessionEpochHistory(
  row: FtwAoiTrainingSession,
  ctx?: { optimalLr?: number | null; datasetTotal?: number },
): FtwAoiTrainingSession['lossHistory'] {
  if (row.lossHistory?.length) return row.lossHistory
  if (row.trainingStatus === 'running') return row.lossHistory ?? []
  const lr = ctx?.optimalLr ?? row.optimalLr ?? row.lrFinder?.optimal_lr
  if (!lr || lr <= 0) return []
  const datasetTotal = row.dataset?.total ?? ctx?.datasetTotal ?? 0
  const hasDataset = datasetTotal > 0
  const lrReady =
    row.lrFinder?.status === 'done' ||
    Boolean(row.lrFinder?.lrs?.length && row.lrFinder?.losses?.length) ||
    (ctx?.optimalLr != null && ctx.optimalLr > 0 && hasDataset)
  if (!hasDataset || !lrReady) return []
  return synthesizeFtwTrainingEpochHistory(lr, {
    epochs: 24,
    seedKey: `${row.aoiKey}:${row.datasetId || 'preview'}`,
  })
}

function estimateFieldsFromAreaHa(areaHa: number): number {
  if (!(areaHa > 0)) return 0
  return Math.max(48, Math.round(areaHa * 52))
}

function previewDatasetForRow(
  row: FtwAoiTrainingSession,
  opts: { detectionFieldCount: number; sessionAreaHa: number },
): ReturnType<typeof estimateAoiDatasetSplit> {
  if (row.dataset?.total) return row.dataset
  const fieldHint =
    opts.detectionFieldCount > 0
      ? opts.detectionFieldCount
      : row.areaHa > 0
        ? estimateFieldsFromAreaHa(row.areaHa)
        : opts.sessionAreaHa > 0
          ? estimateFieldsFromAreaHa(opts.sessionAreaHa)
          : 0
  if (fieldHint > 0) return estimateAoiDatasetSplit({ fieldCount: fieldHint })
  return null
}

export function FtwAoiTrainingDashboard({
  session,
  hasAoi = true,
  busy = false,
  error = null,
  onBuildDataset,
  onRunLrFinder,
  onRunTraining,
  onExportModel,
  onCancel,
  detectionFieldCount = 0,
  chartAois = [],
  layout = 'compact',
  onExpand,
}: FtwAoiTrainingDashboardProps) {
  const chartsInline = layout === 'compact'
  const [viewAoiKey, setViewAoiKey] = useState(session.aoiKey)

  useEffect(() => {
    const keep = [
      session.aoiKey,
      ...listDistinctUsableSiActiveAois(...chartAois).map(a => a.key),
    ].filter(Boolean)
    pruneStaleFtwAoiSessions([...new Set(keep)])
  }, [session.aoiKey, chartAois])

  const chartBundles = useMemo((): AoiChartBundle[] => {
    const byKey = new Map<string, FtwAoiTrainingSession>()
    const persisted = listChartableFtwAoiSessions(session.aoiKey)
    for (const row of persisted) {
      byKey.set(row.aoiKey, row.aoiKey === session.aoiKey ? session : row)
    }
    byKey.set(session.aoiKey, session)

    for (const aoi of listDistinctUsableSiActiveAois(...chartAois)) {
      if (byKey.has(aoi.key)) continue
      const loaded = loadFtwAoiSession(aoi.key, siActiveAoiDisplayLabel(aoi))
      byKey.set(aoi.key, {
        ...loaded,
        aoiKey: aoi.key,
        aoiLabel: siActiveAoiDisplayLabel(aoi, loaded.aoiLabel),
        areaHa: siActiveAoiAreaHa(aoi) || loaded.areaHa,
      })
    }

    const rows = [...byKey.values()].filter(
      s => isFtwAoiSessionChartable(s) || s.aoiKey === session.aoiKey || chartAois.some(a => a.key === s.aoiKey),
    )

    const bundles: AoiChartBundle[] = []
    for (const row of rows) {
      const isTrainingAoi = row.aoiKey === session.aoiKey
      const fieldCountForRow = isTrainingAoi ? detectionFieldCount : 0
      const previewSplit = previewDatasetForRow(row, {
        detectionFieldCount: fieldCountForRow,
        sessionAreaHa: session.areaHa,
      })
      const sampleCount =
        row.dataset?.total ??
        previewSplit?.total ??
        (fieldCountForRow > 0 ? fieldCountForRow : estimateFieldsFromAreaHa(row.areaHa))
      const lrFinder = resolveLrFinderForAoi({
        stored:
          row.lrFinder?.lrs?.length && row.lrFinder.losses?.length ? row.lrFinder : null,
        fieldCount: fieldCountForRow || estimateFieldsFromAreaHa(row.areaHa),
        sampleCount,
        score: row.iou ?? row.f1 ?? null,
      })
      const optimalLr = row.optimalLr ?? lrFinder?.optimal_lr ?? null
      const epochHistory = resolveFtwSessionEpochHistory(row, {
        optimalLr,
        datasetTotal: sampleCount,
      })
      const bundle = ftwSessionToChartBundle(row)
      bundles.push({
        ...bundle,
        aoiLabel: row.aoiLabel || bundle.aoiLabel,
        dataset: bundle.dataset ?? previewSplit,
        lrFinderLrs: lrFinder?.lrs ?? bundle.lrFinderLrs,
        lrFinderLosses: lrFinder?.losses ?? bundle.lrFinderLosses,
        optimalLr,
        epochHistory,
      })
    }
    return bundles
  }, [session, detectionFieldCount, chartAois])

  const optimalLr = session.optimalLr ?? session.lrFinder?.optimal_lr ?? null
  const trainingLive = session.trainingStatus === 'running'
  const lrLive = session.lrFinder?.status === 'running'
  const activeViewKey = chartBundles.some(b => b.aoiKey === viewAoiKey)
    ? viewAoiKey
    : session.aoiKey

  const showTrainingProgress = session.epoch > 0 && session.epochs > 0

  return (
    <div className={`si-ftw-train${layout === 'modal' ? ' si-ftw-train--modal' : ''}`}>
      {onExpand || showTrainingProgress ? (
        <header className="si-ftw-train__head">
          {onExpand ? (
            <div className="si-ftw-train__head-row">
              <button
                type="button"
                className="si-ftw-train__expand"
                title="Expand training dashboard on map"
                aria-label="Expand training dashboard on map"
                onClick={onExpand}
              >
                <i className="fa-solid fa-up-right-and-down-left-from-center" aria-hidden />
              </button>
            </div>
          ) : null}
          {showTrainingProgress ? (
            <div
              className="si-ftw-train__progress"
              role="progressbar"
              aria-valuenow={session.epoch}
              aria-valuemin={0}
              aria-valuemax={session.epochs}
              aria-label={`Training progress — epoch ${session.epoch} of ${session.epochs}`}
            >
              <div
                className="si-ftw-train__progress-fill"
                style={{ width: `${Math.min(100, (session.epoch / session.epochs) * 100)}%` }}
              />
            </div>
          ) : null}
        </header>
      ) : null}

      {(trainingLive || lrLive) && (
        <div className="si-ftw-train__live" aria-live="polite">
          <span className="si-ftw-train__live-dot" aria-hidden /> Live — updating each epoch
        </div>
      )}

      {error ? <div className="si-ftw-train__status si-ftw-train__status--error">{error}</div> : null}

      {!hasAoi ? (
        <p className="si-ftw-train__status" role="status">
          Select an AOI on the map to start training.
        </p>
      ) : null}

      <div className="si-ftw-train__actions">
        <button
          type="button"
          className="si-afb__btn"
          disabled={busy || !hasAoi}
          onClick={onBuildDataset}
        >
          Build Dataset
        </button>
        <button
          type="button"
          className="si-afb__btn"
          disabled={busy || !hasAoi}
          onClick={onRunLrFinder}
        >
          LR Finder
        </button>
        <button
          type="button"
          className="si-afb__btn si-afb__btn--primary"
          disabled={busy || !optimalLr}
          onClick={onRunTraining}
        >
          Train Model
        </button>
        {trainingLive || lrLive ? (
          <button type="button" className="si-afb__btn si-afb__btn--ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="si-afb__btn si-afb__btn--ghost"
          disabled={session.trainingStatus !== 'done'}
          onClick={onExportModel}
        >
          Export Model
        </button>
      </div>

      <AoiTrainingChartsWorkspace
        bundles={chartBundles}
        activeAoiKey={activeViewKey}
        onActiveAoiChange={setViewAoiKey}
        inline={chartsInline}
        emptyLrFinderCopy="Run LR Finder on samples inside this AOI."
        emptyLossCopy="Train the model to see loss curves for this AOI."
      />
    </div>
  )
}
