import type { Map as LeafletMap } from 'leaflet'
import L from 'leaflet'

const INTEL_PICK_IGNORE_SELECTOR = [
  '.develop-elite-map__insight-panel',
  '.develop-elite-map__draw-widget-host',
  '.si-map-draw-widget',
  '.develop-elite-map__swipe-chrome-host',
  '.si-map-swipe-overlay',
  '.leaflet-control',
  '.leaflet-popup',
].join(',')

/** True when the DOM target is map chrome, not the map surface. */
export function shouldIgnoreDevelopEliteMapIntelPickClick(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  return Boolean(target.closest(INTEL_PICK_IGNORE_SELECTOR))
}

/**
 * Register a pick handler on the Leaflet map container so clicks work on basemap,
 * overlays, and vector layers (not only empty map tiles).
 */
export function registerDevelopEliteMapIntelPick(
  map: LeafletMap,
  onPick: (lat: number, lng: number) => void,
): () => void {
  const container = map.getContainer()
  container.classList.add('develop-elite-map--intel-pick')

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return
    if (shouldIgnoreDevelopEliteMapIntelPickClick(event.target)) return
    const latlng = map.mouseEventToLatLng(event)
    if (!Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return
    map.closePopup()
    onPick(latlng.lat, latlng.lng)
  }

  L.DomEvent.on(container, 'click', onClick)
  return () => {
    L.DomEvent.off(container, 'click', onClick)
    container.classList.remove('develop-elite-map--intel-pick')
  }
}
