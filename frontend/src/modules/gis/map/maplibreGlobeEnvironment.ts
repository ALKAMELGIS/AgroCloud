import type { Map as MaplibreMap, SkySpecification } from 'maplibre-gl'

/**
 * Any map exposing `setProjection` — MapLibre (`{ type }`), Mapbox GL (`{ name }` | string)
 * or a test double. Parameter typed `never` so every library signature is assignable.
 */
export type AgroCloudProjectionSettableMap = { setProjection?: (projection: never) => unknown }

type AgroCloudProjectionInput = { type: 'globe' | 'mercator' } | { name: 'globe' | 'mercator' }

/** Invoke `map.setProjection` (bound to `map`) across MapLibre / Mapbox signature differences. */
function callSetProjection(map: AgroCloudProjectionSettableMap, projection: AgroCloudProjectionInput): void {
  const setProjection = map.setProjection as ((this: unknown, p: AgroCloudProjectionInput) => unknown) | undefined
  setProjection?.call(map, projection)
}

/** MapLibre GL 5 has no `setFog`; Mapbox-compatible maps / doubles may provide one. */
type MaplibreMapWithOptionalFog = MaplibreMap & {
  setFog?: (fog: typeof MAPLIBRE_GLOBE_FOG_GALAXY | null) => unknown
}

/** Google Earth–style space backdrop (pure black + procedural stars via fog). */
export const MAPLIBRE_GLOBE_SKY_GALAXY: SkySpecification = {
  'sky-color': '#000000',
  'sky-horizon-blend': 0.04,
  'horizon-color': '#000000',
  'horizon-fog-blend': 0.08,
  'fog-color': '#000000',
  'fog-ground-blend': 0,
  'atmosphere-blend': 1,
}

/** Starfield in space around the globe (MapLibre `setFog`). */
export const MAPLIBRE_GLOBE_FOG_GALAXY = {
  range: [0.25, 11] as [number, number],
  color: '#000000',
  'horizon-blend': 0.16,
  'high-color': '#000000',
  'space-color': '#000000',
  'star-intensity': 0.55,
}

/** Match {@link syncAgroCloudMapProjectionForZoom} globe cutoff (avoid import cycle). */
export const MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM = 4.5

export const MAPLIBRE_GLOBE_LIGHT = {
  anchor: 'map' as const,
  position: [1.5, 90, 78] as [number, number, number],
}

export function setMapLibreGlobeProjection(
  map: AgroCloudProjectionSettableMap | null | undefined,
): void {
  if (!map?.setProjection) return
  try {
    callSetProjection(map, { type: 'globe' })
    return
  } catch {
    /* Mapbox GL */
  }
  try {
    callSetProjection(map, { name: 'globe' })
  } catch {
    /* ignore */
  }
}

export function setMapLibreMercatorProjection(
  map: AgroCloudProjectionSettableMap | null | undefined,
): void {
  if (!map?.setProjection) return
  try {
    callSetProjection(map, { type: 'mercator' })
    return
  } catch {
    /* Mapbox GL */
  }
  try {
    callSetProjection(map, { name: 'mercator' })
  } catch {
    /* ignore */
  }
}

function transparentMapLibreCanvas(map: MaplibreMap): void {
  const canvas = map.getCanvas?.()
  if (canvas) canvas.style.background = 'transparent'
  const container = map.getContainer?.()
  if (container) container.style.background = 'transparent'
  const canvasContainer = container?.querySelector?.('.maplibregl-canvas-container') as HTMLElement | null
  if (canvasContainer) canvasContainer.style.background = 'transparent'
}

export function applyMapLibreGlobeGalaxyFog(
  map: MaplibreMapWithOptionalFog | null | undefined,
  zoom?: number,
): void {
  if (!map?.setFog) return
  try {
    const z = typeof zoom === 'number' ? zoom : map.getZoom()
    if (z < MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM) {
      map.setFog(MAPLIBRE_GLOBE_FOG_GALAXY)
    } else {
      map.setFog(null)
    }
  } catch {
    /* style not ready */
  }
}

export function applyMapLibreGlobeGalaxySky(map: MaplibreMap | null | undefined): void {
  if (!map) return
  try {
    map.setSky?.(MAPLIBRE_GLOBE_SKY_GALAXY)
    transparentMapLibreCanvas(map)
    applyMapLibreGlobeGalaxyFog(map)
  } catch {
    /* style not ready */
  }
}

/** Field / farm zoom — opaque canvas + no galaxy fog so raster basemap stays visible after fly-to. */
export function applyMapLibreFieldBasemapEnvironment(map: MaplibreMap | null | undefined): void {
  if (!map) return
  try {
    setMapLibreMercatorProjection(map)
    applyMapLibreGlobeGalaxyFog(map, MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM + 1)
    map.setSky?.(undefined as never)
    const canvas = map.getCanvas?.()
    if (canvas) canvas.style.background = '#0b0f14'
    const container = map.getContainer?.()
    if (container) container.style.background = '#0b0f14'
    const canvasContainer = container?.querySelector?.('.maplibregl-canvas-container') as HTMLElement | null
    if (canvasContainer) canvasContainer.style.background = '#0b0f14'
  } catch {
    /* style not ready */
  }
}

export function applyMapLibreGlobeOrFieldEnvironment(
  map: MaplibreMap | null | undefined,
  zoom?: number,
): void {
  if (!map) return
  const z = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : map.getZoom()
  if (z < MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM) applyMapLibreGlobeGalaxySky(map)
  else applyMapLibreFieldBasemapEnvironment(map)
}

export function mergeMapLibreGlobeCockpitStyle<T extends Record<string, unknown>>(
  base: T,
): T & {
  projection: { type: 'globe' }
  sky: SkySpecification
  light: typeof MAPLIBRE_GLOBE_LIGHT
} {
  return {
    ...base,
    projection: { type: 'globe' as const },
    sky: MAPLIBRE_GLOBE_SKY_GALAXY,
    light: MAPLIBRE_GLOBE_LIGHT,
  }
}
