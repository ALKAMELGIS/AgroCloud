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
 * - An explicit `maxzoom` (from the service's `maxLOD`) always wins.
 * - Dynamic export services (bbox-templated, no `{z}`) render at any zoom, so
 *   they are never capped (capping would blur them).
 * - XYZ templates use the provider's native cap; unknown providers stay uncapped.
 */
export function rasterTilesSourceMaxNativeZoom(config: {
  tiles?: string[] | null
  maxzoom?: number | null
}): number | undefined {
  if (typeof config?.maxzoom === 'number' && Number.isFinite(config.maxzoom)) {
    return config.maxzoom
  }
  const first = config?.tiles?.[0] ?? ''
  if (!first || !/\{z\}/i.test(first)) return undefined
  const cap = rasterTileMaxNativeZoom(first)
  return cap < NO_CAP_MAX_ZOOM ? cap : undefined
}
