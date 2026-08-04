import { describe, expect, it } from 'vitest'
import { buildSentinelHubWmsDisplayChunks, inferWmsEvalProfile } from './sentinelHubWmsAoiClip'
import { usesSentinelHubWmsCustomEvalscript } from './sentinelHubWmsLayers'
import { DATAMASK_LAYER_ID } from './dataMaskLayer'

describe('DATAMASK Layers AOI paint path', () => {
  it('builds GEOMETRY + EVALSCRIPT chunks for DATAMASK', () => {
    expect(usesSentinelHubWmsCustomEvalscript(DATAMASK_LAYER_ID)).toBe(true)
    expect(inferWmsEvalProfile(DATAMASK_LAYER_ID)).toBe('data_mask')
    const poly = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [55, 25],
                [55.01, 25],
                [55.01, 25.01],
                [55, 25.01],
                [55, 25],
              ],
            ],
          },
        },
      ],
    }
    const chunks = buildSentinelHubWmsDisplayChunks(poly, 'DATAMASK', {
      indexVisibilityMin: null,
      sceneDate: '2024-06-01',
      maxTileLayers: 8,
    })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks[0]?.evalscriptB64).toBeTruthy()
    expect(chunks[0]?.geometryWkt3857).toBeTruthy()
  })
})
