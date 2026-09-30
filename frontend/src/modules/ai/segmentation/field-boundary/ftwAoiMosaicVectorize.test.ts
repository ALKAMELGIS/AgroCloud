import { describe, expect, it } from 'vitest'
import { sampleFtwMosaicFieldStats, type FtwRasterMosaic } from './ftwAoiMosaicVectorize'

function mosaic(): FtwRasterMosaic {
  const width = 4
  const height = 2
  const mask = new Uint8Array([1, 1, 0, 0, 1, 1, 0, 0])
  const confidence = new Float32Array([0.2, 0.4, 0.9, 0.9, 0.2, 0.4, 0.9, 0.9])
  return { mask, confidence, width, height, bbox: [0, 0, 4, 2] }
}

describe('sampleFtwMosaicFieldStats', () => {
  it('uses the mean of raster pixels inside the field, not the bbox maximum', () => {
    const feature: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      },
    }
    const stats = sampleFtwMosaicFieldStats(mosaic(), feature)
    expect(stats.fieldPixels).toBeGreaterThan(0)
    expect(stats.confidenceMean).toBeCloseTo(0.3, 5)
    expect(stats.confidenceMean).toBeLessThan(0.9)
  })
})
