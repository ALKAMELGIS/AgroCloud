/**
 * Independent Sentinel WMS raster stack for one AOI clip path (Edit draw vs Layers vector).
 */

import { isAgroDeltaCompositeLayerId } from './agroCompositeIndices'
import { isAdiLayerId } from './adiIndex'
import { isNcadiLayerId } from './ncadiIndex'
import { isWapiLayerId } from './wapiIndex'
import {
  isCropClassificationLayerId,
  resolveCropClassificationTimeWindow,
} from './siCropClassification'
import { isLulcClassificationLayerId } from './siLulcClassification'
import { getCachedSentinelHubWmsDisplayChunks } from './siAoiLayerModeClipCache'
import {
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
  SENTINEL_HUB_WMS_TILE_PIXELS,
} from './sentinelHubWmsLayers'
import { geometryBBox } from './geoAiGeoJsonSpatial'

export const SI_SENTINEL_DRAW_WMS_ID_PREFIX = 'sentinel-draw'
export const SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX = 'sentinel-layer-aoi'

export type SiSentinelAoiWmsStackBuildInput = {
  clipSource: unknown
  maskCacheKey: string
  sessionKey: string
  activeWmsLayer: string | null
  sentinelFetchDate: string
  wmsTimeWindowKey: string
  effectiveWmsCloudCoverage: number
  autoPreviousSceneDate: string | null
  catalogSceneIsos: string[]
  timeSeriesStart: string
  cropSeasonStart: string
  cropSeasonEnd: string
  indexVisibilityMin: number | null
  maxTileLayers: number
}

export type SiSentinelAoiWmsStackState = {
  idPrefix: string
  clipSource: unknown
  displayChunks: SentinelHubWmsAoiClipPart[]
  tileUrls: string[]
  tilePixels: number
  aoiBoundsLngLat: [number, number, number, number] | null
  renderReady: boolean
  sessionKey: string
  sourceRefreshKey: string
}

const EMPTY_STACK: SiSentinelAoiWmsStackState = {
  idPrefix: '',
  clipSource: null,
  displayChunks: [],
  tileUrls: [],
  tilePixels: SENTINEL_HUB_WMS_TILE_PIXELS,
  aoiBoundsLngLat: null,
  renderReady: false,
  sessionKey: '',
  sourceRefreshKey: '',
}

function padLngLatBBox(raw: [number, number, number, number]): [number, number, number, number] {
  let [w, s, e, n] = raw
  const eps = 1e-4
  if (e <= w) {
    const c = (w + e) / 2
    w = c - eps
    e = c + eps
  }
  if (n <= s) {
    const c = (s + n) / 2
    s = c - eps
    n = c + eps
  }
  const padX = Math.max((e - w) * 0.02, 1e-6)
  const padY = Math.max((n - s) * 0.02, 1e-6)
  return [w - padX, s - padY, e + padX, n + padY]
}

export function resolveSiSentinelAoiWmsBoundsLngLat(clipSource: unknown): [number, number, number, number] | null {
  const clipGeo = getDrawnGeometry(clipSource)
  if (!clipGeo) return null
  const raw = geometryBBox(clipGeo)
  if (!raw) return null
  const [w, s, e, n] = raw
  if (![w, s, e, n].every(Number.isFinite)) return null
  return padLngLatBBox([w, s, e, n])
}

export function siSentinelAoiWmsSourceId(idPrefix: string, chunkIdx: number): string {
  return `${idPrefix}-source-${chunkIdx}`
}

export function siSentinelAoiWmsLayerId(idPrefix: string, chunkIdx: number): string {
  return `${idPrefix}-layer-${chunkIdx}`
}

export function isSiSentinelAoiWmsMapLayerId(layerId: string): boolean {
  return (
    layerId === 'sentinel-layer' ||
    layerId.startsWith('sentinel-layer-') ||
    layerId.startsWith(`${SI_SENTINEL_DRAW_WMS_ID_PREFIX}-layer-`) ||
    layerId.startsWith(`${SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX}-layer-`)
  )
}

export function isSiSentinelAoiWmsMapSourceId(sourceId: string): boolean {
  return (
    sourceId.startsWith('sentinel-source-') ||
    sourceId.startsWith(`${SI_SENTINEL_DRAW_WMS_ID_PREFIX}-source-`) ||
    sourceId.startsWith(`${SI_SENTINEL_LAYER_AOI_WMS_ID_PREFIX}-source-`)
  )
}

export function buildSiSentinelAoiWmsStackState(
  idPrefix: string,
  input: SiSentinelAoiWmsStackBuildInput,
): SiSentinelAoiWmsStackState {
  const activeWmsLayer = String(input.activeWmsLayer || '').trim()
  const sentinelFetchDate = String(input.sentinelFetchDate || '').trim().slice(0, 10)
  if (!activeWmsLayer || !sentinelFetchDate || !input.clipSource) {
    return { ...EMPTY_STACK, idPrefix, clipSource: input.clipSource ?? null, sessionKey: input.sessionKey }
  }

  const displayChunks = getCachedSentinelHubWmsDisplayChunks(
    input.clipSource,
    activeWmsLayer,
    {
      indexVisibilityMin: input.indexVisibilityMin,
      sceneDate: sentinelFetchDate,
      viewportBBox: null,
      maxTileLayers: input.maxTileLayers,
    },
    input.maskCacheKey,
  )

  const aoiBoundsLngLat = resolveSiSentinelAoiWmsBoundsLngLat(input.clipSource)
  const renderReady = isSentinelHubWmsRenderReady(activeWmsLayer, displayChunks, { aoiBoundsLngLat })
  if (!renderReady) {
    return {
      idPrefix,
      clipSource: input.clipSource,
      displayChunks,
      tileUrls: [],
      tilePixels: resolveSentinelHubWmsTilePixels(activeWmsLayer),
      aoiBoundsLngLat,
      renderReady: false,
      sessionKey: input.sessionKey,
      sourceRefreshKey: '',
    }
  }

  const wmsLayerCatalog = getSentinelHubWmsLayerCatalog()
  const wmsGetMapLayerName = resolveSentinelHubWmsGetMapLayerName(activeWmsLayer, wmsLayerCatalog)
  const deltaPreviousDate =
    isAgroDeltaCompositeLayerId(activeWmsLayer) ||
    isNcadiLayerId(activeWmsLayer) ||
    isWapiLayerId(activeWmsLayer)
      ? resolveSentinelHubWmsDeltaPreviousDate(sentinelFetchDate, {
          autoPreviousSceneDate: input.autoPreviousSceneDate,
          catalogSceneIsos: input.catalogSceneIsos,
          timeSeriesStart: input.timeSeriesStart,
        })
      : null
  const { timeStart, timeEnd } = isCropClassificationLayerId(activeWmsLayer)
    ? resolveCropClassificationTimeWindow(input.cropSeasonStart, input.cropSeasonEnd, sentinelFetchDate)
    : resolveSentinelHubWmsTimeWindow(activeWmsLayer, sentinelFetchDate, deltaPreviousDate)
  const wmsBaseUrl = getSentinelHubWmsBaseUrl()
  const tilePixels = resolveSentinelHubWmsTilePixels(activeWmsLayer)
  const tileUrls = displayChunks.map(chunk =>
    buildSentinelHubWmsGetMapUrlParts({
      baseUrl: wmsBaseUrl,
      layer: wmsGetMapLayerName,
      timeStart,
      timeEnd,
      cloudCoverage: input.effectiveWmsCloudCoverage,
      geometryWkt3857: chunk.geometryWkt3857 ?? undefined,
      evalscriptB64: chunk.evalscriptB64,
      tilePixels,
      categorical:
        isLulcClassificationLayerId(activeWmsLayer) ||
        isAdiLayerId(activeWmsLayer) ||
        isNcadiLayerId(activeWmsLayer) ||
        isWapiLayerId(activeWmsLayer),
    }),
  )

  const sourceRefreshKey = [
    activeWmsLayer,
    input.wmsTimeWindowKey,
    input.sessionKey,
    displayChunks.length,
    tilePixels,
  ].join(':')

  return {
    idPrefix,
    clipSource: input.clipSource,
    displayChunks,
    tileUrls,
    tilePixels,
    aoiBoundsLngLat,
    renderReady: true,
    sessionKey: input.sessionKey,
    sourceRefreshKey,
  }
}

export function resolveSiSentinelAoiWmsChunkBounds(
  stack: SiSentinelAoiWmsStackState,
  chunk: SentinelHubWmsAoiClipPart | undefined,
): [number, number, number, number] | undefined {
  return chunk?.aoiBoundsLngLat ?? stack.aoiBoundsLngLat ?? undefined
}
