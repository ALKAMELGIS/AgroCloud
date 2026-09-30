import { describe, expect, it } from 'vitest'
import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import { buildCutFillProfile, buildCutFillProfileChart } from './cutFillProfile'

function grid(): DemGrid {
  return {
    width: 4,
    height: 3,
    elev: new Float32Array(12),
    bbox: { west: 0, south: 0, east: 4, north: 3 },
    zoom: 12,
    originWorldPxX: 0,
    originWorldPxY: 0,
    metersPerPixel: 10,
    cornerCoords: [
      [0, 3],
      [4, 3],
      [4, 0],
      [0, 0],
    ],
    tilesLoaded: 1,
    tilesTotal: 1,
    pxToLngLat: (x, y) => [x, 3 - y],
  }
}

describe('cut/fill profile', () => {
  it('draws cut where existing ground is above the design', () => {
    const dem = grid()
    const existing = new Float32Array(12).fill(NaN)
    const design = new Float32Array(12).fill(NaN)
    const difference = new Float32Array(12).fill(NaN)
    for (let x = 0; x < 4; x += 1) {
      const i = 1 * 4 + x
      existing[i] = 100
      design[i] = 98
      difference[i] = 2
    }
    const profile = buildCutFillProfile(dem, existing, design, difference)
    expect(profile?.axis).toBe('row')
    expect(profile?.samples).toHaveLength(4)
    expect(profile?.samples[0]?.distanceM).toBe(0)
    expect(profile?.samples[3]?.distanceM).toBe(30)
    const chart = buildCutFillProfileChart(profile!)
    expect(chart?.bands.every(band => band.kind === 'cut')).toBe(true)
    expect(chart?.xEndLabel).toBe('30 m')
  })

  it('draws fill where the design is above existing ground', () => {
    const dem = grid()
    const existing = new Float32Array(12).fill(NaN)
    const design = new Float32Array(12).fill(NaN)
    const difference = new Float32Array(12).fill(NaN)
    for (let y = 0; y < 3; y += 1) {
      const i = y * 4 + 2
      existing[i] = 50
      design[i] = 54
      difference[i] = -4
    }
    const profile = buildCutFillProfile(dem, existing, design, difference)
    expect(profile?.axis).toBe('col')
    const chart = buildCutFillProfileChart(profile!)
    expect(chart?.bands.every(band => band.kind === 'fill')).toBe(true)
  })
})
