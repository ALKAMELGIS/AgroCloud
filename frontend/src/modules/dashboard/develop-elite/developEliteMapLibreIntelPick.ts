import type { Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'
import { shouldIgnoreDevelopEliteMapIntelPickClick } from './developEliteMapIntelPick'
import { isMapLibreSketchInteractionLocked } from './developEliteMapLibreSketchInteraction'

const TAP_MAX_MOVE_PX = 10
const PICK_DEBOUNCE_MS = 100

export function registerDevelopEliteMapLibreIntelPick(
  map: MaplibreMap,
  onPick: (lat: number, lng: number) => void,
): () => void {
  const container = map.getContainer()
  container.classList.add('develop-elite-map--intel-pick')

  let pointerDown: { x: number; y: number } | null = null
  let lastPickMs = 0

  const emitPick = (event: MapMouseEvent) => {
    const dom = event.originalEvent
    if (dom instanceof MouseEvent && dom.button !== 0) return
    if (isMapLibreSketchInteractionLocked(map)) return
    const target = dom?.target ?? null
    if (target instanceof Element && shouldIgnoreDevelopEliteMapIntelPickClick(target)) return
    const { lat, lng } = event.lngLat
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    const now = Date.now()
    if (now - lastPickMs < PICK_DEBOUNCE_MS) return
    lastPickMs = now
    onPick(lat, lng)
  }

  const onMapClick = (event: MapMouseEvent) => {
    emitPick(event)
  }

  const onMouseDown = (event: MapMouseEvent) => {
    if (event.originalEvent.button !== 0) return
    pointerDown = { x: event.point.x, y: event.point.y }
  }

  const onMouseUp = (event: MapMouseEvent) => {
    const down = pointerDown
    pointerDown = null
    if (!down || event.originalEvent.button !== 0) return
    const dx = event.point.x - down.x
    const dy = event.point.y - down.y
    if (dx * dx + dy * dy > TAP_MAX_MOVE_PX * TAP_MAX_MOVE_PX) return
    emitPick(event)
  }

  map.on('click', onMapClick)
  map.on('mousedown', onMouseDown)
  map.on('mouseup', onMouseUp)
  return () => {
    map.off('click', onMapClick)
    map.off('mousedown', onMouseDown)
    map.off('mouseup', onMouseUp)
    container.classList.remove('develop-elite-map--intel-pick')
  }
}
