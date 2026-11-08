import type { Map as MaplibreMap } from 'maplibre-gl'

/** True when the map style object is safe for layer/source APIs. */
export function isDevelopEliteMapLibreStyleReady(map: MaplibreMap | null | undefined): boolean {
  if (!map) return false
  try {
    if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return false
    const style = map.getStyle()
    return Boolean(style?.layers?.length)
  } catch {
    return false
  }
}

/**
 * True when the layer exists. Deliberately does not require `isStyleLoaded()`: that flips to false
 * while any GeoJSON source is re-parsing, which made existing layers look missing and the next
 * `addLayer` throw "already exists" — aborting the rest of the overlay sync.
 */
export function developEliteMapLibreHasLayer(map: MaplibreMap | null | undefined, layerId: string): boolean {
  if (!map) return false
  try {
    return Boolean(map.getLayer(layerId))
  } catch {
    return false
  }
}

export function developEliteMapLibreRunIfStyleReady(
  map: MaplibreMap | null | undefined,
  run: (map: MaplibreMap) => void,
): void {
  if (!isDevelopEliteMapLibreStyleReady(map)) return
  try {
    run(map!)
  } catch {
    /* map removed or style swapped mid-sync */
  }
}
