/**
 * FTW AOI-scoped Optimal Learning Rate Finder — controls + multi-AOI charts.
 */

import { useMemo, useState } from 'react'
import type { FtwAoiTrainingSession } from '../../../lib/agriFieldBoundary/ftwAoiTrainingTypes'
import { listFtwAoiSessions } from '../../../lib/agriFieldBoundary/ftwAoiTrainingPersistence'
import {
  AoiTrainingChartsWorkspace,
  ftwSessionToChartBundle,
  type AoiChartBundle,
} from './AoiTrainingChartsGrid'
import './FtwAoiTrainingDashboard.css'

export type FtwAoiTrainingDashboardProps = {
  session: FtwAoiTrainingSession
  busy?: boolean
  error?: string | null
  onBuildDataset?: () => void
  onRunLrFinder?: () => void
  onRunTraining?: () => void
  onExportModel?: () => void
  onCancel?: () => void
}

function fmtLr(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—'
  if (v >= 0.001) return v.toFixed(4)
  return v.toExponential(1)
}

function fmtMetric(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(digits)
}

export function FtwAoiTrainingDashboard({
  session,
  busy = false,
  error = null,
  onBuildDataset,
  onRunLrFinder,
  onRunTraining,
  onExportModel,
  onCancel,
}: FtwAoiTrainingDashboardProps) {
  const [viewAoiKey, setViewAoiKey] = useState(session.aoiKey)

  const chartBundles = useMemo((): AoiChartBundle[] => {
    const byKey = new Map<string, AoiChartBundle>()
    for (const row of listFtwAoiSessions()) {
      byKey.set(row.aoiKey, ftwSessionToChartBundle(row))
    }
    byKey.set(session.aoiKey, ftwSessionToChartBundle(session))
    return [...byKey.values()]
  }, [session])

  const optimalLr = session.optimalLr ?? session.lrFinder?.optimal_lr ?? null
  const trainingLive = session.trainingStatus === 'running'
  const lrLive = session.lrFinder?.status === 'running'
  const totalSamples = session.dataset?.total ?? 0
  const activeViewKey = chartBundles.some(b => b.aoiKey === viewAoiKey)
    ? viewAoiKey
    : session.aoiKey

  return (
    <div className="si-ftw-train">
      <header className="si-ftw-train__head">
        <div className="si-ftw-train__title">Optimal Learning Rate Finder — {session.aoiLabel}</div>
        <dl className="si-ftw-train__meta-grid">
          <div>
            <dt>FTW Dataset</dt>
            <dd>Samples: {totalSamples ? totalSamples.toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>{session.areaHa > 0 ? `${session.areaHa.toFixed(1)} ha` : '—'}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>
              {session.model.architecture} · {session.model.encoder}
            </dd>
          </div>
          <div>
            <dt>Optimal LR</dt>
            <dd className="si-ftw-train__opt-lr">{optimalLr ? fmtLr(optimalLr) : '—'}</dd>
          </div>
          <div>
            <dt>Training</dt>
            <dd>
              Epoch {session.epoch}/{session.epochs}
              {session.trainLoss != null ? ` · Loss ${fmtMetric(session.trainLoss, 3)}` : ''}
            </dd>
          </div>
          <div>
            <dt>Metrics</dt>
            <dd>
              IoU {fmtMetric(session.iou)} · F1 {fmtMetric(session.f1)}
            </dd>
          </div>
        </dl>
      </header>

      {(trainingLive || lrLive) && (
        <div className="si-ftw-train__live" aria-live="polite">
          <span className="si-ftw-train__live-dot" aria-hidden /> Live — updating each epoch
        </div>
      )}

      {error ? <div className="si-ftw-train__status si-ftw-train__status--error">{error}</div> : null}

      <div className="si-ftw-train__actions">
        <button type="button" className="si-afb__btn" disabled={busy} onClick={onBuildDataset}>
          Build Dataset
        </button>
        <button type="button" className="si-afb__btn" disabled={busy} onClick={onRunLrFinder}>
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
        inline
        emptyLrFinderCopy="Run LR Finder on samples inside this AOI."
        emptyLossCopy="Train the model to see loss curves for this AOI."
      />
    </div>
  )
}
