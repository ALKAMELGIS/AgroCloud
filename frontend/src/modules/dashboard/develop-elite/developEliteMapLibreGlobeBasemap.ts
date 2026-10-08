import type { Map as MaplibreMap } from 'maplibre-gl'
import {
  MAPLIBRE_GLOBE_FOG_GALAXY,
  MAPLIBRE_GLOBE_SKY_GALAXY,
  setMapLibreGlobeProjection,
} from '@/modules/gis/map/maplibreGlobeEnvironment'
import { syncAgroCloudTerrain3d } from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'
import { applyDevelopEliteMapLibreFlatPortfolioCamera } from './developEliteMapLibreNavigation'
import {
  DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
  isDevelopEliteMapPortfolio3dActive,
} from './developEliteMapViewport'

/** Portfolio map always renders as a 3D globe with galaxy backdrop — never Mercator / flat field mode. */
export function applyDevelopElitePortfolioGlobeEnvironment(map: MaplibreMap | null | undefined): void {
  if (!map) return
  setMapLibreGlobeProjection(map)
  try {
    map.setSky?.(MAPLIBRE_GLOBE_SKY_GALAXY)
    map.setFog?.(MAPLIBRE_GLOBE_FOG_GALAXY)
    const canvas = map.getCanvas?.()
    if (canvas) canvas.style.background = 'transparent'
    const container = map.getContainer?.()
    if (container) container.style.background = 'transparent'
    const canvasContainer = container?.querySelector?.('.maplibregl-canvas-container') as HTMLElement | null
    if (canvasContainer) canvasContainer.style.background = 'transparent'
  } catch {
    /* style swap race */
  }
}

export type RestoreDevelopElitePortfolioGlobeOpts = {
  basemapId: string
  viewMode3d: boolean
}

/** Re-apply projection, sky/fog, and terrain after `setStyle` or camera moves (no basemap swap). */
export function restoreDevelopElitePortfolioGlobeBasemap(
  map: MaplibreMap | null | undefined,
  opts: RestoreDevelopElitePortfolioGlobeOpts,
): void {
  if (!map) return
  const apply = () => {
    try {
      syncDevelopEliteMapLibreViewportEnvironment(map, opts)
    } catch {
      /* style swap / teardown */
    }
  }
  if (map.isStyleLoaded?.() || map.loaded?.()) {
    apply()
    return
  }
  map.once('load', apply)
}

/** After refresh: globe environment + portfolio camera; topographic only if {@link DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D}. */
export function applyDevelopElitePortfolioMapBrowserLoadDefault(
  map: MaplibreMap,
  basemapId: string,
): void {
  const apply = () => {
    restoreDevelopElitePortfolioGlobeBasemap(map, {
      basemapId,
      viewMode3d: DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
    })
    applyDevelopEliteMapLibreFlatPortfolioCamera(map, { animate: false })
  }
  if (map.isStyleLoaded?.() || map.loaded?.()) apply()
  else map.once('load', apply)
}

export function syncDevelopEliteMapLibreViewportEnvironment(
  map: MaplibreMap,
  opts: RestoreDevelopElitePortfolioGlobeOpts,
): void {
  applyDevelopElitePortfolioGlobeEnvironment(map)
  syncAgroCloudTerrain3d(map as never, opts.basemapId, map.getPitch(), {
    terrainLayerEnabled: isDevelopEliteMapPortfolio3dActive(opts.viewMode3d),
    terrainExplicitToolbarGate: true,
  })
  try {
    map.triggerRepaint?.()
  } catch {
    /* ignore */
  }
}
