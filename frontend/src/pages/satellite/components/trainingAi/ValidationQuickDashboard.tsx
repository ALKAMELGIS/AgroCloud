/**
 * Validation Quick Dashboard — floating, draggable, resizable lux black-glass
 * card that mirrors ModelValidationPanel metrics on the map canvas.
 */

import { useEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  detectOverfitting,
  type TrainingJobStatus,
} from '../../../../lib/trainingAi/trainingAiClient'
import { GisFloatingWorkspacePanel } from '../GisFloatingWorkspacePanel'
import { ConfusionMatrixHeatmap } from '../ConfusionMatrixHeatmap'
import { EpochDetailsTable } from '../EpochDetailsTable'
import { ValidationLinePlot, type PlotSeries } from '../ValidationLinePlot'
import './ValidationQuickDashboard.css'

const TRAIN_COLOR = '#38bdf8'
const VAL_COLOR = '#fbbf24'

export type ValidationQuickDashboardProps = {
  open: boolean
  onClose: () => void
  mapContainerRef: RefObject<HTMLElement | null>
  job: TrainingJobStatus | null
}

export function ValidationQuickDashboard({
  open,
  onClose,
  mapContainerRef,
  job,
}: ValidationQuickDashboardProps) {
  const [hostTick, setHostTick] = useState(0)
  useEffect(() => {
    if (!open) return
    if (mapContainerRef.current) {
      if (hostTick === 0) setHostTick(1)
      return
    }
    const id = window.requestAnimationFrame(() => setHostTick(n => n + 1))
    return () => window.cancelAnimationFrame(id)
  }, [open, mapContainerRef, hostTick])

  const host = mapContainerRef.current
  if (!open || !host) return null

  const metrics = job?.metrics || {}
  const history = job?.loss_history || []
  const overfit = detectOverfitting(history)
  const failed = job?.status === 'error'
  const statusCls = failed ? 'is-failed' : overfit ? 'is-warning' : 'is-stable'
  const statusLabel = !job
    ? 'No run'
    : failed
      ? '✕ Failed'
      : overfit
        ? '⚠ Warning'
        : '✓ Stable'
  const model = job?.model
  const lossSeries: PlotSeries[] = [
    {
      id: 'train',
      label: 'Train',
      color: TRAIN_COLOR,
      markers: history.length <= 30,
      points: history.map(h => ({ x: h.epoch, y: h.train_loss })),
    },
    {
      id: 'validation',
      label: 'Validation',
      color: VAL_COLOR,
      markers: history.length <= 30,
      points: history.map(h => ({ x: h.epoch, y: h.val_loss })),
    },
  ]
  const classNames =
    metrics.class_names?.length
      ? metrics.class_names
      : (metrics.confusion_matrix || []).map((_, i) => `Class ${i}`)

  const subtitle = [
    job?.status ? String(job.status) : null,
    model?.model_name || null,
    typeof job?.epochs === 'number' ? `${job.epochs} epochs` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const body = (
    <div className="si-tai-val-dash">
      <div className="si-tai-val-dash__head">
        <span className={`si-tai-val-dash__badge ${statusCls}`}>{statusLabel}</span>
        {overfit ? <span className="si-tai-val-dash__warn">Possible overfitting</span> : null}
      </div>

      {!job || (job.status !== 'done' && !job.metrics) ? (
        <p className="si-tai-val-dash__empty">Complete a training job to view validation metrics.</p>
      ) : (
        <>
          <div className="si-tai-val-dash__kpis" aria-label="Validation metrics">
            <div className="si-tai-val-dash__kpi">
              <span>Train loss</span>
              <strong>{job.train_loss != null ? job.train_loss.toFixed(4) : '—'}</strong>
            </div>
            <div className="si-tai-val-dash__kpi">
              <span>Val loss</span>
              <strong>{job.val_loss != null ? job.val_loss.toFixed(4) : '—'}</strong>
            </div>
            <div className="si-tai-val-dash__kpi">
              <span>Accuracy</span>
              <strong>
                {metrics.accuracy != null ? `${(metrics.accuracy * 100).toFixed(1)}%` : '—'}
              </strong>
            </div>
            <div className="si-tai-val-dash__kpi">
              <span>Precision</span>
              <strong>{metrics.precision != null ? metrics.precision.toFixed(3) : '—'}</strong>
            </div>
            <div className="si-tai-val-dash__kpi">
              <span>Recall</span>
              <strong>{metrics.recall != null ? metrics.recall.toFixed(3) : '—'}</strong>
            </div>
            <div className="si-tai-val-dash__kpi">
              <span>F1</span>
              <strong>{metrics.f1 != null ? metrics.f1.toFixed(3) : '—'}</strong>
            </div>
            <div className="si-tai-val-dash__kpi">
              <span>IoU</span>
              <strong>{metrics.iou != null ? metrics.iou.toFixed(3) : '—'}</strong>
            </div>
          </div>

          {history.length ? (
            <section className="si-tai-val-dash__card">
              <header className="si-tai-val-dash__card-head">
                <h4>Training &amp; validation loss</h4>
                <span>{history.length} epochs</span>
              </header>
              <ValidationLinePlot
                series={lossSeries}
                xLabel="Epoch"
                yLabel="Loss"
                ariaLabel="Training and validation loss per epoch"
                height={200}
              />
            </section>
          ) : null}

          <section className="si-tai-val-dash__card si-tai-val-dash__card--table">
            <EpochDetailsTable rows={history} showEmpty />
          </section>

          {metrics.confusion_matrix?.length ? (
            <section className="si-tai-val-dash__card">
              <header className="si-tai-val-dash__card-head">
                <h4>Confusion matrix</h4>
              </header>
              <ConfusionMatrixHeatmap
                counts={metrics.confusion_matrix}
                labels={classNames}
                ariaLabel="Class confusion matrix heatmap from the validation split"
              />
            </section>
          ) : null}

          {model ? (
            <div className="si-tai-val-dash__kpis si-tai-val-dash__kpis--meta" aria-label="Model details">
              <div className="si-tai-val-dash__kpi">
                <span>Model</span>
                <strong>{model.model_name}</strong>
              </div>
              <div className="si-tai-val-dash__kpi">
                <span>Version</span>
                <strong>{model.model_version || model.model_id}</strong>
              </div>
              <div className="si-tai-val-dash__kpi">
                <span>Samples</span>
                <strong>{model.sample_count ?? '—'}</strong>
              </div>
              <div className="si-tai-val-dash__kpi">
                <span>Classes</span>
                <strong>{model.class_count ?? '—'}</strong>
              </div>
              <div className="si-tai-val-dash__kpi">
                <span>Trained</span>
                <strong>{model.training_date?.slice(0, 19) || '—'}</strong>
              </div>
              <div className="si-tai-val-dash__kpi">
                <span>Epochs</span>
                <strong>{model.epochs ?? job.epochs ?? '—'}</strong>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )

  return createPortal(
    <GisFloatingWorkspacePanel
      open={open}
      onClose={onClose}
      containerRef={mapContainerRef}
      storageKey="si.tai.validationQuickDash.v1"
      panelId="si-tai-validation-quick-dash"
      title="Validation Quick Dashboard"
      subtitle={subtitle || 'Training performance'}
      layerIcon={<i className="fa-solid fa-chart-pie" aria-hidden />}
      defaultDock="float"
      defaultWidth={720}
      defaultHeight={540}
      minWidth={400}
      maxWidth={1100}
      minHeight={320}
      maxHeight={900}
    >
      {body}
    </GisFloatingWorkspacePanel>,
    host,
  )
}
