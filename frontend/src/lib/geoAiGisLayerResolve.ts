/**
 * Resolve GIS tool inputs from live map layers / AOI / "this" selection.
 */

import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import type { GeoAiLiveMapState } from './geoAiLiveMapContext'
import { normalizeLayerName } from './geoExplorerLayerContext'

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties?: Record<string, unknown> | null
    geometry?: { type?: string; coordinates?: unknown } | null
  }>
}

export type ResolvedGisLayer = {
  name: string
  source: 'layer' | 'aoi' | 'selected'
  collection: GeoJsonFeatureCollection
  featureCount: number
}

function asFeatureCollection(input: unknown): GeoJsonFeatureCollection | null {
  if (!input || typeof input !== 'object') return null
  const o = input as { type?: string; features?: unknown[]; geometry?: unknown }
  if (o.type === 'FeatureCollection' && Array.isArray(o.features)) {
    return {
      type: 'FeatureCollection',
      features: o.features.filter(Boolean).map(f => {
        const feat = f as {
          type?: string
          properties?: Record<string, unknown> | null
          geometry?: { type?: string; coordinates?: unknown } | null
        }
        return {
          type: 'Feature' as const,
          properties: feat.properties ?? {},
          geometry: feat.geometry ?? null,
        }
      }),
    }
  }
  if (o.type === 'Feature' && o.geometry) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: (o as { properties?: Record<string, unknown> }).properties ?? {},
          geometry: o.geometry as { type?: string; coordinates?: unknown },
        },
      ],
    }
  }
  if (o.type && o.geometry == null && Array.isArray((o as { coordinates?: unknown }).coordinates)) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: o as { type: string; coordinates: unknown } }],
    }
  }
  if (o.geometry && typeof o.geometry === 'object') {
    return asFeatureCollection({ type: 'Feature', properties: {}, geometry: o.geometry })
  }
  return null
}

function layerCollection(layer: GeoAiMapLayer): GeoJsonFeatureCollection | null {
  return asFeatureCollection(layer.geojson) || asFeatureCollection(layer.data)
}

function scoreNameMatch(query: string, candidate: string): number {
  const q = normalizeLayerName(query)
  const c = normalizeLayerName(candidate)
  if (!q || !c) return 0
  if (q === c) return 100
  if (c.includes(q) || q.includes(c)) return 80
  const qt = q.split(/\s+/).filter(Boolean)
  const ct = new Set(c.split(/\s+/).filter(Boolean))
  let hit = 0
  for (const t of qt) if (ct.has(t) || [...ct].some(x => x.includes(t) || t.includes(x))) hit += 1
  return hit ? 40 + hit * 10 : 0
}

function aoiCollection(state: GeoAiLiveMapState | null | undefined): GeoJsonFeatureCollection | null {
  if (!state?.aoiGeometry) return null
  return asFeatureCollection(state.aoiGeometry)
}

function selectedHintCollection(
  state: GeoAiLiveMapState | null | undefined,
  layers: GeoAiMapLayer[],
): ResolvedGisLayer | null {
  const sel = state?.selectedFeature
  if (!sel?.layerName) return null
  const match = resolveGisInputLayer({
    hint: sel.layerName,
    layers,
    liveMapState: state,
    allowAoiFallback: false,
  })
  if (!match.ok || !match.layer) return null
  return { ...match.layer, source: 'selected' }
}

export type ResolveGisInputResult =
  | { ok: true; layer: ResolvedGisLayer }
  | { ok: false; error: string; available: string[] }

/**
 * Resolve a layer name / "this" / AOI against loaded vector layers + live map state.
 */
export function resolveGisInputLayer(input: {
  hint?: string | null
  layers: GeoAiMapLayer[]
  liveMapState?: GeoAiLiveMapState | null
  allowAoiFallback?: boolean
}): ResolveGisInputResult {
  const layers = input.layers || []
  const available = layers.map(l => l.name).filter(Boolean)
  const aoi = aoiCollection(input.liveMapState)
  if (aoi?.features.length) available.push('AOI')

  const hint = (input.hint || '').trim()
  const allowAoi = input.allowAoiFallback !== false

  if (!hint || /^(this|it|here|the\s+aoi|aoi|current|selection|selected|هذا|هذه|المنطقة)$/i.test(hint)) {
    const selected = selectedHintCollection(input.liveMapState, layers)
    if (selected) return { ok: true, layer: selected }
    if (allowAoi && aoi?.features.length) {
      return {
        ok: true,
        layer: { name: 'AOI', source: 'aoi', collection: aoi, featureCount: aoi.features.length },
      }
    }
    if (layers.length === 1) {
      const only = layers[0]!
      const col = layerCollection(only)
      if (col?.features.length) {
        return {
          ok: true,
          layer: {
            name: only.name,
            source: 'layer',
            collection: col,
            featureCount: col.features.length,
          },
        }
      }
    }
    return {
      ok: false,
      error:
        'No input layer resolved. Name a loaded layer, draw an AOI, or select a feature. Available: ' +
        (available.length ? available.join(', ') : '(none)'),
      available,
    }
  }

  if (/^(aoi|the\s+aoi|analysis\s+boundary)$/i.test(hint)) {
    if (aoi?.features.length) {
      return {
        ok: true,
        layer: { name: 'AOI', source: 'aoi', collection: aoi, featureCount: aoi.features.length },
      }
    }
    return { ok: false, error: 'No AOI is drawn on the map yet.', available }
  }

  let best: { layer: GeoAiMapLayer; score: number; col: GeoJsonFeatureCollection } | null = null
  for (const layer of layers) {
    const col = layerCollection(layer)
    if (!col?.features.length) continue
    const score = Math.max(
      scoreNameMatch(hint, layer.name),
      scoreNameMatch(hint, layer.clientLayerId || ''),
    )
    if (score <= 0) continue
    if (!best || score > best.score) best = { layer, score, col }
  }

  if (best && best.score >= 40) {
    return {
      ok: true,
      layer: {
        name: best.layer.name,
        source: 'layer',
        collection: best.col,
        featureCount: best.col.features.length,
      },
    }
  }

  return {
    ok: false,
    error: `Could not match layer "${hint}". Available: ${available.length ? available.join(', ') : '(none)'}`,
    available,
  }
}

export function listAvailableGisLayerNames(
  layers: GeoAiMapLayer[],
  liveMapState?: GeoAiLiveMapState | null,
): string[] {
  const names = layers.map(l => l.name).filter(Boolean)
  if (aoiCollection(liveMapState)?.features.length) names.push('AOI')
  return names
}
