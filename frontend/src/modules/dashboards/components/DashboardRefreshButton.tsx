type Props = {
  onClick: () => void
  busy?: boolean
  disabled?: boolean
  /** Shown in tooltip when set, e.g. last successful refresh time. */
  lastUpdated?: Date | null
  className?: string
  title?: string
  'aria-label'?: string
}

function formatLastUpdated(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function dashboardRefreshTitle(lastUpdated?: Date | null, base = 'Refresh dashboard'): string {
  if (!lastUpdated) return base
  return `${base} · Updated ${formatLastUpdated(lastUpdated)}`
}

export function DashboardRefreshButton({
  onClick,
  busy = false,
  disabled,
  lastUpdated,
  className = '',
  title,
  'aria-label': ariaLabel = 'Refresh dashboard',
}: Props) {
  const resolvedTitle = title ?? dashboardRefreshTitle(lastUpdated)
  return (
    <button
      type="button"
      className={`dashboard-refresh-btn${busy ? ' is-spinning' : ''}${className ? ` ${className}` : ''}`}
      title={resolvedTitle}
      aria-label={ariaLabel}
      aria-busy={busy}
      disabled={disabled ?? busy}
      onClick={onClick}
    >
      <i className="fa-solid fa-rotate" aria-hidden />
    </button>
  )
}
