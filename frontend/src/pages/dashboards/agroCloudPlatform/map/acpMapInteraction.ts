import type { Map as MaplibreMap } from 'maplibre-gl'
import type { AcpMapLayerVisibility } from '../acpMapLayerVisibility'
import { ACP_SOURCE_PORTAL_PREFIX } from './acpPortalMapLayers'

const ACP_WMS_PREFIX = 'acp-sentinel-wms-'

function mapStyleLayers(map: MaplibreMap) {
  return map.getStyle()?.layers ?? []
}

export type AcpMapSuspendSnapshot = {
  wmsVisible: boolean
  portalVisible: Record<string, boolean>
}

/** Hide heavy raster/portal overlays during pan/zoom — sources stay mounted (no reload flicker). */
export function suspendAcpMapHeavyOverlays(
  map: MaplibreMap,
  portalLayerIds: string[],
): AcpMapSuspendSnapshot {
  const portalVisible: Record<string, boolean> = {}
  for (const id of portalLayerIds) {
    for (const suffix of ['-fill', '-line', '-circle']) {
      const layerId = `${ACP_SOURCE_PORTAL_PREFIX}${id}${suffix}`
      if (!map.getLayer(layerId)) continue
      const vis = map.getLayoutProperty(layerId, 'visibility')
      portalVisible[layerId] = vis !== 'none'
      map.setLayoutProperty(layerId, 'visibility', 'none')
    }
  }

  let wmsWasVisible = false
  for (const layer of mapStyleLayers(map)) {
    if (!layer.id.startsWith(ACP_WMS_PREFIX) || !layer.id.endsWith('-raster')) continue
    const vis = map.getLayoutProperty(layer.id, 'visibility')
    if (vis !== 'none') wmsWasVisible = true
    map.setLayoutProperty(layer.id, 'visibility', 'none')
  }

  return { wmsVisible: wmsWasVisible, portalVisible }
}

export function restoreAcpMapHeavyOverlays(
  map: MaplibreMap,
  visibility: AcpMapLayerVisibility,
  portalLayerIds: string[],
  wmsOnMap: boolean,
  suspendSnap: AcpMapSuspendSnapshot | null,
) {
  if (wmsOnMap && visibility.sentinelWms) {
    for (const layer of mapStyleLayers(map)) {
      if (!layer.id.startsWith(ACP_WMS_PREFIX) || !layer.id.endsWith('-raster')) continue
      map.setLayoutProperty(layer.id, 'visibility', 'visible')
    }
  }

  for (const id of portalLayerIds) {
    const portalOn = visibility.portal[id] !== false
    if (!portalOn) continue
    for (const suffix of ['-fill', '-line', '-circle']) {
      const layerId = `${ACP_SOURCE_PORTAL_PREFIX}${id}${suffix}`
      if (!map.getLayer(layerId)) continue
      const wasOn = suspendSnap?.portalVisible[layerId] !== false
      map.setLayoutProperty(layerId, 'visibility', wasOn ? 'visible' : 'none')
    }
  }
}

export function debounceAcpMap<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, waitMs)
  }
}
