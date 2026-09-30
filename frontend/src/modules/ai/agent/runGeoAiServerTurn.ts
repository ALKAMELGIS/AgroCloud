import { applyGeoAiChatResult, type GeoAiChatMapHost } from './applyGeoAiChatResult'
import { buildGeoAiChatContext, type BuildGeoAiChatContextInput } from './buildGeoAiChatContext'
import { askGeoAI, checkGeoAiChatHealth } from './geoAiChatService'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'

export type GeoAiServerTurnResult = {
  handled: boolean
  replyText?: string
  table?: GeoExplorerDataTablePayload
  mapQueryLngLat?: [number, number]
  error?: string
}

/**
 * Try GeoAI Chat server (FastAPI). Returns handled:false when offline so caller can fall back to client LLM.
 */
export async function runGeoAiServerTurn(
  message: string,
  contextInput: BuildGeoAiChatContextInput,
  mapHost: GeoAiChatMapHost,
): Promise<GeoAiServerTurnResult> {
  const trimmed = message.trim()
  if (!trimmed) return { handled: false }

  const online = await checkGeoAiChatHealth()
  if (!online) return { handled: false }

  const context = buildGeoAiChatContext(contextInput)
  const response = await askGeoAI(trimmed, context)
  if (response.error && !response.answer) {
    return { handled: false, error: response.error }
  }

  const applied = applyGeoAiChatResult(response, mapHost)
  return {
    handled: true,
    replyText: applied.replyText || response.answer,
    table: applied.table,
    mapQueryLngLat: applied.mapQueryLngLat,
  }
}
