import {
  buildSentinelLayerLiveWmsTileSpecs,
  SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM,
  type SentinelLayerLiveWmsTileSpec,
} from '../../../lib/sentinelLayerLiveWmsEngine'
import type { LngLatBBox } from '../../../lib/siMapViewport'
import { resolveAcpWmsBuildOptions } from './acpWmsClip'

export type AcpWmsTileEntry = {
  layerKey: string
  spec: SentinelLayerLiveWmsTileSpec
  rasterUrl: string
  bounds: LngLatBBox | null
}

/** @deprecated use AcpWmsTileEntry */
export type AcpWmsFieldTileEntry = AcpWmsTileEntry

function fieldLayerKey(feature: GeoJSON.Feature, index: number, chunkIndex = 0): string {
  const props = (feature.properties ?? {}) as Record<string, unknown>
  const id = String(props.OBJECTID ?? props.objectid ?? props.__acpFieldKey ?? index).trim()
  return chunkIndex > 0 ? `${id}-${chunkIndex}` : id
}

function buildPackedWmsTileEntries(
  clip: GeoJSON.FeatureCollection,
  wmsLayerName: string,
  startDate: string,
  endDate: string,
  cloudCoverage: number,
  maxWmsLayers: number | undefined,
  keyPrefix: string,
): AcpWmsTileEntry[] {
  const analysisDate = String(endDate || startDate || '').trim().slice(0, 10)
  const fieldCount = clip.features.length
  const wmsBuild = resolveAcpWmsBuildOptions(fieldCount, maxWmsLayers)
  const tileCap = wmsBuild.maxTileLayers ?? SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM

  const specs = buildSentinelLayerLiveWmsTileSpecs({
    clipSource: clip,
    wmsLayerName,
    analysisDate,
    startDate,
    endDate,
    cloudCoverage,
    lookbackDays: 30,
    wmsBuild: {
      preferSingleRingChunks: false,
      maxTileLayers: tileCap,
      viewportBBox: null,
    },
  })

  return specs.map((spec, index) => ({
    layerKey: `${keyPrefix}${index}`,
    spec,
    rasterUrl: spec.url,
    bounds: spec.boundsLngLat,
  }))
}

/**
 * Build WMS tile specs — one MapLibre raster source per AOI when under platform cap;
 * otherwise packed multipolygon chunks that still include every ring in the load set.
 */
export function buildAcpWmsChunkTileEntries(
  clip: GeoJSON.FeatureCollection,
  wmsLayerName: string,
  startDate: string,
  endDate: string,
  cloudCoverage: number,
  maxWmsLayers?: number,
): AcpWmsTileEntry[] {
  const analysisDate = String(endDate || startDate || '').trim().slice(0, 10)
  if (!analysisDate || !clip.features.length) return []

  const fieldCount = clip.features.length
  const wmsBuild = resolveAcpWmsBuildOptions(fieldCount, maxWmsLayers)
  const tileCap = wmsBuild.maxTileLayers ?? SENTINEL_LAYER_LIVE_WMS_MAX_TILE_LAYERS_PLATFORM
  const perField =
    wmsBuild.preferSingleRingChunks &&
    fieldCount > 0 &&
    fieldCount <= tileCap

  if (perField) {
    const entries: AcpWmsTileEntry[] = []
    for (let i = 0; i < clip.features.length; i++) {
      const feature = clip.features[i] as GeoJSON.Feature
      const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [feature] }
      const specs = buildSentinelLayerLiveWmsTileSpecs({
        clipSource: fc,
        wmsLayerName,
        analysisDate,
        startDate,
        endDate,
        cloudCoverage,
        lookbackDays: 30,
        wmsBuild: resolveAcpWmsBuildOptions(1, maxWmsLayers),
      })
      specs.forEach((spec, chunkIndex) => {
        entries.push({
          layerKey: fieldLayerKey(feature, i, chunkIndex),
          spec,
          rasterUrl: spec.url,
          bounds: spec.boundsLngLat,
        })
      })
    }
    return entries
  }

  return buildPackedWmsTileEntries(
    clip,
    wmsLayerName,
    startDate,
    endDate,
    cloudCoverage,
    maxWmsLayers,
    'p-',
  )
}

/** @deprecated */
export function buildAcpWmsFieldTileEntries(
  clip: GeoJSON.FeatureCollection,
  wmsLayerName: string,
  analysisDate: string,
  cloudCoverage: number,
): AcpWmsTileEntry[] {
  const date = analysisDate.slice(0, 10)
  return buildAcpWmsChunkTileEntries(clip, wmsLayerName, date, date, cloudCoverage)
}

export function wmsSourceIdForChunk(layerKey: string): string {
  const safe = layerKey.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 56)
  return `acp-sentinel-wms-c-${safe}`
}

export function wmsLayerIdForChunk(layerKey: string): string {
  return `${wmsSourceIdForChunk(layerKey)}-raster`
}

/** @deprecated */
export function wmsSourceIdForField(fieldKey: string): string {
  return wmsSourceIdForChunk(fieldKey)
}

/** @deprecated */
export function wmsLayerIdForField(fieldKey: string): string {
  return wmsLayerIdForChunk(fieldKey)
}

/** @deprecated Layer cap is applied at WKT merge build time — passthrough for callers. */
export function limitAcpWmsTileEntries(entries: AcpWmsTileEntry[], _maxLayers?: number): AcpWmsTileEntry[] {
  return entries
}
