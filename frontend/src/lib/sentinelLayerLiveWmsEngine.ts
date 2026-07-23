/**
 * Shared Sentinel Hub Layer Live WMS pipeline — Satellite Intelligence parity.
 * AOI clip when clipSource has geometry; full-canvas evalscript when clipSource is null.
 */

import { isAgroDeltaCompositeLayerId } from './agroCompositeIndices'
import { isAdiLayerId } from './adiIndex'
import { isNcadiLayerId } from './ncadiIndex'
import { isLulcClassificationLayerId } from './siLulcClassification'
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
  resolveSentinelHubWmsTilePixels,
  resolveSentinelHubWmsTimeWindow,
} from './sentinelHubWmsLayers'
import { geometryBBox } from './geoAiGeoJsonSpatial'
import type { LngLatBBox } from './siMapViewport'

export const SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS = 8
/** AgroCloud Platform — one GEOMETRY clip per visible PIVOT (up to this many MapLibre raster sources). */
export const SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM = 64
export const SENTINEL_LAYER_LIVE_INDEX_VISIBILITY_MIN: number | null = null
export const SENTINEL_LAYER_LIVE_DEFAULT_CLOUD_COVERAGE = 20

export type SentinelLayerLiveWmsBuildOptions = {
  viewportBBox?: LngLatBBox | null
  maxTileLayers?: number | null
  preferSingleRingChunks?: boolean
}

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
  const padX = Math.max((east - west) * 0.08, 4e-4)
  const padY = Math.max((north - south) * 0.08, 4e-4)
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

/** Display chunks — Satellite Intelligence default (packed multipolygon, cap 8). */
export function buildSentinelLayerLiveDisplayChunks(
  clipSource: unknown,
  wmsLayerName: string,
  options?: SentinelLayerLiveWmsBuildOptions,
): SentinelHubWmsAoiClipPart[] {
  const maxTileLayers =
    options?.maxTileLayers !== undefined ? options.maxTileLayers : SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS
  return buildSentinelHubWmsDisplayChunks(clipSource, wmsLayerName, {
    indexVisibilityMin: SENTINEL_LAYER_LIVE_INDEX_VISIBILITY_MIN,
    viewportBBox: options?.viewportBBox ?? null,
    maxTileLayers,
    preferSingleRingChunks: options?.preferSingleRingChunks ?? false,
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

/** Resolve WMS TIME= from explicit start/end or Sentinel Hub lookback ending on analysisDate. */
export function resolveSentinelLayerLiveWmsTimeRange(options: {
  wmsLayerName: string
  analysisDate: string
  startDate?: string
  endDate?: string
  previousSceneDate?: string | null
  catalogSceneIsos?: string[]
  timeSeriesStart?: string | null
  lookbackDays?: number
}): { timeStart: string; timeEnd: string } {
  const endIso = String(options.endDate || options.analysisDate || '')
    .trim()
    .slice(0, 10)
  const startIso = String(options.startDate || '').trim().slice(0, 10)
  if (endIso && startIso && startIso < endIso) {
    return { timeStart: startIso, timeEnd: endIso }
  }

  const deltaPreviousDate = isAgroDeltaCompositeLayerId(options.wmsLayerName)
    ? resolveSentinelHubWmsDeltaPreviousDate(endIso || options.analysisDate, {
        autoPreviousSceneDate: options.previousSceneDate ?? undefined,
        catalogSceneIsos: options.catalogSceneIsos ?? [],
        timeSeriesStart: options.timeSeriesStart ?? undefined,
      })
    : null

  return resolveSentinelHubWmsTimeWindow(
    options.wmsLayerName,
    endIso || options.analysisDate,
    deltaPreviousDate,
    options.lookbackDays != null ? { lookbackDays: options.lookbackDays } : undefined,
  )
}

/** Build GetMap tile URL templates — mirrors Satellite Intelligence `wmsTileUrls`. */
export function buildSentinelLayerLiveWmsTileSpecs(options: {
  clipSource: unknown
  wmsLayerName: string
  analysisDate: string
  startDate?: string
  endDate?: string
  cloudCoverage?: number
  catalogSceneIsos?: string[]
  previousSceneDate?: string | null
  timeSeriesStart?: string | null
  lookbackDays?: number
  wmsBuild?: SentinelLayerLiveWmsBuildOptions
}): SentinelLayerLiveWmsTileSpec[] {
  const wmsLayerName = String(options.wmsLayerName || '').trim()
  if (!wmsLayerName) return []

  const analysisDate = String(options.analysisDate || options.endDate || options.startDate || '')
    .trim()
    .slice(0, 10)
  if (!analysisDate) return []

  const chunks = buildSentinelLayerLiveDisplayChunks(options.clipSource, wmsLayerName, options.wmsBuild)
  const aoiBoundsLngLat = resolveSentinelLayerLiveAoiBoundsLngLat(options.clipSource)
  if (!isSentinelHubWmsRenderReady(wmsLayerName, chunks, { aoiBoundsLngLat })) return []

  const catalog = getSentinelHubWmsLayerCatalog()
  const getMapLayer = resolveSentinelHubWmsGetMapLayerName(wmsLayerName, catalog)

  const { timeStart, timeEnd } = resolveSentinelLayerLiveWmsTimeRange({
    wmsLayerName,
    analysisDate,
    startDate: options.startDate,
    endDate: options.endDate,
    previousSceneDate: options.previousSceneDate,
    catalogSceneIsos: options.catalogSceneIsos,
    timeSeriesStart: options.timeSeriesStart,
    lookbackDays: options.lookbackDays,
  })
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
      tilePixels: resolveSentinelHubWmsTilePixels(wmsLayerName),
      categorical: isLulcClassificationLayerId(wmsLayerName) || isAdiLayerId(wmsLayerName) || isNcadiLayerId(wmsLayerName),
    }),
    boundsLngLat: resolveSentinelLayerLiveChunkBoundsLngLat(chunk, options.clipSource, aoiBoundsLngLat),
  }))
}
