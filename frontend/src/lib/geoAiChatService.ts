import { apiUrl } from './apiOrigin'
import type { GeoAiLiveMapState } from './geoAiLiveMapContext'

export type GeoAiChatContext = {
  selectedAOI: {
    id?: string | null
    name?: string | null
    geometry: GeoJSON.Geometry | null
    areaHa?: number | null
  } | null
  activeLayer: {
    id?: string | null
    name?: string | null
    type?: string | null
    sceneDate?: string | null
    resolutionM?: number | null
    meanValue?: number | null
  } | null
  visibleLayers: Array<{ id?: string; name: string; type?: string | null; visible?: boolean }>
  map: {
    center: { lng: number; lat: number } | null
    zoom: number | null
    bearing?: number | null
    pitch?: number | null
  }
  activeAnalysis?: GeoAiLiveMapState['activeAnalysis']
  zonalStats?: Record<string, { mean?: number | null; min?: number | null; max?: number | null }>
}

export type GeoAiChatAction =
  | { type: 'ADD_GEOJSON_LAYER'; layerId: string }
  | { type: 'FLY_TO'; lng: number; lat: number; zoom?: number }

export type GeoAiChatResponse = {
  answer: string
  context?: Record<string, unknown>
  action?: GeoAiChatAction | null
  statistics?: Record<string, unknown>
  geojson?: GeoJSON.FeatureCollection | GeoJSON.Geometry | null
  error?: string
  offline?: boolean
}

let healthCache: { ok: boolean; checkedAt: number } | null = null
const HEALTH_TTL_MS = 30_000

export async function checkGeoAiChatHealth(force = false): Promise<boolean> {
  const now = Date.now()
  if (!force && healthCache && now - healthCache.checkedAt < HEALTH_TTL_MS) {
    return healthCache.ok
  }
  try {
    const res = await fetch(apiUrl('/api/geoai-chat/health'), { method: 'GET' })
    const json = (await res.json().catch(() => ({}))) as { reachable?: boolean; status?: string }
    const ok = res.ok && (json.reachable !== false) && json.status !== 'offline'
    healthCache = { ok, checkedAt: now }
    return ok
  } catch {
    healthCache = { ok: false, checkedAt: now }
    return false
  }
}

export async function askGeoAI(message: string, context: GeoAiChatContext): Promise<GeoAiChatResponse> {
  const res = await fetch(apiUrl('/api/geoai-chat/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  })
  const json = (await res.json().catch(() => ({}))) as GeoAiChatResponse
  if (!res.ok) {
    return {
      answer: '',
      error: json.error || `GeoAI Chat failed (HTTP ${res.status}).`,
      offline: Boolean((json as { offline?: boolean }).offline),
    }
  }
  return json
}

export function clearGeoAiChatHealthCache(): void {
  healthCache = null
}
