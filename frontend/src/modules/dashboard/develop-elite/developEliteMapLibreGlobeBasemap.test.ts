import { describe, expect, it, vi } from 'vitest'
import { restoreDevelopElitePortfolioGlobeBasemap } from './developEliteMapLibreGlobeBasemap'

vi.mock('@/modules/gis/map/maplibreGlobeEnvironment', async importOriginal => {
  const actual = await importOriginal<typeof import('@/modules/gis/map/maplibreGlobeEnvironment')>()
  return {
    ...actual,
    setMapLibreGlobeProjection: vi.fn(),
  }
})

vi.mock('@/modules/remote-sensing/terrain/agroCloudMapTerrain', () => ({
  syncAgroCloudTerrain3d: vi.fn(),
}))

import { setMapLibreGlobeProjection } from '@/modules/gis/map/maplibreGlobeEnvironment'
import { syncAgroCloudTerrain3d } from '@/modules/remote-sensing/terrain/agroCloudMapTerrain'

describe('restoreDevelopElitePortfolioGlobeBasemap', () => {
  it('reapplies globe sky/fog, projection, and terrain when style is ready', () => {
    const setSky = vi.fn()
    const setFog = vi.fn()
    const map = {
      isStyleLoaded: () => true,
      getZoom: () => 12,
      getPitch: () => 48,
      getCanvas: () => ({ style: {} }),
      getContainer: () => ({ style: {}, querySelector: () => null }),
      setSky,
      setFog,
      triggerRepaint: vi.fn(),
    }
    restoreDevelopElitePortfolioGlobeBasemap(map as never, {
      basemapId: 'google-satellite-hybrid',
      viewMode3d: true,
    })
    expect(setMapLibreGlobeProjection).toHaveBeenCalledWith(map)
    expect(setSky).toHaveBeenCalled()
    expect(setFog).toHaveBeenCalled()
    expect(syncAgroCloudTerrain3d).toHaveBeenCalledWith(map, 'google-satellite-hybrid', 48, {
      terrainLayerEnabled: true,
      terrainExplicitToolbarGate: true,
    })
  })
})
