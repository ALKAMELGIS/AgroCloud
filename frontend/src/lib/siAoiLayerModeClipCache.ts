/**
 * Stable AOI clip cache for Layers AOI mode — avoids recomputing mask GeoJSON and
 * Sentinel WMS display chunks (WKT + evalscript / dataMask) on every toggle.
 */

import {
  buildSiAoiMaskBuilderGeoJson,
  effectiveAoiMaskFilterValues,
  type SiAoiMaskBuilderLayerLike,
  type SiAoiMaskBuilderSettings,
} from './siAoiMaskBuilder'
import { featureToPrimaryAoiFeature, isAgroStructuresLayer, buildAgroStructuresLayerAoiMask } from './agroStructuresPrimaryAoi'
import {
  buildSentinelHubWmsDisplayChunks,
  type BuildSentinelHubWmsAoiClipOptions,
  type SentinelHubWmsAoiClipPart,
} from './sentinelHubWmsAoiClip'
import { computeStableGisFeatureKey } from './gisFeatureStableKey'

export type SiAoiLayerModeClipMask = { type: 'FeatureCollection'; features: unknown[] } | null

const MASK_CACHE_MAX = 32
const CHUNKS_CACHE_MAX = 48

const maskCache = new Map<string, SiAoiLayerModeClipMask>()
const chunksCache = new Map<string, SentinelHubWmsAoiClipPart[]>()

function readFeatureProperties(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const f = raw as Record<string, unknown>
  if (f.properties && typeof f.properties === 'object' && !Array.isArray(f.properties)) {
    return f.properties as Record<string, unknown>
  }
  return {}
}

/** Compact signature of layer GeoJSON for cache keys (stable across identical geometry). */
export function siAoiLayerGeoJsonCacheSig(layer: SiAoiMaskBuilderLayerLike | null | undefined): string {
  const features = Array.isArray(layer?.geojson?.features) ? layer!.geojson!.features! : []
  if (!features.length) return `empty:${String(layer?.id ?? '')}`
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const idTokens: string[] = []
  const step = features.length > 200 ? Math.ceil(features.length / 200) : 1
  for (let i = 0; i < features.length; i += step) {
    const raw = features[i]
    const props = readFeatureProperties(raw)
    idTokens.push(String(props.OBJECTID ?? props.GlobalID ?? computeStableGisFeatureKey(raw, i)))
    const geom = (raw as { geometry?: { coordinates?: unknown } })?.geometry
    const ring = Array.isArray(geom?.coordinates?.[0]?.[0]) ? (geom!.coordinates as number[][][])[0]?.[0] : null
    if (Array.isArray(ring) && ring.length >= 2) {
      const lng = Number(ring[0])
      const lat = Number(ring[1])
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        minLng = Math.min(minLng, lng)
        minLat = Math.min(minLat, lat)
        maxLng = Math.max(maxLng, lng)
        maxLat = Math.max(maxLat, lat)
      }
    }
  }
  const bbox =
    Number.isFinite(minLng) && Number.isFinite(minLat)
      ? `${minLng.toFixed(5)},${minLat.toFixed(5)},${maxLng.toFixed(5)},${maxLat.toFixed(5)}`
      : 'nobbox'
  return `n${features.length}|${bbox}|${idTokens.slice(0, 12).join(',')}`
}

/** Settings-only pin key — stable across viewport pan/zoom geo churn. */
export function siAoiLayerModeSettingsPinKey(
  settings: Pick<SiAoiMaskBuilderSettings, 'sourceLayerId' | 'maskMode' | 'filterField' | 'filterValues'>,
  selectedFeatureKeys: Set<string>,
  layer?: SiAoiMaskBuilderLayerLike | null,
): string {
  const filterValues = layer ? effectiveAoiMaskFilterValues(layer, settings) : settings.filterValues
  let key = `lid:${settings.sourceLayerId}|mode:${settings.maskMode}|field:${settings.filterField}|fv:${filterValues.join(',')}`
  if (settings.maskMode === 'selected-features') {
    key += `|sel:${[...selectedFeatureKeys].sort().join(',')}`
  }
  return key
}

export function siAoiLayerModeMaskCacheKey(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
  settings: Pick<SiAoiMaskBuilderSettings, 'sourceLayerId' | 'maskMode' | 'filterField' | 'filterValues'>,
  selectedFeatureKeys: Set<string>,
): string {
  const geoSig = siAoiLayerGeoJsonCacheSig(layer)
  const filterValues = effectiveAoiMaskFilterValues(layer, settings)
  return `${siAoiLayerModeSettingsPinKey(settings, selectedFeatureKeys, layer)}|geo:${geoSig}`
}

/** Cache key from a resolved clip mask (pinned Layers AOI) — decoupled from live viewport geo. */
export function siAoiLayerModeClipMaskCacheKey(
  mask: SiAoiLayerModeClipMask,
  settings: Pick<SiAoiMaskBuilderSettings, 'sourceLayerId' | 'maskMode' | 'filterField' | 'filterValues'>,
  selectedFeatureKeys: Set<string>,
): string {
  const pseudoLayer: SiAoiMaskBuilderLayerLike = {
    id: settings.sourceLayerId,
    geojson: mask ?? undefined,
  }
  return siAoiLayerModeMaskCacheKey(pseudoLayer, settings, selectedFeatureKeys)
}

function trimCache<K, V>(map: Map<K, V>, max: number): void {
  while (map.size > max) {
    const first = map.keys().next().value
    if (first === undefined) break
    map.delete(first)
  }
}

/** Build clip mask without requiring `settings.enabled` (for prefetch + cache). */
export function buildSiAoiLayerModeClipMask(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
  settings: Pick<SiAoiMaskBuilderSettings, 'maskMode' | 'filterField' | 'filterValues'>,
  selectedFeatureKeys: Set<string>,
): SiAoiLayerModeClipMask {
  if (!layer) return null

  const filterValues = effectiveAoiMaskFilterValues(layer, settings)
  const filterField =
    settings.filterField.trim() ||
    (isAgroStructuresLayer(layer) ? 'Structure_Type' : settings.filterField)

  const mask = buildSiAoiMaskBuilderGeoJson(
    layer,
    { filterField, filterValues, maskMode: settings.maskMode },
    selectedFeatureKeys,
  )
  if (mask?.features?.length) return mask

  if (isAgroStructuresLayer(layer)) {
    return buildAgroStructuresLayerAoiMask(layer.geojson ?? null)
  }

  if (settings.maskMode === 'entire-layer' && layer.geojson?.features?.length) {
    const features: unknown[] = []
    for (const raw of layer.geojson.features) {
      const aoi = featureToPrimaryAoiFeature(raw)
      if (aoi) features.push(aoi)
    }
    if (features.length) return { type: 'FeatureCollection', features }
  }

  return null
}

export function getCachedSiAoiLayerModeClipMask(
  layer: SiAoiMaskBuilderLayerLike | null | undefined,
  settings: Pick<SiAoiMaskBuilderSettings, 'sourceLayerId' | 'maskMode' | 'filterField' | 'filterValues'>,
  selectedFeatureKeys: Set<string>,
): SiAoiLayerModeClipMask {
  const key = siAoiLayerModeMaskCacheKey(layer, settings, selectedFeatureKeys)
  if (maskCache.has(key)) return maskCache.get(key) ?? null
  const mask = buildSiAoiLayerModeClipMask(layer, settings, selectedFeatureKeys)
  maskCache.set(key, mask)
  trimCache(maskCache, MASK_CACHE_MAX)
  return mask
}

export function siAoiLayerModeChunksCacheKey(
  maskCacheKey: string,
  layerName: string,
  sceneDate: string | null | undefined,
  options?: Pick<BuildSentinelHubWmsAoiClipOptions, 'indexVisibilityMin' | 'maxTileLayers'>,
): string {
  return [
    maskCacheKey,
    `layer:${layerName}`,
    `scene:${sceneDate ?? ''}`,
    `vmin:${options?.indexVisibilityMin ?? ''}`,
    `cap:${options?.maxTileLayers ?? ''}`,
  ].join('|')
}

/** Settings-pin chunk key — stable across viewport pan/zoom while warming prefetch tiles. */
export function siAoiLayerModeWarmChunksCacheKey(
  settingsPinKey: string,
  layerName: string,
  sceneDate: string | null | undefined,
  options?: Pick<BuildSentinelHubWmsAoiClipOptions, 'indexVisibilityMin' | 'maxTileLayers'>,
): string {
  return siAoiLayerModeChunksCacheKey(settingsPinKey, layerName, sceneDate, options)
}

export function getCachedSentinelHubWmsDisplayChunks(
  clipSource: unknown,
  layerName: string,
  options: BuildSentinelHubWmsAoiClipOptions | undefined,
  cacheKey: string,
): SentinelHubWmsAoiClipPart[] {
  const hit = chunksCache.get(cacheKey)
  if (hit) return hit
  const chunks = buildSentinelHubWmsDisplayChunks(clipSource, layerName, options)
  chunksCache.set(cacheKey, chunks)
  trimCache(chunksCache, CHUNKS_CACHE_MAX)
  return chunks
}

export function clearSiAoiLayerModeClipCaches(): void {
  maskCache.clear()
  chunksCache.clear()
}
