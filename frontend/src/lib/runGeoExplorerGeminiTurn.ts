/**
 * Shared Gemini Geo Explorer / Geo AI turn: same system context, weather, layer lookup, and MAP_QUERY
 * logic for Satellite Imagery and GIS Map.
 */

import { buildGisContentLayersContext } from './geoAiChatClaude'
import { buildGeoAiFullWeatherSessionAppend, type GeoAiWeatherPopupRef } from './geoAiWeatherContext'
import {
  geocodePlaceCandidates,
  pickConfidentGeocode,
  simplifyGeoExplorerUserQuery,
  stripLayerReferenceForGeocode,
} from './geoExplorerGeocode'
import {
  GEO_AI_COPILOT_RULES,
  GEO_EXPLORER_LAYER_RULES,
  GEO_EXPLORER_SYSTEM_PROMPT,
  geminiGenerateContent,
  messagesToGeminiContents,
  parseMapQueryLngLat,
  stripMapQueryLine,
  type GeoExplorerMessage,
} from './geoExplorerGemini'
import {
  allowsGeocodeWhenNoStrongLayerHit,
  extractGeoExplorerLayerHint,
  findLngLatFromLayerQuery,
  GEO_EXPLORER_MIN_LAYER_PIN_SCORE,
  isGisDataScopedQuestion,
  summarizeGeoAiMapLayers,
  type GeoAiMapLayer,
  type LayerQueryMatch,
} from './geoExplorerLayerContext'
import { loadGisMapSavedLayers } from './gisMapLayerStore'
import {
  appendAmbiguousGeocodeGuidance,
  appendSpatialGuidance,
  gateModelMapQuery,
  isTabularAnalysisHeavyQuestion,
  refinementSuggestionsSuffix,
  spatialLang,
  userExplicitlyRequestedMapNavigation,
} from './geoExplorerSpatialGate'

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

export type GeoExplorerGeminiPinSource = 'map_query' | 'layer' | 'geocode'

export type GeoExplorerGeminiMapEffect = {
  coords: [number, number]
  pinSource: GeoExplorerGeminiPinSource
  layerHit: LayerQueryMatch | null
  replyText: string
}

export type RunGeoExplorerGeminiTurnResult = {
  modelMsg: GeoExplorerMessage
  mapEffect: GeoExplorerGeminiMapEffect | null
}

export type RunGeoExplorerGeminiTurnParams = {
  apiKey: string
  historyWithUser: GeoExplorerMessage[]
  userTextForMapFallback: string
  /** Vector layers for this surface (Satellite “added” layers or GIS map layers). */
  primaryVectorLayers: GeoAiMapLayer[]
  mapboxAccessToken?: string
  openWeatherApiKey: string
  pinLngLat: [number, number] | null
  lastMapQueryCoords: [number, number] | null
  /** Optional: inspect card / map-popup coords for weather when pin lags or user asks “weather here”. */
  inspectAnchorLngLat?: [number, number] | null
  mapPopup: GeoAiWeatherPopupRef
  /** First line of the added-layers section, e.g. "### Satellite — Added layers (this page)" */
  addedLayersHeading: string
  /**
   * GIS Map only: merge IndexedDB saved layers + GIS Content prompt block.
   * Satellite must pass `false` so Geo AI stays isolated from GIS Map storage and cannot recurse on huge combined layer sets.
   */
  attachGisSavedLayers?: boolean
  /** Optional extra authoritative blocks (e.g. Develop Dashboard snapshot excerpt). */
  extraSystemAppend?: string
  /**
   * User edited an existing question in-place; history already ends with the revised user message.
   * Model should answer concisely and apply deltas without generic re-onboarding.
   */
  questionEditInPlace?: boolean
}

export async function runGeoExplorerGeminiTurn(
  params: RunGeoExplorerGeminiTurnParams,
): Promise<RunGeoExplorerGeminiTurnResult> {
  const {
    apiKey,
    historyWithUser,
    userTextForMapFallback,
    primaryVectorLayers,
    mapboxAccessToken,
    openWeatherApiKey,
    pinLngLat,
    lastMapQueryCoords,
    inspectAnchorLngLat,
    mapPopup,
    addedLayersHeading,
    attachGisSavedLayers,
    extraSystemAppend,
    questionEditInPlace,
  } = params

  const attachGis = attachGisSavedLayers === true

  let combinedForLookup: GeoAiMapLayer[] = [...primaryVectorLayers]
  let gisBlock =
    '### GIS Content (saved layers from GIS Map)\n(Not attached on this page — open **GIS Map** → Geo AI to use layers saved in IndexedDB.)'

  if (attachGis) {
    const gisSaved = await loadGisMapSavedLayers()
    combinedForLookup = [
      ...primaryVectorLayers,
      ...gisSaved.map(
        (l): GeoAiMapLayer => ({
          name: l.name,
          visible: l.visible,
          source: l.source,
          data: l.data,
          arcgisLayerDefinition: (l as { arcgisLayerDefinition?: unknown }).arcgisLayerDefinition as
            | GeoAiMapLayer['arcgisLayerDefinition']
            | undefined,
        }),
      ),
    ]
    gisBlock = await buildGisContentLayersContext(22000)
  }

  const addedBlock = summarizeGeoAiMapLayers(primaryVectorLayers, 20000)

  const layerLookup: LayerQueryMatch | null =
    userTextForMapFallback.trim().length > 0
      ? findLngLatFromLayerQuery(userTextForMapFallback, combinedForLookup)
      : null

  let resolvedFeatureAppend = ''
  if (layerLookup && layerLookup.score >= 32) {
    resolvedFeatureAppend = `\n\n### RESOLVED LAYER FEATURE (authoritative for this user message)\nThe question matches **one** loaded vector feature. Answer using **only** this JSON for its attributes and treat the centroid as its map location—do not claim this id/code is missing from layers because the one-line "example attributes" sample showed a different row.\n- Layer: ${layerLookup.layerName}\n- Centroid WGS84 (longitude, latitude): ${layerLookup.lng}, ${layerLookup.lat}\n- Attributes:\n${layerLookup.matchSummary}`
  }

  const sessionWeatherBlocks = await buildGeoAiFullWeatherSessionAppend({
    userText: userTextForMapFallback,
    pinLngLat,
    lastMapQueryCoords,
    inspectAnchorLngLat,
    combinedLayers: combinedForLookup,
    mapboxAccessToken,
    openWeatherApiKey,
    mapPopup,
  })

  const tail = extraSystemAppend?.trim() ? `\n\n${extraSystemAppend.trim()}` : ''
  const editInPlaceNote = questionEditInPlace
    ? `\n\n### In-place question refinement\nThe user edited their latest question in the same thread (no new chat). Prior assistant replies after that question are not in this history. Answer only the **updated** wording: apply new field/layer/selection/stat instructions concisely. Skip greetings, recap, and generic onboarding.`
    : ''
  const systemInstruction = `${GEO_EXPLORER_SYSTEM_PROMPT}\n\n${GEO_AI_COPILOT_RULES}\n\n${GEO_EXPLORER_LAYER_RULES}${sessionWeatherBlocks}${resolvedFeatureAppend}\n\n---\n${addedLayersHeading}\n${addedBlock}\n\n${gisBlock}${editInPlaceNote}${tail}`

  let reply = await geminiGenerateContent({
    apiKey,
    systemInstruction,
    contents: messagesToGeminiContents(historyWithUser),
  })

  const dataScoped = isGisDataScopedQuestion(userTextForMapFallback, combinedForLookup)
  const layerHintTrim = (
    userTextForMapFallback ? extractGeoExplorerLayerHint(userTextForMapFallback, combinedForLookup) : null
  )?.trim() ?? ''
  const rawLayerHit = layerLookup
  const strongLayerHit: LayerQueryMatch | null =
    rawLayerHit && rawLayerHit.score >= GEO_EXPLORER_MIN_LAYER_PIN_SCORE ? rawLayerHit : null

  let mapQueryCoords = parseMapQueryLngLat(reply)
  if (dataScoped && !strongLayerHit && mapQueryCoords) {
    reply = `${stripMapQueryLine(reply).trimEnd()}\n\n**Map:** MAP_QUERY was removed — no confident feature match in your active or GIS Content layers; the app will not move the map to an unrelated location.${refinementSuggestionsSuffix(spatialLang(userTextForMapFallback))}`
    mapQueryCoords = null
  }

  if (mapQueryCoords && !strongLayerHit) {
    const mqGate = gateModelMapQuery({
      userText: userTextForMapFallback,
      replyText: reply,
      mapQueryCoords,
      strongLayerHit,
    })
    if (!mqGate.allow) {
      const lang = spatialLang(userTextForMapFallback)
      reply = `${stripMapQueryLine(reply).trimEnd()}`
      reply = appendSpatialGuidance(reply, lang, 'lowConfidenceMapQuery', mqGate.confidence)
      reply = `${reply.trimEnd()}${refinementSuggestionsSuffix(lang)}`
      mapQueryCoords = null
    }
  }

  let coords: [number, number] | null = null
  let replyText = reply
  let pinSource: GeoExplorerGeminiPinSource = 'geocode'

  const layerPinNote = (hit: LayerQueryMatch) => {
    const hint = hit.matchSummary.trim()
    return `\n\n(Map pin from layer "${hit.layerName}" — matched feature attributes: ${hint.slice(0, 200)}${hint.length > 200 ? '…' : ''})`
  }

  /** Prefer vector layer geometry when the user scoped a layer or MAP_QUERY disagrees strongly with the hit feature. */
  const preferLayerCoords =
    Boolean(strongLayerHit) &&
    (Boolean(layerHintTrim) ||
      Boolean(
        mapQueryCoords &&
          strongLayerHit &&
          haversineKm(mapQueryCoords, [strongLayerHit.lng, strongLayerHit.lat]) > 2,
      ))

  if (preferLayerCoords && strongLayerHit) {
    coords = [strongLayerHit.lng, strongLayerHit.lat]
    pinSource = 'layer'
    replyText = `${stripMapQueryLine(reply).trimEnd()}${layerPinNote(strongLayerHit)}`
  } else if (mapQueryCoords && (!dataScoped || strongLayerHit)) {
    coords = mapQueryCoords
    pinSource = 'map_query'
    replyText = reply
  } else if (userTextForMapFallback) {
    if (strongLayerHit) {
      coords = [strongLayerHit.lng, strongLayerHit.lat]
      pinSource = 'layer'
      replyText = `${reply.trimEnd()}${layerPinNote(strongLayerHit)}`
    } else if (
      allowsGeocodeWhenNoStrongLayerHit(userTextForMapFallback, combinedForLookup) &&
      !(isTabularAnalysisHeavyQuestion(userTextForMapFallback) && !userExplicitlyRequestedMapNavigation(userTextForMapFallback))
    ) {
      const geoQuery = stripLayerReferenceForGeocode(simplifyGeoExplorerUserQuery(userTextForMapFallback))
      if (geoQuery.length >= 2) {
        const candidates = await geocodePlaceCandidates(geoQuery, { mapboxAccessToken })
        const { chosen, ambiguous } = pickConfidentGeocode(candidates)
        const lang = spatialLang(userTextForMapFallback)
        if (chosen && !ambiguous) {
          coords = [chosen.lng, chosen.lat]
          pinSource = 'geocode'
          const safeLabel = chosen.label.replace(/\s+/g, ' ').trim().slice(0, 160)
          replyText = `${stripMapQueryLine(reply).trimEnd()}\n\n(Map centered on "${safeLabel}" — geocoder confidence OK.)`
        } else if (candidates.length >= 2 && ambiguous) {
          const shortLabels = candidates
            .slice(0, 3)
            .map(c => c.label.split(',').slice(0, 2).join(',').trim())
            .filter(Boolean)
          replyText = appendAmbiguousGeocodeGuidance(stripMapQueryLine(reply).trimEnd(), lang, shortLabels)
        } else if (!candidates.length) {
          replyText = `${appendSpatialGuidance(stripMapQueryLine(reply).trimEnd(), lang, 'cannotLocatePrecisely').trimEnd()}${refinementSuggestionsSuffix(lang)}`
        } else {
          replyText = `${appendSpatialGuidance(stripMapQueryLine(reply).trimEnd(), lang, 'insufficientData').trimEnd()}${refinementSuggestionsSuffix(lang)}`
        }
      }
    } else if (dataScoped) {
      replyText = reply.trimEnd()
      const lang = spatialLang(userTextForMapFallback)
      if (!/\b(not found|not available|no match|غير متوفر|لا توجد|لم يتم العثور)\b/i.test(replyText)) {
        replyText += `\n\n**Map:** No matching location in your layers — the map was not changed.${refinementSuggestionsSuffix(lang)}`
      }
    }
  }

  if (coords && !parseMapQueryLngLat(replyText)) {
    replyText = `${replyText.trimEnd()}\nMAP_QUERY:${coords[0]},${coords[1]}`
  }

  const modelId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `geo-m-${Date.now()}`
  const modelMsg: GeoExplorerMessage = {
    id: modelId,
    role: 'model',
    parts: [{ type: 'text', text: replyText }],
  }

  if (!coords) {
    return { modelMsg, mapEffect: null }
  }

  return {
    modelMsg,
    mapEffect: {
      coords,
      pinSource,
      layerHit: strongLayerHit,
      replyText,
    },
  }
}

export function geoExplorerTargetZoomForPinSource(pinSource: GeoExplorerGeminiPinSource): number {
  if (pinSource === 'layer') return 17
  if (pinSource === 'map_query') return 15.75
  return 13.65
}
