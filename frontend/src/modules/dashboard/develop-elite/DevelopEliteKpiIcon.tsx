type Props = {
  cardId: string
  icon: string
  className?: string
}

/** Tree KPI — grape bunch (readable at dashboard KPI size). */
export function DevelopEliteTreeIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`develop-elite__kpi-icon develop-elite__kpi-icon--tree${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 28"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12.1 0.6c1.7-.15 3.15.85 3.55 2.15-.85.15-1.9 0-2.85-.55-.85.6-1.95.8-2.9.55.45-1.15 1.7-1.95 2.2-2.15z"
      />
      <path fill="currentColor" d="M11.15 2.35h1.7c.15.7.1 1.55 0 2.35h-1.7c-.1-.8-.15-1.65 0-2.35z" />
      <circle cx="9.15" cy="8.05" r="2.15" fill="currentColor" />
      <circle cx="14.85" cy="8.05" r="2.15" fill="currentColor" />
      <circle cx="6.35" cy="12.35" r="2.15" fill="currentColor" />
      <circle cx="12" cy="11.85" r="2.25" fill="currentColor" />
      <circle cx="17.65" cy="12.35" r="2.15" fill="currentColor" />
      <circle cx="9.15" cy="16.7" r="2.15" fill="currentColor" />
      <circle cx="14.85" cy="16.7" r="2.15" fill="currentColor" />
      <circle cx="12" cy="21.15" r="2.2" fill="currentColor" />
    </svg>
  )
}

/** VIP Farm KPI — green shield with a dark star. */
export function DevelopEliteVipFarmIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`develop-elite__kpi-icon develop-elite__kpi-icon--vip${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 28"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 1.4 21.2 5.1v7.6c0 6.1-3.8 10.4-9.2 12.9C6.6 23.1 2.8 18.8 2.8 12.7V5.1L12 1.4z"
      />
      <path
        fill="#04140c"
        d="M12 7.15l1.55 3.55 3.85.35-2.92 2.52.88 3.76L12 15.4l-3.36 1.93.88-3.76-2.92-2.52 3.85-.35L12 7.15z"
      />
    </svg>
  )
}

/** Total Projects — GIS portfolio: stacked site cards + location pins (readable at KPI size). */
export function DevelopEliteTotalProjectsIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`develop-elite__kpi-icon develop-elite__kpi-icon--projects${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 28"
      aria-hidden
    >
      <path
        fill="currentColor"
        opacity="0.32"
        d="M4.5 8.2h13.8l1.6 1.9H20c.9 0 1.6.7 1.6 1.6v12.4c0 .7-.5 1.2-1.2 1.1L12 22.1l-8.4 2.1c-.7.2-1.2-.3-1.2-1.1V8.2z"
      />
      <path
        fill="currentColor"
        d="M2.8 6.4h14.4l2 2.4H20.8c.9 0 1.6.7 1.6 1.6v13.2c0 .8-.6 1.3-1.3 1.1L12 21.2 3.7 23.3c-.7.2-1.3-.3-1.3-1.1V6.4z"
      />
      <path
        fill="currentColor"
        opacity="0.45"
        d="M6.2 12.8h11.6v1.05H6.2zm0 2.6h11.6v1.05H6.2zm0 2.6h7.4v1.05H6.2z"
      />
      <path
        fill="#04140c"
        d="M9.2 8.9c-1.45 0-2.62 1.12-2.62 2.5 0 1.85 2.62 4.55 2.62 4.55s2.62-2.7 2.62-4.55c0-1.38-1.17-2.5-2.62-2.5zm0 1.35a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3z"
      />
      <path
        fill="#04140c"
        d="M14.8 10.2c-1.62 0-2.93 1.25-2.93 2.8 0 2.05 2.93 5.05 2.93 5.05s2.93-3 2.93-5.05c0-1.55-1.31-2.8-2.93-2.8zm0 1.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z"
      />
    </svg>
  )
}

/** @deprecated Use {@link DevelopEliteTotalProjectsIcon}. */
export const DevelopEliteTotalProjectsCoralIcon = DevelopEliteTotalProjectsIcon

export function DevelopEliteKpiIcon({ cardId, icon, className = '' }: Props) {
  if (cardId === 'tree') {
    return <DevelopEliteTreeIcon className={className} />
  }
  if (cardId === 'vip-farm') {
    return <DevelopEliteVipFarmIcon className={className} />
  }
  if (cardId === 'total-projects') {
    return <DevelopEliteTotalProjectsIcon className={className} />
  }
  return <i className={`fa-solid ${icon} develop-elite__kpi-icon${className ? ` ${className}` : ''}`} aria-hidden />
}
