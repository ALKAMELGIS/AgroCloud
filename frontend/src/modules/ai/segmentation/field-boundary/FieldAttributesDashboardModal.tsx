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
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.1
const ZOOM_DEFAULT = 1
const ZOOM_DEFAULT_COMPACT = 0.92

/** Professional floating panel — not full-map takeover. */
const PANEL_MAX_WIDTH = 1024
const PANEL_MAX_HEIGHT = 760
const PANEL_WIDTH_RATIO = 0.78
const PANEL_HEIGHT_RATIO = 0.82
const PANEL_MARGIN = 14

type Frame = { x: number; y: number; w: number; h: number }

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function frameLimits(host: HTMLElement) {
  const pad = 8
  const maxW = Math.max(240, host.clientWidth - pad)
  const maxH = Math.max(240, host.clientHeight - pad)
  const minW = Math.min(420, Math.max(280, maxW))
  const minH = Math.min(360, Math.max(260, maxH))
  return { minW, minH, maxW, maxH, pad }
}

function defaultZoomForHost(host: HTMLElement) {
  return host.clientWidth < 720 || host.clientHeight < 520 ? ZOOM_DEFAULT_COMPACT : ZOOM_DEFAULT
}

function initialFrame(host: HTMLElement): Frame {
  const { minW, minH, maxW, maxH } = frameLimits(host)
  const width = clamp(
    Math.min(PANEL_MAX_WIDTH, Math.round(host.clientWidth * PANEL_WIDTH_RATIO)),
    minW,
    maxW,
  )
  const height = clamp(
    Math.min(PANEL_MAX_HEIGHT, Math.round(host.clientHeight * PANEL_HEIGHT_RATIO)),
    minH,
    maxH,
  )
  const x = clamp(
    Math.round((host.clientWidth - width) / 2),
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, host.clientWidth - width - PANEL_MARGIN),
  )
  const y = clamp(
    PANEL_MARGIN,
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, host.clientHeight - height - PANEL_MARGIN),
  )
  return { x, y, w: width, h: height }
}

function clampFrameToHost(frame: Frame, host: HTMLElement): Frame {
  const { minW, minH, maxW, maxH } = frameLimits(host)
  const w = clamp(frame.w, minW, maxW)
  const h = clamp(frame.h, minH, maxH)
  return {
    w,
    h,
    x: clamp(frame.x, 0, Math.max(0, host.clientWidth - w)),
    y: clamp(frame.y, 0, Math.max(0, host.clientHeight - h)),
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
    pointerId: number
  } | null>(null)
  const captureTargetRef = useRef<HTMLElement | null>(null)
  const modalRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)

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
      setZoom(defaultZoomForHost(containerRef.current))
      return
    }
    let cancelled = false
    let frameId = 0
    const waitForHost = () => {
      if (cancelled) return
      if (containerRef.current) {
        setPortalHost(containerRef.current)
        setFrame(initialFrame(containerRef.current))
        setZoom(defaultZoomForHost(containerRef.current))
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

  /** Map wheel / drag must not steal input while the dashboard modal is open. */
  useEffect(() => {
    const host = portalHost
    if (!open || !host) return
    host.classList.add('si-map-container--field-dash-modal-open')
    return () => host.classList.remove('si-map-container--field-dash-modal-open')
  }, [open, portalHost])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus({ preventScroll: true })
  }, [open, frame])

  useEffect(() => {
    if (!open) return
    const onWheelCapture = (e: WheelEvent) => {
      const modal = modalRef.current
      if (!modal?.contains(e.target as Node)) return
      e.stopPropagation()
      e.stopImmediatePropagation()
      const panel = panelRef.current
      const body = bodyRef.current
      if (!panel?.contains(e.target as Node)) {
        e.preventDefault()
        return
      }
      if (!body) return
      const maxScroll = body.scrollHeight - body.clientHeight
      if (maxScroll <= 1) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      const next = clamp(body.scrollTop + e.deltaY, 0, maxScroll)
      body.scrollTop = next
    }
    document.addEventListener('wheel', onWheelCapture, { passive: false, capture: true })
    return () => document.removeEventListener('wheel', onWheelCapture, { capture: true })
  }, [open])

  useEffect(() => {
    if (!open || maximized) return
    const host = containerRef.current
    if (!host) return
    const ro = new ResizeObserver(() => {
      setFrame(prev => (prev ? clampFrameToHost(prev, host) : prev))
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [open, maximized, containerRef])

  const endDrag = (pointerId?: number) => {
    const target = captureTargetRef.current
    if (target && pointerId != null && target.hasPointerCapture(pointerId)) {
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* already released */
      }
    }
    captureTargetRef.current = null
    dragRef.current = null
    document.body.style.removeProperty('user-select')
    document.body.style.removeProperty('cursor')
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current
      const host = containerRef.current
      if (!drag || !host) return
      if (e.pointerId !== drag.pointerId) return
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
      const { minW, minH, maxW, maxH } = frameLimits(host)
      setFrame({
        ...drag.frame,
        w: clamp(drag.frame.w + dx, minW, maxW),
        h: clamp(drag.frame.h + dy, minH, maxH),
      })
    }
    const onEnd = (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      if (e.pointerId !== drag.pointerId) return
      endDrag(e.pointerId)
    }
    const onBlur = () => endDrag()
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
      window.removeEventListener('blur', onBlur)
      endDrag()
    }
  }, [containerRef])

  if (!open || !portalHost || !frame) return null

  const resetView = () => {
    setMaximized(false)
    savedFrameRef.current = null
    if (containerRef.current) setFrame(initialFrame(containerRef.current))
    setZoom(containerRef.current ? defaultZoomForHost(containerRef.current) : ZOOM_DEFAULT)
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
    const { pad, maxW, maxH } = frameLimits(host)
    setFrame({ x: pad / 2, y: pad / 2, w: maxW, h: maxH })
    setMaximized(true)
  }

  const startDrag = (kind: 'move' | 'resize') => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    if (maximized && kind === 'resize') return
    if (kind === 'move' && (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    e.stopPropagation()
    const target = e.currentTarget
    captureTargetRef.current = target
    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    dragRef.current = {
      kind,
      px: e.clientX,
      py: e.clientY,
      frame: { ...frame },
      pointerId: e.pointerId,
    }
    document.body.style.userSelect = 'none'
    document.body.style.cursor = kind === 'resize' ? 'nwse-resize' : 'grabbing'
  }

  return createPortal(
    <div
      ref={modalRef}
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
        ref={panelRef}
        tabIndex={-1}
        className={`si-field-dash-modal__panel${maximized ? ' si-field-dash-modal__panel--maximized' : ''}`}
        style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
      >
        <header
          className="si-field-dash-modal__header"
          onPointerDown={startDrag('move')}
          onPointerUp={e => endDrag(e.pointerId)}
          onPointerCancel={e => endDrag(e.pointerId)}
          onLostPointerCapture={e => endDrag(e.pointerId)}
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
        <div ref={bodyRef} className="si-field-dash-modal__body">
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
            onPointerUp={e => endDrag(e.pointerId)}
            onPointerCancel={e => endDrag(e.pointerId)}
            onLostPointerCapture={e => endDrag(e.pointerId)}
          />
        ) : null}
      </div>
    </div>,
    portalHost,
  )
}
