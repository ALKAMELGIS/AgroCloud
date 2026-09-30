import type { Map as MaplibreMap } from 'maplibre-gl'
import type { AcpMapLayerVisibility } from '../acpMapLayerVisibility'
import { ACP_SOURCE_PORTAL_PREFIX } from './acpPortalMapLayers'

const ACP_WMS_PREFIX = 'acp-sentinel-wms-'
const ACP_LAYER_AOI_FILL = 'acp-aoi-fill'
const ACP_LAYER_AOI_LINE = 'acp-aoi-line'

function mapStyleLayers(map: MaplibreMap) {
  return map.getStyle()?.layers ?? []
}

function readLayerVisible(map: MaplibreMap, layerId: string): boolean {
  if (!map.getLayer(layerId)) return false
  return map.getLayoutProperty(layerId, 'visibility') !== 'none'
}

export type AcpMapSuspendSnapshot = {
  wmsVisible: boolean
  portalVisible: Record<string, boolean>
  aoiFillVisible: boolean
  aoiLineVisible: boolean
}

/** Hide heavy raster/portal/aoi overlays during pan/zoom — sources stay mounted (no reload flicker). */
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

  const aoiFillVisible = readLayerVisible(map, ACP_LAYER_AOI_FILL)
  const aoiLineVisible = readLayerVisible(map, ACP_LAYER_AOI_LINE)
  if (map.getLayer(ACP_LAYER_AOI_FILL)) {
    map.setLayoutProperty(ACP_LAYER_AOI_FILL, 'visibility', 'none')
  }
  if (map.getLayer(ACP_LAYER_AOI_LINE)) {
    map.setLayoutProperty(ACP_LAYER_AOI_LINE, 'visibility', 'none')
  }

  let wmsWasVisible = false
  for (const layer of mapStyleLayers(map)) {
    if (!layer.id.startsWith(ACP_WMS_PREFIX) || !layer.id.endsWith('-raster')) continue
    const vis = map.getLayoutProperty(layer.id, 'visibility')
    if (vis !== 'none') wmsWasVisible = true
    map.setLayoutProperty(layer.id, 'visibility', 'none')
  }

  return { wmsVisible: wmsWasVisible, portalVisible, aoiFillVisible, aoiLineVisible }
}

export function restoreAcpMapHeavyOverlays(
  map: MaplibreMap,
  visibility: AcpMapLayerVisibility,
  portalLayerIds: string[],
  wmsOnMap: boolean,
  suspendSnap: AcpMapSuspendSnapshot | null,
) {
  if (visibility.aoi) {
    if (map.getLayer(ACP_LAYER_AOI_FILL)) {
      const show = suspendSnap?.aoiFillVisible !== false
      map.setLayoutProperty(ACP_LAYER_AOI_FILL, 'visibility', show ? 'visible' : 'none')
    }
    if (map.getLayer(ACP_LAYER_AOI_LINE)) {
      const show = suspendSnap?.aoiLineVisible !== false
      map.setLayoutProperty(ACP_LAYER_AOI_LINE, 'visibility', show ? 'visible' : 'none')
    }
  }

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

type RasterSourceMutable = {
  setTiles?: (tiles: string[]) => void
  setBounds?: (bounds: [number, number, number, number] | null) => void
}

/** True when the map style is still mounted (safe for layer/source mutations). */
export function isAcpMapStyleReady(map: MaplibreMap | null | undefined): map is MaplibreMap {
  if (!map) return false
  try {
    return Boolean(map.getStyle())
  } catch {
    return false
  }
}

export function safeAcpMapResize(map: MaplibreMap | null | undefined): void {
  if (!isAcpMapStyleReady(map)) return
  try {
    map.resize()
  } catch {
    /* map removed mid-resize */
  }
}

export function safeAcpRasterSetTiles(
  source: RasterSourceMutable | undefined,
  tiles: string[],
): boolean {
  if (!source || typeof source.setTiles !== 'function') return false
  try {
    source.setTiles(tiles)
    return true
  } catch {
    return false
  }
}

export function safeAcpRasterSetBounds(
  source: RasterSourceMutable | undefined,
  bounds: [number, number, number, number] | null | undefined,
): void {
  if (!source || typeof source.setBounds !== 'function') return
  try {
    source.setBounds(bounds ?? null)
  } catch {
    /* source detached */
  }
}

/** Hide a WMS chunk layer — keep source/layer mounted (no removeLayer flicker). */
export function hideAcpWmsChunkLayer(map: MaplibreMap, layerId: string): void {
  if (!map.getLayer(layerId)) return
  try {
    map.setLayoutProperty(layerId, 'visibility', 'none')
    map.setPaintProperty(layerId, 'raster-opacity', 0)
  } catch {
    /* style race */
  }
}

/** Drop chunk sources only on analysis revision / map teardown — not on field selection. */
export function removeAcpWmsChunkLayer(map: MaplibreMap, sourceId: string, layerId: string): void {
  try {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  } catch {
    /* style race */
  }
}

export function nextAcpMapRequestId(ref: { current: number }): number {
  ref.current += 1
  return ref.current
}

export function isAcpMapRequestCurrent(ref: { current: number }, requestId: number): boolean {
  return ref.current === requestId
}
