/**
 * Geo AI Chat: Claude + data context from GIS Content (saved layers) and Develop Dashboard Data pane snapshot.
 */

import { formatFeaturePropertiesForGeoAi, type ArcgisLayerDefLite } from './arcgisAttributeDisplay'
import { loadGisMapSavedLayers } from './gisMapLayerStore'
import type { LayerData } from '../pages/satellite/components/LayerManager'
import { buildLayerIdValueCatalogSnippet, summarizeGeoAiMapLayers } from './geoExplorerLayerContext'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'

/** Develop Dashboard writes this when layers / CSV tables change. */
export const DEVELOP_DATA_CONTEXT_LS_KEY = 'agri_develop_data_context_v1'

export const GEO_AI_CHAT_SYSTEM_BASE = `You are **Geo AI Copilot** / Geo AI Chat: an advanced geospatial assistant integrated with GIS layer summaries, map hints (MAP_QUERY when justified), and optional appended weather/session blocks from the app.

Your job is to analyze and explain tabular or layer-related information using ONLY the data summaries provided in the context blocks (Satellite Added layers when present, GIS Content layers saved from GIS Map, Develop Dashboard snapshot), plus any "### SESSION MAP ANCHOR" / OPENWEATHER / OPEN-METEO / WEATHER COORDINATE SOURCE sections when appended below.

Users write in free natural language (e.g. “show me”, “describe”, “find”, “on the map”) — infer intent and map their wording to the closest fields, features, and layer names in the context. Do not ask them to use fixed commands.

Rules:
- If the answer is not supported by the context, say clearly that the data is not in the snapshot and suggest what the user could add (e.g. add layers on this Satellite map, save layers in GIS Map / GIS Content, or open Develop Dashboard → Data).
- When context lines include "domain/subtype descriptions" or attribute values like "Label (stored code: …)", treat the text before the parenthesis as the authoritative meaning; do not answer with bare database codes alone unless the user explicitly asks for raw codes.
- For feature/place lookups or layer queries: answer like a GIS or data analyst — use a short **Interpretation** (2–4 sentences), then **Key attributes** as bullets (concise), then location or caveats. Avoid dumping large JSON; reserve raw attribute lists for explicit "show raw" requests.
- For counts, distributions, or comparisons implied by the context: add one brief quantitative read (e.g. dominant category, approximate share) only when the numbers are directly supported by the provided summaries.
- Prefer short structured answers: headings, bullets, and small tables in plain text when useful.
- Do not invent field values, coordinates, or statistics that are not implied by the context.
- When sample feature properties appear, treat them as examples only, not exhaustive; **Layer id catalog** lines list values from many fields — use them for ids/codes/names before saying data is missing.
- When "### SESSION MAP ANCHOR", "### OPEN-METEO FACTS", "### OPEN-METEO COMPACT", or "### OPENWEATHER FACTS" sections appear after this block, they are authoritative for map focus and weather numbers at that location; cite Open-Meteo and/or OpenWeather once; do not invent values beyond those blocks.
- When DATA CONTEXT clearly identifies one geographic point for the user’s request (feature geometry centroid, or explicit lon/lat fields tied to that feature), you may end with a new line exactly: MAP_QUERY:longitude,latitude (WGS84 decimal degrees, longitude first). Omit MAP_QUERY if no single justified location. Do not put MAP_QUERY inside markdown fences.
- When a "## Geo AI Copilot mission" block is appended, obey spatial/GIS/weather/map-action contracts there—including the required single-line machine trace GEO_AI_JSON:{...minified JSON...} as the **last line** of every assistant reply (see that block for schema).`

export type GeoAiChatTurn = { role: 'user' | 'assistant'; text: string }

function layerFields(l: LayerData): string[] {
  const any = l as { fields?: string[] }
  return Array.isArray(any.fields) ? any.fields : []
}

export function summarizeGisLayer(l: LayerData): string {
  const fields = layerFields(l).slice(0, 48).join(', ')
  let sample = ''
  const data = l.data as { features?: Array<{ properties?: Record<string, unknown> }> } | undefined
  if (data?.features?.length) {
    const ft = data.features[0]
    const props = ft?.properties
    const arcDef =
      l.source === 'arcgis'
        ? ((l as { arcgisLayerDefinition?: ArcgisLayerDefLite | null }).arcgisLayerDefinition ?? undefined)
        : undefined
    if (props && typeof props === 'object') {
      const shown =
        arcDef && typeof arcDef === 'object'
          ? formatFeaturePropertiesForGeoAi(
              props as Record<string, unknown>,
              ft as { properties?: Record<string, unknown> },
              arcDef,
            )
          : props
      const label = arcDef && typeof arcDef === 'object' ? 'example attributes (domain/subtype descriptions)' : 'example attributes'
      sample = ` | ${label}: ${JSON.stringify(shown).slice(0, 420)}`
    }
    const feats = data.features as Array<{ properties?: Record<string, unknown> }>
    const cat = buildLayerIdValueCatalogSnippet(feats, 2400)
    if (cat) sample += ` | ${cat}`
  }
  return `- ${l.name} (type=${l.type}, source=${l.source ?? 'n/a'}, visible=${l.visible}) fields=[${fields || '—'}]${sample}`
}

/** GIS Map / GIS Content layers only (IndexedDB), for AI Agro-Chat and similar. */
export async function buildGisContentLayersContext(maxChars = 40000): Promise<string> {
  try {
    const layers = await loadGisMapSavedLayers()
    let block =
      layers.length > 0
        ? '### GIS Content (layers saved in GIS Map — this browser)\n' + layers.map(summarizeGisLayer).join('\n')
        : '### GIS Content\n(no saved layers yet — open GIS Map, add layers, and save them to attach data here).'
    if (block.length > maxChars) block = `${block.slice(0, maxChars)}\n[…truncated…]`
    return block
  } catch {
    return '### GIS Content\n(could not read saved layers).'
  }
}

export type { GeoAiMapLayer } from './geoExplorerLayerContext'

/** Build a single text block appended to the system prompt (truncated for safety). */
export async function buildGeoAiDataContext(
  maxChars = 48000,
  opts?: { satelliteLayers?: GeoAiMapLayer[]; includeGisSavedLayers?: boolean },
): Promise<string> {
  const chunks: string[] = []
  const includeGisSavedLayers = opts?.includeGisSavedLayers !== false

  if (opts?.satelliteLayers?.length) {
    const cap = Math.min(30000, Math.max(8000, maxChars - 12000))
    chunks.push(
      '### Satellite Imagery — Added layers (visible vector layers on this map session)\n' +
        summarizeGeoAiMapLayers(opts.satelliteLayers, cap),
    )
  }

  if (includeGisSavedLayers) {
    try {
      const layers = await loadGisMapSavedLayers()
      if (layers.length) {
        chunks.push(
          '### GIS Content (layers saved in this browser / GIS Map)\n' + layers.map(summarizeGisLayer).join('\n'),
        )
      } else {
        chunks.push('### GIS Content\n(no saved layers in IndexedDB for this browser yet).')
      }
    } catch {
      chunks.push('### GIS Content\n(could not read saved layers).')
    }
  } else {
    chunks.push(
      '### GIS Content\n(Omitted on this page — Satellite Geo AI uses only layers added on this map. Open **GIS Map** for Geo AI with saved GIS layers.)',
    )
  }

  try {
    if (typeof localStorage === 'undefined') {
      chunks.push('### Develop Dashboard — Data\n(localStorage unavailable).')
    } else {
      const raw = localStorage.getItem(DEVELOP_DATA_CONTEXT_LS_KEY)
      if (raw) {
        chunks.push('### Develop Dashboard — Data pane snapshot (JSON)\n' + raw.slice(0, maxChars))
      } else {
        chunks.push(
          '### Develop Dashboard — Data\n(no snapshot yet). Open Develop Dashboard and use the Data panel (layers / CSV) so the app can record a summary here.',
        )
      }
    }
  } catch {
    chunks.push('### Develop Dashboard\n(could not read snapshot).')
  }

  let out = chunks.join('\n\n')
  if (out.length > maxChars) out = `${out.slice(0, maxChars)}\n\n[…context truncated…]`
  return out
}

const CLAUDE_MODEL_CANDIDATES = ['claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'] as const

type AnthropicContentBlock = { type: 'text'; text: string }

type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }

function toAnthropicMessages(turns: GeoAiChatTurn[]): AnthropicMessage[] {
  return turns.map(t => ({
    role: t.role,
    content: [{ type: 'text', text: t.text } satisfies AnthropicContentBlock],
  }))
}

/** One completion; `turns` should be prior user/assistant pairs (text only), then caller appends latest user separately. */
export async function claudeGeoAiComplete(params: {
  apiKey: string
  system: string
  turns: GeoAiChatTurn[]
  userMessage: string
}): Promise<string> {
  const { apiKey, system, turns, userMessage } = params
  const messages: AnthropicMessage[] = [...toAnthropicMessages(turns), { role: 'user', content: userMessage }]

  let lastErr = 'Unknown error'
  for (const model of CLAUDE_MODEL_CANDIDATES) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system,
        messages,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: { message?: string }
      content?: Array<{ type?: string; text?: string }>
    }
    if (!res.ok) {
      lastErr = data?.error?.message || res.statusText || `HTTP ${res.status}`
      if (res.status === 404 || res.status === 400) continue
      throw new Error(lastErr)
    }
    const text = data.content?.find(c => c.type === 'text')?.text?.trim()
    if (text) return text
    lastErr = 'Empty Claude response'
  }
  throw new Error(lastErr)
}
