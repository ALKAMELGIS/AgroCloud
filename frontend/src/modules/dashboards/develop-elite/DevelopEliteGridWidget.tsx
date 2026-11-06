import type { ReactNode } from 'react'

type Props = {
  className?: string
  children: ReactNode
}

/** Grid card shell (drag handle is on the grid item chrome). */
export function DevelopEliteGridWidget({ className = '', children }: Props) {
  return (
    <div className={`develop-elite-grid-widget${className ? ` ${className}` : ''}`}>
      <div className="develop-elite-grid-widget__body">{children}</div>
    </div>
  )
}
