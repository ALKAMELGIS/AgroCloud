import { describe, expect, it } from 'vitest'
import { computeCloudDeckVolumeFrame } from './siSentinel3dCloudVolumeFrame'

describe('computeCloudDeckVolumeFrame', () => {
  it('derives center and half extents from corner coordinates', () => {
    const coordinates: [
      [number, number],
      [number, number],
      [number, number],
      [number, number],
    ] = [
      [0, 1],
      [0.01, 1],
      [0.01, 0.99],
      [0, 0.99],
    ]
    const frame = computeCloudDeckVolumeFrame(coordinates)
    expect(frame.centerLng).toBeCloseTo(0.005, 4)
    expect(frame.centerLat).toBeCloseTo(0.995, 4)
    expect(frame.halfWidthM).toBeGreaterThan(40)
    expect(frame.halfHeightM).toBeGreaterThan(40)
  })
})
