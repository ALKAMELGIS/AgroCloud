export type AfbOperationProgressBarProps = {
  label: string
  pct: number
  className?: string
}

export function AfbOperationProgressBar({ label, pct, className = '' }: AfbOperationProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  const width = clamped <= 0 ? 6 : Math.max(8, clamped)

  return (
    <div
      className={`si-afb__op-progress${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <div className="si-afb__op-progress-head">
        <span className="si-afb__op-progress-label">{label}</span>
        <span className="si-afb__op-progress-pct">{clamped}%</span>
      </div>
      <div className="si-afb__progress">
        <div className="si-afb__progress-track">
          <div
            className="si-afb__progress-fill si-afb__progress-fill--export"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    </div>
  )
}
