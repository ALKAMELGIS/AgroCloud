import { describe, expect, it } from 'vitest'
import { buildElevationProfile, formatProfileDistance, lineFromGeometry } from './elevationProfile'

describe('elevation profile', () => {
  it('reports distance, rise gain, and slope along a line', () => {
    const vertices: [number, number][] = [
      [55.2, 24.4],
      [55.21, 24.4],
    ]
    const profile = buildElevationProfile(vertices, (_lng, lat) => 100 + (lat - 24.4) * 0, 50)
    expect(profile).not.toBeNull()
    expect(profile!.stats.distanceM).toBeGreaterThan(900)
    expect(profile!.stats.minM).toBeCloseTo(100, 3)
    expect(profile!.stats.gainM).toBeCloseTo(0, 3)
    expect(Math.abs(profile!.stats.slopeAvgPct)).toBeLessThan(0.05)
    expect(formatProfileDistance(3433)).toBe('3,433 m')
  })

  it('splits gain and loss when the surface rises then falls', () => {
    const vertices: [number, number][] = [
      [0, 0],
      [0.01, 0],
      [0.02, 0],
    ]
    const profile = buildElevationProfile(
      vertices,
      lng => (lng <= 0.01 ? 10 + (lng / 0.01) * 30 : 40 - ((lng - 0.01) / 0.01) * 25),
      40,
    )
    expect(profile).not.toBeNull()
    expect(profile!.stats.gainM).toBeGreaterThan(20)
    expect(profile!.stats.lossM).toBeLessThan(-15)
    expect(profile!.stats.maxM).toBeGreaterThan(profile!.stats.minM)
    expect(profile!.stats.slopeMaxPct).toBeGreaterThan(0)
    expect(profile!.stats.slopeMinPct).toBeLessThan(0)
  })

  it('reads a polygon ring as a profile line', () => {
    const line = lineFromGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    })
    expect(line).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
  })
})
