/**
 * Safety gate for Geo AI map moves — prefer no pin over a wrong pin.
 */

const AR_HINT = /[\u0600-\u06FF]/

export const SPATIAL_GUIDANCE = {
  en: {
    noMatch: 'No matching reliable results were found — the map was not moved.',
    unclearRequest: 'I could not fully understand this request — please rephrase or name a layer/field more clearly.',
    specifyLayerOrPlace:
      'Please specify the layer name, feature ID, or place name more clearly so we can target the correct location.',
    insufficientData: 'There is not enough reliable data to run this spatial action safely — the map was not moved.',
    cannotLocatePrecisely:
      'The requested location could not be determined with sufficient confidence — the map was not moved.',
    lowConfidenceMapQuery:
      'The suggested map position was not confident enough — the map was not moved to avoid showing a wrong place.',
    ambiguousPlaces: (labels: string[]) =>
      `Several possible places matched (${labels.join(' · ')}). Reply with the exact name or coordinates — the map was not moved.`,
  },
  ar: {
    noMatch: 'لم يتم العثور على نتائج مطابقة موثوقة — لم يتم تحريك الخريطة.',
    unclearRequest: 'لم أفهم الطلب بشكل كامل — جرّب صياغة أوضح.',
    specifyLayerOrPlace: 'يرجى تحديد اسم الموقع أو الطبقة بشكل أوضح.',
    insufficientData: 'لا توجد بيانات كافية لتنفيذ العملية بأمان — لم يتم تحريك الخريطة.',
    cannotLocatePrecisely: 'تعذر تحديد الموقع المطلوب بدقة — لم يتم تحريك الخريطة.',
    lowConfidenceMapQuery:
      'موقع الخريطة المقترح لم يكن بدرجة ثقة كافية — لم يتم تحريك الخريطة لتجنب عرض موقع خاطئ.',
    ambiguousPlaces: (labels: string[]) =>
      `تطابق عدة أماكن محتملة (${labels.join(' · ')}). أجب بالاسم الدقيق أو الإحداثيات — لم يتم تحريك الخريطة.`,
  },
} as const

export function spatialLang(userText: string): 'ar' | 'en' {
  return AR_HINT.test(userText.trim()) ? 'ar' : 'en'
}

const NAV_VERB_EN =
  /\b(zoom|fly|center|centre|pan|pin|goto|go\s+to|navigate|locate|where\s+is|where's|map\s+of|show\s+(?:me\s+)?(?:on\s+)?(?:the\s+)?map|display\s+(?:on\s+)?(?:the\s+)?map|open\s+(?:the\s+)?map\s+to|coordinates?\b|lat(?:itude)?\b|lon(?:gitude)?\b)\b/i

const NAV_AR =
  /أين\s|موقع|إحداثيات|خط\s+العرض|خط\s+الطول|قرّب|تكبير|تصغير|عرض\s+على\s+الخريطة|وجّه\s+الخريطة|انتقل\s+إلى/i

const TABULAR_ANALYSIS_EN =
  /\b(filter|filtering|condition|criteria|comparison\s+operator|attribute\s+table|tabular|statistics|stats|group\s+by|calculate\s+field|selection\s+rows|feature\s+values|only\s+have\s+layer\s+summary|full\s+attribute\s+table)\b/i

const TABULAR_AR =
  /تصفية|شرط|جدول\s+السمات|إحصاء|مجموع|متوسط|عدد|استعلام|حقول|طبقة\s+ولكن/i

/** User clearly wants the map view to change (not only tabular analysis). */
export function userExplicitlyRequestedMapNavigation(userText: string): boolean {
  const t = userText.trim()
  if (!t) return false
  return NAV_VERB_EN.test(t) || NAV_AR.test(t)
}

/** Heavy tabular / stats phrasing without navigation — do not trust blind MAP_QUERY / geocode fly. */
export function isTabularAnalysisHeavyQuestion(userText: string): boolean {
  const t = userText.trim()
  if (!t) return false
  return TABULAR_ANALYSIS_EN.test(t) || TABULAR_AR.test(t)
}

export type GeoAiCopilotJson = {
  intent?: string
  action?: string
  location?: { lat?: number | null; lon?: number | null }
}

export function parseGeoAiCopilotJson(replyText: string): GeoAiCopilotJson | null {
  const tag = 'GEO_AI_JSON:'
  const idx = replyText.lastIndexOf(tag)
  if (idx < 0) return null
  const rest = replyText.slice(idx + tag.length).trim()
  try {
    const v = JSON.parse(rest) as GeoAiCopilotJson
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

function coordsRoughlyMatchJson(lng: number, lat: number, j: GeoAiCopilotJson | null, tolDeg = 0.04): boolean {
  if (!j?.location) return false
  const jLat = j.location.lat
  const jLon = j.location.lon
  if (typeof jLat !== 'number' || typeof jLon !== 'number') return false
  if (!Number.isFinite(jLat) || !Number.isFinite(jLon)) return false
  return Math.abs(jLat - lat) <= tolDeg && Math.abs(jLon - lng) <= tolDeg
}

import type { LayerQueryMatch } from './geoExplorerLayerContext'

export type SpatialGuidanceKey =
  | 'noMatch'
  | 'unclearRequest'
  | 'specifyLayerOrPlace'
  | 'insufficientData'
  | 'cannotLocatePrecisely'
  | 'lowConfidenceMapQuery'

export type ModelMapQueryGateResult = {
  allow: boolean
  confidence: number
}

/**
 * Block model-emitted MAP_QUERY when the user did not ask for map placement and Copilot trace disagrees.
 */
export function gateModelMapQuery(params: {
  userText: string
  replyText: string
  mapQueryCoords: [number, number]
  strongLayerHit: LayerQueryMatch | null
}): ModelMapQueryGateResult {
  const { userText, replyText, mapQueryCoords, strongLayerHit } = params
  if (strongLayerHit) {
    return { allow: true, confidence: 1 }
  }

  if (isTabularAnalysisHeavyQuestion(userText) && !userExplicitlyRequestedMapNavigation(userText)) {
    return { allow: false, confidence: 0.22 }
  }

  const j = parseGeoAiCopilotJson(replyText)
  let confidence = 0.55

  if (j?.action === 'zoom') confidence += 0.25
  if (j?.intent === 'gis_search') confidence += 0.15
  if (j?.intent === 'analysis' || j?.intent === 'unknown') confidence -= 0.2
  if (j?.action === 'none' || j?.action === 'highlight' || j?.action === 'weather') confidence -= 0.25

  if (coordsRoughlyMatchJson(mapQueryCoords[0], mapQueryCoords[1], j)) confidence += 0.15

  if (userExplicitlyRequestedMapNavigation(userText)) confidence += 0.2
  if (isTabularAnalysisHeavyQuestion(userText) && !userExplicitlyRequestedMapNavigation(userText)) {
    confidence -= 0.35
  }

  confidence = Math.max(0, Math.min(1, confidence))

  const allow = confidence >= 0.72
  return {
    allow,
    confidence,
  }
}

export function appendSpatialGuidance(
  replyText: string,
  lang: 'ar' | 'en',
  key: SpatialGuidanceKey,
  confidence?: number,
): string {
  const msg = SPATIAL_GUIDANCE[lang][key]
  const label = lang === 'ar' ? 'التحقق المكاني' : 'Map validation'
  const confBit =
    typeof confidence === 'number'
      ? lang === 'ar'
        ? `درجة الثقة: ${Math.round(confidence * 100)}٪. `
        : `Confidence: ${Math.round(confidence * 100)}%. `
      : ''
  return `${replyText.trimEnd()}\n\n**${label}:** ${confBit}${msg}`
}

export function appendAmbiguousGeocodeGuidance(replyText: string, lang: 'ar' | 'en', labels: string[]): string {
  const fn = SPATIAL_GUIDANCE[lang].ambiguousPlaces
  const line = typeof fn === 'function' ? fn(labels) : ''
  return `${replyText.trimEnd()}\n\n**${lang === 'ar' ? 'التحقق المكاني' : 'Map validation'}:** ${line}${refinementSuggestionsSuffix(lang)}`
}

export function refinementSuggestionsSuffix(lang: 'ar' | 'en'): string {
  if (lang === 'ar') {
    return '\n\n**اقتراحات:** ضع اسم الطبقة بين علامتي تنصيص، أو أرسل معرف العنصر، أو اكتب «انتقل إلى [اسم المكان]» عندما تريد تحريك الخريطة فقط.'
  }
  return '\n\n**Suggestions:** put the layer name in quotes, send a feature ID, or write “zoom to [place]” when you only want the map to move.'
}
