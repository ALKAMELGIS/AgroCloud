import { detectOverfitting, type TrainingJobStatus } from '../../../../lib/trainingAi/trainingAiClient'
import { ConfusionMatrixHeatmap } from '../ConfusionMatrixHeatmap'
import { EpochDetailsTable } from '../EpochDetailsTable'
import { ValidationLinePlot, type PlotSeries } from '../ValidationLinePlot'
import '../AgriFieldBoundaryValidatePanel.css'

const TRAIN_COLOR = '#1f77b4'
const VAL_COLOR = '#ff7f0e'

export type ModelValidationPanelProps = {
  job: TrainingJobStatus | null
}

export function ModelValidationPanel({ job }: ModelValidationPanelProps) {
  if (!job || (job.status !== 'done' && !job.metrics)) {
    return (
      <div className="si-tai__section">
        <p className="si-tai__hint">Complete a training job to view validation metrics.</p>
      </div>
    )
  }

  const metrics = job.metrics || {}
  const history = job.loss_history || []
  const overfit = detectOverfitting(history)
  const failed = job.status === 'error'
  const statusCls = failed ? 'is-failed' : overfit ? 'is-warning' : 'is-stable'
  const statusLabel = failed ? '✕ Failed' : overfit ? '⚠ Warning' : '✓ Stable'
  const model = job.model
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

  return (
    <div className="si-tai__section">
      <div className="si-tai__row si-tai__row--h">
        <span className={`si-tai__status-badge ${statusCls}`}>{statusLabel}</span>
        {overfit ? <span className="si-tai__warn">Possible overfitting detected</span> : null}
      </div>
      <div className="si-tai__metrics">
        <div className="si-tai__metric">
          Training Loss
          <strong>{job.train_loss != null ? job.train_loss.toFixed(4) : '—'}</strong>
        </div>
        <div className="si-tai__metric">
          Validation Loss
          <strong>{job.val_loss != null ? job.val_loss.toFixed(4) : '—'}</strong>
        </div>
        <div className="si-tai__metric">
          Accuracy
          <strong>{metrics.accuracy != null ? `${(metrics.accuracy * 100).toFixed(1)}%` : '—'}</strong>
        </div>
        <div className="si-tai__metric">
          Precision
          <strong>{metrics.precision != null ? metrics.precision.toFixed(3) : '—'}</strong>
        </div>
        <div className="si-tai__metric">
          Recall
          <strong>{metrics.recall != null ? metrics.recall.toFixed(3) : '—'}</strong>
        </div>
        <div className="si-tai__metric">
          F1 Score
          <strong>{metrics.f1 != null ? metrics.f1.toFixed(3) : '—'}</strong>
        </div>
        <div className="si-tai__metric">
          IoU
          <strong>{metrics.iou != null ? metrics.iou.toFixed(3) : '—'}</strong>
        </div>
      </div>

      {history.length ? (
        <div className="si-tai__row">
          <span className="si-tai__label">Training and validation loss</span>
          <ValidationLinePlot
            series={lossSeries}
            xLabel="Epoch"
            yLabel="Loss"
            ariaLabel="Training and validation loss per epoch"
            height={168}
          />
        </div>
      ) : null}

      <div className="si-tai__row">
        <EpochDetailsTable rows={history} showEmpty />
      </div>

      {metrics.confusion_matrix?.length ? (
        <div className="si-tai__row">
          <span className="si-tai__label">Confusion matrix</span>
          <ConfusionMatrixHeatmap
            counts={metrics.confusion_matrix}
            labels={classNames}
            ariaLabel="Class confusion matrix heatmap from the validation split"
          />
        </div>
      ) : null}

      {model ? (
        <div className="si-tai__metrics">
          <div className="si-tai__metric">
            Model
            <strong>{model.model_name}</strong>
          </div>
          <div className="si-tai__metric">
            Version
            <strong>{model.model_version || model.model_id}</strong>
          </div>
          <div className="si-tai__metric">
            Samples
            <strong>{model.sample_count ?? '—'}</strong>
          </div>
          <div className="si-tai__metric">
            Classes
            <strong>{model.class_count ?? '—'}</strong>
          </div>
          <div className="si-tai__metric">
            Training date
            <strong>{model.training_date?.slice(0, 19) || '—'}</strong>
          </div>
          <div className="si-tai__metric">
            Epochs
            <strong>{model.epochs ?? job.epochs ?? '—'}</strong>
          </div>
        </div>
      ) : null}
    </div>
  )
}
