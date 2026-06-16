/**
 * Resolve map pin coordinates from model reply + user text + vector layers (Claude / DeepSeek Geo AI, etc.).
 * Mirrors the coordinate preference rules in runGeoExplorerGeminiTurn (layer hint vs MAP_QUERY).
 */

import { parseMapQueryLngLat } from './geoExplorerGemini'
import {
  extractGeoExplorerLayerHint,
  findLngLatFromLayerQuery,
  GEO_EXPLORER_MIN_LAYER_PIN_SCORE,
  isGisDataScopedQuestion,
  type GeoAiMapLayer,
  type LayerQueryMatch,
} from './geoExplorerLayerContext'
import { gateModelMapQuery } from './geoExplorerSpatialGate'

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

export type GeoAiResolvedPin = {
  coords: [number, number]
  layerHit: LayerQueryMatch | null
  pinSource: 'map_query' | 'layer'
}

export function resolveGeoAiPinFromUserTextAndReply(
  userText: string,
  reply: string,
  combinedLayers: GeoAiMapLayer[],
): GeoAiResolvedPin | null {
  let mapQueryCoords = parseMapQueryLngLat(reply)
  const trimmed = userText.trim()
  const layerHit: LayerQueryMatch | null =
    trimmed.length > 0 ? findLngLatFromLayerQuery(trimmed, combinedLayers) : null

  const strongLayerHit: LayerQueryMatch | null =
    layerHit && layerHit.score >= GEO_EXPLORER_MIN_LAYER_PIN_SCORE ? layerHit : null

  const layerHintTrim = (trimmed ? extractGeoExplorerLayerHint(trimmed, combinedLayers) : null)?.trim() ?? ''
  const preferLayerCoords =
    Boolean(strongLayerHit) &&
    (Boolean(layerHintTrim) ||
      Boolean(
        mapQueryCoords &&
          strongLayerHit &&
          haversineKm(mapQueryCoords, [strongLayerHit.lng, strongLayerHit.lat]) > 2,
      ))

  if (preferLayerCoords && strongLayerHit) {
    return { coords: [strongLayerHit.lng, strongLayerHit.lat], layerHit: strongLayerHit, pinSource: 'layer' }
  }

  const dataScoped = isGisDataScopedQuestion(trimmed, combinedLayers)
  if (dataScoped && !strongLayerHit && mapQueryCoords) {
    mapQueryCoords = null
  }

  if (mapQueryCoords && !strongLayerHit) {
    const gate = gateModelMapQuery({
      userText: trimmed,
      replyText: reply,
      mapQueryCoords,
      strongLayerHit,
    })
    if (!gate.allow) mapQueryCoords = null
  }

  if (mapQueryCoords) {
    return { coords: mapQueryCoords, layerHit: strongLayerHit, pinSource: 'map_query' }
  }
  if (strongLayerHit) {
    return { coords: [strongLayerHit.lng, strongLayerHit.lat], layerHit: strongLayerHit, pinSource: 'layer' }
  }
  return null
}
