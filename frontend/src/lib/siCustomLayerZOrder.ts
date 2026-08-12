/**
 * Keep imported GIS overlays above satellite / street basemap rasters.
 * Style diffs and in-place tile swaps can re-append basemap layers on top of
 * React Source/Layer children — this module re-asserts draw order.
 */

export const SI_CUSTOM_OVERLAY_LAYER_SUFFIXES = [
  '-fill',
  '-line',
  '-circle',
  '-marker',
  '-arcgis-icon',
  '-cluster',
  '-cluster-count',
  '-raster',
  '-arcgis-raster',
  '-label',
] as const

const SI_BASEMAP_LAYER_PREFIX = 'agrocloud-basemap-layer-'
const SI_BASEMAP_LAYER_IDS = new Set([
  'topo-base-layer',
  'sat3d-base-layer',
  'google-earth-sat-layer',
  'agrocloud-esri-hillshade',
])

const DRAW_CHROME_ABOVE_OVERLAY_IDS = [
  'si-draw-draft-fill',
  'si-draw-draft-line',
  'si-draw-draft-close-hint',
  'si-draw-draft-vertex',
  'si-draw-draft-pt',
  'drawn-index-geometry-line',
  'drawn-index-geometry-point',
] as const

export type SiCustomLayerZOrderMap = {
  getStyle?: () => { layers?: Array<{ id?: string }> } | undefined
  getLayer?: (id: string) => unknown
  moveLayer?: (id: string, beforeId?: string) => void
}

export function isSiBasemapStyleLayerId(layerId: string): boolean {
  if (!layerId) return false
  if (SI_BASEMAP_LAYER_IDS.has(layerId)) return true
  if (layerId.startsWith(SI_BASEMAP_LAYER_PREFIX)) return true
  if (layerId.startsWith('topo-fallback-layer-')) return true
  return false
}

function styleLayerIds(map: SiCustomLayerZOrderMap): string[] {
  try {
    return (map.getStyle?.()?.layers ?? []).map(l => l.id).filter((id): id is string => !!id)
  } catch {
    return []
  }
}

function overlayIdsForSource(sourceId: string, styleIds: string[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  const push = (id: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }
  for (const suffix of SI_CUSTOM_OVERLAY_LAYER_SUFFIXES) push(`${sourceId}${suffix}`)
  for (const id of styleIds) {
    if (id.startsWith(`${sourceId}-vt-`) || id.startsWith(`${sourceId}-arcgis-`) || id === `${sourceId}-arcgis-raster`) {
      push(id)
    }
  }
  return ids
}

function isTrackedOverlayLayerId(id: string, sourceId: string): boolean {
  return (
    id === `${sourceId}-fill` ||
    id === `${sourceId}-line` ||
    id === `${sourceId}-circle` ||
    id === `${sourceId}-raster` ||
    id === `${sourceId}-arcgis-raster` ||
    id === `${sourceId}-label` ||
    id.startsWith(`${sourceId}-vt-`) ||
    id.startsWith(`${sourceId}-arcgis-`)
  )
}

function moveLayer(map: SiCustomLayerZOrderMap, id: string, beforeId?: string): void {
  if (!id || typeof map.moveLayer !== 'function') return
  try {
    if (!map.getLayer?.(id)) return
    if (beforeId && !map.getLayer?.(beforeId)) {
      map.moveLayer(id)
      return
    }
    map.moveLayer(id, beforeId)
  } catch {
    /* style rebuild race */
  }
}

function moveToTop(map: SiCustomLayerZOrderMap, id: string): void {
  moveLayer(map, id)
}

/**
 * Slide every satellite / street basemap raster to sit immediately under the
 * first non-basemap overlay. Opaque imagery on top of GeoJSON is why imported
 * shapefiles show in the TOC but not on the canvas.
 */
export function siParkBasemapRastersBelowOverlays(map: SiCustomLayerZOrderMap): void {
  if (typeof map.moveLayer !== 'function') return
  const ids = styleLayerIds(map)
  const basemapIds = ids.filter(isSiBasemapStyleLayerId)
  if (!basemapIds.length) return
  const firstOverlayId = ids.find(id => id !== 'background' && !isSiBasemapStyleLayerId(id))
  if (!firstOverlayId) return
  for (const id of basemapIds) {
    moveLayer(map, id, firstOverlayId)
  }
}

/** True when any tracked custom overlay sits under a basemap raster layer. */
export function siCustomLayersBuriedUnderBasemap(
  map: SiCustomLayerZOrderMap,
  trackedSourceIds: Iterable<string>,
): boolean {
  try {
    const layers = map.getStyle?.()?.layers ?? []
    let lastBasemapIdx = -1
    let firstCustomIdx = -1
    const sources = [...trackedSourceIds]
    for (let i = 0; i < layers.length; i += 1) {
      const id = layers[i]?.id
      if (!id) continue
      if (isSiBasemapStyleLayerId(id)) {
        lastBasemapIdx = i
        continue
      }
      for (const sourceId of sources) {
        if (!sourceId) continue
        if (isTrackedOverlayLayerId(id, sourceId)) {
          if (firstCustomIdx < 0) firstCustomIdx = i
          break
        }
      }
    }
    return lastBasemapIdx >= 0 && firstCustomIdx >= 0 && firstCustomIdx < lastBasemapIdx
  } catch {
    return false
  }
}

/**
 * Move imported GIS fill/line/circle (and vector-tile stacks) above every
 * basemap raster. Always raise — the buried check alone missed cases where
 * opaque tiles re-appended above GeoJSON after a soft basemap swap (TOC showed
 * the shapefile/AOI but the canvas stayed empty). Sketch chrome stays on top.
 */
export function siRaiseCustomLayersAboveBasemap(
  map: SiCustomLayerZOrderMap,
  trackedSourceIds: Iterable<string>,
): void {
  if (typeof map.moveLayer !== 'function') return
  siParkBasemapRastersBelowOverlays(map)

  const styleIds = styleLayerIds(map)
  const overlayIds: string[] = []
  const seen = new Set<string>()
  for (const sourceId of trackedSourceIds) {
    if (!sourceId) continue
    for (const id of overlayIdsForSource(sourceId, styleIds)) {
      if (seen.has(id)) continue
      seen.add(id)
      overlayIds.push(id)
    }
  }
  for (const id of overlayIds) moveToTop(map, id)

  if (siCustomLayersBuriedUnderBasemap(map, trackedSourceIds)) {
    siParkBasemapRastersBelowOverlays(map)
    for (const id of overlayIds) moveToTop(map, id)
  }

  for (const id of DRAW_CHROME_ABOVE_OVERLAY_IDS) moveToTop(map, id)
}
