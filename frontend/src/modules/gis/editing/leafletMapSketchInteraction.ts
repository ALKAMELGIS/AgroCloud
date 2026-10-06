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
