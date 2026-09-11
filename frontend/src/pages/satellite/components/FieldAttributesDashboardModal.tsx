import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export type FieldAttributesDashboardModalProps = {
  open: boolean
  onClose: () => void
  containerRef: RefObject<HTMLElement | null>
  title: string
  subtitle?: string
  children: ReactNode
}

const ZOOM_MIN = 0.85
const ZOOM_MAX = 2.75
const ZOOM_STEP = 0.15
const ZOOM_DEFAULT = 1.45

type Frame = { x: number; y: number; w: number; h: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function initialFrame(host: HTMLElement): Frame {
  const width = Math.max(560, Math.min(Math.round(host.clientWidth * 0.96), host.clientWidth - 12))
  const height = Math.max(480, Math.min(Math.round(host.clientHeight * 0.92), host.clientHeight - 12))
  return {
    x: Math.max(6, Math.round((host.clientWidth - width) / 2)),
    y: Math.max(6, Math.round((host.clientHeight - height) / 2)),
    w: width,
    h: height,
  }
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
  const [frame, setFrame] = useState<Frame | null>(null)
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  const [maximized, setMaximized] = useState(false)
  const savedFrameRef = useRef<Frame | null>(null)
  const dragRef = useRef<{
    kind: 'move' | 'resize'
    px: number
    py: number
    frame: Frame
  } | null>(null)

  useEffect(() => {
    if (!open) {
      setPortalHost(null)
      setFrame(null)
      setZoom(ZOOM_DEFAULT)
      setMaximized(false)
      savedFrameRef.current = null
      return
    }
    if (containerRef.current) {
      setPortalHost(containerRef.current)
      setFrame(initialFrame(containerRef.current))
      return
    }
    let cancelled = false
    let frameId = 0
    const waitForHost = () => {
      if (cancelled) return
      if (containerRef.current) {
        setPortalHost(containerRef.current)
        setFrame(initialFrame(containerRef.current))
        return
      }
      frameId = window.requestAnimationFrame(waitForHost)
    }
    frameId = window.requestAnimationFrame(waitForHost)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
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

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const host = containerRef.current
      if (!drag || !host) return
      const dx = e.clientX - drag.px
      const dy = e.clientY - drag.py
      if (drag.kind === 'move') {
        setFrame({
          ...drag.frame,
          x: clamp(drag.frame.x + dx, -drag.frame.w + 80, host.clientWidth - 48),
          y: clamp(drag.frame.y + dy, 0, host.clientHeight - 40),
        })
        return
      }
      setFrame({
        ...drag.frame,
        w: clamp(drag.frame.w + dx, 560, host.clientWidth - 8),
        h: clamp(drag.frame.h + dy, 480, host.clientHeight - 8),
      })
    }
    const onUp = () => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [containerRef])

  if (!open || !portalHost || !frame) return null

  const resetView = () => {
    setMaximized(false)
    savedFrameRef.current = null
    if (containerRef.current) setFrame(initialFrame(containerRef.current))
    setZoom(ZOOM_DEFAULT)
  }

  const toggleMaximize = () => {
    const host = containerRef.current
    if (!host) return
    if (maximized) {
      setFrame(savedFrameRef.current ?? initialFrame(host))
      setMaximized(false)
      savedFrameRef.current = null
      return
    }
    savedFrameRef.current = frame
    setFrame({ x: 4, y: 4, w: host.clientWidth - 8, h: host.clientHeight - 8 })
    setMaximized(true)
  }

  const startDrag = (kind: 'move' | 'resize') => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    if (maximized && kind === 'resize') return
    if (kind === 'move' && (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { kind, px: e.clientX, py: e.clientY, frame }
  }

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
      <div
        className={`si-field-dash-modal__panel${maximized ? ' si-field-dash-modal__panel--maximized' : ''}`}
        style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
      >
        <header
          className="si-field-dash-modal__header"
          onPointerDown={startDrag('move')}
          title="Drag to move the dashboard"
        >
          <span className="si-field-dash-modal__icon" aria-hidden>
            <i className="fa-solid fa-chart-pie" />
          </span>
          <div className="si-field-dash-modal__titles">
            <h2 className="si-field-dash-modal__title">{title}</h2>
            {subtitle ? <p className="si-field-dash-modal__subtitle">{subtitle}</p> : null}
          </div>
          <div className="si-field-dash-modal__tools">
            <button
              type="button"
              className="si-field-dash-modal__tool"
              aria-label="Zoom out charts"
              title="Zoom out charts"
              disabled={zoom <= ZOOM_MIN + 0.001}
              onClick={() => setZoom(z => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100))}
            >
              <i className="fa-solid fa-magnifying-glass-minus" aria-hidden />
            </button>
            <span className="si-field-dash-modal__zoom" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              className="si-field-dash-modal__tool"
              aria-label="Zoom in charts"
              title="Zoom in charts"
              disabled={zoom >= ZOOM_MAX - 0.001}
              onClick={() => setZoom(z => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100))}
            >
              <i className="fa-solid fa-magnifying-glass-plus" aria-hidden />
            </button>
            <button
              type="button"
              className="si-field-dash-modal__tool"
              aria-label="Reset dashboard size and zoom"
              title="Reset size and zoom"
              onClick={resetView}
            >
              <i className="fa-solid fa-rotate-left" aria-hidden />
            </button>
            <button
              type="button"
              className="si-field-dash-modal__tool"
              aria-label={maximized ? 'Restore window size' : 'Maximize dashboard'}
              title={maximized ? 'Restore window size' : 'Maximize dashboard'}
              onClick={toggleMaximize}
            >
              <i className={`fa-solid ${maximized ? 'fa-compress' : 'fa-expand'}`} aria-hidden />
            </button>
            <button
              type="button"
              className="si-field-dash-modal__close"
              aria-label="Close dashboard"
              onClick={onClose}
            >
              <i className="fa-solid fa-xmark" aria-hidden />
            </button>
          </div>
        </header>
        <div className="si-field-dash-modal__body">
          <div className="si-field-dash-modal__zoom-host" style={{ zoom }}>
            {children}
          </div>
        </div>
        {!maximized ? (
          <button
            type="button"
            className="si-field-dash-modal__resize"
            aria-label="Resize dashboard window"
            title="Drag to resize window"
            onPointerDown={startDrag('resize')}
          />
        ) : null}
      </div>
    </div>,
    portalHost,
  )
}
