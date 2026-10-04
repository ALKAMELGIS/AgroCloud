import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import type { DevelopEliteWidgetPosition } from './developEliteLayoutConfig'
import {
  snapDevelopElitePercent,
  useDevelopEliteDrag,
} from './DevelopEliteDragContext'

type Props = {
  widgetId: string
  className?: string
  as?: ElementType
  children: ReactNode
  style?: CSSProperties
} & HTMLAttributes<HTMLElement>

function measureCanvasPosition(
  canvas: DOMRect,
  element: DOMRect,
): DevelopEliteWidgetPosition {
  return {
    xPct: ((element.left - canvas.left) / canvas.width) * 100,
    yPct: ((element.top - canvas.top) / canvas.height) * 100,
    widthPx: element.width,
    heightPx: element.height,
    zIndex: 50,
  }
}

export function DevelopEliteDraggableWidget({
  widgetId,
  className = '',
  as: Tag = 'div',
  children,
  style,
  ...rest
}: Props) {
  const drag = useDevelopEliteDrag()
  const hostRef = useRef<HTMLElement | null>(null)
  const livePosRef = useRef<DevelopEliteWidgetPosition | null>(null)
  const [livePos, setLivePos] = useState<DevelopEliteWidgetPosition | null>(null)
  const [dragging, setDragging] = useState(false)
  const [floatLayerReady, setFloatLayerReady] = useState(false)

  const saved = drag.widgetFloat[widgetId]
  const isFloated = Boolean(saved)

  useLayoutEffect(() => {
    setFloatLayerReady(Boolean(drag.floatLayerRef.current))
  }, [drag.floatLayerRef, saved, dragging])

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const canvas = drag.canvasRef.current
      const host = hostRef.current
      if (!canvas || !host) return

      const canvasRect = canvas.getBoundingClientRect()
      const hostRect = host.getBoundingClientRect()
      const start = saved ?? measureCanvasPosition(canvasRect, hostRect)

      livePosRef.current = start
      setLivePos(start)
      setDragging(true)
      document.body.classList.add('develop-elite--widget-dragging')

      const handle = e.currentTarget
      handle.setPointerCapture(e.pointerId)

      const pointerOffsetX = e.clientX - hostRect.left
      const pointerOffsetY = e.clientY - hostRect.top

      const onMove = (ev: PointerEvent) => {
        const c = canvas.getBoundingClientRect()
        const xPct = ((ev.clientX - pointerOffsetX - c.left) / c.width) * 100
        const yPct = ((ev.clientY - pointerOffsetY - c.top) / c.height) * 100
        const next = {
          xPct: Math.max(0, Math.min(98, xPct)),
          yPct: Math.max(0, Math.min(98, yPct)),
          widthPx: livePosRef.current?.widthPx ?? start.widthPx,
          heightPx: livePosRef.current?.heightPx ?? start.heightPx,
          zIndex: 80,
        }
        livePosRef.current = next
        setLivePos(next)
      }

      const onUp = (ev: PointerEvent) => {
        try {
          handle.releasePointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        setDragging(false)
        document.body.classList.remove('develop-elite--widget-dragging')

        const final = livePosRef.current ?? start
        const snapped: DevelopEliteWidgetPosition = {
          xPct: snapDevelopElitePercent(final.xPct, drag.snapGridPct),
          yPct: snapDevelopElitePercent(final.yPct, drag.snapGridPct),
          widthPx: final.widthPx,
          heightPx: final.heightPx,
          zIndex: final.zIndex ?? 50,
        }
        drag.setWidgetFloat(widgetId, snapped)
        livePosRef.current = null
        setLivePos(null)
        drag.persistFloat()
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)

      if (!saved) {
        drag.setWidgetFloat(widgetId, start)
      }
    },
    [drag, saved, widgetId],
  )

  const dockOnDoubleClick = useCallback(() => {
    drag.setWidgetFloat(widgetId, null)
    drag.persistFloat()
  }, [drag, widgetId])

  useEffect(() => {
    if (!dragging) return
    return () => document.body.classList.remove('develop-elite--widget-dragging')
  }, [dragging])

  const position = dragging && livePos ? livePos : saved

  const floatStyle: CSSProperties | undefined =
    isFloated && position
      ? {
          position: 'absolute',
          left: `${position.xPct}%`,
          top: `${position.yPct}%`,
          width: position.widthPx ? `${position.widthPx}px` : undefined,
          height: position.heightPx ? `${position.heightPx}px` : undefined,
          zIndex: position.zIndex ?? 50,
          maxWidth: '96vw',
        }
      : undefined

  const mergedStyle = { ...style, ...floatStyle }

  const inner = (
    <Tag
      ref={hostRef as never}
      className={`develop-elite-drag-widget${isFloated ? ' is-floated' : ''}${dragging ? ' is-dragging' : ''}${className ? ` ${className}` : ''}`}
      style={mergedStyle}
      {...rest}
    >
      <button
        type="button"
        className="develop-elite-drag-widget__handle"
        aria-label="Drag to move"
        title="Drag to move (double-click to dock)"
        onPointerDown={onHandlePointerDown}
        onDoubleClick={dockOnDoubleClick}
      >
        <i className="fa-solid fa-grip-vertical" aria-hidden />
      </button>
      {children}
    </Tag>
  )

  if (isFloated && floatLayerReady && drag.floatLayerRef.current) {
    return (
      <>
        <div className="develop-elite-drag-widget__flow-placeholder" aria-hidden />
        {createPortal(inner, drag.floatLayerRef.current)}
      </>
    )
  }

  if (isFloated) {
    return <div className="develop-elite-drag-widget__flow-placeholder" aria-hidden />
  }

  return inner
}
