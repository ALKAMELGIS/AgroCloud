import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restoreDevelopElitePortfolioGlobeBasemap } from './developEliteMapLibreGlobeBasemap'

const viewportFlags = vi.hoisted(() => ({ mercatorOnly: true }))

vi.mock('./developEliteMapViewport', async importOriginal => {
  const actual = await importOriginal<typeof import('./developEliteMapViewport')>()
  return {
    ...actual,
    get DEVELOP_ELITE_GRID_MAP_MERCATOR_ONLY() {
      return viewportFlags.mercatorOnly
    },
  }
})

vi.mock('@/modules/gis/map/maplibreGlobeEnvironment', async importOriginal => {
  const actual = await importOriginal<typeof import('@/modules/gis/map/maplibreGlobeEnvironment')>()
  return {
    ...actual,
    setMapLibreGlobeProjection: vi.fn(),
    setMapLibreMercatorProjection: vi.fn(),
  }
})

vi.mock('@/modules/remote-sensing/terrain/agroCloudMapTerrain', () => ({
  syncAgroCloudTerrain3d: vi.fn(),
}))

import {
  MAPLIBRE_GLOBE_SKY_GALAXY,
  setMapLibreGlobeProjection,
  setMapLibreMercatorProjection,
} from '@/modules/gis/map/maplibreGlobeEnvironment'
import { syncAgroCloudTerrain3d } from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'

function makeMap(zoom: number) {
  return {
    isStyleLoaded: () => true,
    getZoom: () => zoom,
    getPitch: () => 48,
    getCanvas: () => ({ style: {} as Record<string, string> }),
    getContainer: () => ({ style: {} as Record<string, string>, querySelector: () => null }),
    setSky: vi.fn(),
    setFog: vi.fn(),
    triggerRepaint: vi.fn(),
  }
}

describe('restoreDevelopElitePortfolioGlobeBasemap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    viewportFlags.mercatorOnly = true
  })

  it('grid map (Mercator-only): reapplies Mercator, clears sky/fog, and syncs terrain when style is ready', () => {
    const map = makeMap(12)
    restoreDevelopElitePortfolioGlobeBasemap(map as never, {
      basemapId: 'google-satellite-hybrid',
      viewMode3d: true,
    })
    expect(setMapLibreMercatorProjection).toHaveBeenCalledWith(map)
    expect(setMapLibreGlobeProjection).not.toHaveBeenCalled()
    expect(map.setSky).toHaveBeenCalledWith(undefined)
    expect(map.setFog).toHaveBeenCalledWith(null)
    expect(syncAgroCloudTerrain3d).toHaveBeenCalledWith(map, 'google-satellite-hybrid', 48, {
      terrainLayerEnabled: true,
      terrainExplicitToolbarGate: true,
    })
    expect(map.triggerRepaint).not.toHaveBeenCalled()
  })

  it('globe-enabled map: reapplies globe sky/fog, projection, and terrain at portfolio zoom', () => {
    viewportFlags.mercatorOnly = false
    const map = makeMap(2)
    restoreDevelopElitePortfolioGlobeBasemap(map as never, {
      basemapId: 'google-satellite-hybrid',
      viewMode3d: true,
    })
    expect(setMapLibreGlobeProjection).toHaveBeenCalledWith(map)
    expect(map.setSky).toHaveBeenCalledWith(MAPLIBRE_GLOBE_SKY_GALAXY)
    expect(map.setFog).toHaveBeenCalled()
    expect(syncAgroCloudTerrain3d).toHaveBeenCalledWith(map, 'google-satellite-hybrid', 48, {
      terrainLayerEnabled: true,
      terrainExplicitToolbarGate: true,
    })
    expect(map.triggerRepaint).toHaveBeenCalled()
  })
})
