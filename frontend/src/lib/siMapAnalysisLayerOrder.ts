/**
 * Map layer stack for analysis rasters:
 * Satellite basemap → drawn AOI fill → Sentinel AOI raster → vector AOI boundaries.
 */

import type { Map as MapboxMap } from 'mapbox-gl'
import {
  isSiSentinelAoiWmsMapLayerId,
  SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
} from './siSentinelAoiWmsStack'
import { isSiSentinelAoiWmsPingPongMapId } from './siSentinelAoiWmsImperative'

const SI_BASEMAP_LAYER_PREFIX = 'agrocloud-basemap-layer-'

/** Polygon fills that must sit under analysis rasters (so NDVI is visible). */
const DRAWN_AOI_FILL_UNDER_RASTER_IDS = [
  'drawn-index-geometry-fill',
  'si-crop-class-aoi-fill',
] as const

/** Boundaries that must stay above analysis rasters. */
const DRAWN_AOI_OUTLINE_ABOVE_RASTER_IDS = [
  'drawn-index-geometry-line',
  'drawn-index-geometry-point',
  'si-crop-class-aoi-line',
] as const

const DRAW_DRAFT_TOP_IDS = [
  'si-draw-draft-fill',
  'si-draw-draft-line',
  'si-draw-draft-close-hint',
  'si-draw-draft-vertex',
  'si-draw-draft-pt',
] as const

export function isSiBasemapMapLayerId(layerId: string): boolean {
  return layerId.startsWith(SI_BASEMAP_LAYER_PREFIX)
}

export function isSiAnalysisRasterMapLayerId(layerId: string): boolean {
  return isSiSentinelAoiWmsMapLayerId(layerId) || isSiSentinelAoiWmsPingPongMapId(layerId)
}

/** Topmost vector AOI line used as the insert anchor for analysis rasters. */
export function resolveSiAnalysisRasterBeforeLayerId(map: MapboxMap, agroLineId?: string): string | undefined {
  const styleLayers =
    typeof map.getStyle === 'function' ? (map.getStyle()?.layers ?? []) : []
  const candidates = [
    agroLineId,
    'drawn-index-geometry-line',
    'si-crop-class-aoi-line',
    ...(styleLayers
      .map(l => l.id)
      .filter((id): id is string => !!id && /-line$/.test(id) && !isSiAnalysisRasterMapLayerId(id))),
  ].filter((id): id is string => !!id && !!map.getLayer(id))

  return candidates[0]
}

function placeUnder(map: MapboxMap, layerId: string, beforeId: string | undefined): void {
  if (!beforeId || !map.getLayer(layerId)) return
  try {
    map.moveLayer(layerId, beforeId)
  } catch {
    /* style rebuild race */
  }
}

function raiseToTop(map: MapboxMap, layerId: string): void {
  if (!map.getLayer(layerId)) return
  try {
    map.moveLayer(layerId)
  } catch {
    /* ignore */
  }
}

export type SyncSiMapAnalysisLayerOrderInput = {
  agroFillId?: string
  agroLineId?: string
  freezeLayerAoiRasterOrder?: boolean
  suppressAgroFillWhenWms?: boolean
  restoreAgroFillOpacity?: number
  useAgSymbology?: boolean
}

/**
 * Enforce basemap → AOI fill → analysis raster → vector outlines on Mapbox GL.
 *
 * Important: rasters must be moved *before* fills are tucked under them. The previous
 * order (fills under raster, then rasters under agro-line) left drawn AOI fills above
 * Sentinel WMS — so "Show NDVI on map" looked like a solid green circle only.
 */
export function syncSiMapAnalysisLayerOrder(
  map: MapboxMap,
  input: SyncSiMapAnalysisLayerOrderInput = {},
): void {
  const agroFillId = input.agroFillId
  const agroLineId = input.agroLineId
  const rasterBeforeId = resolveSiAnalysisRasterBeforeLayerId(map, agroLineId)

  const styleLayers =
    typeof map.getStyle === 'function' ? (map.getStyle()?.layers ?? []) : []
  const rasterIds = styleLayers
    .map(l => l.id)
    .filter((id): id is string => !!id && isSiAnalysisRasterMapLayerId(id))

  // 1) Park analysis rasters under vector outlines (agro / drawn AOI lines).
  for (const rasterId of rasterIds) {
    if (input.freezeLayerAoiRasterOrder && rasterId.includes(`${SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX}-layer-`)) {
      continue
    }
    if (!map.getLayer(rasterId)) continue
    if (rasterBeforeId) {
      placeUnder(map, rasterId, rasterBeforeId)
    } else {
      raiseToTop(map, rasterId)
    }
  }

  const firstRaster =
    (typeof map.getStyle === 'function' ? (map.getStyle()?.layers ?? []) : [])
      .map(l => l.id)
      .find((id): id is string => !!id && isSiAnalysisRasterMapLayerId(id)) ?? null

  // 2) Tuck polygon fills under the rasters so NDVI / indices paint on top of AOI fill.
  for (const aoiId of DRAWN_AOI_FILL_UNDER_RASTER_IDS) {
    placeUnder(map, aoiId, firstRaster ?? rasterBeforeId)
  }

  if (agroFillId && map.getLayer(agroFillId) && !input.useAgSymbology) {
    try {
      if (input.suppressAgroFillWhenWms) {
        map.setPaintProperty(agroFillId, 'fill-opacity', 0)
        // Keep agro fill under rasters while WMS is on — never raise it above NDVI.
        placeUnder(map, agroFillId, firstRaster ?? rasterBeforeId)
      } else if (typeof input.restoreAgroFillOpacity === 'number') {
        map.setPaintProperty(agroFillId, 'fill-opacity', input.restoreAgroFillOpacity)
      }
    } catch {
      /* ignore */
    }
  }

  // When WMS is off (or ArcGIS Online symbology owns fill), agro fill can stay on top.
  if (agroFillId && !input.suppressAgroFillWhenWms) {
    raiseToTop(map, agroFillId)
  }
  if (agroLineId) raiseToTop(map, agroLineId)

  // 3) Drawn AOI outline / vertices always above the index raster.
  for (const outlineId of DRAWN_AOI_OUTLINE_ABOVE_RASTER_IDS) {
    raiseToTop(map, outlineId)
  }

  for (const draftId of DRAW_DRAFT_TOP_IDS) {
    raiseToTop(map, draftId)
  }

  try {
    const mcdaLayerIds = styleLayers
      .map(l => l.id)
      .filter(
        (id): id is string =>
          !!id && id.includes('well-suit-mcda') && !id.includes('label') && !id.includes('symbol'),
      )
    for (const mcdaId of mcdaLayerIds) raiseToTop(map, mcdaId)
  } catch {
    /* ignore */
  }
}
