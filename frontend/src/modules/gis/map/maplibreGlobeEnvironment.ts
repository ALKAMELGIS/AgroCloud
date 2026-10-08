import type { Map as MaplibreMap } from 'maplibre-gl'
import type { SkySpecification } from '@maplibre/maplibre-gl-style-spec'

/** MapLibre v5 globe + space backdrop (Mapbox GL uses `name`; MapLibre uses `type`). */
export const MAPLIBRE_GLOBE_SKY_GALAXY: SkySpecification = {
  'sky-color': '#08051a',
  'sky-horizon-blend': 0.06,
  'horizon-color': '#2d1b4e',
  'horizon-fog-blend': 0.14,
  'fog-color': '#0a0614',
  'fog-ground-blend': 0,
  'atmosphere-blend': 1,
}

/** Starfield in space around the globe (MapLibre `setFog`). */
export const MAPLIBRE_GLOBE_FOG_GALAXY = {
  range: [0.35, 12] as [number, number],
  color: '#000000',
  'horizon-blend': 0.1,
  'high-color': '#000000',
  'space-color': '#000000',
  'star-intensity': 1,
}

/** Match {@link syncAgroCloudMapProjectionForZoom} globe cutoff (avoid import cycle). */
export const MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM = 4.5

export const MAPLIBRE_GLOBE_LIGHT = {
  anchor: 'map' as const,
  position: [1.5, 90, 78] as [number, number, number],
}

export function setMapLibreGlobeProjection(
  map: { setProjection?: (p: { type: string } | { name: string }) => void } | null | undefined,
): void {
  if (!map?.setProjection) return
  try {
    map.setProjection({ type: 'globe' })
    return
  } catch {
    /* Mapbox GL */
  }
  try {
    map.setProjection({ name: 'globe' })
  } catch {
    /* ignore */
  }
}

export function setMapLibreMercatorProjection(
  map: { setProjection?: (p: { type: string } | { name: string }) => void } | null | undefined,
): void {
  if (!map?.setProjection) return
  try {
    map.setProjection({ type: 'mercator' })
    return
  } catch {
    /* Mapbox GL */
  }
  try {
    map.setProjection({ name: 'mercator' })
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
  map: MaplibreMap | null | undefined,
  zoom?: number,
): void {
  if (!map?.setFog) return
  try {
    const z = typeof zoom === 'number' ? zoom : map.getZoom()
    if (z < MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM) {
      map.setFog(MAPLIBRE_GLOBE_FOG_GALAXY)
    } else {
      map.setFog(null as never)
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

export function mergeMapLibreGlobeCockpitStyle<T extends Record<string, unknown>>(base: T): T {
  return {
    ...base,
    projection: { type: 'globe' },
    sky: MAPLIBRE_GLOBE_SKY_GALAXY,
    light: MAPLIBRE_GLOBE_LIGHT,
  }
}
