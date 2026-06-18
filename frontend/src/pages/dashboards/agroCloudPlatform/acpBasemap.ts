import {
  buildBasemapCatalog,
  catalogEntryById,
  resolveBasemapId,
  tileUrlForMapboxGl,
  type LeafletTileSpec,
} from '../../satellite/basemapCatalog'

export type AcpBasemapRasterLayer = {
  sourceId: string
  layerId: string
  tiles: string[]
  tileSize: number
  attribution: string
  opacity: number
}

const ACP_BASEMAP_SOURCE_PREFIX = 'acp-basemap-'
const ACP_BASEMAP_LAYER_PREFIX = 'acp-basemap-layer-'
const ACP_BASEMAP_LAYER_CAP = 4

function specFromLeafletLayer(layer: LeafletTileSpec, index: number): AcpBasemapRasterLayer {
  return {
    sourceId: `${ACP_BASEMAP_SOURCE_PREFIX}${index}`,
    layerId: `${ACP_BASEMAP_LAYER_PREFIX}${index}`,
    tiles: [tileUrlForMapboxGl(layer.url)],
    tileSize: 256,
    attribution: layer.attribution,
    opacity: layer.opacity ?? 1,
  }
}

/** Resolve catalog basemap id to MapLibre raster layer specs (supports multi-layer hybrids). */
export function resolveAcpBasemapRasterLayers(basemapId: string): AcpBasemapRasterLayer[] {
  const catalog = buildBasemapCatalog('')
  const resolved = resolveBasemapId(basemapId)
  const entry =
    catalogEntryById(catalog, resolved) ??
    catalogEntryById(catalog, 'esri') ??
    catalogEntryById(catalog, 'satellite')
  const leafletLayers = entry?.leafletLayers
  if (!leafletLayers?.length) {
    const fallback = catalogEntryById(catalog, 'esri')?.leafletLayers?.[0]
    if (!fallback) return []
    return [specFromLeafletLayer(fallback, 0)]
  }
  return leafletLayers.map(specFromLeafletLayer)
}

export { ACP_BASEMAP_LAYER_CAP, ACP_BASEMAP_LAYER_PREFIX, ACP_BASEMAP_SOURCE_PREFIX }
