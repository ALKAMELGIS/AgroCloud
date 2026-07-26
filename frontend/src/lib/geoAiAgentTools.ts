/**
 * Typed GIS tool registry for the Geo AI Agent.
 *
 * Wraps existing map commands (`geoAiCommandExecutor`), local vector stats
 * (`runGeoAiStatsCommand`), live Layer Live / RS readout (`geoAiLiveMapContext`),
 * and weather context builders. Schemas are emitted in Gemini / Claude /
 * OpenAI-compatible (DeepSeek) shapes for native function calling.
 */

import {
  executeGeoAiMapCommands,
  parseGeoAiRsIndexId,
  type GeoAiMapCommand,
  type GeoAiMapCommandHandlers,
  type GeoAiMapCommandResult,
} from './geoAiCommandExecutor'
import {
  buildGeoAiLiveMapStateBlock,
  type GeoAiLiveMapState,
} from './geoAiLiveMapContext'
import { runGeoAiStatsCommand, type GeoAiStatsResult } from './geoAiStatsEngine'
import { runGeoAiLayerAttributeQuery } from './geoAiLayerAttributeQuery'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'
import {
  GEO_AI_GIS_TOOL_NAMES,
  runGeoAiGisTool,
  type GeoAiGisToolHost,
} from './geoAiGisToolRunner'

export const GEO_AI_AGENT_TOOL_NAMES = [
  'fly_to',
  'zoom_to_aoi',
  'zoom_to_layer',
  'set_layer_visibility',
  'set_layer_opacity',
  'switch_basemap',
  'search_place',
  'identify_basemap',
  'run_vector_stats',
  'query_layer_attributes',
  'read_live_map_state',
  'read_rs_analysis',
  'get_weather_context',
  'open_toolbox_panel',
  'run_rs_index',
  ...GEO_AI_GIS_TOOL_NAMES,
] as const

export type GeoAiAgentToolName = (typeof GEO_AI_AGENT_TOOL_NAMES)[number]

export type GeoAiAgentToolResult = {
  name: string
  ok: boolean
  /** Compact text the model should treat as authoritative tool output. */
  content: string
  /** Optional structured table for the chat UI (vector stats). */
  table?: GeoExplorerDataTablePayload
  /** Map-first selection sync from vector stats. */
  mapFirstSync?: GeoAiStatsResult['mapFirstSync']
  /** Underlying map command result(s), when the tool drove the map. */
  mapResults?: GeoAiMapCommandResult[]
}

export type GeoAiAgentWeatherFetcher = (userText: string) => Promise<string>

/** Host capabilities injected by SatelliteIntelligence (or tests). */
export type GeoAiAgentToolHost = {
  mapHandlers: GeoAiMapCommandHandlers
  liveMapState: GeoAiLiveMapState | null | undefined
  vectorLayers: GeoAiMapLayer[]
  /** When set, `get_weather_context` can pull live OpenWeather / Open-Meteo blocks. */
  weatherFetcher?: GeoAiAgentWeatherFetcher
  /** Add a geoprocessing result GeoJSON layer to the map. */
  addGeoJsonResultLayer?: GeoAiGisToolHost['addGeoJsonResultLayer']
}

type JsonSchema = Record<string, unknown>

type ToolDef = {
  name: GeoAiAgentToolName
  description: string
  parameters: JsonSchema
}

const TOOL_DEFS: ToolDef[] = [
  {
    name: 'fly_to',
    description: 'Center the map camera on a WGS84 longitude/latitude (optional zoom and label).',
    parameters: {
      type: 'object',
      properties: {
        lng: { type: 'number', description: 'Longitude (WGS84)' },
        lat: { type: 'number', description: 'Latitude (WGS84)' },
        zoom: { type: 'number', description: 'Optional target zoom level' },
        label: { type: 'string', description: 'Optional place label for the pin' },
      },
      required: ['lng', 'lat'],
    },
  },
  {
    name: 'zoom_to_aoi',
    description: 'Fit the map view to the currently drawn AOI (analysis boundary).',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'zoom_to_layer',
    description: 'Fit the map view to a loaded vector layer by name (exact or close match).',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string', description: 'Layer name as shown in LIVE MAP STATE' },
      },
      required: ['layer'],
    },
  },
  {
    name: 'set_layer_visibility',
    description: 'Show or hide a map layer (vector, active RS overlay, or basemap).',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string', description: 'Layer name' },
        visible: { type: 'boolean', description: 'true = on, false = off' },
      },
      required: ['layer', 'visible'],
    },
  },
  {
    name: 'set_layer_opacity',
    description: 'Set draw opacity for a vector layer (0–1 or 0–100).',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        opacity: { type: 'number', description: '0–1 fraction or 0–100 percent' },
      },
      required: ['layer', 'opacity'],
    },
  },
  {
    name: 'switch_basemap',
    description: 'Switch the basemap by catalog id or label (e.g. satellite, streets).',
    parameters: {
      type: 'object',
      properties: {
        basemap: { type: 'string' },
      },
      required: ['basemap'],
    },
  },
  {
    name: 'search_place',
    description:
      'Google-Maps-style place / address / POI search: geocode, fly the map, and drop an info pin.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Place name, address, or POI text' },
      },
      required: ['query'],
    },
  },
  {
    name: 'identify_basemap',
    description:
      'Identify named basemap places / POIs near a point (or current map focus when omitted).',
    parameters: {
      type: 'object',
      properties: {
        lng: { type: 'number' },
        lat: { type: 'number' },
      },
    },
  },
  {
    name: 'run_vector_stats',
    description:
      'Run attribute / spatial selection and statistics against loaded GeoJSON layers (count, sum, filter, select-by-location). Prefer this over inventing numbers.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language stats / selection query, e.g. "count buildings" or "sum Area_ha where Crop = Wheat"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_layer_attributes',
    description:
      'Look up a feature or aggregate attributes on loaded vector layers (population, area, codes, Field|Value). Returns authoritative values and map focus — never invent or geocode.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'User question about layer data, e.g. "how many population on it" or "attributes of MH105"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_live_map_state',
    description:
      'Read the authoritative live map snapshot: camera, AOI metrics, layer roster, selected feature, basemap POIs.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'read_rs_analysis',
    description:
      'Read the active remote-sensing analysis (NDVI/NDWI/NDMI/LST/etc.): scene date, mean, and live per-class area legend.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_weather_context',
    description:
      'Fetch authoritative weather facts (OpenWeather / Open-Meteo) for the current map focus or a place named in the query text.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'User weather question or place hint (e.g. "weather here", "forecast for Dubai")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'open_toolbox_panel',
    description:
      'Open a Satellite map-toolbox analysis panel. For NDVI/NDWI/NDMI/SAVI/EVI prefer run_rs_index (shows the index on the map automatically). Panels: remote-sensing, imagery-time-series, flood-monitoring, well-site, hydro-watershed, aoi-edit, layers, tree-detections, agri-field-boundary, crop-alerts, stress-zones.',
    parameters: {
      type: 'object',
      properties: {
        panel: {
          type: 'string',
          description:
            'Panel id or alias: remote-sensing | imagery-time-series | flood-monitoring | well-site | hydro-watershed | aoi-edit | layers | ndvi | time-series | flood | draw | tree-detections | agri-field-boundary',
        },
      },
      required: ['panel'],
    },
  },
  {
    name: 'run_rs_index',
    description:
      'Show a Sentinel remote-sensing index on the map for the current AOI (same as checking “Show NDVI on map”). Use for NDVI, NDWI, NDMI, SAVI, EVI, etc. Opens Remote Sensing and paints the WMS overlay automatically — do not only open the panel.',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'string',
          description: 'Index id: NDVI | NDWI | NDMI | SAVI | EVI | GNDVI | NBR | NDRE | BSI | MNDWI | LST',
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'gis_buffer',
    description:
      'Create a buffer polygon layer around a loaded vector layer or the current AOI (e.g. farms by 500 m, wells by 1 km). Adds a new result layer to the map.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string', description: 'Input layer name, or "AOI" / "this"' },
        distance: { type: 'number', description: 'Buffer distance' },
        unit: { type: 'string', description: 'meters | kilometers | miles | feet' },
        rings: { type: 'array', items: { type: 'number' }, description: 'Optional multi-ring distances' },
        output: { type: 'string', description: 'Output layer name' },
      },
      required: ['distance'],
    },
  },
  {
    name: 'gis_intersect',
    description: 'Intersect two polygon/line layers and add the overlap as a new map layer.',
    parameters: {
      type: 'object',
      properties: {
        layerA: { type: 'string' },
        layerB: { type: 'string' },
        output: { type: 'string' },
      },
      required: ['layerA', 'layerB'],
    },
  },
  {
    name: 'gis_clip',
    description: 'Clip a vector layer by AOI or another polygon layer; adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string', description: 'Target layer to clip' },
        clipLayer: { type: 'string', description: 'Clip mask (default AOI)' },
        output: { type: 'string' },
      },
      required: ['layer'],
    },
  },
  {
    name: 'gis_erase',
    description: 'Erase (difference) target features using an eraser/mask layer; adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        eraser: { type: 'string' },
        output: { type: 'string' },
      },
      required: ['layer', 'eraser'],
    },
  },
  {
    name: 'gis_union',
    description: 'Union / dissolve all polygons in a layer into one geometry; adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        output: { type: 'string' },
      },
    },
  },
  {
    name: 'gis_merge',
    description: 'Merge selected / layer polygons into one feature; adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        output: { type: 'string' },
      },
    },
  },
  {
    name: 'gis_dissolve',
    description: 'Dissolve polygons by an attribute field (e.g. Crop Type); adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        field: { type: 'string', description: 'Attribute field to dissolve by' },
        output: { type: 'string' },
      },
      required: ['field'],
    },
  },
  {
    name: 'gis_convex_hull',
    description: 'Build a convex hull around a layer; adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        output: { type: 'string' },
      },
    },
  },
  {
    name: 'gis_voronoi',
    description: 'Generate Voronoi / Thiessen polygons from point features (e.g. wells); adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        output: { type: 'string' },
      },
    },
  },
  {
    name: 'gis_area',
    description: 'Calculate area (ha / m²) for every feature in a layer or AOI; returns a compact table (no new layer required).',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        idField: { type: 'string' },
      },
    },
  },
  {
    name: 'gis_select_by_location',
    description:
      'Select features of a target layer that intersect / are within / within_distance of a mask layer (e.g. fields within 2 km of a river). Adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string', description: 'Target features' },
        mask: { type: 'string', description: 'Mask / near layer' },
        distance: { type: 'number' },
        unit: { type: 'string' },
        relationship: { type: 'string', description: 'intersects | within | within_distance' },
        output: { type: 'string' },
      },
      required: ['layer', 'mask'],
    },
  },
  {
    name: 'gis_select_by_attribute',
    description: 'Select features where an attribute matches a value; adds a new result layer.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        field: { type: 'string' },
        value: {},
        operator: { type: 'string', description: '= | != | contains | > | <' },
        output: { type: 'string' },
      },
      required: ['layer', 'field'],
    },
  },
  {
    name: 'export_layer',
    description: 'Export a loaded vector layer (or AOI) as GeoJSON, Shapefile, KMZ, or Excel.',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string' },
        format: { type: 'string', description: 'geojson | shapefile | kmz | excel' },
      },
      required: ['layer', 'format'],
    },
  },
]

export function listGeoAiAgentTools(): ReadonlyArray<ToolDef> {
  return TOOL_DEFS
}

/** Gemini `functionDeclarations` payload (inside `tools: [{ functionDeclarations }]`). */
export function getGeminiFunctionDeclarations(): Array<{
  name: string
  description: string
  parameters: JsonSchema
}> {
  return TOOL_DEFS.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}

/** Anthropic Messages API `tools` array. */
export function getClaudeToolDefinitions(): Array<{
  name: string
  description: string
  input_schema: JsonSchema
}> {
  return TOOL_DEFS.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }))
}

/** OpenAI-compatible / DeepSeek `tools` array. */
export function getOpenAiCompatibleTools(): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: JsonSchema }
}> {
  return TOOL_DEFS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}

export function isGeoAiAgentToolName(name: string): name is GeoAiAgentToolName {
  return (GEO_AI_AGENT_TOOL_NAMES as readonly string[]).includes(name)
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : String(v ?? '').trim()
}

function runMapOp(host: GeoAiAgentToolHost, command: GeoAiMapCommand): GeoAiAgentToolResult {
  const mapResults = executeGeoAiMapCommands([command], host.mapHandlers)
  const first = mapResults[0]
  return {
    name: command.op,
    ok: Boolean(first?.ok),
    content: first?.message || 'Map command produced no result.',
    mapResults,
  }
}

function readRsAnalysis(state: GeoAiLiveMapState | null | undefined): GeoAiAgentToolResult {
  const a = state?.activeAnalysis
  if (!a?.label) {
    return {
      name: 'read_rs_analysis',
      ok: false,
      content:
        'No active remote-sensing analysis is visible on the map right now (no NDVI/NDWI/NDMI/LST Layer Live selection).',
    }
  }
  const lines: string[] = [`Active analysis: ${a.label}`]
  if (a.acquisitionDate) lines.push(`Scene / imagery date: ${a.acquisitionDate}`)
  if (typeof a.resolutionMeters === 'number') lines.push(`Resolution: ${a.resolutionMeters} m/px`)
  if (typeof a.meanValue === 'number' && Number.isFinite(a.meanValue)) {
    lines.push(`AOI mean: ${a.meanValue.toFixed(4)}`)
  }
  if (a.classes?.length) {
    lines.push('Live per-class areas:')
    for (const cl of a.classes) {
      const bits: string[] = [cl.name]
      if (typeof cl.areaHa === 'number' && cl.areaHa > 0) bits.push(`${cl.areaHa.toFixed(2)} ha`)
      if (typeof cl.pct === 'number' && Number.isFinite(cl.pct)) bits.push(`${cl.pct.toFixed(1)}%`)
      lines.push(`  - ${bits.join(' · ')}`)
    }
  } else if (a.note?.trim()) {
    lines.push(`Note: ${a.note.trim()}`)
  }
  return { name: 'read_rs_analysis', ok: true, content: lines.join('\n') }
}

/**
 * Execute one agent tool by name. Unknown names return `ok: false`.
 * Map tools go through `executeGeoAiMapCommands`; stats use `runGeoAiStatsCommand`.
 */
export async function executeGeoAiAgentTool(
  name: string,
  args: Record<string, unknown> | null | undefined,
  host: GeoAiAgentToolHost,
): Promise<GeoAiAgentToolResult> {
  const a = args && typeof args === 'object' ? args : {}
  const tool = name.trim()

  try {
    switch (tool) {
      case 'fly_to': {
        const lng = num(a.lng ?? a.lon ?? a.longitude)
        const lat = num(a.lat ?? a.latitude)
        if (lng == null || lat == null) {
          return { name: tool, ok: false, content: 'fly_to requires numeric lng and lat.' }
        }
        const zoom = num(a.zoom)
        const label = str(a.label)
        return runMapOp(host, {
          op: 'flyTo',
          lng,
          lat,
          ...(zoom != null ? { zoom } : {}),
          ...(label ? { label } : {}),
        })
      }
      case 'zoom_to_aoi':
        return runMapOp(host, { op: 'zoomToAoi' })
      case 'zoom_to_layer': {
        const layer = str(a.layer ?? a.name)
        if (!layer) return { name: tool, ok: false, content: 'zoom_to_layer requires a layer name.' }
        return runMapOp(host, { op: 'zoomToLayer', layer })
      }
      case 'set_layer_visibility': {
        const layer = str(a.layer ?? a.name)
        if (!layer) return { name: tool, ok: false, content: 'set_layer_visibility requires a layer name.' }
        const visible = a.visible == null ? true : Boolean(a.visible)
        return runMapOp(host, { op: 'setLayerVisibility', layer, visible })
      }
      case 'set_layer_opacity': {
        const layer = str(a.layer ?? a.name)
        const opacity = num(a.opacity ?? a.value)
        if (!layer || opacity == null) {
          return { name: tool, ok: false, content: 'set_layer_opacity requires layer and opacity.' }
        }
        return runMapOp(host, {
          op: 'setLayerOpacity',
          layer,
          opacity: opacity > 1 ? Math.min(1, Math.max(0, opacity / 100)) : Math.min(1, Math.max(0, opacity)),
        })
      }
      case 'switch_basemap': {
        const basemap = str(a.basemap ?? a.name ?? a.id)
        if (!basemap) return { name: tool, ok: false, content: 'switch_basemap requires a basemap id/label.' }
        return runMapOp(host, { op: 'switchBasemap', basemap })
      }
      case 'search_place': {
        const query = str(a.query ?? a.q ?? a.place ?? a.name)
        if (!query) return { name: tool, ok: false, content: 'search_place requires a query string.' }
        return runMapOp(host, { op: 'searchPlace', query })
      }
      case 'identify_basemap': {
        const lng = num(a.lng ?? a.lon ?? a.longitude)
        const lat = num(a.lat ?? a.latitude)
        return runMapOp(host, {
          op: 'identifyBasemap',
          ...(lng != null ? { lng } : {}),
          ...(lat != null ? { lat } : {}),
        })
      }
      case 'run_vector_stats': {
        const query = str(a.query ?? a.q ?? a.text)
        if (!query) return { name: tool, ok: false, content: 'run_vector_stats requires a query string.' }
        const stats = runGeoAiStatsCommand(query, host.vectorLayers ?? [])
        if (!stats) {
          return {
            name: tool,
            ok: false,
            content:
              'No local vector-stats result for that query (no matching layer intent, or world-place navigation should use search_place instead).',
          }
        }
        return {
          name: tool,
          ok: stats.handled,
          content: stats.reply,
          ...(stats.table ? { table: stats.table } : {}),
          ...(stats.mapFirstSync ? { mapFirstSync: stats.mapFirstSync } : {}),
        }
      }
      case 'query_layer_attributes': {
        const query = str(a.query ?? a.q ?? a.text)
        if (!query) return { name: tool, ok: false, content: 'query_layer_attributes requires a query string.' }
        const hit = runGeoAiLayerAttributeQuery(query, host.vectorLayers ?? [])
        if (!hit?.handled) {
          return {
            name: tool,
            ok: false,
            content: 'No matching layer attribute result. Check loaded layers or name a field / feature code.',
          }
        }
        const mapResults =
          hit.focus != null
            ? executeGeoAiMapCommands(
                [
                  {
                    op: 'flyTo',
                    lng: hit.focus.lng,
                    lat: hit.focus.lat,
                    zoom: 14,
                    ...(hit.focus.label ? { label: hit.focus.label } : {}),
                  },
                ],
                host.mapHandlers,
              )
            : undefined
        return {
          name: tool,
          ok: true,
          content: hit.reply,
          ...(hit.table ? { table: hit.table } : {}),
          ...(hit.mapFirstSync ? { mapFirstSync: hit.mapFirstSync } : {}),
          ...(mapResults ? { mapResults } : {}),
        }
      }
      case 'read_live_map_state': {
        const block = buildGeoAiLiveMapStateBlock(host.liveMapState)
        if (!block) {
          return { name: tool, ok: false, content: 'Live map state is empty — nothing measurable on the map yet.' }
        }
        return { name: tool, ok: true, content: block }
      }
      case 'read_rs_analysis':
        return readRsAnalysis(host.liveMapState)
      case 'get_weather_context': {
        const query = str(a.query ?? a.q ?? a.text) || 'weather here'
        if (!host.weatherFetcher) {
          return {
            name: tool,
            ok: false,
            content: 'Weather fetcher is not wired for this session.',
          }
        }
        const block = await host.weatherFetcher(query)
        const trimmed = (block || '').trim()
        if (!trimmed) {
          return {
            name: tool,
            ok: false,
            content: 'No weather facts available for the current map focus / query.',
          }
        }
        return { name: tool, ok: true, content: trimmed }
      }
      case 'open_toolbox_panel': {
        const panel = str(a.panel ?? a.tool ?? a.section ?? a.id)
        if (!panel) return { name: tool, ok: false, content: 'open_toolbox_panel requires a panel id.' }
        // NDVI / NDWI / … aliases → show index on map, not just open the dock.
        const indexHint = parseGeoAiRsIndexId(panel) || parseGeoAiRsIndexId(str(a.index))
        if (indexHint) {
          return runMapOp(host, { op: 'runRsIndex', index: indexHint })
        }
        return runMapOp(host, { op: 'openToolboxPanel', panel })
      }
      case 'run_rs_index': {
        const index = parseGeoAiRsIndexId(str(a.index ?? a.layer ?? a.name)) || 'NDVI'
        return runMapOp(host, { op: 'runRsIndex', index })
      }
      case 'gis_buffer':
      case 'gis_intersect':
      case 'gis_clip':
      case 'gis_erase':
      case 'gis_union':
      case 'gis_merge':
      case 'gis_dissolve':
      case 'gis_convex_hull':
      case 'gis_voronoi':
      case 'gis_area':
      case 'gis_select_by_location':
      case 'gis_select_by_attribute':
      case 'export_layer': {
        const gis = await runGeoAiGisTool(tool, a, {
          vectorLayers: host.vectorLayers ?? [],
          liveMapState: host.liveMapState,
          addGeoJsonResultLayer: host.addGeoJsonResultLayer,
        })
        return {
          name: tool,
          ok: gis.ok,
          content: gis.content,
          ...(gis.table ? { table: gis.table } : {}),
        }
      }
      default:
        return { name: tool, ok: false, content: `Unknown tool: ${tool}` }
    }
  } catch (err) {
    return {
      name: tool,
      ok: false,
      content: err instanceof Error ? err.message : 'Tool execution failed.',
    }
  }
}

/** Serialize tool results for a follow-up model turn. */
export function formatToolResultsForModel(results: GeoAiAgentToolResult[]): string {
  if (!results.length) return '(no tool results)'
  return results
    .map((r, i) => {
      const status = r.ok ? 'ok' : 'error'
      return `### Tool result ${i + 1}: ${r.name} [${status}]\n${r.content}`
    })
    .join('\n\n')
}

/** Collect human-readable map action lines from tool results. */
export function collectMapActionSummaries(results: GeoAiAgentToolResult[]): string[] {
  const out: string[] = []
  for (const r of results) {
    if (r.mapResults?.length) {
      for (const mr of r.mapResults) {
        if (mr.message) out.push(mr.message)
      }
    } else if (r.ok && (r.name === 'fly_to' || r.name.startsWith('zoom') || r.name.startsWith('set_') || r.name === 'switch_basemap' || r.name === 'search_place' || r.name === 'identify_basemap' || r.name.startsWith('gis_') || r.name === 'export_layer' || r.name === 'open_toolbox_panel' || r.name === 'run_rs_index')) {
      out.push(r.content)
    }
  }
  return out
}
