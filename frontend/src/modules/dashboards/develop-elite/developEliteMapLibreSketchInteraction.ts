import type { Map as MaplibreMap } from 'maplibre-gl'
import { DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT } from '@/modules/gis/editing/leafletMapSketchInteraction'

const SKETCH_CLASS = 'develop-elite-map--drawing-sketch'
const TOUCH_BLOCK_KEY = '__deMapLibreSketchTouchMoveBlock'

function blockSketchTouchScroll(container: HTMLElement): void {
  if ((container as HTMLElement & Record<string, unknown>)[TOUCH_BLOCK_KEY]) return
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 1) event.preventDefault()
  }
  container.addEventListener('touchmove', onTouchMove, { passive: false })
  ;(container as HTMLElement & Record<string, unknown>)[TOUCH_BLOCK_KEY] = onTouchMove
}

function unblockSketchTouchScroll(container: HTMLElement): void {
  const handler = (container as HTMLElement & Record<string, unknown>)[TOUCH_BLOCK_KEY] as
    | ((event: TouchEvent) => void)
    | undefined
  if (!handler) return
  container.removeEventListener('touchmove', handler)
  delete (container as HTMLElement & Record<string, unknown>)[TOUCH_BLOCK_KEY]
}

/** Suspend pan/zoom/orbit so circle/rectangle/polygon sketch gets touch drags (MapLibre). */
export function lockMapLibreForSketch(map: MaplibreMap): void {
  const container = map.getContainer()
  try {
    map.dragPan.disable()
    map.doubleClickZoom.disable()
    map.boxZoom.disable()
    map.touchZoomRotate.disable()
    map.scrollZoom.disable()
    ;(map as { touchPitch?: { disable?: () => void } }).touchPitch?.disable?.()
  } catch {
    /* style swap */
  }
  blockSketchTouchScroll(container)
  container.classList.add(SKETCH_CLASS)
}

export function unlockMapLibreForSketch(map: MaplibreMap): void {
  const container = map.getContainer()
  try {
    map.dragPan.enable()
    map.doubleClickZoom.enable()
    map.boxZoom.enable()
    map.touchZoomRotate.enable()
    map.scrollZoom.enable()
    ;(map as { touchPitch?: { enable?: () => void } }).touchPitch?.enable?.()
  } catch {
    /* style swap */
  }
  unblockSketchTouchScroll(container)
  container.classList.remove(SKETCH_CLASS)
}

export function finishMapLibreSketchSession(map: MaplibreMap | null | undefined): void {
  if (!map) return
  unlockMapLibreForSketch(map)
  try {
    map.getContainer().classList.remove('develop-elite-map--interacting', 'develop-elite-map--zooming')
    window.dispatchEvent(new Event(DEVELOP_ELITE_MAP_RESET_INTERACTION_EVENT))
  } catch {
    /* teardown */
  }
}

export function isMapLibreSketchInteractionLocked(map: MaplibreMap): boolean {
  return map.getContainer().classList.contains(SKETCH_CLASS)
}
