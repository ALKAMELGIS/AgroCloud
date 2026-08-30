/**
 * Mapbox GL feature identify — query rendered features at a map click.
 */

import { computeStableGisFeatureKey, findFeatureIndexByStableKey, gisFeatureIdFromProperties } from './gisFeatureStableKey'
import { isSiLayerPopupEnabled, type SiLayerPopupConfig } from './siLayerPopupConfig'

export type MapboxRenderedHit = {
  layer?: { id?: string }
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: unknown }
  id?: string | number
}

/** Mapbox layer id `${sourceId}-fill|line|circle|…` → GeoJSON source id. */
export function mapboxLayerIdToSourceId(mapboxLayerId: string): string | null {
  const m = mapboxLayerId.match(/^(.+)-(fill|line|circle|marker|label|cluster|cluster-count)$/)
  return m ? m[1]! : null
}

export function isMapIdentifyLayerSkippable(layerId: string): boolean {
  if (!layerId) return true
  if (layerId.startsWith('si-crop-alert-')) return true
  if (layerId.startsWith('si-geo-ai-pin')) return true
  if (layerId.startsWith('si-geo-ai-sel-')) return true
  if (layerId.startsWith('si-draw-draft')) return true
  if (layerId.startsWith('si-edit-handles')) return true
  if (layerId.startsWith('si-measure-')) return true
  if (layerId === 'sentinel-layer' || layerId.startsWith('sentinel-layer-') || layerId === 'si-stac-thumb-layer') {
    return true
  }
  if (layerId === 'background') return true
  return false
}

function sublayerRank(layerId: string): number {
  if (/-cluster-count$/.test(layerId)) return -2
  if (/-cluster$/.test(layerId)) return -1
  if (/-circle$/.test(layerId)) return 0
  if (/-marker$/.test(layerId)) return 1
  if (/-fill$/.test(layerId)) return 2
  if (/-line$/.test(layerId)) return 3
  return 4
}

function preferHit(a: MapboxRenderedHit, b: MapboxRenderedHit): number {
  return sublayerRank(String(a?.layer?.id ?? '')) - sublayerRank(String(b?.layer?.id ?? ''))
}

/** Keep top-most source (Mapbox order) with the best sub-layer per source. */
export function rankMapIdentifyHits(hits: MapboxRenderedHit[]): MapboxRenderedHit[] {
  const out: MapboxRenderedHit[] = []
  const sourceIndex = new Map<string, number>()

  for (const h of hits) {
    const lid = String(h?.layer?.id ?? '')
    const sid = mapboxLayerIdToSourceId(lid) ?? lid
    const ix = sourceIndex.get(sid)
    if (ix === undefined) {
      sourceIndex.set(sid, out.length)
      out.push(h)
      continue
    }
    if (preferHit(h, out[ix]!) < 0) out[ix] = h
  }
  return out
}

export function filterMapLayerIdsThatExist(
  map: { getStyle?: () => { layers?: Array<{ id: string }> } | null; getLayer?: (id: string) => unknown },
  candidateIds: string[],
): string[] {
  if (!candidateIds.length) return []
  const out: string[] = []
  for (const id of candidateIds) {
    try {
      if (map.getLayer?.(id)) out.push(id)
    } catch {
      /* ignore */
    }
  }
  if (out.length) return out
  const style = map.getStyle?.()
  if (!style?.layers?.length) return []
  const existing = new Set(style.layers.map(l => l.id))
  return candidateIds.filter(id => existing.has(id))
}

function queryRenderedHitsAtPoint(
  map: {
    project: (lngLat: [number, number]) => { x: number; y: number }
    queryRenderedFeatures: (
      geometry: [number, number] | [[number, number], [number, number]],
      opts?: { layers?: string[] },
    ) => MapboxRenderedHit[]
  },
  lng: number,
  lat: number,
  layerIds: string[],
  pixelTolerance = 6,
): MapboxRenderedHit[] {
  const existing = filterMapLayerIdsThatExist(map, layerIds)
  if (!existing.length) return []

  const pt = map.project([lng, lat])
  const tol = Math.max(3, pixelTolerance)
  const bbox: [[number, number], [number, number]] = [
    [pt.x - tol, pt.y - tol],
    [pt.x + tol, pt.y + tol],
  ]

  const runQuery = (geometry: [number, number] | [[number, number], [number, number]]) => {
    try {
      return map.queryRenderedFeatures(geometry, { layers: existing }) ?? []
    } catch {
      return []
    }
  }

  let hits = runQuery(bbox)
  if (!hits.length) hits = runQuery([pt.x, pt.y])
  return hits.filter(h => !isMapIdentifyLayerSkippable(String(h?.layer?.id ?? '')))
}

/** All rendered hits at a point (may include overlapping polygons from one layer). */
export function queryAllMapFeaturesAtPoint(
  map: Parameters<typeof queryRenderedHitsAtPoint>[0],
  lng: number,
  lat: number,
  layerIds: string[],
  pixelTolerance = 6,
): MapboxRenderedHit[] {
  return queryRenderedHitsAtPoint(map, lng, lat, layerIds, pixelTolerance)
}

export function queryMapFeaturesAtPoint(
  map: Parameters<typeof queryRenderedHitsAtPoint>[0],
  lng: number,
  lat: number,
  layerIds: string[],
  pixelTolerance = 6,
): MapboxRenderedHit[] {
  return rankMapIdentifyHits(queryRenderedHitsAtPoint(map, lng, lat, layerIds, pixelTolerance))
}

/** Dedupe overlapping hits that refer to the same feature identity. */
export function dedupeOverlapHitsByFeature(hits: MapboxRenderedHit[]): MapboxRenderedHit[] {
  const seen = new Set<string>()
  const out: MapboxRenderedHit[] = []
  for (const h of hits) {
    const rawProps =
      h.properties && typeof h.properties === 'object' && !Array.isArray(h.properties)
        ? (h.properties as Record<string, unknown>)
        : {}
    const clean = sanitizeIdentifyProperties(rawProps)
    const idKey = gisFeatureIdFromProperties(clean)?.key ?? JSON.stringify(clean)
    if (seen.has(idKey)) continue
    seen.add(idKey)
    out.push(h)
  }
  return out
}

/** Overlapping features from the same vector source as the primary hit (ArcGIS-style stack). */
export function overlapHitsForPrimarySource(
  allHits: MapboxRenderedHit[],
  primaryHit: MapboxRenderedHit,
): MapboxRenderedHit[] {
  const primarySid = mapboxLayerIdToSourceId(String(primaryHit?.layer?.id ?? ''))
  if (!primarySid) return [primaryHit]
  const sameSource = allHits.filter(
    h => mapboxLayerIdToSourceId(String(h?.layer?.id ?? '')) === primarySid,
  )
  const deduped = dedupeOverlapHitsByFeature(sameSource)
  return deduped.length ? deduped : [primaryHit]
}

const FEATURE_POPUP_TITLE_KEYS = [
  'OBJECT_NAME',
  'Object_Name',
  'object_name',
  'Label',
  'label',
  'LABEL',
  'NAME',
  'Name',
  'name',
  'Farm_Name',
  'farm_name',
  'title',
  'Title',
  'OBJECT_ID',
  'OBJECTID',
  'ObjectId',
  'objectid',
  'Feature_ID',
  'feature_id',
] as const

/** Popup header — prefer object / feature label over layer name. */
export function getFeaturePopupTitle(
  properties: Record<string, unknown> | null | undefined,
  layerFallback = '',
): string {
  if (!properties || typeof properties !== 'object') return layerFallback
  for (const k of FEATURE_POPUP_TITLE_KEYS) {
    const v = properties[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return layerFallback
}

export function sanitizeIdentifyProperties(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('mapbox_')) continue
    if (k === 'layer' || k === 'id' || k === 'source_layer') continue
    out[k] = v
  }
  return out
}

export type CustomLayerIdentifyMeta = {
  id: string
  name: string
  popupConfig?: SiLayerPopupConfig | null
  geojson?: { features?: unknown[] } | null
}

export function safeMapboxLayerId(value: unknown): string {
  return String(value ?? 'layer')
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 80)
}

export function resolveCustomLayerFromMapboxHit(
  mapboxLayerId: string,
  customLayers: CustomLayerIdentifyMeta[],
): CustomLayerIdentifyMeta | null {
  const sid = mapboxLayerIdToSourceId(mapboxLayerId)
  if (sid) {
    const bySid = customLayers.find(l => safeMapboxLayerId(l.id) === sid)
    if (bySid) return bySid
  }
  const base = mapboxLayerId.replace(/-(fill|line|circle|cluster|cluster-count|marker|label)$/, '')
  return customLayers.find(l => String(l.id) === base) ?? null
}

export function resolveFeatureLinkFromMapHit(
  hit: MapboxRenderedHit,
  customLayer: CustomLayerIdentifyMeta,
): { layerId: string; featureKey: string } | null {
  const rawProps =
    hit.properties && typeof hit.properties === 'object' && !Array.isArray(hit.properties)
      ? (hit.properties as Record<string, unknown>)
      : {}
  const clean = sanitizeIdentifyProperties(rawProps)
  const feats = customLayer.geojson?.features
  if (!Array.isArray(feats)) return null

  const hitIdFromProps = gisFeatureIdFromProperties(clean)
  if (hitIdFromProps) {
    const ix = findFeatureIndexByStableKey(feats, hitIdFromProps.key)
    if (ix >= 0) {
      const f = feats[ix]
      return { layerId: String(customLayer.id), featureKey: computeStableGisFeatureKey(f, ix) }
    }
  }

  const want = JSON.stringify(clean)
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i] as { properties?: Record<string, unknown> }
    const fp =
      f.properties && typeof f.properties === 'object' && !Array.isArray(f.properties)
        ? sanitizeIdentifyProperties(f.properties)
        : {}
    if (JSON.stringify(fp) === want) {
      return { layerId: String(customLayer.id), featureKey: computeStableGisFeatureKey(f, i) }
    }
  }

  if (typeof hit.id === 'string' || typeof hit.id === 'number') {
    const idStr = String(hit.id)
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i] as { id?: unknown; properties?: Record<string, unknown> }
      if (String(f.id ?? '') === idStr) {
        return { layerId: String(customLayer.id), featureKey: computeStableGisFeatureKey(f, i) }
      }
      const oid =
        f.properties?.OBJECT_ID ??
        f.properties?.OBJECTID ??
        f.properties?.objectid ??
        f.properties?.Feature_ID ??
        f.properties?.object_id ??
        f.properties?.FID
      if (oid != null && String(oid) === idStr) {
        return { layerId: String(customLayer.id), featureKey: computeStableGisFeatureKey(f, i) }
      }
    }
  }
  return null
}

export function isCustomLayerPopupEnabled(layer: CustomLayerIdentifyMeta | null | undefined): boolean {
  if (!layer) return true
  return isSiLayerPopupEnabled(layer.popupConfig)
}

/** Cycle index when the user clicks the same map spot with multiple overlapping features. */
export function nextOverlapPickIndex(
  prev: { lng: number; lat: number; count: number; index: number } | null,
  lng: number,
  lat: number,
  count: number,
  toleranceDeg = 1.5e-5,
): number {
  if (!prev || prev.count !== count) return 0
  if (Math.hypot(lng - prev.lng, lat - prev.lat) > toleranceDeg) return 0
  return (prev.index + 1) % Math.max(1, count)
}
