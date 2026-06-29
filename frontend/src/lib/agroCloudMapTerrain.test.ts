import { describe, expect, it } from 'vitest'
import {
  AGRO_CLOUD_ESRI_HILLSHADE_LAYER_ID,
  AGRO_CLOUD_HILLSHADE_LAYER_ID,
  AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD,
  AGRO_CLOUD_TOPO_BASE_LAYER_ID,
  build3dTopographicMapboxStyle,
  buildEsriWorldTerrainDemSourceSpec,
  ESRI_WORLD_TERRAIN_DEM_TILE_PATH,
  ESRI_WORLD_TERRAIN_SOURCE_ID,
  getAgroCloudTerrainExaggeration,
  is3dTopographicBasemapId,
  setAgroCloudTerrainExaggeration,
  shouldEnableAgroCloudTerrain3d,
  TOPOGRAPHIC_3D_BASEMAP_ID,
} from './agroCloudMapTerrain'

describe('agroCloudMapTerrain', () => {
  it('identifies the 3D topographic basemap id', () => {
    expect(is3dTopographicBasemapId(TOPOGRAPHIC_3D_BASEMAP_ID)).toBe(true)
    expect(is3dTopographicBasemapId('esri-topo')).toBe(false)
  })

  it('enables terrain when pitch tilts into 3D or topographic basemap is active', () => {
    expect(
      shouldEnableAgroCloudTerrain3d({
        basemapId: 'satellite',
        pitch: AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD,
      }),
    ).toBe(true)
    expect(
      shouldEnableAgroCloudTerrain3d({
        basemapId: 'satellite',
        pitch: AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD - 1,
      }),
    ).toBe(false)
    expect(shouldEnableAgroCloudTerrain3d({ basemapId: TOPOGRAPHIC_3D_BASEMAP_ID, pitch: 0 })).toBe(
      true,
    )
  })

  it('builds Esri WorldElevation3D raster-dem source via the backend terrain-RGB proxy', () => {
    const spec = buildEsriWorldTerrainDemSourceSpec() as {
      type: string
      tiles: string[]
      tileSize: number
      encoding: string
      maxzoom: number
    }
    expect(spec).toMatchObject({
      type: 'raster-dem',
      tileSize: 256,
      encoding: 'mapbox',
      maxzoom: 13,
    })
    // The DEM tiles must be routed through the backend decoding proxy, not the raw LERC endpoint.
    expect(spec.tiles[0].endsWith(ESRI_WORLD_TERRAIN_DEM_TILE_PATH)).toBe(true)
    expect(spec.tiles[0]).not.toContain('elevation3d.arcgis.com')
  })

  it('builds a flat topo basemap + Esri World Hillshade overlay without baking in the DEM mesh', () => {
    // The DEM mesh (raster-dem source + `setTerrain`) is intentionally NOT baked
    // into the style. It is added at runtime only after the backend terrain proxy
    // is confirmed reachable, so static/backend-less hosts degrade gracefully to
    // this flat style instead of flooding the console with /api/terrain 404s.
    const style = build3dTopographicMapboxStyle() as {
      sources: Record<string, { type: string; tiles?: string[]; encoding?: string }>
      layers: { id: string; type: string }[]
      terrain?: { source: string; exaggeration: number }
    }

    // No DEM source and no terrain block until the runtime controller adds them.
    expect(style.sources[ESRI_WORLD_TERRAIN_SOURCE_ID]).toBeUndefined()
    expect(style.terrain).toBeUndefined()

    // Layer order (bottom→top): topo basemap raster → Esri World Hillshade overlay.
    expect(style.layers[0]).toMatchObject({
      id: AGRO_CLOUD_TOPO_BASE_LAYER_ID,
      type: 'raster',
    })
    expect(style.layers[1]).toMatchObject({
      id: AGRO_CLOUD_ESRI_HILLSHADE_LAYER_ID,
      type: 'raster',
    })
    // The computed-hillshade layer (sourced from the DEM) is not present yet.
    expect(style.layers.some((l) => l.id === AGRO_CLOUD_HILLSHADE_LAYER_ID)).toBe(false)
  })

  it('clamps and shares the user-adjustable terrain exaggeration', () => {
    expect(setAgroCloudTerrainExaggeration(2.5)).toBe(2.5)
    expect(getAgroCloudTerrainExaggeration()).toBe(2.5)
    expect(setAgroCloudTerrainExaggeration(99)).toBe(8)
    expect(setAgroCloudTerrainExaggeration(0)).toBe(1)
    // Restore default so other tests/styles see 1.5.
    expect(setAgroCloudTerrainExaggeration(1.5)).toBe(1.5)
  })
})
