/**
 * Shared Sentinel Hub Layer Live WMS pipeline — Satellite Intelligence parity.
 * AOI clip when clipSource has geometry; full-canvas evalscript when clipSource is null.
 */

import { isAgroDeltaCompositeLayerId } from './agroCompositeIndices'
import {
  buildSentinelHubWmsDisplayChunks,
  getDrawnGeometry,
  isSentinelHubWmsRenderReady,
  type SentinelHubWmsAoiClipPart,
} from './sentinelHubWmsAoiClip'
import { getSentinelHubWmsBaseUrl } from './sentinelHubWmsInstance'
import {
  buildSentinelHubWmsGetMapUrlParts,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsDeltaPreviousDate,
  resolveSentinelHubWmsGetMapLayerName,
  resolveSentinelHubWmsTimeWindow,
  SENTINEL_HUB_WMS_TILE_PIXELS,
} from './sentinelHubWmsLayers'
import { geometryBBox } from './geoAiGeoJsonSpatial'
import type { LngLatBBox } from './siMapViewport'

export const SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS = 8
export const SENTINEL_LAYER_LIVE_INDEX_VISIBILITY_MIN: number | null = null
export const SENTINEL_LAYER_LIVE_DEFAULT_CLOUD_COVERAGE = 20

export type SentinelLayerLiveWmsTileSpec = {
  url: string
  boundsLngLat: LngLatBBox | null
}

function padLngLatBBox(raw: LngLatBBox): LngLatBBox {
  let [west, south, east, north] = raw
  const eps = 1e-4
  if (east <= west) {
    const c = (west + east) / 2
    west = c - eps
    east = c + eps
  }
  if (north <= south) {
    const c = (south + north) / 2
    south = c - eps
    north = c + eps
  }
  const padX = Math.max((east - west) * 0.04, 2e-4)
  const padY = Math.max((north - south) * 0.04, 2e-4)
  return [west - padX, south - padY, east + padX, north + padY]
}

/** AOI bounds for tile limits — stable mask extent (not moving viewport). */
export function resolveSentinelLayerLiveAoiBoundsLngLat(clipSource: unknown): LngLatBBox | null {
  const clipGeo = getDrawnGeometry(clipSource)
  if (!clipGeo) return null
  const raw = geometryBBox(clipGeo)
  if (!raw) return null
  const [west, south, east, north] = raw
  if (![west, south, east, north].every(Number.isFinite)) return null
  return padLngLatBBox([west, south, east, north])
}

/** Display chunks — same options as Satellite Intelligence map canvas. */
export function buildSentinelLayerLiveDisplayChunks(
  clipSource: unknown,
  wmsLayerName: string,
): SentinelHubWmsAoiClipPart[] {
  return buildSentinelHubWmsDisplayChunks(clipSource, wmsLayerName, {
    indexVisibilityMin: SENTINEL_LAYER_LIVE_INDEX_VISIBILITY_MIN,
    viewportBBox: null,
    maxTileLayers: SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS,
    preferSingleRingChunks: false,
  })
}

export function resolveSentinelLayerLiveChunkBoundsLngLat(
  chunk: SentinelHubWmsAoiClipPart | undefined,
  clipSource: unknown,
  aoiBoundsLngLat: LngLatBBox | null,
): LngLatBBox | null {
  return chunk?.aoiBoundsLngLat ?? aoiBoundsLngLat ?? resolveSentinelLayerLiveAoiBoundsLngLat(clipSource)
}

export function isSentinelLayerLiveWmsRenderReady(
  wmsLayerName: string,
  chunks: SentinelHubWmsAoiClipPart[],
  clipSource: unknown,
): boolean {
  const aoiBoundsLngLat = resolveSentinelLayerLiveAoiBoundsLngLat(clipSource)
  return isSentinelHubWmsRenderReady(wmsLayerName, chunks, { aoiBoundsLngLat })
}

/** Build GetMap tile URL templates — mirrors Satellite Intelligence `wmsTileUrls`. */
export function buildSentinelLayerLiveWmsTileSpecs(options: {
  clipSource: unknown
  wmsLayerName: string
  analysisDate: string
  cloudCoverage?: number
  catalogSceneIsos?: string[]
  previousSceneDate?: string | null
  timeSeriesStart?: string | null
}): SentinelLayerLiveWmsTileSpec[] {
  const wmsLayerName = String(options.wmsLayerName || '').trim()
  if (!wmsLayerName) return []

  const analysisDate = String(options.analysisDate || '').trim().slice(0, 10)
  if (!analysisDate) return []

  const chunks = buildSentinelLayerLiveDisplayChunks(options.clipSource, wmsLayerName)
  const aoiBoundsLngLat = resolveSentinelLayerLiveAoiBoundsLngLat(options.clipSource)
  if (!isSentinelHubWmsRenderReady(wmsLayerName, chunks, { aoiBoundsLngLat })) return []

  const catalog = getSentinelHubWmsLayerCatalog()
  const getMapLayer = resolveSentinelHubWmsGetMapLayerName(wmsLayerName, catalog)

  const deltaPreviousDate = isAgroDeltaCompositeLayerId(wmsLayerName)
    ? resolveSentinelHubWmsDeltaPreviousDate(analysisDate, {
        autoPreviousSceneDate: options.previousSceneDate ?? undefined,
        catalogSceneIsos: options.catalogSceneIsos ?? [],
        timeSeriesStart: options.timeSeriesStart ?? undefined,
      })
    : null

  const { timeStart, timeEnd } = resolveSentinelHubWmsTimeWindow(
    wmsLayerName,
    analysisDate,
    deltaPreviousDate,
  )
  if (!timeStart || !timeEnd) return []

  const baseUrl = getSentinelHubWmsBaseUrl()
  const cloudCoverage = options.cloudCoverage ?? SENTINEL_LAYER_LIVE_DEFAULT_CLOUD_COVERAGE

  return chunks.map(chunk => ({
    url: buildSentinelHubWmsGetMapUrlParts({
      baseUrl,
      layer: getMapLayer,
      timeStart,
      timeEnd,
      cloudCoverage,
      geometryWkt3857: chunk.geometryWkt3857 ?? undefined,
      evalscriptB64: chunk.evalscriptB64,
      tilePixels: SENTINEL_HUB_WMS_TILE_PIXELS,
    }),
    boundsLngLat: resolveSentinelLayerLiveChunkBoundsLngLat(chunk, options.clipSource, aoiBoundsLngLat),
  }))
}
