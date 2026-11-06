import type { Map as MaplibreMap, RasterTileSource, StyleSpecification } from 'maplibre-gl'

type RasterSourceSpec = {
  type?: string
  tiles?: string[]
}

/** Swap raster basemap tile URLs without `setStyle` when layer/source layout matches (keeps GIS overlays). */
export function developEliteMapLibreTrySwapRasterBasemap(
  map: MaplibreMap,
  style: StyleSpecification,
): boolean {
  if (!map.isStyleLoaded?.()) return false

  const sources = style.sources as Record<string, RasterSourceSpec> | undefined
  const layers = style.layers as Array<{ type?: string; source?: string }> | undefined
  const rasterLayers = (layers ?? []).filter(l => l.type === 'raster' && l.source)
  if (!rasterLayers.length) return false

  const existingRasterLayers = (map.getStyle()?.layers ?? []).filter(l => l.type === 'raster')
  if (existingRasterLayers.length !== rasterLayers.length) return false

  for (const layer of rasterLayers) {
    const sid = layer.source!
    const incoming = sources?.[sid]
    if (!incoming || incoming.type !== 'raster' || !incoming.tiles?.length) return false
    const source = map.getSource(sid) as RasterTileSource | undefined
    if (!source || typeof source.setTiles !== 'function') return false
  }

  try {
    for (const layer of rasterLayers) {
      const sid = layer.source!
      const incoming = sources![sid]!
      const source = map.getSource(sid) as RasterTileSource
      source.setTiles(incoming.tiles!)
    }
    map.triggerRepaint?.()
    return true
  } catch {
    return false
  }
}
