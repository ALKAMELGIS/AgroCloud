import { describe, expect, it } from 'vitest'
import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import { computeCutFillGrid } from './cutFillEngine'
import { buildDesignGridConstant } from './cutFillDesignSurface'

function mockDem(w: number, h: number, mpp = 10): DemGrid {
  const elev = new Float32Array(w * h)
  for (let i = 0; i < elev.length; i += 1) elev[i] = 100
  return {
    width: w,
    height: h,
    elev,
    bbox: { west: 0, east: 0.01, south: 0, north: 0.01 },
    zoom: 14,
    originWorldPxX: 0,
    originWorldPxY: 0,
    metersPerPixel: mpp,
    cornerCoords: [
      [0, 0.01],
      [0.01, 0.01],
      [0.01, 0],
      [0, 0],
    ],
    tilesLoaded: 1,
    tilesTotal: 1,
    pxToLngLat: (x, y) => [x * 0.001, y * 0.001],
  }
}

describe('computeCutFillGrid', () => {
  it('computes cut volume for raised design platform', () => {
    const dem = mockDem(10, 10, 10)
    const existing = new Float32Array(dem.width * dem.height).fill(100)
    const design = buildDesignGridConstant(dem, 105)
    const mask = new Uint8Array(dem.width * dem.height).fill(1)
    const out = computeCutFillGrid({
      dem,
      existingElev: existing,
      designElev: design,
      aoiMask: mask,
      verticalToleranceM: 0.1,
      maxTableRows: 10_000,
    })
    expect(out.summary.fillVolumeM3).toBeGreaterThan(0)
    expect(out.summary.cutVolumeM3).toBe(0)
    const cellArea = 100
    expect(out.summary.fillVolumeM3).toBeCloseTo(5 * cellArea * 100, -1)
  })

  it('respects vertical tolerance band', () => {
    const dem = mockDem(5, 5, 10)
    const existing = new Float32Array(25).fill(100)
    const design = new Float32Array(25).fill(99.85)
    const mask = new Uint8Array(25).fill(1)
    const strict = computeCutFillGrid({
      dem,
      existingElev: existing,
      designElev: design,
      aoiMask: mask,
      verticalToleranceM: 0.05,
    })
    const loose = computeCutFillGrid({
      dem,
      existingElev: existing,
      designElev: design,
      aoiMask: mask,
      verticalToleranceM: 0.2,
    })
    expect(strict.summary.cutVolumeM3).toBeGreaterThan(loose.summary.cutVolumeM3)
  })
})
