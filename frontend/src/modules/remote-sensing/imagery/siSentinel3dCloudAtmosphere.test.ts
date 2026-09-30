import { describe, expect, it } from 'vitest'
import {
  bilinearLngLatAtUv,
  buildPixelLiftCloudDeckMesh,
  sampleCloudDensityRgba,
} from './siSentinel3dCloudAtmosphere'

describe('siSentinel3dCloudAtmosphere', () => {
  it('interpolates corners at UV center', () => {
    const coords: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] = [[0, 1], [2, 1], [2, 0], [0, 0]]
    const [lng, lat] = bilinearLngLatAtUv(coords, 0.5, 0.5)
    expect(lng).toBeCloseTo(1, 5)
    expect(lat).toBeCloseTo(0.5, 5)
  })

  it('builds a single quad for pixel-lift deck', () => {
    const mesh = buildPixelLiftCloudDeckMesh(
      {
        imageUrl: 'blob:test',
        deckAltitudeM: 6000,
        deckVerticalSpreadM: 0,
        coordinates: [[0, 1], [2, 1], [2, 0], [0, 0]],
        pixelLift: true,
      },
      1,
    )
    expect(mesh.vertexCount).toBe(6)
  })

  it('returns higher density for opaque bright pixels', () => {
    const rgba = new Uint8ClampedArray(16)
    rgba[0] = 240
    rgba[1] = 240
    rgba[2] = 240
    rgba[3] = 255
    expect(sampleCloudDensityRgba(rgba, 2, 2, 0.25, 0.25)).toBeGreaterThan(0.5)
    rgba[3] = 0
    expect(sampleCloudDensityRgba(rgba, 2, 2, 0.25, 0.25)).toBeLessThan(0.05)
  })
})
