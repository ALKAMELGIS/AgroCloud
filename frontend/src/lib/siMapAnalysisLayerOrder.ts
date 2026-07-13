/**
 * Map layer stack for analysis rasters:
 * Satellite basemap → Sentinel AOI raster → vector AOI boundaries.
 */

import type { Map as MapboxMap } from 'mapbox-gl'
import {
  isSiSentinelAoiWmsMapLayerId,
  SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX,
} from './siSentinelAoiWmsStack'
import { isSiSentinelAoiWmsPingPongMapId } from './siSentinelAoiWmsImperative'

const SI_BASEMAP_LAYER_PREFIX = 'agrocloud-basemap-layer-'

const DRAWN_AOI_UNDER_RASTER_IDS = [
  'drawn-index-geometry-fill',
  'drawn-index-geometry-line',
  'drawn-index-geometry-point',
  'si-crop-class-aoi-fill',
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
 * Enforce basemap → analysis raster → vector AOI ordering on Mapbox GL.
 * Safe to call after raster mount, pan/zoom settle, or layer toggles.
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

  const firstRaster = rasterIds[0] ?? null

  for (const aoiId of DRAWN_AOI_UNDER_RASTER_IDS) {
    placeUnder(map, aoiId, firstRaster ?? rasterBeforeId)
  }

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

  if (agroFillId && map.getLayer(agroFillId) && !input.useAgSymbology) {
    try {
      if (input.suppressAgroFillWhenWms) {
        map.setPaintProperty(agroFillId, 'fill-opacity', 0)
      } else if (typeof input.restoreAgroFillOpacity === 'number') {
        map.setPaintProperty(agroFillId, 'fill-opacity', input.restoreAgroFillOpacity)
      }
    } catch {
      /* ignore */
    }
  }

  if (agroFillId) raiseToTop(map, agroFillId)
  if (agroLineId) raiseToTop(map, agroLineId)

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
