import { useCallback, useEffect, useMemo, useRef } from 'react'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from 'react'

type AnyOverlayEvent =
  | ReactPointerEvent
  | ReactMouseEvent
  | ReactTouchEvent
  | ReactWheelEvent

export type MapOverlayIsolationProps = {
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  onMouseDown: (e: ReactMouseEvent) => void
  onMouseUp: (e: ReactMouseEvent) => void
  onClick: (e: ReactMouseEvent) => void
  onDoubleClick: (e: ReactMouseEvent) => void
  onContextMenu: (e: ReactMouseEvent) => void
  onWheel: (e: ReactWheelEvent) => void
  onTouchStart: (e: ReactTouchEvent) => void
  onTouchMove: (e: ReactTouchEvent) => void
  /** Present only in `native` mode — attach to the panel root for full isolation. */
  ref?: (node: HTMLElement | null) => void
}

const NOOP_PROPS = {} as Partial<MapOverlayIsolationProps>

export type MapOverlayIsolationOptions = {
  /**
   * Stop the map-driving events with NATIVE DOM listeners (bubble phase) on the
   * panel root, not just React synthetic handlers.
   *
   * This is required when the panel is rendered INSIDE the Mapbox canvas
   * container (e.g. portaled via `MapToolsDock`): Mapbox binds its pan / zoom /
   * rotate handlers with native `addEventListener` on the canvas container, an
   * ancestor of the panel. React 18 delegates synthetic events at the React
   * root — also an ancestor of the canvas container — so a synthetic
   * `stopPropagation()` fires only AFTER the event has already bubbled through
   * the canvas container and triggered Mapbox. A native listener on the panel
   * itself stops the event before it ever reaches Mapbox.
   */
  native?: boolean
}

/**
 * Only the map-driving gestures are stopped natively. We deliberately do NOT
 * touch `click`, `keydown`, `input`, or `change`, so the panel's own buttons,
 * inputs, sliders and dropdowns keep receiving them through React's delegated
 * event system. We never call `preventDefault()`, so native scrolling, text
 * selection, focus and range-slider dragging inside the panel still work.
 */
const NATIVE_ISOLATED_EVENTS = [
  'pointerdown',
  'mousedown',
  'touchstart',
  'touchmove',
  'wheel',
  'dblclick',
  'contextmenu',
] as const

/**
 * Isolate a floating panel that sits over the map canvas.
 *
 * Returns a set of event-handler props (and, in `native` mode, a `ref`) to
 * spread onto the panel root. Every pointer / mouse / touch / wheel interaction
 * that bubbles up to the root has its propagation stopped, so it never reaches
 * a map-level handler — no pan, zoom, click, or scroll-zoom passes through to
 * the map beneath. The panel's own buttons, menus, sliders and scrolling keep
 * working: the event fires on the inner target first and is only stopped once
 * it reaches the root, and we never call `preventDefault()`.
 */
export function useMapOverlayIsolation(
  enabled = true,
  options?: MapOverlayIsolationOptions,
): Partial<MapOverlayIsolationProps> {
  const native = options?.native ?? false

  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const nodeRef = useRef<HTMLElement | null>(null)
  const stopNativeRef = useRef<(e: Event) => void>(e => {
    if (!enabledRef.current) return
    e.stopPropagation()
  })

  const detach = useCallback((node: HTMLElement) => {
    for (const type of NATIVE_ISOLATED_EVENTS) {
      node.removeEventListener(type, stopNativeRef.current)
    }
  }, [])

  const attach = useCallback((node: HTMLElement) => {
    for (const type of NATIVE_ISOLATED_EVENTS) {
      node.addEventListener(type, stopNativeRef.current)
    }
  }, [])

  const nativeRef = useCallback(
    (node: HTMLElement | null) => {
      if (nodeRef.current && nodeRef.current !== node) detach(nodeRef.current)
      nodeRef.current = node
      if (node) attach(node)
    },
    [attach, detach],
  )

  useEffect(() => {
    return () => {
      if (nodeRef.current) detach(nodeRef.current)
    }
  }, [detach])

  return useMemo(() => {
    if (!enabled) return native ? ({ ref: nativeRef } as Partial<MapOverlayIsolationProps>) : NOOP_PROPS
    const stop = (e: AnyOverlayEvent) => {
      e.stopPropagation()
    }
    const handlers: Partial<MapOverlayIsolationProps> = {
      onPointerDown: stop,
      onPointerUp: stop,
      onMouseDown: stop,
      onMouseUp: stop,
      onClick: stop,
      onDoubleClick: stop,
      onContextMenu: stop,
      onWheel: stop,
      onTouchStart: stop,
      onTouchMove: stop,
    }
    if (native) handlers.ref = nativeRef
    return handlers
  }, [enabled, native, nativeRef])
}
