import { describe, expect, it } from 'vitest'
import {
  AGRO_CLOUD_HILLSHADE_LAYER_ID,
  AGRO_CLOUD_TERRAIN_PITCH_THRESHOLD,
  AGRO_CLOUD_TOPO_BASE_LAYER_ID,
  build3dTopographicMapboxStyle,
  buildEsriWorldTerrainDemSourceSpec,
  ESRI_WORLD_TERRAIN_SOURCE_ID,
  ESRI_WORLD_TERRAIN_TILE_URL,
  is3dTopographicBasemapId,
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

  it('builds Esri WorldElevation3D raster-dem source tuned for fast load', () => {
    expect(buildEsriWorldTerrainDemSourceSpec()).toMatchObject({
      type: 'raster-dem',
      tiles: [ESRI_WORLD_TERRAIN_TILE_URL],
      tileSize: 256,
      encoding: 'terrarium',
      maxzoom: 13,
    })
  })

  it('places hillshade below basemap rasters in the style stack', () => {
    const style = build3dTopographicMapboxStyle() as {
      sources: Record<string, { type: string; tiles?: string[]; encoding?: string }>
      layers: { id: string; type: string }[]
      terrain?: { source: string; exaggeration: number }
    }

    expect(style.sources[ESRI_WORLD_TERRAIN_SOURCE_ID]).toMatchObject({
      type: 'raster-dem',
      tiles: [ESRI_WORLD_TERRAIN_TILE_URL],
      encoding: 'terrarium',
    })
    expect(style.layers[0]).toMatchObject({
      id: AGRO_CLOUD_HILLSHADE_LAYER_ID,
      type: 'hillshade',
    })
    expect(style.layers[1]).toMatchObject({
      id: AGRO_CLOUD_TOPO_BASE_LAYER_ID,
      type: 'raster',
    })
    expect(style.terrain).toMatchObject({
      source: ESRI_WORLD_TERRAIN_SOURCE_ID,
      exaggeration: 1.5,
    })
  })
})
