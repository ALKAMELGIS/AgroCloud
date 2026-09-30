import type { ReactNode } from 'react'

type AcpMapPanelProps = {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}

export function AcpMapPanel({ title, onClose, children, className }: AcpMapPanelProps) {
  return (
    <aside
      className={`acp-map-panel${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-label={title}
    >
      <header className="acp-map-panel__head">
        <span>{title}</span>
        <button type="button" className="acp-map-panel__close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </header>
      <div className="acp-map-panel__body">{children}</div>
    </aside>
  )
}
