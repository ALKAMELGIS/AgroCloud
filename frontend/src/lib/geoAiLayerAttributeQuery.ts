/**
 * Professional layer-attribute Q&A for Geo AI / Neighborhood Agent.
 * Answers from loaded vector features (not web geocode), with map highlight + table.
 */

import { computeStableGisFeatureKey } from './gisFeatureStableKey'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'
import {
  findLngLatFromLayerQuery,
  isGisDataScopedQuestion,
  type GeoAiMapLayer,
  type LayerQueryMatch,
} from './geoExplorerLayerContext'
import { runGeoAiStatsCommand, type GeoAiMapFirstSelection, type GeoAiStatsResult } from './geoAiStatsEngine'
import { isNeighborhoodAgentDataQuestion } from './neighborhoodAgentPlaceIntent'

export type GeoAiLayerAttributeQueryResult = {
  handled: boolean
  reply: string
  table?: GeoExplorerDataTablePayload
  mapFirstSync?: { selections: GeoAiMapFirstSelection[] }
  /** Fly / pin target when a single feature was resolved. */
  focus?: { lng: number; lat: number; label?: string; layerName?: string }
  /** Raw properties for inspect popup. */
  layerHit?: LayerQueryMatch | null
}

const ATTR_QUESTION_RE =
  /\b(what\s+is|what'?s|how\s+many|how\s+much|number\s+of|count\s+of|tell\s+me|show\s+me|get|give|list|describe|attribute|attributes|field|fields|properties|populati\w*|pop\b|area|مساحة|سكان|عدد|كم|ما\s+هي|ما\s+هو|اعرض|أظهر)\b/i

const LAYER_CUE_RE =
  /\b(layer|layers|feature|features|polygon|parcel|record|on\s+it|this\s+layer|loaded|gis|in\s+\w+|طبقة|طبقات|عنصر|مضلع|سجل)\b/i

/** True when the user is asking about loaded layer data (not pure place navigation / weather). */
export function isLayerAttributeQuestion(userText: string, layers: GeoAiMapLayer[]): boolean {
  const t = userText.trim()
  if (!t || !layers.length) return false

  if (/\b(weather|forecast|temperature|humidity|ndvi|ndwi)\b/i.test(t) && !LAYER_CUE_RE.test(t)) {
    return false
  }

  if (isGisDataScopedQuestion(t, layers)) return true
  if (ATTR_QUESTION_RE.test(t)) return true
  return false
}

function pickLabelFromProps(props: Record<string, unknown> | null | undefined): string | undefined {
  if (!props) return undefined
  const keys = ['NAME', 'Name', 'name', 'LABEL', 'Label', 'label', 'TITLE', 'Title', 'ZONE_ID', 'Farm_Code', 'code', 'CODE', 'id', 'ID']
  for (const k of keys) {
    const v = props[k]
    if (v != null && String(v).trim()) return String(v).trim()
  }
  for (const [k, v] of Object.entries(props)) {
    if (/name|label|title|code/i.test(k) && v != null && String(v).trim()) return String(v).trim()
  }
  return undefined
}

function propsToAttributeTable(
  props: Record<string, unknown>,
  title: string,
  preferKeys?: string[],
): GeoExplorerDataTablePayload {
  const entries = Object.entries(props).filter(([, v]) => v != null && String(v).trim() !== '')
  const preferred = preferKeys?.length
    ? [
        ...preferKeys
          .map(pk => entries.find(([k]) => k.toLowerCase() === pk.toLowerCase() || k.toLowerCase().includes(pk.toLowerCase())))
          .filter(Boolean) as Array<[string, unknown]>,
        ...entries.filter(([k]) => !preferKeys.some(pk => k.toLowerCase().includes(pk.toLowerCase()))),
      ]
    : entries
  const rows = preferred.slice(0, 16).map(([k, v]) => ({
    values: {
      field: k,
      value: typeof v === 'number' ? v : String(v).slice(0, 120),
    },
  }))
  return {
    kind: 'statistics',
    title,
    columns: [
      { key: 'field', label: 'Field', align: 'left' },
      { key: 'value', label: 'Value', align: 'right' },
    ],
    rows,
  }
}

function resolveMapSelection(match: LayerQueryMatch, layers: GeoAiMapLayer[]): GeoAiMapFirstSelection[] {
  const layer = layers.find(l => l.name === match.layerName)
  const layerId = layer?.clientLayerId
  if (!layerId || !layer) return []
  const features = layer.geojson?.features ?? layer.data?.features
  if (!Array.isArray(features) || !features.length || !match.properties) return []

  let idx = -1
  for (let i = 0; i < features.length; i++) {
    const p = features[i]?.properties
    if (!p) continue
    const keys = Object.keys(match.properties).slice(0, 8)
    const same = keys.every(k => String(p[k] ?? '') === String(match.properties![k] ?? ''))
    if (same) {
      idx = i
      break
    }
  }
  if (idx < 0) return []
  return [
    {
      layerId,
      featureKey: computeStableGisFeatureKey(features[idx], idx),
    },
  ]
}

function preferFieldHints(query: string): string[] {
  const hints: string[] = []
  if (/\b(population|pop|سكان)\b/i.test(query)) hints.push('population', 'pop', 'pop_tot', 'inhabitants', 'سكان')
  if (/\b(area|مساحة|hectare|ha\b)\b/i.test(query)) hints.push('area', 'area_ha', 'shape_area', 'hectares', 'مساحة')
  if (/\b(name|اسم)\b/i.test(query)) hints.push('name', 'label', 'title')
  return hints
}

/**
 * Answer a layer-data question from loaded features.
 * Prefers local stats when aggregating; otherwise resolves a feature and returns attributes + map sync.
 */
export function runGeoAiLayerAttributeQuery(
  userText: string,
  layers: GeoAiMapLayer[],
): GeoAiLayerAttributeQueryResult | null {
  const q = userText.trim()
  if (!q) return null

  if (!layers.length) {
    if (isNeighborhoodAgentDataQuestion(q) || ATTR_QUESTION_RE.test(q)) {
      return { handled: true, reply: formatNoLayerMatchReply(q) }
    }
    return null
  }

  if (!isLayerAttributeQuestion(q, layers)) {
    // Still allow strong feature-code lookups (MH105) via stats / match
    if (!findLngLatFromLayerQuery(q, layers)) return null
  }

  // Aggregate / table stats first (sum population, count, filters…)
  const rewritten = rewriteAttributeStatsQuery(q)
  const stats = runGeoAiStatsCommand(rewritten, layers)
  if (
    stats?.handled &&
    !/Please specify a field name/i.test(stats.reply) &&
    !/No loaded layer records are available/i.test(stats.reply)
  ) {
    const match = findLngLatFromLayerQuery(q, layers)
    const selections = stats.mapFirstSync?.selections?.length
      ? stats.mapFirstSync.selections
      : match
        ? resolveMapSelection(match, layers)
        : undefined
    return {
      handled: true,
      reply: stats.reply,
      ...(stats.table ? { table: stats.table } : {}),
      ...(selections?.length ? { mapFirstSync: { selections } } : {}),
      ...(match
        ? {
            focus: {
              lng: match.lng,
              lat: match.lat,
              label: pickLabelFromProps(match.properties) || match.layerName,
              layerName: match.layerName,
            },
            layerHit: match,
          }
        : {}),
    }
  }

  const match = findLngLatFromLayerQuery(q, layers)
  if (!match?.properties) {
    if (isLayerAttributeQuestion(q, layers) || /\b(populati\w*|number\s+of|how\s+many)\b/i.test(q)) {
      return {
        handled: true,
        reply: formatNoLayerMatchReply(q),
      }
    }
    return null
  }

  const label = pickLabelFromProps(match.properties) || match.layerName
  const hints = preferFieldHints(q)
  const table = propsToAttributeTable(match.properties, `${match.layerName} · ${label}`, hints)
  const highlighted = hints.length
    ? hints
        .map(h => {
          const hit = Object.entries(match.properties!).find(
            ([k]) => k.toLowerCase() === h.toLowerCase() || k.toLowerCase().includes(h.toLowerCase()),
          )
          return hit ? `**${hit[0]}** = **${hit[1]}**` : null
        })
        .filter(Boolean)
        .slice(0, 3)
    : []

  const lead =
    highlighted.length > 0
      ? `${label} (${match.layerName}): ${highlighted.join(' · ')}`
      : `${label} on layer **${match.layerName}** — key attributes below. Map focused on the feature.`

  const selections = resolveMapSelection(match, layers)

  return {
    handled: true,
    reply: lead,
    table,
    ...(selections.length ? { mapFirstSync: { selections } } : {}),
    focus: { lng: match.lng, lat: match.lat, label, layerName: match.layerName },
    layerHit: match,
  }
}

/** Normalize casual attribute phrasing into stats-engine friendly queries. */
export function rewriteAttributeStatsQuery(q: string): string {
  let out = q.trim()
  // "how many population" / "number of populations" → sum population when aggregating
  if (
    /\b(how\s+many|number\s+of|what\s+is\s+(the\s+)?total|sum|total)\b/i.test(out) &&
    /\bpopulati\w*|pop\b|سكان/i.test(out)
  ) {
    out = out.replace(/\bhow\s+many\b/i, 'sum').replace(/\bnumber\s+of\b/i, 'sum')
    out = out.replace(/\bpopulati\w*\b/gi, 'population')
    if (!/\b(sum|total)\b/i.test(out)) out = `sum population ${out}`
  }
  if (/\bpopulation\s+of\b/i.test(out) && !/\b(sum|count|average)\b/i.test(out)) {
    out = out.replace(/\bpopulation\s+of\b/i, 'population ')
  }
  if (/\bon\s+it\b/i.test(out)) {
    out = out.replace(/\bon\s+it\b/i, ' on layer ')
  }
  return out
}

function formatNoLayerMatchReply(q: string): string {
  const place =
    q
      .replace(
        /\b(number\s+of|how\s+many|how\s+much|what\s+is\s+(the\s+)?|populati\w*|pop|in|on|of|the|a|an|count|total)\b/gi,
        ' ',
      )
      .replace(/[?.!]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48) || null
  const where = place ? ` for “${place}”` : ''
  return `No matching figures${where} in the layers currently on the map. Load a demographic (or attribute) layer, or select a feature and ask again.\n\n**References**\n- AgroCloud loaded GIS layers — in-map attribute table`
}

export type { GeoAiStatsResult }
