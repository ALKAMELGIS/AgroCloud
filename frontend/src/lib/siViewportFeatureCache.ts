/**
 * In-memory cache for viewport-fetched GeoJSON features (dedupe + bbox query).
 */

import { computeStableGisFeatureKey } from './gisFeatureStableKey'
import {
  filterFeatureCollectionByLngLatBBox,
  lngLatBBoxContains,
  normalizeLngLatBBox,
  type LngLatBBox,
  lngLatBBoxCacheKey,
} from './siMapViewport'

function featureCacheId(raw: unknown, index: number): string {
  const props = (raw as { properties?: Record<string, unknown> })?.properties ?? {}
  const oid = props.OBJECTID ?? props.objectid ?? props.GlobalID ?? props.globalid ?? props.FID
  if (oid != null && String(oid).trim()) return `oid:${String(oid).trim()}`
  return computeStableGisFeatureKey(raw, index)
}

export class SiViewportFeatureCache {
  private byId = new Map<string, unknown>()
  private fetchedTileKeys = new Set<string>()
  /** Bboxes successfully queried from ArcGIS (prefetch envelope). */
  private fetchedRegions: LngLatBBox[] = []

  get size(): number {
    return this.byId.size
  }

  hasTileKey(bbox: LngLatBBox, tileDeg?: number): boolean {
    return this.fetchedTileKeys.has(lngLatBBoxCacheKey(bbox, tileDeg))
  }

  /** True when this prefetch bbox was already queried (not just the quantized tile key). */
  isPrefetchCovered(bbox: LngLatBBox): boolean {
    const target = normalizeLngLatBBox(bbox)
    if (!target) return false
    return this.fetchedRegions.some(region => lngLatBBoxContains(region, target))
  }

  markTileFetched(bbox: LngLatBBox, tileDeg?: number): void {
    const normalized = normalizeLngLatBBox(bbox)
    if (normalized) this.fetchedRegions.push(normalized)
    this.fetchedTileKeys.add(lngLatBBoxCacheKey(bbox, tileDeg))
  }

  merge(features: unknown[]): void {
    features.forEach((raw, i) => {
      this.byId.set(featureCacheId(raw, i), raw)
    })
  }

  featureCollectionInBBox(bbox: LngLatBBox): { type: 'FeatureCollection'; features: unknown[] } {
    return filterFeatureCollectionByLngLatBBox(
      { type: 'FeatureCollection', features: [...this.byId.values()] },
      bbox,
    )
  }

  allFeatureCollection(): { type: 'FeatureCollection'; features: unknown[] } {
    return { type: 'FeatureCollection', features: [...this.byId.values()] }
  }

  clear(): void {
    this.byId.clear()
    this.fetchedTileKeys.clear()
    this.fetchedRegions = []
  }
}
