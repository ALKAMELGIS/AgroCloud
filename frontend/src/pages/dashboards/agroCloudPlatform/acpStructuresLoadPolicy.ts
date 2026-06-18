import {
  getGisContentItemDetails,
  getGisContentMapRegistry,
  getGisContentRowById,
} from '../../../lib/gisContentPortalStore'
import {
  isAgroStructuresPortalRow,
  readGisHostedFeatureLayerSnapshot,
} from '../../../lib/gisHostedFeatureLayerPortal'
import type { LngLatBBox } from '../../../lib/siMapViewport'
import { lngLatBBoxCacheKey } from '../../../lib/siMapViewport'

export type AcpStructuresLoadReason = 'initial' | 'portal' | 'viewport' | 'manual'

export type AcpStructuresLoadRequest = {
  force?: boolean
  reason?: AcpStructuresLoadReason
  showLoadingBanner?: boolean
}

/** Stable signature for a GeoJSON feature collection (count + object-id fingerprint). */
export function geojsonCollectionSignature(
  geojson: GeoJSON.FeatureCollection | null | undefined,
): string {
  if (!geojson?.features?.length) return 'empty'
  const ids: number[] = []
  for (const feature of geojson.features) {
    const props = feature.properties as Record<string, unknown> | undefined
    const id = Number(props?.OBJECTID ?? props?.objectid ?? NaN)
    if (Number.isFinite(id)) ids.push(id)
  }
  ids.sort((a, b) => a - b)
  const featureCount = geojson.features.length
  if (!ids.length) return `n0:${featureCount}`
  let hash = 0
  for (const id of ids) hash = (Math.imul(hash, 31) + id) | 0
  return `${featureCount}:${ids.length}:${ids[0]}:${ids[ids.length - 1]}:${hash}`
}

/** Quantized viewport bbox key — avoids reload on minor pan/zoom jitter. */
export function quantizeViewportBboxSignature(bbox: LngLatBBox | null | undefined): string | null {
  if (!bbox) return null
  return lngLatBBoxCacheKey(bbox)
}

/** Portal Agro_Structures layer identity — changes only when the layer source changes. */
export function resolveAgroStructuresPortalSignature(): string {
  const registry = getGisContentMapRegistry()
  for (const id of registry.activeItemIds) {
    const row = getGisContentRowById(id)
    if (!row || !isAgroStructuresPortalRow(row)) continue
    const snap = readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(row.id))
    const ext = snap?.externalServiceUrl?.trim() ?? ''
    const published = snap?.publishedAt ?? ''
    const count = snap?.featureCount ?? snap?.geojson?.features?.length ?? 0
    const geoSig = geojsonCollectionSignature(
      (snap?.geojson as GeoJSON.FeatureCollection | undefined) ?? null,
    )
    return `${row.id}|${ext}|${published}|n${count}|${geoSig}`
  }
  return 'external'
}
