import {
  ensureAgroCloudMapScrollZoom,
  type AgroCloudMapboxMapScrollLike,
} from './agroCloudMapNavigation'

export const AGRO_CLOUD_MAP_SKETCH_LOCK_CLASS = 'agro-cloud-map--sketch-lock'

const TOUCH_BLOCK_KEY = '__agroCloudMapSketchTouchMoveBlock'

function getMapContainer(map: AgroCloudMapboxMapScrollLike): HTMLElement | null {
  try {
    return map.getContainer?.() ?? null
  } catch {
    return null
  }
}

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

/** Suspend pan/zoom/pitch so rectangle/circle/polygon sketch receives touch drags. */
export function lockAgroCloudMapForSketch(map: AgroCloudMapboxMapScrollLike | null | undefined): void {
  if (!map) return
  const container = getMapContainer(map)
  if (!container) return
  try {
    map.dragPan?.disable?.()
    map.doubleClickZoom?.disable?.()
    map.boxZoom?.disable?.()
    map.touchZoomRotate?.disable?.()
    map.scrollZoom?.disable?.()
    ;(map as { touchPitch?: { disable?: () => void } }).touchPitch?.disable?.()
  } catch {
    /* style swap */
  }
  blockSketchTouchScroll(container)
  container.classList.add(AGRO_CLOUD_MAP_SKETCH_LOCK_CLASS)
}

export function unlockAgroCloudMapForSketch(map: AgroCloudMapboxMapScrollLike | null | undefined): void {
  if (!map) return
  const container = getMapContainer(map)
  if (!container) return
  try {
    map.dragPan?.enable?.()
    map.doubleClickZoom?.enable?.()
    map.boxZoom?.enable?.()
    map.touchZoomRotate?.enable?.()
    ensureAgroCloudMapScrollZoom(map)
    ;(map as { touchPitch?: { enable?: () => void } }).touchPitch?.enable?.()
  } catch {
    /* style swap */
  }
  unblockSketchTouchScroll(container)
  container.classList.remove(AGRO_CLOUD_MAP_SKETCH_LOCK_CLASS)
}

export function isAgroCloudMapSketchLocked(map: AgroCloudMapboxMapScrollLike | null | undefined): boolean {
  const container = map ? getMapContainer(map) : null
  return !!container?.classList.contains(AGRO_CLOUD_MAP_SKETCH_LOCK_CLASS)
}
