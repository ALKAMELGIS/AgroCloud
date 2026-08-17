/**
 * Native (server-cached) max zoom per raster basemap provider / Esri service.
 *
 * Tile servers such as ArcGIS Online return a gray "Map data not yet available"
 * placeholder image (HTTP 200 — not a 404) once you request a tile beyond the
 * level that service actually caches. Because it is a valid image, Mapbox GL has
 * no way to know it is a placeholder and paints it over the real imagery.
 *
 * The professional-GIS fix (matching Leaflet `maxNativeZoom`, ArcGIS JS API,
 * ArcGIS Pro and QGIS) is to cap the Mapbox raster source `maxzoom` at the level
 * the service really has. Mapbox then keeps and up-samples ("over-zooms") the
 * last real tiles for higher display zooms, giving seamless, continuous imagery
 * with no gray placeholder tiles and no missing-data flashes during zoom/pan.
 */

/** Fallback for unknown Esri services — the global World_Imagery floor. */
const DEFAULT_ESRI_MAX_NATIVE_ZOOM = 19

/** Unknown provider → keep Mapbox's default (no effective cap). */
const NO_CAP_MAX_ZOOM = 22

/** Match order matters: most specific service paths first. */
const ESRI_SERVICE_MAX_ZOOM: Array<[RegExp, number]> = [
  [/World_Imagery/i, 19],
  [/World_Boundaries_and_Places/i, 19],
  [/World_Street_Map/i, 19],
  [/World_Topo_Map/i, 19],
  [/World_Hillshade/i, 19],
  [/NatGeo_World_Map/i, 16],
  [/World_Light_Gray|World_Dark_Gray/i, 16],
  [/World_Ocean_Reference/i, 16],
  [/World_Ocean_Base/i, 13],
  [/World_Reference_Overlay/i, 13],
  [/World_Terrain_Base/i, 13],
  [/World_Shaded_Relief/i, 13],
  [/World_Physical_Map/i, 8],
]

/**
 * Resolve the native max zoom for a raster tile URL template. Values above this
 * are rendered by over-zooming the last cached tiles (no gray placeholders).
 */
export function rasterTileMaxNativeZoom(url: string): number {
  const u = String(url || '')
  if (!u) return NO_CAP_MAX_ZOOM
  if (/google\.com\/vt|googleusercontent/i.test(u)) return 21
  if (/openstreetmap\.org/i.test(u)) return 19
  if (/cartocdn\.com/i.test(u)) return 20
  if (/opentopomap\.org/i.test(u)) return 17
  if (/arcgisonline\.com|\/arcgis\//i.test(u)) {
    for (const [re, z] of ESRI_SERVICE_MAX_ZOOM) {
      if (re.test(u)) return z
    }
    return DEFAULT_ESRI_MAX_NATIVE_ZOOM
  }
  return NO_CAP_MAX_ZOOM
}

/**
 * Native max zoom for a Mapbox raster source built from a tiles config, or
 * `undefined` when no cap is needed. Applying it as the source `maxzoom` stops
 * the gray "Map data not yet available" placeholder tiles that cached services
 * (Esri/Google) return above their native level — Mapbox over-zooms instead.
 *
 * - Explicit service `maxzoom` / `maxLOD` is clamped to the provider's native cap.
 * - Dynamic export services (bbox-templated, no `{z}`) render at any zoom, so
 *   they are never capped (capping would blur them).
 * - XYZ templates use the provider's native cap; unknown providers stay uncapped.
 */
export function rasterTilesSourceMaxNativeZoom(config: {
  tiles?: string[] | null
  maxzoom?: number | null
}): number | undefined {
  const first = config?.tiles?.[0] ?? ''
  if (!first || !/\{z\}/i.test(first)) return undefined
  const providerCap = rasterTileMaxNativeZoom(first)
  const hasProviderCap = providerCap < NO_CAP_MAX_ZOOM
  if (typeof config?.maxzoom === 'number' && Number.isFinite(config.maxzoom)) {
    return hasProviderCap ? Math.min(config.maxzoom, providerCap) : config.maxzoom
  }
  return hasProviderCap ? providerCap : undefined
}

type RasterStyleSource = {
  type?: string
  tiles?: string[]
  tileSize?: number
  attribution?: string
  maxzoom?: number
  [key: string]: unknown
}

type RasterStyleLayer = {
  id: string
  type?: string
  source?: string
  paint?: Record<string, unknown>
  layout?: Record<string, unknown>
}

export type MapboxRasterSourceSpec = {
  type: 'raster'
  tiles: string[]
  tileSize: number
  attribution?: string
  maxzoom?: number
}

/** Build a Mapbox/MapLibre raster source with a safe native `maxzoom` when applicable. */
export function buildMapboxRasterSourceSpec(config: {
  tiles: string[]
  tileSize?: number
  attribution?: string
  maxzoom?: number | null
}): MapboxRasterSourceSpec {
  const cap = rasterTilesSourceMaxNativeZoom({ tiles: config.tiles, maxzoom: config.maxzoom ?? null })
  return {
    type: 'raster',
    tiles: config.tiles,
    tileSize: config.tileSize ?? 256,
    ...(config.attribution ? { attribution: config.attribution } : {}),
    ...(typeof cap === 'number' ? { maxzoom: cap } : {}),
  }
}

type MapRasterPatchTarget = {
  getStyle?: () => { sources?: Record<string, RasterStyleSource>; layers?: RasterStyleLayer[] } | null | undefined
  removeLayer?: (id: string) => void
  removeSource?: (id: string) => void
  addSource?: (id: string, spec: object) => void
  addLayer?: (spec: object, beforeId?: string) => void
}

/**
 * Patch live map sources that are missing (or exceed) native `maxzoom`.
 * Mapbox cannot change `maxzoom` via `setTiles` — rebuild affected sources in place.
 */
export function patchMapRasterSourcesMaxNativeZoom(map: MapRasterPatchTarget): number {
  const style = map.getStyle?.()
  if (!style?.sources) return 0

  const layerList = style.layers ?? []
  let patched = 0

  for (const [sourceId, src] of Object.entries(style.sources)) {
    if (!src || src.type !== 'raster' || !Array.isArray(src.tiles) || !src.tiles.length) continue
    const cap = rasterTilesSourceMaxNativeZoom({ tiles: src.tiles, maxzoom: src.maxzoom })
    if (typeof cap !== 'number' || src.maxzoom === cap) continue

    const boundLayers = layerList.filter(layer => layer.source === sourceId && layer.type === 'raster')
    if (!boundLayers.length) continue

    const firstIdx = layerList.findIndex(layer => layer.id === boundLayers[0]!.id)
    const topIdx = layerList.findIndex(layer => layer.id === boundLayers[boundLayers.length - 1]!.id)
    const belowId = firstIdx > 0 ? layerList[firstIdx - 1]!.id : undefined
    const aboveId =
      topIdx >= 0 && topIdx < layerList.length - 1 ? layerList[topIdx + 1]!.id : undefined

    const saved = boundLayers.map(layer => ({
      id: layer.id,
      paint: { ...(layer.paint ?? {}) },
      layout: { ...(layer.layout ?? {}) },
    }))

    for (let i = boundLayers.length - 1; i >= 0; i -= 1) {
      try {
        map.removeLayer?.(boundLayers[i]!.id)
      } catch {
        /* style rebuild race */
      }
    }
    try {
      map.removeSource?.(sourceId)
    } catch {
      continue
    }

    try {
      map.addSource?.(
        sourceId,
        buildMapboxRasterSourceSpec({
          tiles: src.tiles,
          tileSize: typeof src.tileSize === 'number' ? src.tileSize : 256,
          attribution: typeof src.attribution === 'string' ? src.attribution : undefined,
          maxzoom: cap,
        }),
      )
    } catch {
      continue
    }

    for (let i = saved.length - 1; i >= 0; i -= 1) {
      const layer = saved[i]!
      try {
        map.addLayer?.(
          {
            id: layer.id,
            type: 'raster',
            source: sourceId,
            paint: layer.paint,
            layout: layer.layout,
          },
          aboveId,
        )
      } catch {
        /* ignore layer race */
      }
    }

    void belowId
    patched += 1
  }

  return patched
}

/**
 * Ensure every XYZ raster source in a Mapbox style JSON has a safe native
 * `maxzoom` so high zoom levels over-sample instead of fetching Esri placeholders.
 */
export function ensureRasterStyleMaxNativeZoom<T extends Record<string, unknown>>(style: T): T {
  if (!style || typeof style !== 'object') return style
  const sources = style.sources as Record<string, RasterStyleSource> | undefined
  if (!sources || typeof sources !== 'object') return style

  let changed = false
  const nextSources: Record<string, RasterStyleSource> = { ...sources }
  for (const [id, src] of Object.entries(sources)) {
    if (!src || src.type !== 'raster' || !Array.isArray(src.tiles) || !src.tiles.length) continue
    const cap = rasterTilesSourceMaxNativeZoom({ tiles: src.tiles, maxzoom: src.maxzoom })
    if (typeof cap !== 'number' || src.maxzoom === cap) continue
    nextSources[id] = { ...src, maxzoom: cap }
    changed = true
  }
  return changed ? ({ ...style, sources: nextSources } as T) : style
}
