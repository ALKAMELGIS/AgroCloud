import { computeStableGisFeatureKey } from '../gisFeatureStableKey'
import {
  mapboxLayerIdToSourceId,
  nextOverlapPickIndex,
  queryMapFeaturesAtPoint,
  rankMapIdentifyHits,
  resolveCustomLayerFromMapboxHit,
  resolveFeatureLinkFromMapHit,
  sanitizeIdentifyProperties,
  type CustomLayerIdentifyMeta,
  type MapboxRenderedHit,
} from '../siMapFeatureIdentify'
import type { GisSelectionHit, GisSelectionLayerSource } from './types'

export type MapSelectionOverlapState = {
  lng: number
  lat: number
  count: number
  index: number
} | null

const BUILTIN_LAYER_PREFIXES: Array<{ prefix: string; layerId: string; layerName: string }> = [
  { prefix: 'si-aoi-fields-', layerId: '__aoi_fields__', layerName: 'AOI Fields' },
  { prefix: 'si-multi-aoi-', layerId: '__multi_aoi__', layerName: 'Multi AOI' },
  { prefix: 'drawn-index-geometry-', layerId: '__drawn_aoi__', layerName: 'Drawn AOI' },
  { prefix: 'si-stac-footprints-', layerId: '__stac_footprints__', layerName: 'STAC Footprints' },
]

function resolveBuiltinLayerSource(mapboxLayerId: string): { layerId: string; layerName: string } | null {
  for (const row of BUILTIN_LAYER_PREFIXES) {
    if (mapboxLayerId.startsWith(row.prefix)) return { layerId: row.layerId, layerName: row.layerName }
  }
  return null
}

function findFeatureInLayerSource(
  layer: GisSelectionLayerSource,
  hit: MapboxRenderedHit,
): { featureKey: string; properties: Record<string, unknown> } | null {
  const feats = layer.geojson?.features
  if (!Array.isArray(feats)) return null

  const rawProps =
    hit.properties && typeof hit.properties === 'object' && !Array.isArray(hit.properties)
      ? (hit.properties as Record<string, unknown>)
      : {}
  const clean = sanitizeIdentifyProperties(rawProps)
  const want = JSON.stringify(clean)

  for (let i = 0; i < feats.length; i++) {
    const f = feats[i] as { id?: unknown; properties?: Record<string, unknown> }
    const fp =
      f.properties && typeof f.properties === 'object' && !Array.isArray(f.properties)
        ? sanitizeIdentifyProperties(f.properties)
        : {}
    if (JSON.stringify(fp) === want) {
      return {
        featureKey: computeStableGisFeatureKey(f, i),
        properties: fp,
      }
    }
  }

  if (typeof hit.id === 'string' || typeof hit.id === 'number') {
    const idStr = String(hit.id)
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i] as { id?: unknown; properties?: Record<string, unknown> }
      if (String(f.id ?? '') === idStr) {
        return {
          featureKey: computeStableGisFeatureKey(f, i),
          properties: sanitizeIdentifyProperties(f.properties),
        }
      }
      const oid = f.properties?.OBJECTID ?? f.properties?.objectid ?? f.properties?.id ?? f.properties?.FID
      if (oid != null && String(oid) === idStr) {
        return {
          featureKey: computeStableGisFeatureKey(f, i),
          properties: sanitizeIdentifyProperties(f.properties),
        }
      }
    }
  }

  if (Object.keys(clean).length) {
    for (let i = 0; i < feats.length; i++) {
      const f = feats[i] as { properties?: Record<string, unknown> }
      const fp = sanitizeIdentifyProperties(f.properties)
      const overlap = Object.keys(clean).filter(k => fp[k] === clean[k]).length
      if (overlap >= Math.min(2, Object.keys(clean).length)) {
        return { featureKey: computeStableGisFeatureKey(f, i), properties: fp }
      }
    }
  }

  return null
}

function mapHitToSelectionHit(
  hit: MapboxRenderedHit,
  layers: GisSelectionLayerSource[],
  customLayers: CustomLayerIdentifyMeta[],
  selectableLayerIds: Set<string>,
): GisSelectionHit | null {
  const mapboxLayerId = String(hit?.layer?.id ?? '')
  if (!mapboxLayerId) return null

  const customLayer = resolveCustomLayerFromMapboxHit(mapboxLayerId, customLayers)
  if (customLayer) {
    if (!selectableLayerIds.has(String(customLayer.id))) return null
    const link = resolveFeatureLinkFromMapHit(hit, customLayer)
    if (!link) return null
    const source = layers.find(l => String(l.id) === link.layerId)
    const props =
      source?.geojson?.features && link.featureKey
        ? findFeatureInLayerSource(source, hit)?.properties
        : null
    return {
      layerId: link.layerId,
      featureKey: link.featureKey,
      layerName: customLayer.name,
      properties: props ?? sanitizeIdentifyProperties(hit.properties as Record<string, unknown>),
    }
  }

  const builtin = resolveBuiltinLayerSource(mapboxLayerId)
  if (!builtin || !selectableLayerIds.has(builtin.layerId)) return null
  const source = layers.find(l => String(l.id) === builtin.layerId)
  if (!source) return null
  const resolved = findFeatureInLayerSource(source, hit)
  if (!resolved) return null
  return {
    layerId: builtin.layerId,
    featureKey: resolved.featureKey,
    layerName: builtin.layerName,
    properties: resolved.properties,
  }
}

export function resolveSelectionSetModeFromClick(
  baseMode: 'new' | 'add' | 'remove' | 'subset',
  clickEv?: MouseEvent | null,
): 'new' | 'add' | 'remove' | 'subset' {
  if (!clickEv) return baseMode
  if (clickEv.ctrlKey && clickEv.shiftKey) return 'subset'
  if (clickEv.ctrlKey) return 'remove'
  if (clickEv.shiftKey) return 'add'
  return baseMode
}

export function selectFeaturesAtMapPoint(args: {
  map: Parameters<typeof queryMapFeaturesAtPoint>[0]
  lng: number
  lat: number
  queryableLayerIds: string[]
  layers: GisSelectionLayerSource[]
  customLayers: CustomLayerIdentifyMeta[]
  selectableLayerIds: Set<string>
  overlapState: MapSelectionOverlapState
  pickSingle?: boolean
}): { hits: GisSelectionHit[]; overlapState: MapSelectionOverlapState } {
  const {
    map,
    lng,
    lat,
    queryableLayerIds,
    layers,
    customLayers,
    selectableLayerIds,
    overlapState,
    pickSingle = true,
  } = args

  let rendered = queryMapFeaturesAtPoint(map, lng, lat, queryableLayerIds)
  if (!rendered.length) {
    const pt = map.project([lng, lat])
    try {
      const fallback =
        map.queryRenderedFeatures([pt.x, pt.y])?.filter(h => {
          const lid = String(h?.layer?.id ?? '')
          return lid && queryableLayerIds.includes(lid)
        }) ?? []
      rendered = rankMapIdentifyHits(fallback)
    } catch {
      rendered = []
    }
  }

  const selectableHits: GisSelectionHit[] = []
  const seenSources = new Set<string>()
  const seenKeys = new Set<string>()
  for (const hit of rendered) {
    const sid = mapboxLayerIdToSourceId(String(hit?.layer?.id ?? '')) ?? String(hit?.layer?.id ?? '')
    if (seenSources.has(sid)) continue
    const sel = mapHitToSelectionHit(hit, layers, customLayers, selectableLayerIds)
    if (!sel) continue
    seenSources.add(sid)
    const key = `${sel.layerId}::${sel.featureKey}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    selectableHits.push(sel)
  }

  if (!selectableHits.length) {
    return { hits: [], overlapState: null }
  }

  if (!pickSingle) {
    return { hits: selectableHits, overlapState: null }
  }

  const pickIx = nextOverlapPickIndex(overlapState, lng, lat, selectableHits.length)
  const nextOverlap: MapSelectionOverlapState = {
    lng,
    lat,
    count: selectableHits.length,
    index: pickIx,
  }
  return { hits: [selectableHits[pickIx]!], overlapState: nextOverlap }
}
