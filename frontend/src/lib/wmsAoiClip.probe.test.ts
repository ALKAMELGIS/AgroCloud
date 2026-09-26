import { describe, expect, it } from 'vitest'
import { buildSentinelHubWmsDisplayChunks } from './sentinelHubWmsAoiClip'

const squareAoi = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [55.0, 25.0],
        [55.01, 25.0],
        [55.01, 25.01],
        [55.0, 25.01],
        [55.0, 25.0],
      ],
    ],
  },
}

describe('wms aoi clip probe', () => {
  for (const layer of ['NDVI', 'LULC', 'ADI', 'NCADI', 'MVI', 'REMI']) {
    it(`builds display chunks for ${layer}`, () => {
      const chunks = buildSentinelHubWmsDisplayChunks(squareAoi, layer, {
        sceneDate: '2025-06-15',
        maxTileLayers: 16,
      })
      expect(chunks.length, layer).toBeGreaterThan(0)
      expect(chunks.every(c => c.evalscriptB64 != null), layer).toBe(true)
    })
  }
})
