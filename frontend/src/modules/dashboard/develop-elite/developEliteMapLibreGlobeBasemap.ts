import type { Map as MaplibreMap } from 'maplibre-gl'
import {
  applyMapLibreGlobeGalaxySky,
  MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM,
  setMapLibreGlobeProjection,
  setMapLibreMercatorProjection,
} from '@/modules/gis/map/maplibreGlobeEnvironment'
import { syncAgroCloudTerrain3d } from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'
import { developEliteMapLibreApplyPortfolioHome } from './developEliteMapLibreNavigation'
import {
  DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY,
  DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
  isDevelopEliteMapPortfolio3dActive,
} from './developEliteMapViewport'

const DE_FIELD_MAP_CANVAS_BG = '#0e1a16'

function applyDevelopEliteFieldMapCanvasBackdrop(map: MaplibreMap): void {
  const canvas = map.getCanvas?.()
  if (canvas) canvas.style.background = DE_FIELD_MAP_CANVAS_BG
  const container = map.getContainer?.()
  if (container) container.style.background = DE_FIELD_MAP_CANVAS_BG
  const canvasContainer = container?.querySelector?.('.maplibregl-canvas-container') as HTMLElement | null
  if (canvasContainer) canvasContainer.style.background = DE_FIELD_MAP_CANVAS_BG
}

function clearDevelopEliteGalaxySky(map: MaplibreMap): void {
  try {
    map.setFog?.(null as never)
    map.setSky?.(undefined as never)
  } catch {
    /* style swap */
  }
  applyDevelopEliteFieldMapCanvasBackdrop(map)
}

/** Globe + galaxy when zoomed out; Mercator + opaque canvas at field zoom (no black starfield gaps). */
export function applyDevelopElitePortfolioGlobeEnvironment(map: MaplibreMap | null | undefined): void {
  if (!map) return
  if (DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY) {
    setMapLibreMercatorProjection(map)
    clearDevelopEliteGalaxySky(map)
    return
  }
  const zoom = map.getZoom()
  if (zoom >= MAPLIBRE_GLOBE_PORTFOLIO_MAX_ZOOM) {
    setMapLibreMercatorProjection(map)
    clearDevelopEliteGalaxySky(map)
    return
  }
  setMapLibreGlobeProjection(map)
  try {
    applyMapLibreGlobeGalaxySky(map)
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
  opts?: { worldCountries?: GeoJSON.FeatureCollection | null },
): void {
  const apply = () => {
    restoreDevelopElitePortfolioGlobeBasemap(map, {
      basemapId,
      viewMode3d: DEVELOP_ELITE_MAP_DEFAULT_VIEW_3D,
    })
    developEliteMapLibreApplyPortfolioHome(map, {
      animate: false,
      worldCountries: opts?.worldCountries,
    })
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
  if (!DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY) {
    try {
      map.triggerRepaint?.()
    } catch {
      /* ignore */
    }
  }
}
