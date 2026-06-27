/**
 * Geo AI map-command layer.
 *
 * The assistant can drive the map by emitting one or more `MAP_ACTION:{…}` lines
 * (single-line minified JSON) in its reply. This module parses those lines into a
 * typed command list, strips them from the user-facing bubble text, and dispatches
 * them through a host-provided handler set (implemented in SatelliteIntelligence).
 *
 * Commands are intentionally limited to safe, reversible map operations
 * (camera + layer visibility/opacity + basemap). Destructive actions (delete /
 * rename / export) are deliberately excluded from this first cut.
 */

export type GeoAiMapCommand =
  | { op: 'flyTo'; lng: number; lat: number; zoom?: number; label?: string }
  | { op: 'zoomToAoi' }
  | { op: 'zoomToLayer'; layer: string }
  | { op: 'setLayerVisibility'; layer: string; visible: boolean }
  | { op: 'setLayerOpacity'; layer: string; opacity: number }
  | { op: 'switchBasemap'; basemap: string }
  /** Google-Maps-style place/POI/address search → fly + drop info pin. */
  | { op: 'searchPlace'; query: string }
  /** Identify basemap places/POIs near a point (or current focus when omitted). */
  | { op: 'identifyBasemap'; lng?: number; lat?: number }

export type GeoAiMapCommandResult = {
  command: GeoAiMapCommand
  ok: boolean
  message: string
}

const MAP_ACTION_TAG = 'MAP_ACTION:'

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** Accepts 0–1 or 0–100 opacity and normalizes to 0–1. */
function normalizeOpacity(raw: unknown): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  if (n > 1) return clamp01(n / 100)
  return clamp01(n)
}

function coerceCommand(raw: unknown): GeoAiMapCommand | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const op = String(o.op || o.action || '').trim()
  switch (op) {
    case 'flyTo':
    case 'panTo':
    case 'center': {
      const lng = Number(o.lng ?? o.lon ?? o.longitude)
      const lat = Number(o.lat ?? o.latitude)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
      const zoom = Number(o.zoom)
      return {
        op: 'flyTo',
        lng,
        lat,
        ...(Number.isFinite(zoom) ? { zoom } : {}),
        ...(typeof o.label === 'string' ? { label: o.label } : {}),
      }
    }
    case 'zoomToAoi':
    case 'zoomToAOI':
    case 'fitAoi':
      return { op: 'zoomToAoi' }
    case 'zoomToLayer':
    case 'fitLayer': {
      const layer = String(o.layer ?? o.name ?? '').trim()
      return layer ? { op: 'zoomToLayer', layer } : null
    }
    case 'setLayerVisibility':
    case 'toggleLayer':
    case 'showLayer':
    case 'hideLayer': {
      const layer = String(o.layer ?? o.name ?? '').trim()
      if (!layer) return null
      let visible: boolean
      if (op === 'showLayer') visible = true
      else if (op === 'hideLayer') visible = false
      else visible = o.visible == null ? true : Boolean(o.visible)
      return { op: 'setLayerVisibility', layer, visible }
    }
    case 'setLayerOpacity':
    case 'setOpacity': {
      const layer = String(o.layer ?? o.name ?? '').trim()
      const opacity = normalizeOpacity(o.opacity ?? o.value)
      if (!layer || opacity == null) return null
      return { op: 'setLayerOpacity', layer, opacity }
    }
    case 'switchBasemap':
    case 'setBasemap': {
      const basemap = String(o.basemap ?? o.name ?? o.id ?? '').trim()
      return basemap ? { op: 'switchBasemap', basemap } : null
    }
    case 'searchPlace':
    case 'search':
    case 'findPlace':
    case 'geocode': {
      const query = String(o.query ?? o.q ?? o.place ?? o.name ?? '').trim()
      return query ? { op: 'searchPlace', query } : null
    }
    case 'identifyBasemap':
    case 'identify':
    case 'whatsHere':
    case 'queryBasemap': {
      const lng = Number(o.lng ?? o.lon ?? o.longitude)
      const lat = Number(o.lat ?? o.latitude)
      return {
        op: 'identifyBasemap',
        ...(Number.isFinite(lng) ? { lng } : {}),
        ...(Number.isFinite(lat) ? { lat } : {}),
      }
    }
    default:
      return null
  }
}

/** Parse every `MAP_ACTION:{…}` line in a model reply into typed commands. */
export function parseGeoAiMapCommands(reply: string): GeoAiMapCommand[] {
  if (!reply || reply.indexOf(MAP_ACTION_TAG) < 0) return []
  const commands: GeoAiMapCommand[] = []
  for (const rawLine of reply.split(/\r?\n/)) {
    const line = rawLine.trim()
    const idx = line.indexOf(MAP_ACTION_TAG)
    if (idx < 0) continue
    let jsonPart = line.slice(idx + MAP_ACTION_TAG.length).trim()
    // Tolerate trailing markdown fences / backticks.
    jsonPart = jsonPart.replace(/^`+/, '').replace(/`+$/, '').trim()
    if (!jsonPart) continue
    try {
      const parsed = JSON.parse(jsonPart)
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of list) {
        const cmd = coerceCommand(item)
        if (cmd) commands.push(cmd)
      }
    } catch {
      // ignore malformed action lines
    }
  }
  return commands
}

/** Remove `MAP_ACTION:` lines from text destined for the chat bubble. */
export function stripGeoAiMapActionLines(text: string): string {
  if (!text || text.indexOf(MAP_ACTION_TAG) < 0) return text
  return text
    .split(/\r?\n/)
    .filter(line => line.trim().indexOf(MAP_ACTION_TAG) !== 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

export type GeoAiMapCommandHandlers = {
  flyTo?: (cmd: Extract<GeoAiMapCommand, { op: 'flyTo' }>) => string | void
  zoomToAoi?: () => string | void
  zoomToLayer?: (layer: string) => string | void
  setLayerVisibility?: (layer: string, visible: boolean) => string | void
  setLayerOpacity?: (layer: string, opacity: number) => string | void
  switchBasemap?: (basemap: string) => string | void
  searchPlace?: (query: string) => string | void
  identifyBasemap?: (lng?: number, lat?: number) => string | void
}

/** Execute parsed commands against host handlers; returns a per-command result log. */
export function executeGeoAiMapCommands(
  commands: GeoAiMapCommand[],
  handlers: GeoAiMapCommandHandlers,
): GeoAiMapCommandResult[] {
  const results: GeoAiMapCommandResult[] = []
  for (const command of commands) {
    try {
      let message: string | void
      switch (command.op) {
        case 'flyTo':
          message = handlers.flyTo?.(command)
          break
        case 'zoomToAoi':
          message = handlers.zoomToAoi?.()
          break
        case 'zoomToLayer':
          message = handlers.zoomToLayer?.(command.layer)
          break
        case 'setLayerVisibility':
          message = handlers.setLayerVisibility?.(command.layer, command.visible)
          break
        case 'setLayerOpacity':
          message = handlers.setLayerOpacity?.(command.layer, command.opacity)
          break
        case 'switchBasemap':
          message = handlers.switchBasemap?.(command.basemap)
          break
        case 'searchPlace':
          message = handlers.searchPlace?.(command.query)
          break
        case 'identifyBasemap':
          message = handlers.identifyBasemap?.(command.lng, command.lat)
          break
        default:
          break
      }
      results.push({
        command,
        ok: typeof message === 'string',
        message: typeof message === 'string' ? message : 'No handler available for this action.',
      })
    } catch (err) {
      results.push({
        command,
        ok: false,
        message: err instanceof Error ? err.message : 'Command failed.',
      })
    }
  }
  return results
}
