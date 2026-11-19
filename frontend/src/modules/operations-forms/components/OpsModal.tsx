import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Drawer slides in from the side (entry form); center is a dialog (import, report). */
  variant?: 'drawer' | 'center'
  closeLabel?: string
}

/** Accessible modal: Esc closes, focus moves inside and returns on close, background is inert to clicks. */
export function OpsModal({ title, subtitle, onClose, children, footer, variant = 'center', closeLabel = 'Close' }: Props) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = panelRef.current?.querySelector<HTMLElement>('input:not([readonly]), select, textarea, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      className={`ops-overlay${variant === 'center' ? ' ops-overlay--center' : ''}`}
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={panelRef} className="ops-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="ops-modal__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="ops-icon-btn" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
            <X aria-hidden />
          </button>
        </header>
        <div className="ops-modal__body">{children}</div>
        {footer ? <footer className="ops-modal__foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}
