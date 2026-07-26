/**
 * Geo AI map-command layer.
 *
 * The assistant can drive the map by emitting one or more `MAP_ACTION:{…}` lines
 * (single-line minified JSON) in its reply. This module parses those lines into a
 * typed command list, strips them from the user-facing bubble text, and dispatches
 * them through a host-provided handler set (implemented in SatelliteIntelligence).
 *
 * Commands cover camera + layer visibility/opacity + basemap + GIS geoprocessing
 * (gisOp → buffer/intersect/clip/…) and toolbox openers.
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
  /** Open a Satellite map-toolbox analysis panel (RS / Time Series / Flood / Well Site / AOI edit). */
  | { op: 'openToolboxPanel'; panel: string }
  /** Show a remote-sensing index (NDVI/…) on the map for the current AOI. */
  | { op: 'runRsIndex'; index: string }
  /** Run a GIS geoprocessing op (buffer, intersect, clip, …) via host handler. */
  | { op: 'gisOp'; tool: string; args: Record<string, unknown> }

export type GeoAiToolboxPanelId =
  | 'remote-sensing'
  | 'imagery-time-series'
  | 'flood-monitoring'
  | 'well-site'
  | 'hydro-watershed'
  | 'aoi-edit'
  | 'layers'
  | 'eo-enrichment'
  | 'tree-detections'
  | 'agri-field-boundary'
  | 'crop-alerts'
  | 'stress-zones'

/** Normalize free-text panel names from the model into dock section ids. */
export function normalizeGeoAiToolboxPanelId(raw: string): GeoAiToolboxPanelId | null {
  const t = raw.trim().toLowerCase().replace(/[_/]+/g, '-').replace(/\s+/g, '-')
  if (!t) return null
  if (/^(remote-sensing|remote|rs|indices?|ndvi|ndwi|ndmi|savi|evi|wms|layer-live)$/.test(t)) {
    return 'remote-sensing'
  }
  if (/^(imagery-time-series|time-series|timeseries|timeline|ts)$/.test(t)) return 'imagery-time-series'
  if (/^(flood-monitoring|flood|sar-flood|sar)$/.test(t)) return 'flood-monitoring'
  if (/^(well-site|well|hydro-ai|drilling)$/.test(t)) return 'well-site'
  if (/^(hydro-watershed|hydro|watershed|basin)$/.test(t)) return 'hydro-watershed'
  if (/^(aoi-edit|aoi|draw|drawing|edit|polygon)$/.test(t)) return 'aoi-edit'
  if (/^(layers?|layer-manager)$/.test(t)) return 'layers'
  if (/^(eo-enrichment|eo|enrichment)$/.test(t)) return 'eo-enrichment'
  if (/^(tree-detections|trees?)$/.test(t)) return 'tree-detections'
  if (/^(agri-field-boundary|field-boundary|fields?)$/.test(t)) return 'agri-field-boundary'
  if (/^(crop-alerts?|alerts?)$/.test(t)) return 'crop-alerts'
  if (/^(stress-zones?|stress)$/.test(t)) return 'stress-zones'
  return null
}

/** Extract RS index id from free text (ndvi, ndwi, …). Defaults null if none. */
export function parseGeoAiRsIndexId(raw: string | null | undefined): string | null {
  const t = String(raw || '').trim().toUpperCase()
  if (!t) return null
  const m = t.match(/\b(NDVI|NDMI|NDWI|SAVI|EVI|GNDVI|NBR|NDRE|BSI|MNDWI|LST|NDSI|ET)\b/i)
  if (m) return m[1]!.toUpperCase()
  const compact = t.replace(/[\s_-]+/g, '')
  if (/^(NDVI|NDMI|NDWI|SAVI|EVI|GNDVI|NBR|NDRE|BSI|MNDWI|LST|NDSI|ET)$/.test(compact)) {
    return compact
  }
  return null
}

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
    case 'openToolboxPanel':
    case 'openPanel':
    case 'openTool':
    case 'openToolbox': {
      const panel = String(o.panel ?? o.tool ?? o.section ?? o.id ?? '').trim()
      const normalized = normalizeGeoAiToolboxPanelId(panel)
      // If user/model asked for NDVI (etc.), emit runRsIndex instead of only opening the panel.
      const indexHint = parseGeoAiRsIndexId(panel) || parseGeoAiRsIndexId(String(o.index ?? ''))
      if (indexHint) {
        return { op: 'runRsIndex', index: indexHint }
      }
      return normalized ? { op: 'openToolboxPanel', panel: normalized } : null
    }
    case 'runRsIndex':
    case 'showRsIndex':
    case 'showNdvi':
    case 'runNdvi': {
      const index =
        parseGeoAiRsIndexId(String(o.index ?? o.layer ?? o.name ?? o.panel ?? '')) ||
        (op === 'showNdvi' || op === 'runNdvi' ? 'NDVI' : null) ||
        'NDVI'
      return { op: 'runRsIndex', index }
    }
    case 'gisOp':
    case 'gis':
    case 'gisBuffer':
    case 'gisIntersect':
    case 'gisClip':
    case 'gisErase':
    case 'gisUnion':
    case 'gisMerge':
    case 'gisDissolve':
    case 'gisConvexHull':
    case 'gisVoronoi':
    case 'gisArea':
    case 'gisSelectByLocation':
    case 'gisSelectByAttribute':
    case 'exportLayer': {
      const aliasToTool: Record<string, string> = {
        gisBuffer: 'buffer',
        gisIntersect: 'intersect',
        gisClip: 'clip',
        gisErase: 'erase',
        gisUnion: 'union',
        gisMerge: 'merge',
        gisDissolve: 'dissolve',
        gisConvexHull: 'convex_hull',
        gisVoronoi: 'voronoi',
        gisArea: 'area',
        gisSelectByLocation: 'select_by_location',
        gisSelectByAttribute: 'select_by_attribute',
        exportLayer: 'export_layer',
      }
      const tool =
        op === 'gisOp' || op === 'gis'
          ? String(o.tool ?? o.name ?? o.op ?? '').trim().replace(/^gis_?/i, '')
          : aliasToTool[op] || ''
      if (!tool) return null
      const args: Record<string, unknown> = { ...o }
      delete args.op
      delete args.action
      delete args.tool
      return { op: 'gisOp', tool, args }
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
  openToolboxPanel?: (panel: string) => string | void
  /** Show NDVI/NDWI/… WMS on the map for the current AOI. */
  runRsIndex?: (index: string) => string | void
  /** Sync or async GIS geoprocess; may return a Promise (executor awaits). */
  gisOp?: (tool: string, args: Record<string, unknown>) => string | void | Promise<string | void>
}

/** Execute parsed commands against host handlers; returns a per-command result log. */
export function executeGeoAiMapCommands(
  commands: GeoAiMapCommand[],
  handlers: GeoAiMapCommandHandlers,
): GeoAiMapCommandResult[] {
  const results: GeoAiMapCommandResult[] = []
  for (const command of commands) {
    try {
      let message: string | void | Promise<string | void>
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
        case 'openToolboxPanel':
          message = handlers.openToolboxPanel?.(command.panel)
          break
        case 'runRsIndex':
          message = handlers.runRsIndex?.(command.index)
          break
        case 'gisOp':
          message = handlers.gisOp?.(command.tool, command.args)
          break
        default:
          break
      }
      // Sync path only — async gisOp should be awaited by the agent tool runner.
      if (message && typeof (message as Promise<unknown>).then === 'function') {
        results.push({
          command,
          ok: true,
          message: 'GIS operation started.',
        })
      } else {
        results.push({
          command,
          ok: typeof message === 'string',
          message: typeof message === 'string' ? message : 'No handler available for this action.',
        })
      }
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
