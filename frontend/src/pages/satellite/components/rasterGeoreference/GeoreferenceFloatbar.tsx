import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useMapOverlayIsolation } from '../../useMapOverlayIsolation'

type Pos = { left: number; top: number }

/**
 * Compact, draggable glass shell for the ArcGIS-style Georeference ribbon.
 * Drag from the grip / title area; tool buttons keep their own clicks.
 */
export function GeoreferenceFloatbar({
  children,
  compact = false,
}: {
  children: ReactNode
  /** Hug icon toolbar width (no full-map empty bar). */
  compact?: boolean
}) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    originLeft: number
    originTop: number
  } | null>(null)
  const isolation = useMapOverlayIsolation(true, { native: true })

  const clamp = useCallback((left: number, top: number): Pos => {
    const el = rootRef.current
    const w = el?.offsetWidth ?? 320
    const h = el?.offsetHeight ?? 40
    const maxL = Math.max(8, window.innerWidth - w - 8)
    const maxT = Math.max(8, window.innerHeight - h - 8)
    return {
      left: Math.min(maxL, Math.max(8, left)),
      top: Math.min(maxT, Math.max(8, top)),
    }
  }, [])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isolation.onPointerDown?.(e)
      const t = e.target as HTMLElement | null
      if (!t) return
      // Never steal clicks from tools / inputs.
      if (t.closest('button, a, input, select, textarea, .si-grb__ribbon')) return
      if (!t.closest('.si-grb-floatbar__drag, .si-grb__head')) return
      const el = rootRef.current
      if (!el) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const next = clamp(rect.left, rect.top)
      setPos(next)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originLeft: next.left,
        originTop: next.top,
      }
      el.setPointerCapture?.(e.pointerId)
      el.classList.add('is-dragging')
    },
    [clamp, isolation],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      setPos(
        clamp(d.originLeft + (e.clientX - d.startX), d.originTop + (e.clientY - d.startY)),
      )
    },
    [clamp],
  )

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    rootRef.current?.classList.remove('is-dragging')
    try {
      rootRef.current?.releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!pos) return
    const onResize = () => setPos(p => (p ? clamp(p.left, p.top) : p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [pos, clamp])

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node
      const isoRef = isolation.ref
      if (typeof isoRef === 'function') isoRef(node)
    },
    [isolation.ref],
  )

  const style: CSSProperties | undefined = pos
    ? { left: pos.left, top: pos.top, transform: 'none' }
    : undefined

  return (
    <div
      ref={setRefs}
      className={
        'si-grb-floatbar' +
        (compact ? ' si-grb-floatbar--compact' : '') +
        (pos ? ' si-grb-floatbar--free' : '')
      }
      dir="auto"
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onWheel={isolation.onWheel}
      onClick={isolation.onClick}
      onDoubleClick={isolation.onDoubleClick}
      onContextMenu={isolation.onContextMenu}
      onMouseDown={isolation.onMouseDown}
      onMouseUp={isolation.onMouseUp}
      onTouchStart={isolation.onTouchStart}
      onTouchMove={isolation.onTouchMove}
    >
      <span className="si-grb-floatbar__drag" title="Drag to move" aria-label="Drag toolbar">
        <i className="fa-solid fa-grip-vertical" aria-hidden />
      </span>
      {children}
    </div>
  )
}
