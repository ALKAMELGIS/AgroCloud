import L from 'leaflet'

const SKETCH_CLASS = 'develop-elite-map--drawing-sketch'
const SKETCH_TOUCH_BLOCK_KEY = '__agroSketchTouchMoveBlock'

type LeafletMapWithTap = L.Map & { tap?: { disable(): void; enable(): void } }

function blockSketchTouchScroll(container: HTMLElement): void {
  if ((container as HTMLElement & Record<string, unknown>)[SKETCH_TOUCH_BLOCK_KEY]) return
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 1) event.preventDefault()
  }
  container.addEventListener('touchmove', onTouchMove, { passive: false })
  ;(container as HTMLElement & Record<string, unknown>)[SKETCH_TOUCH_BLOCK_KEY] = onTouchMove
}

function unblockSketchTouchScroll(container: HTMLElement): void {
  const handler = (container as HTMLElement & Record<string, unknown>)[SKETCH_TOUCH_BLOCK_KEY] as
    | ((event: TouchEvent) => void)
    | undefined
  if (!handler) return
  container.removeEventListener('touchmove', handler)
  delete (container as HTMLElement & Record<string, unknown>)[SKETCH_TOUCH_BLOCK_KEY]
}

/** Suspend pan/zoom so circle/rectangle sketch receives touch drags (Develop Elite + GIS). */
export function lockLeafletMapForSketch(map: L.Map): void {
  try {
    map.dragging.disable()
    map.touchZoom.disable()
    map.doubleClickZoom.disable()
    map.boxZoom.disable()
    map.scrollWheelZoom.disable()
    map.keyboard.disable()
    const tap = (map as LeafletMapWithTap).tap
    tap?.disable?.()
  } catch {
    /* map teardown */
  }
  try {
    blockSketchTouchScroll(map.getContainer())
  } catch {
    /* map teardown */
  }
  L.DomUtil.addClass(map.getContainer(), SKETCH_CLASS)
}

export function unlockLeafletMapForSketch(map: L.Map): void {
  try {
    map.dragging.enable()
    map.touchZoom.enable()
    map.doubleClickZoom.enable()
    map.boxZoom.enable()
    map.scrollWheelZoom.enable()
    map.keyboard.enable()
    const tap = (map as LeafletMapWithTap).tap
    tap?.enable?.()
  } catch {
    /* map teardown */
  }
  try {
    unblockSketchTouchScroll(map.getContainer())
  } catch {
    /* map teardown */
  }
  L.DomUtil.removeClass(map.getContainer(), SKETCH_CLASS)
}

type LeafletDraggableLike = {
  _dragging?: boolean
  _moved?: boolean
  _onUp?: (event: Event) => void
  finishDrag?: () => void
}

/** Clear stuck leaflet-grabbing / pointer-down after sketch teardown or close-draw. */
export function releaseLeafletMapPointerState(map: L.Map): void {
  const container = map.getContainer()
  if (!container?.isConnected) return

  L.DomUtil.removeClass(container, 'leaflet-grabbing')
  L.DomUtil.removeClass(container, 'leaflet-dragging')
  L.DomUtil.removeClass(container, 'crosshair-cursor')

  try {
    const dragging = map.dragging as L.Handler & { _draggable?: LeafletDraggableLike }
    const draggable = dragging?._draggable
    if (draggable?._dragging) {
      try {
        if (typeof draggable.finishDrag === 'function') {
          draggable.finishDrag()
        } else {
          draggable._onUp?.({ type: 'mouseup', target: container } as Event)
        }
      } catch {
        draggable._dragging = false
        draggable._moved = false
      }
    }
  } catch {
    /* dragging handler teardown */
  }

  try {
    if (typeof PointerEvent !== 'undefined') {
      container.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' }),
      )
      container.dispatchEvent(
        new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse' }),
      )
    }
    container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }))
  } catch {
    /* synthetic events unsupported */
  }

  try {
    if (document.pointerLockElement === container) {
      document.exitPointerLock()
    }
  } catch {
    /* pointer lock */
  }
}

export const DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT = 'develop-elite-map:reset-interaction-chrome'

/** End draw/sketch mode and restore normal map pan cursor (no stuck grab). */
export function finishLeafletMapSketchSession(map: L.Map): void {
  unlockLeafletMapForSketch(map)
  releaseLeafletMapPointerState(map)
  try {
    const container = map.getContainer()
    L.DomUtil.removeClass(container, 'develop-elite-map--interacting')
    L.DomUtil.removeClass(container, 'develop-elite-map--zooming')
    window.dispatchEvent(new CustomEvent(DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT))
  } catch {
    /* map teardown */
  }
}

export function isLeafletSketchInteractionLocked(map: L.Map): boolean {
  return L.DomUtil.hasClass(map.getContainer(), SKETCH_CLASS)
}

/** Avoid Leaflet `_leaflet_pos` crashes during sketch, teardown, or 0-size layout. */
export function safeInvalidateLeafletMapSize(
  map: L.Map | null | undefined,
  options?: L.ZoomPanOptions,
): void {
  if (!map) return
  try {
    const loaded = (map as L.Map & { _loaded?: boolean })._loaded
    if (loaded === false) return
    const container = map.getContainer()
    if (!container?.isConnected) return
    if (isLeafletSketchInteractionLocked(map)) return
    map.invalidateSize(options ?? { animate: false })
  } catch {
    /* mid-zoom or pane teardown */
  }
}
