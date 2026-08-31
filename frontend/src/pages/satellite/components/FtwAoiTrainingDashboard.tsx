/**
 * FTW AOI-scoped Optimal Learning Rate Finder — controls + multi-AOI charts.
 */

import { useEffect, useMemo, useState } from 'react'
import type { FtwAoiTrainingSession } from '../../../lib/agriFieldBoundary/ftwAoiTrainingTypes'
import { isFtwAoiSessionChartable } from '../../../lib/agriFieldBoundary/ftwAoiTrainingTypes'
import {
  listChartableFtwAoiSessions,
  pruneStaleFtwAoiSessions,
} from '../../../lib/agriFieldBoundary/ftwAoiTrainingPersistence'
import {
  AoiTrainingChartsWorkspace,
  ftwSessionToChartBundle,
  resolveLrFinderForAoi,
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

type FtwTrainInfoIconsProps = {
  session: FtwAoiTrainingSession
  optimalLr: number | null
  totalSamples: number
  trainingLive: boolean
}

function FtwTrainInfoIcons({
  session,
  optimalLr,
  totalSamples,
  trainingLive,
}: FtwTrainInfoIconsProps) {
  const trainingLoss =
    session.trainLoss != null ? ` · Loss ${fmtMetric(session.trainLoss, 3)}` : ''
  const items: Array<{
    key: string
    icon: string
    label: string
    accent?: boolean
    live?: boolean
  }> = [
    {
      key: 'dataset',
      icon: 'fa-solid fa-database',
      label: `FTW Dataset — Samples: ${totalSamples ? totalSamples.toLocaleString() : '—'}`,
    },
    {
      key: 'area',
      icon: 'fa-solid fa-chart-area',
      label: `Area — ${session.areaHa > 0 ? `${session.areaHa.toFixed(1)} ha` : '—'}`,
    },
    {
      key: 'model',
      icon: 'fa-solid fa-microchip',
      label: `Model — ${session.model.architecture} · ${session.model.encoder}`,
    },
    {
      key: 'lr',
      icon: 'fa-solid fa-sliders',
      label: `Optimal LR — ${optimalLr ? fmtLr(optimalLr) : '—'}`,
      accent: Boolean(optimalLr),
    },
    {
      key: 'training',
      icon: 'fa-solid fa-chart-line',
      label: `Training — Epoch ${session.epoch}/${session.epochs}${trainingLoss}`,
      live: trainingLive,
    },
    {
      key: 'metrics',
      icon: 'fa-solid fa-bullseye',
      label: `Metrics — IoU ${fmtMetric(session.iou)} · F1 ${fmtMetric(session.f1)}`,
    },
  ]

  return (
    <div className="si-ftw-train__info-icons" aria-label="FTW AOI training summary">
      {items.map(item => (
        <span
          key={item.key}
          className={`si-ftw-train__info-icon${item.accent ? ' si-ftw-train__info-icon--accent' : ''}${item.live ? ' si-ftw-train__info-icon--live' : ''}`}
          title={item.label}
          aria-label={item.label}
        >
          <i className={item.icon} aria-hidden />
        </span>
      ))}
    </div>
  )
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

  useEffect(() => {
    pruneStaleFtwAoiSessions([session.aoiKey])
  }, [session.aoiKey])

  const chartBundles = useMemo((): AoiChartBundle[] => {
    const byKey = new Map<string, AoiChartBundle>()
    const persisted = listChartableFtwAoiSessions(session.aoiKey)
    const all = persisted.some(s => s.aoiKey === session.aoiKey)
      ? persisted.map(s => (s.aoiKey === session.aoiKey ? session : s))
      : [...persisted, session]
    const rows = all.filter(
      s => isFtwAoiSessionChartable(s) || s.aoiKey === session.aoiKey,
    )
    for (const row of rows) {
      const bundle = ftwSessionToChartBundle(row)
      const lrFinder = resolveLrFinderForAoi({
        stored: row.lrFinder,
        sampleCount: row.dataset?.total ?? 0,
        score: row.iou ?? row.f1 ?? null,
      })
      byKey.set(row.aoiKey, {
        ...bundle,
        lrFinderLrs: lrFinder?.lrs ?? bundle.lrFinderLrs,
        lrFinderLosses: lrFinder?.losses ?? bundle.lrFinderLosses,
        optimalLr: row.optimalLr ?? lrFinder?.optimal_lr ?? bundle.optimalLr ?? null,
      })
    }
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
        <FtwTrainInfoIcons
          session={session}
          optimalLr={optimalLr}
          totalSamples={totalSamples}
          trainingLive={trainingLive}
        />
        {session.epoch > 0 && session.epochs > 0 ? (
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
