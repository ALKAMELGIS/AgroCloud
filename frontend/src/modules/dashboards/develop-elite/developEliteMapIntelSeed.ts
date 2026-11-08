import type { Map as LeafletMap } from 'leaflet'
import type { Map as MaplibreMap } from 'maplibre-gl'
import { DEVELOP_ELITE_GRID_MAP_DEFAULT_VIEW } from './developEliteMapViewport'

/** Map center for Open-Meteo when Weather tool opens (falls back to dashboard home view). */
export function developEliteMapIntelSeedLatLng(map: MaplibreMap | LeafletMap | null | undefined): {
  lat: number
  lng: number
} {
  const [latFb, lngFb] = DEVELOP_ELITE_GRID_MAP_DEFAULT_VIEW.center
  if (!map) return { lat: latFb, lng: lngFb }
  try {
    const c = map.getCenter()
    const lat = 'lat' in c ? c.lat : latFb
    const lng = 'lng' in c ? c.lng : lngFb
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  } catch {
    /* ignore */
  }
  return { lat: latFb, lng: lngFb }
}
