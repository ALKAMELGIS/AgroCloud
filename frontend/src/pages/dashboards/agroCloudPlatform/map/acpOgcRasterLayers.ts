import type { Map as MaplibreMap } from 'maplibre-gl'
import { buildOgcRasterTileUrlTemplate } from '../../../../lib/acpOgcTileUrls'
import { readAcpOgcLayerMetaForRow } from '../../../../lib/acpOgcLayerMeta'
import type { GisContentMapLayerConfig } from '../../../../lib/gisContentRepository'
import type { GisContentRow } from '../../../master/gisContentPortalData'
import type { AcpMapLayerVisibility } from '../acpMapLayerVisibility'

export const ACP_OGC_RASTER_PREFIX = 'acp-ogc-raster-'

export type AcpOgcRasterLayerEntry = {
  row: GisContentRow
  config: GisContentMapLayerConfig
  visible: boolean
}

export function acpOgcRasterSourceId(rowId: string): string {
  return `${ACP_OGC_RASTER_PREFIX}${rowId}`
}

export function acpOgcRasterLayerId(rowId: string): string {
  return `${acpOgcRasterSourceId(rowId)}-layer`
}

function resolveInsertBeforeId(map: MaplibreMap): string | undefined {
  const layers = map.getStyle()?.layers ?? []
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const id = layers[i]?.id
    if (!id) continue
    if (id.includes('label') || id.includes('symbol') || id.startsWith('place-')) return id
  }
  return undefined
}

export function syncAcpOgcRasterLayers(
  map: MaplibreMap,
  layers: AcpOgcRasterLayerEntry[],
  visibility: AcpMapLayerVisibility,
  options?: { beforeLayerId?: string },
) {
  if (!map.isStyleLoaded()) return

  const beforeId = options?.beforeLayerId ?? resolveInsertBeforeId(map)
  const activeIds = new Set<string>()
  const sorted = [...layers].sort((a, b) => a.config.order - b.config.order)

  for (const entry of sorted) {
    const meta = readAcpOgcLayerMetaForRow(entry.row)
    if (!meta) continue

    const sourceId = acpOgcRasterSourceId(entry.row.id)
    const layerId = acpOgcRasterLayerId(entry.row.id)
    activeIds.add(sourceId)

    const tileUrl = buildOgcRasterTileUrlTemplate(meta)
    const opacity = Math.max(0, Math.min(1, entry.config.opacity ?? 1))
    const portalVisible =
      entry.config.visible !== false &&
      entry.visible &&
      visibility.portal[entry.row.id] !== false

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        scheme: 'xyz',
      })
    }

    if (!map.getLayer(layerId)) {
      map.addLayer(
        {
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': opacity },
          minzoom: entry.config.minZoom,
          maxzoom: entry.config.maxZoom,
        },
        beforeId,
      )
    } else {
      map.setPaintProperty(layerId, 'raster-opacity', opacity)
      if (entry.config.minZoom != null) map.setLayerZoomRange(layerId, entry.config.minZoom, entry.config.maxZoom ?? 24)
    }

    map.setLayoutProperty(layerId, 'visibility', portalVisible ? 'visible' : 'none')
  }

  for (const layer of map.getStyle()?.layers ?? []) {
    if (!layer.id.startsWith(ACP_OGC_RASTER_PREFIX) || !layer.id.endsWith('-layer')) continue
    const sourceId = layer.id.replace(/-layer$/, '')
    if (!activeIds.has(sourceId)) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id)
      if (map.getSource(sourceId)) map.removeSource(sourceId)
    }
  }

  for (let i = 0; i < sorted.length; i += 1) {
    const layerId = acpOgcRasterLayerId(sorted[i]!.row.id)
    if (!map.getLayer(layerId)) continue
    try {
      map.moveLayer(layerId, beforeId)
    } catch {
      /* layer order best-effort */
    }
  }
}

export function applyAcpOgcRasterOpacity(
  map: MaplibreMap,
  rowId: string,
  opacity: number,
) {
  const layerId = acpOgcRasterLayerId(rowId)
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, 'raster-opacity', Math.max(0, Math.min(1, opacity)))
  }
}
