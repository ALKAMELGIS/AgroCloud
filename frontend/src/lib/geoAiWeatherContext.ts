/**
 * Shared weather facts for Geo AI (Gemini Geo Explorer):
 * resolves coordinates (map anchor → inspect/popup selection → named layer feature → text geocode → map fallback),
 * then attaches **OpenWeather** when a key is set **plus** a compact **Open-Meteo** cross-check; without a key, full **Open-Meteo** only.
 */

import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import {
  buildAgriWeatherInsightAppend,
  buildOpenMeteoCompactComparisonBlock,
  fetchOpenMeteoCurrentSnapshot,
  GEO_AI_WEATHER_ASSISTANT_APPDX,
  resolveGeoAiWeatherFactsCoords,
  type WeatherFactsCoordResolution,
} from './geoAiWeatherEngine'
import { GEO_EXPLORER_SESSION_AND_WEATHER } from './geoExplorerGemini'
import {
  buildOpenMeteoContextBlock,
  buildSessionAnchorBlock,
  geoExplorerUserMessageImpliesWeather,
  type SessionAnchorPopup,
} from './openMeteoGeoExplorer'
import { buildOpenWeatherContextBlock } from './openWeatherGeoExplorer'

export type GeoAiWeatherPopupRef = {
  lng: number
  lat: number
  placeName: string
  country: string
  fullDescription: string
} | null

/** User named a specific calendar day — enable historical / per-day OpenWeather branches. */
function userRequestsExplicitCalendarDayForWeather(userText: string): boolean {
  const t = userText.trim()
  if (!t) return false
  return (
    /\b(today|tomorrow|yesterday|tonight|next\s+week|last\s+week|this\s+week)\b/i.test(t) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(t) ||
    /\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/.test(t) ||
    /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:\s*,?\s*\d{4})?\b/i.test(
      t,
    ) ||
    /\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(t)
  )
}

/** Session prose + anchor + weather facts (same bundle as Gemini Geo Explorer turn). */
export async function buildGeoAiFullWeatherSessionAppend(
  input: Parameters<typeof buildGeoAiWeatherSystemAppend>[0],
): Promise<string> {
  return `\n\n${GEO_EXPLORER_SESSION_AND_WEATHER}${await buildGeoAiWeatherSystemAppend(input)}`
}

function popupSnapForCoords(popup: GeoAiWeatherPopupRef, lng: number, lat: number): SessionAnchorPopup {
  if (!popup) return null
  if (Math.abs(popup.lng - lng) < 1e-5 && Math.abs(popup.lat - lat) < 1e-5) {
    return {
      placeName: popup.placeName,
      country: popup.country,
      fullDescription: popup.fullDescription,
    }
  }
  return null
}

/**
 * Returns extra system text: SESSION MAP ANCHOR (when coordinates are known) and, if the user asked about weather,
 * Open-Meteo facts and optionally OpenWeather facts.
 */
export async function buildGeoAiWeatherSystemAppend(input: {
  userText: string
  pinLngLat: [number, number] | null
  lastMapQueryCoords: [number, number] | null
  /** Inspect card / feature card coords (Satellite Geo AI) or map popup click (GIS) — stabilizes “weather at same pin”. */
  inspectAnchorLngLat?: [number, number] | null
  combinedLayers: GeoAiMapLayer[]
  mapboxAccessToken?: string
  openWeatherApiKey: string
  mapPopup: GeoAiWeatherPopupRef
}): Promise<string> {
  const pinCoords =
    input.pinLngLat ?? input.lastMapQueryCoords ?? (input.inspectAnchorLngLat ?? null) ?? null
  const weatherImplied = geoExplorerUserMessageImpliesWeather(input.userText)

  let factsCoords: [number, number] | null = null
  let weatherResolutionNote = ''
  let weatherResolved: WeatherFactsCoordResolution | null = null
  if (weatherImplied) {
    weatherResolved = await resolveGeoAiWeatherFactsCoords({
      userText: input.userText,
      pinLngLat: input.pinLngLat,
      lastMapQueryCoords: input.lastMapQueryCoords,
      inspectAnchorLngLat: input.inspectAnchorLngLat ?? null,
      combinedLayers: input.combinedLayers,
      mapboxAccessToken: input.mapboxAccessToken,
    })
    if (weatherResolved) {
      factsCoords = [weatherResolved.lng, weatherResolved.lat]
      weatherResolutionNote = `Weather location resolution: **${weatherResolved.source}**${weatherResolved.placeLabel ? ` — ${weatherResolved.placeLabel}` : ''}.`
    }
  }

  /** Only treat as “ambient follow-up” when the resolved weather point matches the map pin (avoid disabling calendar logic for remote cities while a pin exists elsewhere). */
  const ambientWeather =
    weatherImplied &&
    Boolean(pinCoords) &&
    Boolean(factsCoords) &&
    !userRequestsExplicitCalendarDayForWeather(input.userText) &&
    Math.abs(factsCoords![0] - pinCoords![0]) < 0.03 &&
    Math.abs(factsCoords![1] - pinCoords![1]) < 0.03

  const anchorCoords = pinCoords ?? (weatherImplied ? factsCoords : null)
  let out = ''

  if (anchorCoords) {
    const [aLng, aLat] = anchorCoords
    const popSnap = popupSnapForCoords(input.mapPopup, aLng, aLat)
    out += `\n\n${buildSessionAnchorBlock(aLng, aLat, popSnap)}`
  }

  if (weatherImplied && factsCoords) {
    const [fLng, fLat] = factsCoords
    const owm = input.openWeatherApiKey.trim()

    if (weatherResolutionNote.trim()) {
      out += `\n\n### WEATHER COORDINATE SOURCE\n${weatherResolutionNote}`
    }

    const layerForAgri =
      weatherResolved?.source === 'layer_feature' ? weatherResolved.layerHit : null
    const omSnap =
      layerForAgri && factsCoords
        ? await fetchOpenMeteoCurrentSnapshot(factsCoords[1], factsCoords[0])
        : null

    if (owm) {
      out += `\n\n${await buildOpenWeatherContextBlock(owm, fLat, fLng, input.userText, {
        ambientWindowOnly: ambientWeather,
      })}`
      out += `\n\n${await buildOpenMeteoCompactComparisonBlock(fLat, fLng)}`
    } else {
      out += `\n\n${await buildOpenMeteoContextBlock(fLat, fLng, input.userText)}`
    }

    if (layerForAgri && omSnap) {
      out += buildAgriWeatherInsightAppend(layerForAgri, {
        temp: omSnap.temp,
        windKmh: omSnap.windKmh,
      })
    }
  }

  if (weatherImplied) {
    out += `\n\n${GEO_AI_WEATHER_ASSISTANT_APPDX}`
  }

  return out
}
