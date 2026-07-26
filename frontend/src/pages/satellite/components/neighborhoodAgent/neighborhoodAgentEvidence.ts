/**
 * Compact “thought / tools used” evidence for Neighborhood Agent Chat.
 * Built from pack / turn tool results — not the old Geo AI explorer cards.
 */

import { geoAiAnalystPackLabel, type GeoAiAnalystPackId } from '../../../../lib/geoAiAnalystPacks'
import type { GeoAiAgentToolResult } from '../../../../lib/geoAiAgentTools'
import type { GeoAiAgentTurnResult } from '../../../../lib/geoAiAgentTurn'
import type { GeoExplorerMessage, GeoExplorerPart } from '../../../../lib/geoExplorerGemini'
import { sanitizeNeighborhoodAgentReplyText } from '../../../../lib/neighborhoodAgentPlaceIntent'
import {
  formatRsLiftAsMarkdown,
  liftRsAnalysisFromText,
} from '../../../../lib/neighborhoodAgentRsViz'
import {
  formatWeatherLiftAsMarkdown,
  liftWeatherFromMarkdownReply,
  liftWeatherNarrativeFromText,
} from '../../../../lib/neighborhoodAgentWeatherViz'

export type NeighborhoodAgentToolChip = {
  /** Tool registry name (e.g. run_vector_stats). */
  name: string
  /** Short chip label shown in the Viewed row. */
  label: string
  ok: boolean
  /** One-line preview for the expanded thought body. */
  preview: string
}

export type NeighborhoodAgentEvidencePayload = {
  packId?: GeoAiAnalystPackId | null
  packLabel?: string | null
  /** Collapsible header title. */
  thoughtTitle: string
  tools: NeighborhoodAgentToolChip[]
}

const TOOL_LABELS: Record<string, string> = {
  fly_to: 'Fly to',
  zoom_to_aoi: 'Zoom to AOI',
  zoom_to_layer: 'Zoom to layer',
  set_layer_visibility: 'Layer visibility',
  set_layer_opacity: 'Layer opacity',
  switch_basemap: 'Basemap',
  search_place: 'Place search',
  identify_basemap: 'Identify',
  run_vector_stats: 'Vector stats',
  read_live_map_state: 'Live map',
  read_rs_analysis: 'RS analysis',
  get_weather_context: 'Weather',
  open_toolbox_panel: 'Toolbox',
  run_rs_index: 'Show RS index',
}

function previewFromContent(content: string, max = 160): string {
  const oneLine = content
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .join(' · ')
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max - 1)}…`
}

/** Friendly chip label; disambiguates repeated vector-stats runs. */
export function geoAiAgentToolChipLabel(name: string, content: string): string {
  if (name === 'run_vector_stats') {
    const c = content.toLowerCase()
    if (/\broad/.test(c) && !/\bbuilding/.test(c)) return 'Roads'
    if (/\bbuilding/.test(c) && !/\broad/.test(c)) return 'Buildings'
    if (/\bbuilding/.test(c) && /\broad/.test(c)) return 'Buildings & roads'
    return 'Vector stats'
  }
  return TOOL_LABELS[name] || name.replace(/_/g, ' ')
}

export function buildNeighborhoodAgentToolChip(result: GeoAiAgentToolResult): NeighborhoodAgentToolChip {
  return {
    name: result.name,
    label: geoAiAgentToolChipLabel(result.name, result.content || ''),
    ok: result.ok,
    preview: previewFromContent(result.content || (result.ok ? 'Completed.' : 'Failed.')),
  }
}

/**
 * Build UI evidence from a completed agent turn. Returns null when nothing ran.
 */
export function buildNeighborhoodAgentEvidenceFromTurn(
  turn: Pick<GeoAiAgentTurnResult, 'toolResults' | 'usedAnalystPack'>,
): NeighborhoodAgentEvidencePayload | null {
  const tools = (turn.toolResults || []).map(buildNeighborhoodAgentToolChip)
  if (!tools.length) return null

  const packId = turn.usedAnalystPack ?? null
  const packLabel = packId ? geoAiAnalystPackLabel(packId) : null
  const thoughtTitle = packLabel
    ? `Thought · ${packLabel}`
    : `Thought · ${tools.length} tool${tools.length === 1 ? '' : 's'} used`

  return {
    packId,
    packLabel,
    thoughtTitle,
    tools,
  }
}

/** Attach pack reply + optional table for chat history (no Evidence UI dumps). */
export function geoAiPackResultToExplorerMessage(
  turn: GeoAiAgentTurnResult,
  id: string,
): GeoExplorerMessage {
  // Keep weather markdown intact so the transcript can lift icons/charts/tables.
  // Aggressive sanitize (char cap / HTML strip) was collapsing replies into raw text blobs.
  const weatherLift =
    liftWeatherFromMarkdownReply(turn.replyText) ||
    (() => {
      const w = liftWeatherNarrativeFromText(turn.replyText)
      return w.currentTable || w.forecastTable || w.monthOutlookTable ? w : null
    })()

  if (weatherLift) {
    const parts: GeoExplorerPart[] = [
      {
        type: 'text',
        // Persist structured markdown the UI re-lifts into NeighborhoodAgentWeatherCard.
        text: formatWeatherLiftAsMarkdown(weatherLift),
      },
    ]
    if (weatherLift.currentTable) {
      parts.push({ type: 'dataTable', table: { ...weatherLift.currentTable, title: 'Now' } })
    }
    if (weatherLift.forecastTable) {
      parts.push({ type: 'dataTable', table: { ...weatherLift.forecastTable, title: 'Forecast' } })
    }
    if (weatherLift.monthOutlookTable) {
      parts.push({ type: 'dataTable', table: weatherLift.monthOutlookTable })
    }
    if (weatherLift.weekOutlookTable) {
      parts.push({ type: 'dataTable', table: weatherLift.weekOutlookTable })
    }
    return { id, role: 'model', parts }
  }

  const rsLift = liftRsAnalysisFromText(turn.replyText)
  if (rsLift) {
    const parts: GeoExplorerPart[] = [{ type: 'text', text: formatRsLiftAsMarkdown(rsLift) }]
    if (rsLift.shareTable) parts.push({ type: 'dataTable', table: rsLift.shareTable })
    if (rsLift.areaTable) parts.push({ type: 'dataTable', table: rsLift.areaTable })
    return { id, role: 'model', parts }
  }

  const text = sanitizeNeighborhoodAgentReplyText(turn.replyText)
  const parts: GeoExplorerPart[] = [{ type: 'text', text }]
  if (turn.table) parts.push({ type: 'dataTable', table: turn.table })
  return {
    id,
    role: 'model',
    parts,
  }
}
