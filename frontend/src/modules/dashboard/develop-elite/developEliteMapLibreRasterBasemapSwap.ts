import type { Map as MaplibreMap, RasterTileSource, StyleSpecification } from 'maplibre-gl'

type RasterSourceSpec = {
  type?: string
  tiles?: string[]
}

/** Swap single-layer raster basemaps without `setStyle` (keeps GIS overlays mounted). */
export function developEliteMapLibreTrySwapRasterBasemap(
  map: MaplibreMap,
  style: StyleSpecification,
): boolean {
  if (!map.isStyleLoaded?.()) return false

  const sources = style.sources as Record<string, RasterSourceSpec> | undefined
  const layers = style.layers as Array<{ type?: string; source?: string }> | undefined
  const incoming = sources?.r0
  if (!incoming || incoming.type !== 'raster' || !incoming.tiles?.length) return false

  const rasterLayers = (layers ?? []).filter(l => l.type === 'raster')
  if (rasterLayers.length !== 1) return false

  const source = map.getSource('r0') as RasterTileSource | undefined
  if (!source || typeof source.setTiles !== 'function') return false

  try {
    source.setTiles(incoming.tiles)
    map.triggerRepaint?.()
    return true
  } catch {
    return false
  }
}
