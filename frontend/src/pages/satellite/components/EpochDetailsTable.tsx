/**
 * Per-epoch training record: losses, accuracies, LR, wall time and extra metrics.
 * Reads real trainer history — never invents rows.
 */

import { useMemo, useState, type ReactNode } from 'react'
import {
  analyzeTrainingHistory,
  normalizeEpochHistory,
  readEpochLearningRate,
  readEpochTrainAccuracy,
  readEpochValAccuracy,
  type TrainingHistoryAnalysis,
} from '../../../lib/trainingAi/analyzeTrainingHistory'
import type { TrainingEpochRecord } from '../../../lib/trainingAi/trainingAiClient'

export type EpochDetailRow = TrainingEpochRecord

export type EpochDetailsTableProps = {
  rows: EpochDetailRow[]
  /** Metric keys to print; defaults to leftover numeric metrics on the rows. */
  metricKeys?: string[]
  maxRows?: number
  /** When true, render the shell even if there is no history yet. */
  showEmpty?: boolean
  /** Start expanded (default true). */
  defaultOpen?: boolean
  /** Show best-epoch / trend summary below the table (default true). */
  showAnalysis?: boolean
  /** Override the empty-state cell when there is no history yet. */
  emptyMessage?: ReactNode
}

/** Metrics already shown as dedicated columns, or too large for the cell. */
const SKIP_METRIC_KEYS = new Set([
  'confusion_matrix',
  'class_names',
  'train_loss',
  'val_loss',
  'epoch',
  'seconds',
  'learning_rate',
  'train_accuracy',
  'val_accuracy',
  'accuracy',
])

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

function formatLoss(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1000) return value.toFixed(3)
  return value.toFixed(4)
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(2)}%`
}

function formatLr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  if (Math.abs(value) < 0.001) return value.toExponential(2)
  return value.toFixed(6)
}

function formatMetric(value: unknown): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    if (Math.abs(value) > 0 && Math.abs(value) < 1) return value.toFixed(6)
    return value.toFixed(4)
  }
  return String(value)
}

function trendTone(trend: TrainingHistoryAnalysis['trend']): string {
  if (trend === 'improving') return 'positive'
  if (trend === 'overfitting' || trend === 'degrading') return 'warning'
  return 'neutral'
}

function AnalysisStrip({ analysis }: { analysis: TrainingHistoryAnalysis }) {
  const tone = trendTone(analysis.trend)
  const items: Array<{
    key: string
    icon: string
    label: string
    tone?: 'positive' | 'warning' | 'neutral'
  }> = [
    {
      key: 'best',
      icon: 'fa-solid fa-trophy',
      label: `Best epoch — ${analysis.bestEpoch ?? '—'}`,
      tone: 'positive',
    },
    {
      key: 'loss',
      icon: 'fa-solid fa-chart-line',
      label: `Lowest val loss — ${formatLoss(analysis.lowestValLoss)}`,
    },
    {
      key: 'acc',
      icon: 'fa-solid fa-bullseye',
      label: `Highest val acc — ${formatPct(analysis.highestValAccuracy)}`,
      tone: 'positive',
    },
    {
      key: 'trend',
      icon:
        tone === 'positive'
          ? 'fa-solid fa-arrow-trend-up'
          : tone === 'warning'
            ? 'fa-solid fa-triangle-exclamation'
            : 'fa-solid fa-minus',
      label: `Trend — ${analysis.trendLabel}`,
      tone: tone === 'positive' ? 'positive' : tone === 'warning' ? 'warning' : 'neutral',
    },
    {
      key: 'gap',
      icon: 'fa-solid fa-scale-balanced',
      label: `Final train vs val — ${analysis.gapLabel}`,
    },
  ]

  return (
    <div
      className={`si-epochs__analysis is-${analysis.trend}`}
      aria-label="Training analysis"
    >
      <div className="si-epochs__analysis-icons" role="list" aria-label="Training summary metrics">
        {items.map(item => (
          <span
            key={item.key}
            role="listitem"
            className={`si-epochs__analysis-icon${item.tone ? ` is-${item.tone}` : ''}`}
            title={item.label}
            aria-label={item.label}
          >
            <i className={item.icon} aria-hidden />
          </span>
        ))}
      </div>
    </div>
  )
}

const DEFAULT_EMPTY_MESSAGE = (
  <>
    No epoch history yet — run Train Model in Training &amp; AI. Results appear here
    automatically from the real loss curve.
  </>
)

export function EpochDetailsTable({
  rows,
  metricKeys,
  maxRows = 200,
  showEmpty = false,
  defaultOpen = true,
  showAnalysis = true,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
}: EpochDetailsTableProps) {
  const [open, setOpen] = useState(defaultOpen)
  const list = useMemo(() => normalizeEpochHistory(rows), [rows])
  const analysis = useMemo(() => analyzeTrainingHistory(list), [list])
  if (!list.length && !showEmpty) return null
  const visible = list.slice(-maxRows)

  const keys =
    metricKeys ??
    [
      ...new Set(
        visible.flatMap(r =>
          Object.entries(r.metrics || {})
            .filter(([k, v]) => !SKIP_METRIC_KEYS.has(k) && (typeof v === 'number' || typeof v === 'string'))
            .map(([k]) => k),
        ),
      ),
    ]

  return (
    <details
      className="si-epochs"
      open={open}
      onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="si-epochs__summary">
        Epochs Details
        {list.length ? (
          <span className="si-epochs__count">{list.length} epochs</span>
        ) : null}
      </summary>
      <div className="si-afbv__table-scroll si-epochs__scroll">
        <table className="si-afbv__table si-epochs__table">
          <thead>
            <tr>
              <th scope="col">Epoch</th>
              <th scope="col">Training Loss</th>
              <th scope="col">Validation Loss</th>
              <th scope="col">Training Acc</th>
              <th scope="col">Validation Acc</th>
              <th scope="col">Learning Rate</th>
              <th scope="col">Time</th>
              <th scope="col">Other Metrics</th>
            </tr>
          </thead>
          <tbody>
            {visible.length ? (
              visible.map((row, idx) => {
                const isBest = analysis?.bestEpoch === row.epoch
                return (
                  <tr
                    key={row.epoch}
                    className={[idx % 2 ? 'is-alt' : '', isBest ? 'is-best' : ''].filter(Boolean).join(' ') || undefined}
                  >
                    <th scope="row">
                      {row.epoch}
                      {isBest ? <span className="si-epochs__best-tag"> best</span> : null}
                    </th>
                    <td>{formatLoss(row.train_loss)}</td>
                    <td>{formatLoss(row.val_loss)}</td>
                    <td>{formatPct(readEpochTrainAccuracy(row))}</td>
                    <td>{formatPct(readEpochValAccuracy(row))}</td>
                    <td>{formatLr(readEpochLearningRate(row))}</td>
                    <td>{formatDuration(row.seconds)}</td>
                    <td className="si-epochs__metrics">
                      {keys.length
                        ? keys.map(k => `"${k}": ${formatMetric(row.metrics?.[k])}`).join(', ')
                        : '—'}
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr className="is-empty">
                <td colSpan={8}>{emptyMessage}</td>
              </tr>
            )}
          </tbody>
        </table>
        {list.length > visible.length ? (
          <p className="si-afb__hint si-epochs__hint">
            Showing the last {visible.length} of {list.length} epochs.
          </p>
        ) : null}
      </div>
      {showAnalysis && analysis ? <AnalysisStrip analysis={analysis} /> : null}
    </details>
  )
}
