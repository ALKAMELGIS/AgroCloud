/**
 * Resolve the best FeatureCollection for Layers AOI clipping — works for any
 * imported / ArcGIS / uploaded vector layer regardless of feature count.
 *
 * Priority: largest available geometry set (session cache → layer.geojson → viewport).
 * Never assume a fixed farm count; each layer may have N = 1 … tens of thousands.
 */

import type { SiAoiMaskBuilderLayerLike } from './siAoiMaskBuilder'
import type { SiViewportFeatureCache } from './siViewportFeatureCache'

export type LayersAoiClipGeoJson = { type: 'FeatureCollection'; features: unknown[] }

export type ResolveLayersAoiClipGeoJsonInput = {
  layer: SiAoiMaskBuilderLayerLike | null | undefined
  /** Accumulated ArcGIS viewport cache for this layer id (may be larger than current view). */
  viewportCache?: SiViewportFeatureCache | null
  /** Current-viewport snapshot only — last resort while cache/full geo are empty. */
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
 * Best geometry for indexing / mask build for the given layer.
 * Safe for streaming ArcGIS layers and fully downloaded GeoJSON alike.
 */
export function resolveLayersAoiClipGeoJson(
  input: ResolveLayersAoiClipGeoJsonInput,
): LayersAoiClipGeoJson | null {
  const layer = input.layer
  if (!layer) return null
  const layerFc =
    Array.isArray(layer.geojson?.features) && layer.geojson!.features!.length > 0
      ? (layer.geojson as LayersAoiClipGeoJson)
      : null
  const cacheFc = input.viewportCache?.allFeatureCollection?.() ?? null
  const viewportFc =
    Array.isArray(input.viewportGeoJson?.features) && input.viewportGeoJson!.features!.length > 0
      ? input.viewportGeoJson!
      : null
  return pickLargestFeatureCollection(cacheFc, layerFc, viewportFc)
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
 * True when the current clip is incomplete relative to what we already know
 * about the layer (metadata / local geo / cache). No fixed N assumed.
 */
export function layersAoiClipNeedsHydrate(opts: {
  layer: SiAoiMaskBuilderLayerLike | null | undefined
  pinFeatureCount: number
  cacheFeatureCount: number
}): boolean {
  const { layer, pinFeatureCount, cacheFeatureCount } = opts
  if (!layer) return false
  const localN = Array.isArray(layer.geojson?.features) ? layer.geojson!.features!.length : 0
  const expected = layersAoiExpectedFeatureCount(layer)
  const known = Math.max(localN, cacheFeatureCount, expected ?? 0)
  // Incomplete vs known inventory.
  if (known > 0 && pinFeatureCount < known) return true
  // ArcGIS streaming with little/no geometry yet — always hydrate once.
  if (
    layer.source === 'arcgis' &&
    Boolean((layer as { viewportStreaming?: boolean }).viewportStreaming) &&
    pinFeatureCount === 0
  ) {
    return true
  }
  // ArcGIS FeatureServer / MapServer layer URL present and pin empty or thinner than cache.
  if (layer.source === 'arcgis' && String(layer.sourceUrl || '').trim()) {
    if (pinFeatureCount === 0) return true
    if (cacheFeatureCount > pinFeatureCount) return true
  }
  return false
}
