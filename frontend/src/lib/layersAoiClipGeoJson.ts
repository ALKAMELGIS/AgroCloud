/**
 * Resolve the FeatureCollection for Layers AOI clipping / Sentinel analysis.
 *
 * Analysis geometry (full-layer query) always wins. Viewport / Mapbox slices
 * are never the source of truth for streaming ArcGIS layers.
 */

import type { SiAoiMaskBuilderLayerLike } from './siAoiMaskBuilder'
import type { SiViewportFeatureCache } from './siViewportFeatureCache'

export type LayersAoiClipGeoJson = { type: 'FeatureCollection'; features: unknown[] }

export type ResolveLayersAoiClipGeoJsonInput = {
  layer: SiAoiMaskBuilderLayerLike | null | undefined
  /** Full-layer analysis cache (independent of pan/zoom). */
  analysisGeoJson?: LayersAoiClipGeoJson | null
  /** True when the analysis cache finished a complete layer query. */
  analysisComplete?: boolean
  /** @deprecated Viewport cache is display-only — ignored for streaming analysis. */
  viewportCache?: SiViewportFeatureCache | null
  /** @deprecated Viewport snapshot is display-only — ignored for streaming analysis. */
  viewportGeoJson?: LayersAoiClipGeoJson | null
}

function featureCount(fc: LayersAoiClipGeoJson | null | undefined): number {
  return Array.isArray(fc?.features) ? fc!.features.length : 0
}

/** Pick the FeatureCollection with the most features (ties keep the first non-empty). */
export function pickLargestFeatureCollection(
  ...candidates: Array<LayersAoiClipGeoJson | null | undefined>
): LayersAoiClipGeoJson | null {
  let best: LayersAoiClipGeoJson | null = null
  let bestN = 0
  for (const fc of candidates) {
    const n = featureCount(fc)
    if (n > bestN) {
      best = fc ?? null
      bestN = n
    }
  }
  return bestN > 0 ? best : null
}

/**
 * Best geometry for Sentinel clip / stats. Streaming layers wait for analysis cache.
 */
export function resolveLayersAoiClipGeoJson(
  input: ResolveLayersAoiClipGeoJsonInput,
): LayersAoiClipGeoJson | null {
  const layer = input.layer
  if (!layer) return null
  const analysisFc =
    Array.isArray(input.analysisGeoJson?.features) && input.analysisGeoJson!.features!.length > 0
      ? input.analysisGeoJson!
      : null
  if (analysisFc) return analysisFc

  const streaming =
    Boolean((layer as { viewportStreaming?: boolean }).viewportStreaming) &&
    (layer.source === 'arcgis' || Boolean(String((layer as { sourceUrl?: string }).sourceUrl || '').trim()))
  if (streaming) return null

  const layerFc =
    Array.isArray(layer.geojson?.features) && layer.geojson!.features!.length > 0
      ? (layer.geojson as LayersAoiClipGeoJson)
      : null
  return layerFc
}

/** Expected feature count hint from layer metadata (not a hard cap). */
export function layersAoiExpectedFeatureCount(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
): number | null {
  if (!layer) return null
  const meta = (layer as { importMetadata?: { featureCount?: number } }).importMetadata
  const fromMeta = Number(meta?.featureCount)
  if (Number.isFinite(fromMeta) && fromMeta > 0) return Math.floor(fromMeta)
  const n = Array.isArray(layer.geojson?.features) ? layer.geojson!.features!.length : 0
  return n > 0 ? n : null
}

/**
 * True when analysis still needs a full-layer service query (not a viewport fetch).
 */
export function layersAoiClipNeedsHydrate(opts: {
  layer: SiAoiMaskBuilderLayerLike | null | undefined
  pinFeatureCount: number
  cacheFeatureCount: number
  analysisComplete?: boolean
  analysisLoadedCount?: number
}): boolean {
  const { layer, pinFeatureCount, analysisComplete, analysisLoadedCount } = opts
  if (!layer) return false
  if (analysisComplete && (analysisLoadedCount ?? 0) > 0) return false
  const expected = layersAoiExpectedFeatureCount(layer)
  if (expected != null && pinFeatureCount > 0 && pinFeatureCount >= expected) return false
  const streaming = Boolean((layer as { viewportStreaming?: boolean }).viewportStreaming)
  const url = String((layer as { sourceUrl?: string }).sourceUrl || '').trim()
  if (streaming && url) return true
  if (layer.source === 'arcgis' && url) {
    if (pinFeatureCount === 0) return true
    if (expected != null && pinFeatureCount < expected) return true
  }
  return false
}
