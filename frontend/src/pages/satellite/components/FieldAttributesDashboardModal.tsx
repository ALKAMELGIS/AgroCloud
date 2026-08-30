import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export type FieldAttributesDashboardModalProps = {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
  title: string
  subtitle?: string
  children: ReactNode
}

export function FieldAttributesDashboardModal({
  open,
  onClose,
  containerRef,
  title,
  subtitle,
  children,
}: FieldAttributesDashboardModalProps) {
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      setPortalHost(null)
      return
    }
    if (containerRef.current) {
      setPortalHost(containerRef.current)
      return
    }
    let cancelled = false
    let frame = 0
    const waitForHost = () => {
      if (cancelled) return
      if (containerRef.current) {
        setPortalHost(containerRef.current)
        return
      }
      frame = window.requestAnimationFrame(waitForHost)
    }
    frame = window.requestAnimationFrame(waitForHost)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [open, containerRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !portalHost) return null

  return createPortal(
    <div
      className="si-field-dash-modal"
      id="si-field-attributes-dashboard"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        className="si-field-dash-modal__backdrop"
        aria-label="Close dashboard"
        onClick={onClose}
      />
      <div className="si-field-dash-modal__panel">
        <header className="si-field-dash-modal__header">
          <span className="si-field-dash-modal__icon" aria-hidden>
            <i className="fa-solid fa-chart-pie" />
          </span>
          <div className="si-field-dash-modal__titles">
            <h2 className="si-field-dash-modal__title">{title}</h2>
            {subtitle ? <p className="si-field-dash-modal__subtitle">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="si-field-dash-modal__close"
            aria-label="Close dashboard"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>
        <div className="si-field-dash-modal__body">{children}</div>
      </div>
    </div>,
    portalHost,
  )
}
