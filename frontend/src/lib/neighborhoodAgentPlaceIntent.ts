/**
 * Neighborhood Agent — place/navigate intents that must fly the AgroCloud map
 * (never Google Maps HTML embeds).
 */

import { stripGeoExplorerBubbleDisplayText } from './geoExplorerGemini'

export type NeighborhoodAgentPlaceIntent = {
  query: string
}

const PLACE_INTENT_RE =
  /^\s*(?:(?:please\s+)?(?:show|find|locate|navigate|take)\s+(?:me\s+)?(?:to\s+)?|fly\s+to\s+|go\s+to\s+|where\s+is\s+|zoom\s+to\s+|center\s+(?:on|at)\s+|اعرض(?:\s+لي)?\s+|اذهب\s+إلى\s+|وين\s+|أين\s+|خذني\s+(?:إلى\s+)?|توجه\s+إلى\s+)/i

/** Thematic / symbology / create-map phrasing — never treat as place navigation. */
const THEMATIC_MAP_INTENT_RE =
  /\b(thematic|themtic|choropleth|symbology|classify|create|generate|build|style|heatmap|legend)\b/i

/**
 * Stats / attribute / demographic questions — never geocode the whole sentence as a place.
 * Includes common typos (Popualtions → populati…).
 */
const LAYER_DATA_INTENT_RE =
  /\b(populati\w*|pop\b|attribute|attributes|field|fields|properties|how\s+many|how\s+much|number\s+of|count\s+of|total\s+of|what\s+is\s+the|what'?s\s+the|on\s+it|this\s+layer|loaded\s+layer|feature\s+code|sum\s+of|average\s+of)\b/i

const QUESTION_LIKE_RE =
  /\b(number\s+of|how\s+many|how\s+much|what\s+is|what'?s|tell\s+me|give\s+me|count|total|average|sum)\b/i

/** True when the message is a data/stats question, not “fly to place”. */
export function isNeighborhoodAgentDataQuestion(userMessage: string): boolean {
  const raw = userMessage.trim()
  if (!raw) return false
  if (LAYER_DATA_INTENT_RE.test(raw)) return true
  if (QUESTION_LIKE_RE.test(raw) && raw.split(/\s+/).length >= 3) return true
  if (/(سكان|مساحة|طبقة|سمات|حقل|عدد\s*(?:السكان)?|كم\s+عدد)/.test(raw)) return true
  return false
}

/**
 * Detect navigate / show-on-map intents and extract the place query.
 * Returns null when the message is not a place-navigation request.
 */
export function parseNeighborhoodAgentPlaceIntent(userMessage: string): NeighborhoodAgentPlaceIntent | null {
  const raw = userMessage.trim()
  if (!raw || raw.length > 200) return null

  // Thematic / analysis / demographic requests must not geocode (before navigate + bare-name).
  if (THEMATIC_MAP_INTENT_RE.test(raw)) return null
  if (isNeighborhoodAgentDataQuestion(raw)) return null

  if (PLACE_INTENT_RE.test(raw)) {
    const query = raw
      .replace(PLACE_INTENT_RE, '')
      .replace(/^(?:the\s+|a\s+|an\s+|على\s+(?:الخريطة\s+)?|في\s+(?:الخريطة\s+)?)/i, '')
      .replace(/\s+(?:on\s+(?:the\s+)?map|in\s+(?:the\s+)?map|على\s+الخريطة|في\s+الخريطة)\s*$/i, '')
      .replace(/[?.!]+$/g, '')
      .trim()
    // Still reject if the remainder is a stats question
    if (isNeighborhoodAgentDataQuestion(query)) return null
    if (query.length >= 2) return { query }
    return null
  }

  // Short “Dubai” / “دبي” style — only when no analysis/question/map words.
  if (
    raw.length <= 48 &&
    !QUESTION_LIKE_RE.test(raw) &&
    !/\b(analyze|analyse|ndvi|weather|count|summary|layers?|aoi|neighborhood|vegetation|buildings?|maps?|populati\w*|pop|attribute|field|number)\b/i.test(
      raw,
    ) &&
    !/(حلل|تحليل|كم|عدد|طقس|نبات|مباني|طبقات|سكان|مساحة)/.test(raw) &&
    /^[\p{L}\p{N}\s,',.\-]+$/u.test(raw)
  ) {
    const words = raw.split(/\s+/).filter(Boolean)
    if (words.length >= 1 && words.length <= 5) return { query: raw.replace(/[?.!]+$/g, '').trim() }
  }

  return null
}

export function formatNeighborhoodAgentFlyReply(
  place: { label: string; subtitle?: string; lng: number; lat: number },
  language: 'ar' | 'en' = 'en',
): string {
  const name = [place.label, place.subtitle].filter(Boolean).join(', ')
  const coords = `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`
  if (language === 'ar') {
    return `تم الانتقال إلى ${name} — ${coords}`
  }
  return `Flew to ${name} — ${coords}`
}

export function formatNeighborhoodAgentPlaceNotFound(query: string, language: 'ar' | 'en' = 'en'): string {
  if (language === 'ar') return `تعذر إيجاد "${query}" على الخريطة.`
  return `Could not find "${query}" on the map.`
}

/** Short professional reply when population/attribute is asked but no layer data matches. */
export function formatNeighborhoodAgentNoLayerDataReply(
  userMessage: string,
  language: 'ar' | 'en' = 'en',
): string {
  const place =
    userMessage
      .replace(/\b(number\s+of|how\s+many|how\s+much|what\s+is\s+(the\s+)?|populati\w*|pop|in|on|of|the|a|an)\b/gi, ' ')
      .replace(/[?.!]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48) || null

  if (language === 'ar') {
    const where = place ? ` لـ «${place}»` : ''
    return `لا تتوفر أرقام من الطبقات المحمّلة على الخريطة${where}. حمّل طبقة تحتوي حقل السكان (أو السمة المطلوبة)، أو حدّد معلمًا ثم أعد السؤال.\n\n**References**\n- AgroCloud — بيانات الطبقات المحمّلة على الخريطة`
  }
  const where = place ? ` for “${place}”` : ''
  return `No matching figures${where} are available from the layers currently on the map. Load a layer with a population (or target) field, or select a feature and ask again.\n\n**References**\n- AgroCloud loaded GIS layers — in-map attribute table`
}

/** Strip HTML embeds / noise so chat bubbles stay compact (map flies separately). */
export function sanitizeNeighborhoodAgentReplyText(raw: string): string {
  let text = stripGeoExplorerBubbleDisplayText(raw)
  // Never show internal tool / LIVE MAP STATE dumps in the bubble
  text = text
    .replace(/(?:^|\n)(?:#{1,3}\s*)?(?:\*\*)?Evidence(?:\*\*)?\s*:?[^\n]*\n(?:[-*•].*(?:\n|$))+/gim, '\n')
    .replace(/(?:^|\n)(?:#{1,3}\s*)?(?:\*\*)?Map actions(?:\*\*)?\s*:?[^\n]*\n(?:[-*•].*(?:\n|$))+/gim, '\n')
    .replace(/(?:^|\n)[-*•]\s*`?(?:read_live_map_state|get_weather_context|read_rs_analysis|run_vector_stats|query_layer_attributes)`?[\s\S]*?(?=\n[-*•]|\n#{1,3}|\n\*\*|$)/gi, '\n')
    .replace(/###\s*LIVE MAP STATE[\s\S]*?(?=\n###|\n\*\*|$)/gi, '\n')
    .replace(/###\s*OPENWEATHER FACTS[\s\S]*?(?=\n###|\n\*\*|$)/gi, '\n')
    .replace(/###\s*SESSION MAP ANCHOR[\s\S]*?(?=\n###|\n\*\*|$)/gi, '\n')
    .replace(/\bTreat these as facts;[^\n]*/gi, '')
  text = text
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/https?:\/\/[^\s<>"']*(?:google\.com\/maps|maps\.google)[^\s<>"']*/gi, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

  if (!text) {
    return 'I can help with map context in AgroCloud — ask about your AOI, layers, or surroundings.'
  }

  const maxChars = 1200
  if (text.length > maxChars) {
    return `${text.slice(0, maxChars).trimEnd()}…`
  }
  return text
}

/** System addendum for Neighborhood Agent / Geo AI send paths. */
export const NEIGHBORHOOD_AGENT_MAP_REPLY_ADDENDUM = `### NEIGHBORHOOD AGENT — MAP-NATIVE REPLIES
- NEVER emit HTML, <iframe>, Google Maps embeds, markdown image maps, or external map widgets.
- To show / find / navigate to a place, emit MAP_ACTION:{"op":"searchPlace","query":"<place>"} (or native search_place / fly_to). The AgroCloud Mapbox map will fly there.
- For pure navigate / "show me X" requests: user-facing prose must be ≤2 short sentences (one line preferred) confirming the fly-to with name + coordinates. No Summary/Evidence headings.
- Match the user's language (Arabic or English).

### STATS / BREAKDOWNS — CHART + TABLE (required when numbers split into groups)
- When the answer is a statistical or demographic breakdown (population shares, nationalities, class areas, counts by category, %, rankings), after a short prose lead (≤2 sentences) ALWAYS emit one compact GitHub-style markdown pipe table so the app can render a modern bar/pie chart + summary table.
- Prefer a short title line immediately above the table (e.g. "Nationality share" / "حصة الجنسيات"). Table: label column + numeric column (value and/or %). Max **6–8 rows**. Right-align numbers with \`---:\` separator.
- Keep answers **direct and brief** in normal chat voice — no long essays, no “Summary/Evidence” theatre, no dumping huge country lists.
- Cite sources as short **References** lines (paper-style: source name ± URL). Never paste LIVE MAP STATE / tool transcripts.
- Example:
Nationality share
| Group | Share % |
| --- | ---: |
| Indians | 28 |
| Pakistanis | 12 |
| Others | 60 |
- Do NOT dump long bullet lists of the same numbers when a table fits. Still never invent unsupported precision; cite the source briefly in prose.

### WEATHER / NUMERIC ANSWERS — VISUAL FIRST (mandatory)
- Do **not** write long narrative weather essays. Keep prose ≤2 short sentences (place + one highlight).
- ALWAYS emit compact markdown pipe tables; the app adds weather icons + pie / bar / timeline charts beside the tables:
  1) **Now** metrics table: Metric | Value (Temp °C, Feels °C, Humidity %, Pressure hPa, Wind m/s).
  2) **Forecast** table when forecast points exist: When | Sky | Temp °C | Feels °C (≤6 rows).
- Example:
Vračar · Clear sky
Now
| Metric | Value |
| --- | ---: |
| Temp °C | 27.7 |
| Feels °C | 28.0 |
| Humidity % | 48 |
| Pressure hPa | 1011 |
| Wind m/s | 3.13 |
Forecast °C
| When | Sky | Temp °C |
| --- | --- | ---: |
| 07-26 12:00 | Few clouds | 29.4 |
| 07-26 15:00 | Scattered clouds | 31.8 |
- Never mention OPENWEATHER FACTS / Evidence / tool names in user-facing prose. No Summary/Evidence headings.
- Same visual-first rule for any numeric analysis (counts, areas, indices): short lead + table (chart follows).

### LOADED LAYERS — PROFESSIONAL DATA ANSWERS (mandatory when layers exist)
- Treat every loaded GIS / vector layer as authoritative tabular geography. Answer attribute questions (population, area, name, codes, counts, filters) from layer data / tools — NEVER invent values and NEVER geocode a world city as a substitute.
- Prefer tools: \`query_layer_attributes\` / \`run_vector_stats\` / live map state. On a feature hit: fly_to or highlight the feature, then short prose (≤2 sentences) + a compact Field|Value markdown table of key attributes.
- For "how many / sum / average / population on the layer": aggregate with run_vector_stats and sync map selection when filters match.
- If the user says "on it" / "this layer", use the focused or only visible vector layer.
- Map interaction is required whenever a concrete feature or filtered set is answered: highlight / zoom / Focus map — not prose alone.`
