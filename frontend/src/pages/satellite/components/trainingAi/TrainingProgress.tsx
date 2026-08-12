import type { TrainingJobStatus } from '../../../../lib/trainingAi/trainingAiClient'

export type TrainingProgressProps = {
  job: TrainingJobStatus | null
  busy: boolean
}

export function TrainingProgress({ job, busy }: TrainingProgressProps) {
  if (!busy && !job) return null
  const pct = Math.max(0, Math.min(100, Math.round(job?.progress ?? 0)))
  return (
    <div className="si-tai__section">
      <div className="si-tai__row si-tai__row--h">
        <span className="si-tai__label">
          {busy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> : null}{' '}
          {job?.stage || job?.status || 'Training…'}
        </span>
        <span className="si-tai__label">{pct}%</span>
      </div>
      <div className="si-tai__progress" aria-hidden>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="si-tai__metrics">
        <div className="si-tai__metric">
          Epoch
          <strong>
            {job?.epoch ?? 0} / {job?.epochs ?? '—'}
          </strong>
        </div>
        <div className="si-tai__metric">
          Status
          <strong>{job?.status || '—'}</strong>
        </div>
        <div className="si-tai__metric">
          Training Loss
          <strong>{job?.train_loss != null ? job.train_loss.toFixed(4) : '—'}</strong>
        </div>
        <div className="si-tai__metric">
          Validation Loss
          <strong>{job?.val_loss != null ? job.val_loss.toFixed(4) : '—'}</strong>
        </div>
      </div>
      {job?.error ? <p className="si-tai__error">{job.error}</p> : null}
    </div>
  )
}
