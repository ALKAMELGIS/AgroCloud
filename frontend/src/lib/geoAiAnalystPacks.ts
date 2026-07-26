/**
 * Analyst packs — intent classifier + multi-tool composers for Geo AI Agent chips.
 *
 * When a quick-action chip (or matching free-text) hits AOI / neighborhood /
 * vegetation / density / flood-heat / weather intents, the turn runner auto-executes
 * a small tool pack against live map state and loaded layers before the model
 * writes Summary / Evidence / Map actions.
 */

export const GEO_AI_ANALYST_PACK_IDS = [
  'analyze-aoi',
  'count-buildings',
  'neighborhood',
  'vegetation',
  'flood-slope',
  'weather',
  'layer-summary',
  'layer-attribute',
] as const

export type GeoAiAnalystPackId = (typeof GEO_AI_ANALYST_PACK_IDS)[number]

export type GeoAiAnalystPackToolCall = {
  name: string
  args: Record<string, unknown>
}

const CHIP_ID_TO_PACK: Record<string, GeoAiAnalystPackId> = {
  'analyze-aoi': 'analyze-aoi',
  'count-buildings': 'count-buildings',
  neighborhood: 'neighborhood',
  vegetation: 'vegetation',
  'flood-slope': 'flood-slope',
  weather: 'weather',
  'layer-summary': 'layer-summary',
  'layer-attribute': 'layer-attribute',
  identify: 'analyze-aoi',
}

/**
 * Classify a user message / chip into an analyst pack.
 * Chip id wins when present; otherwise regex heuristics on the prompt text.
 */
export function classifyGeoAiAnalystIntent(
  userMessage: string,
  chipId?: string | null,
): GeoAiAnalystPackId | null {
  const chip = (chipId || '').trim().toLowerCase()
  if (chip && CHIP_ID_TO_PACK[chip]) return CHIP_ID_TO_PACK[chip]

  const q = userMessage.trim().toLowerCase()
  if (!q) return null

  // Density / buildings / roads — before generic "analyze"
  if (
    /\b(count\s+buildings?|building\s+count|how\s+many\s+buildings?)\b/i.test(q) ||
    /\b(building|road)\s+density\b/i.test(q) ||
    /\bdensity\s+of\s+(buildings?|roads?)\b/i.test(q) ||
    /\bcount\s+roads?\b/i.test(q)
  ) {
    return 'count-buildings'
  }

  // Neighborhood / surroundings — before vegetation so combined prompts keep this pack
  if (
    /\b(neighborhood|surroundings|area\s+character)\b/i.test(q) ||
    /\bwhat'?s\s+around\b/i.test(q) ||
    /\bwhat\s+is\s+around\b/i.test(q) ||
    /\bbuildings?\b[\s\S]{0,80}\broads?\b[\s\S]{0,80}\bvegetation\b/i.test(q) ||
    /\bvegetation\b[\s\S]{0,80}\bbuildings?\b[\s\S]{0,80}\broads?\b/i.test(q)
  ) {
    return 'neighborhood'
  }

  // Vegetation / NDVI health
  if (
    /\b(vegetation|ndvi|ndmi|savi|evi|crop\s+health|plant\s+health|greenness)\b/i.test(q) ||
    /\b(vegetation|crop)\s+health\b/i.test(q)
  ) {
    return 'vegetation'
  }

  // Flood / slope / heat / "why is it hot"
  if (
    /\b(flood|inundat|slope|terrain|dem|elevation|lst|land\s*surface\s*temp|heat\s*island|why\s+is\s+it\s+hot|how\s+hot)\b/i.test(
      q,
    )
  ) {
    return 'flood-slope'
  }

  // Layer attribute / population / field value — before weather so "pop" isn't skipped
  if (
    /\b(population|pop\b|attribute|attributes|field\s+value|on\s+(this\s+)?layer|how\s+many|how\s+much|feature\s+code)\b/i.test(
      q,
    ) ||
    /\b(سكان|مساحة|سمات|حقل|طبقة)\b/.test(q)
  ) {
    // Keep weather pack when clearly weather-only
    if (!/\b(weather|forecast|temperature|humidity|rainfall)\b/i.test(q)) {
      return 'layer-attribute'
    }
  }

  // Weather near AOI
  if (/\b(weather|forecast|temperature|precip|rainfall|humidity|wind)\b/i.test(q)) {
    return 'weather'
  }

  // Layer roster summary
  if (
    /\b(summarize\s+(the\s+)?(loaded\s+)?(gis\s+)?layers?|layer\s+summary|what\s+layers)\b/i.test(q)
  ) {
    return 'layer-summary'
  }

  // Broad AOI analysis
  if (
    /\b(analyze\s+(this\s+)?aoi|analyse\s+(this\s+)?aoi|aoi\s+analysis|analyze\s+this\s+area|what.?s\s+in\s+(the\s+)?aoi)\b/i.test(
      q,
    ) ||
    /\banaly[sz]e\s+this\s+aoi\b/i.test(q)
  ) {
    return 'analyze-aoi'
  }

  return null
}

/**
 * Build the ordered tool calls for a pack. Tools run against map state / layers —
 * the model only synthesizes; it must not invent counts or class areas.
 */
export function buildGeoAiAnalystPackToolCalls(
  packId: GeoAiAnalystPackId,
  userMessage: string,
): GeoAiAnalystPackToolCall[] {
  const weatherQuery = userMessage.trim() || 'weather here'

  switch (packId) {
    case 'analyze-aoi':
      return [
        { name: 'zoom_to_aoi', args: {} },
        { name: 'read_live_map_state', args: {} },
        { name: 'read_rs_analysis', args: {} },
        { name: 'run_vector_stats', args: { query: 'count buildings' } },
        { name: 'get_weather_context', args: { query: weatherQuery } },
      ]
    case 'count-buildings':
      return [
        { name: 'zoom_to_aoi', args: {} },
        { name: 'read_live_map_state', args: {} },
        { name: 'run_vector_stats', args: { query: 'count buildings' } },
        { name: 'run_vector_stats', args: { query: 'count roads' } },
      ]
    case 'neighborhood':
      return [
        { name: 'zoom_to_aoi', args: {} },
        { name: 'read_live_map_state', args: {} },
        { name: 'run_vector_stats', args: { query: 'count buildings' } },
        { name: 'run_vector_stats', args: { query: 'count roads' } },
        { name: 'read_rs_analysis', args: {} },
        { name: 'get_weather_context', args: { query: weatherQuery } },
      ]
    case 'vegetation':
      return [
        { name: 'zoom_to_aoi', args: {} },
        { name: 'read_rs_analysis', args: {} },
        { name: 'read_live_map_state', args: {} },
      ]
    case 'flood-slope':
      return [
        { name: 'zoom_to_aoi', args: {} },
        { name: 'read_live_map_state', args: {} },
        { name: 'read_rs_analysis', args: {} },
        { name: 'get_weather_context', args: { query: weatherQuery } },
      ]
    case 'weather':
      // Weather is authoritative from get_weather_context — skip extra map-state tool for latency.
      return [{ name: 'get_weather_context', args: { query: weatherQuery } }]
    case 'layer-summary':
      return [
        { name: 'read_live_map_state', args: {} },
        { name: 'read_rs_analysis', args: {} },
      ]
    case 'layer-attribute':
      return [
        { name: 'read_live_map_state', args: {} },
        { name: 'query_layer_attributes', args: { query: userMessage.trim() || 'layer attributes' } },
        { name: 'run_vector_stats', args: { query: userMessage.trim() || 'layer stats' } },
      ]
    default:
      return []
  }
}

export function geoAiAnalystPackLabel(packId: GeoAiAnalystPackId): string {
  switch (packId) {
    case 'analyze-aoi':
      return 'AOI multi-tool analysis'
    case 'count-buildings':
      return 'Building / road density'
    case 'neighborhood':
      return 'Neighborhood surroundings'
    case 'vegetation':
      return 'Vegetation / RS health'
    case 'flood-slope':
      return 'Flood / slope / heat context'
    case 'weather':
      return 'Weather near map focus'
    case 'layer-summary':
      return 'Layer roster summary'
    case 'layer-attribute':
      return 'Layer attribute lookup'
    default:
      return packId
  }
}

