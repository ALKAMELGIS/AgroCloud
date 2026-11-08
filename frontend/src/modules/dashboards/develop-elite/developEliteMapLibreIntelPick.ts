import type { Map as MaplibreMap, MapMouseEvent } from 'maplibre-gl'
import { shouldIgnoreDevelopEliteMapIntelPickClick } from './developEliteMapIntelPick'
import { isMapLibreSketchInteractionLocked } from './developEliteMapLibreSketchInteraction'
const PICK_DEBOUNCE_MS = 100

export function registerDevelopEliteMapLibreIntelPick(
  map: MaplibreMap,
  onPick: (lat: number, lng: number) => void,
): () => void {
  const container = map.getContainer()
  container.classList.add('develop-elite-map--intel-pick')

  let lastPickMs = 0

  const onMapClick = (event: MapMouseEvent) => {
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

  map.on('click', onMapClick)
  return () => {
    map.off('click', onMapClick)
    container.classList.remove('develop-elite-map--intel-pick')
  }
}
