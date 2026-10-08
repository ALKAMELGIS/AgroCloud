import type { Map as MaplibreMap } from 'maplibre-gl'
import { shouldIgnoreDevelopEliteMapIntelPickClick } from './developEliteMapIntelPick'

export function registerDevelopEliteMapLibreIntelPick(
  map: MaplibreMap,
  onPick: (lat: number, lng: number) => void,
): () => void {
  const container = map.getContainer()
  container.classList.add('develop-elite-map--intel-pick')

  const onClick = (event: MouseEvent) => {
    if (event.button !== 0) return
    if (shouldIgnoreDevelopEliteMapIntelPickClick(event.target)) return
    const rect = container.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const lngLat = map.unproject([x, y])
    if (!Number.isFinite(lngLat.lat) || !Number.isFinite(lngLat.lng)) return
    onPick(lngLat.lat, lngLat.lng)
  }

  container.addEventListener('click', onClick)
  return () => {
    container.removeEventListener('click', onClick)
    container.classList.remove('develop-elite-map--intel-pick')
  }
}
