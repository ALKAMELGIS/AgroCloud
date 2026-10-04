import type { DevelopEliteMapView } from './developEliteKpiEngine'
import type { DevelopEliteMapRasterSlot } from './developEliteMapRasterConfig'
import {
  clipSubtypeToStructureFilter,
  filterAgroStructuresBySubtype,
} from './developEliteStructureSubtypeFilter'
import {
  agroStructuresLayerAoiSignature,
  buildAgroStructuresLayerAoiMask,
} from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'
import { siAoiLayerModeChunksCacheKey } from '@/modules/remote-sensing/imagery/siAoiLayerModeClipCache'
import {
  buildSiSentinelAoiWmsStackState,
  type SiSentinelAoiWmsStackState,
} from '@/modules/remote-sensing/imagery/siSentinelAoiWmsStack'

export type DevelopEliteMapRasterStackInput = {
  slot: DevelopEliteMapRasterSlot
  slotIndex: number
  structuresGeoJson: GeoJSON.FeatureCollection
  viewport: DevelopEliteMapView | null
  sentinelFetchDate: string
}

const DEVELOP_ELITE_RASTER_MAX_TILE_LAYERS = 48

export function buildDevelopEliteRasterClipFeatureCollection(
  structures: GeoJSON.FeatureCollection,
  slot: DevelopEliteMapRasterSlot,
  viewport: DevelopEliteMapView | null,
): GeoJSON.FeatureCollection {
  if (!slot.clipmask) {
    return { type: 'FeatureCollection', features: [] }
  }

  const subtypeFilter = clipSubtypeToStructureFilter(slot.clipSubtype)
  const features = filterAgroStructuresBySubtype(structures, subtypeFilter).features
  return { type: 'FeatureCollection', features }
}

/**
 * Sentinel WMS clip + dataMask AOI — Farm Plots / PIVOT polygons merged for GEOMETRY + evalscript.
 */
export function buildDevelopEliteRasterWmsClipSource(
  structures: GeoJSON.FeatureCollection,
  slot: DevelopEliteMapRasterSlot,
  viewport: DevelopEliteMapView | null,
): GeoJSON.FeatureCollection | null {
  if (!slot.clipmask) {
    return { type: 'FeatureCollection', features: [] }
  }
  const filtered = buildDevelopEliteRasterClipFeatureCollection(structures, slot, viewport)
  return buildAgroStructuresLayerAoiMask(filtered)
}

/** Clipmask requires GEOMETRY WKT on every chunk — never full-canvas evalscript bleed. */
export function isDevelopEliteClippedRasterStackReady(
  slot: DevelopEliteMapRasterSlot,
  stack: SiSentinelAoiWmsStackState | null | undefined,
): boolean {
  if (!stack?.renderReady || !stack.tileUrls.length) return false
  if (!slot.clipmask) return true
  if (!stack.displayChunks.length) return false
  return stack.displayChunks.every(chunk => !!chunk.geometryWkt3857)
}

export function buildDevelopEliteMapRasterStack(
  input: DevelopEliteMapRasterStackInput,
): SiSentinelAoiWmsStackState {
  const { slot, slotIndex, structuresGeoJson, viewport, sentinelFetchDate } = input
  const idPrefix = `develop-elite-raster-${slotIndex}`
  const filteredForSig = buildDevelopEliteRasterClipFeatureCollection(structuresGeoJson, slot, viewport)
  const maskFc = buildDevelopEliteRasterWmsClipSource(structuresGeoJson, slot, viewport)

  const wmsClipSource: unknown = slot.clipmask
    ? maskFc?.features?.length
      ? maskFc
      : null
    : { type: 'FeatureCollection', features: [] }

  const preferSingleRingChunks = Boolean(slot.clipmask)
  const maskPin = `develop-elite|${agroStructuresLayerAoiSignature(filteredForSig)}|${slot.clipSubtype}|single:${preferSingleRingChunks ? 1 : 0}`
  const maskCacheKey = siAoiLayerModeChunksCacheKey(maskPin, slot.layerId, sentinelFetchDate, {
    maxTileLayers: DEVELOP_ELITE_RASTER_MAX_TILE_LAYERS,
    viewportBBox: null,
    preferSingleRingChunks,
  })

  return buildSiSentinelAoiWmsStackState(idPrefix, {
    clipSource: wmsClipSource,
    maskCacheKey,
    sessionKey: maskCacheKey,
    activeWmsLayer: slot.layerId,
    sentinelFetchDate,
    wmsTimeWindowKey: sentinelFetchDate,
    effectiveWmsCloudCoverage: 100,
    autoPreviousSceneDate: null,
    catalogSceneIsos: [],
    timeSeriesStart: '',
    cropSeasonStart: '',
    cropSeasonEnd: '',
    indexVisibilityMin: null,
    viewportBBox: null,
    maxTileLayers: DEVELOP_ELITE_RASTER_MAX_TILE_LAYERS,
    preferSingleRingChunks,
    terrain3dCloudExtrusion: false,
  })
}
