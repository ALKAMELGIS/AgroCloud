import { describe, expect, it } from 'vitest'
import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import {
  buildDesignGridConstant,
  buildDesignGridFromXyz,
  designConstantOnTerrain,
  parseXyzCsvText,
} from './cutFillDesignSurface'

const dem: DemGrid = {
  width: 4,
  height: 4,
  elev: new Float32Array(16).fill(0),
  bbox: { west: 55, east: 55.01, south: 25, north: 25.01 },
  zoom: 14,
  originWorldPxX: 0,
  originWorldPxY: 0,
  metersPerPixel: 5,
  cornerCoords: [
    [55, 25.01],
    [55.01, 25.01],
    [55.01, 25],
    [55, 25],
  ],
  tilesLoaded: 1,
  tilesTotal: 1,
  pxToLngLat: (x, y) => [55 + x * 0.0025, 25 + y * 0.0025],
}

describe('cutFillDesignSurface', () => {
  it('moves a design plane that misses the terrain onto the mean elevation', () => {
    const existing = new Float32Array([400, 420, 380, 410])
    expect(designConstantOnTerrain(existing, 100)).toBeCloseTo(402.5)
    expect(designConstantOnTerrain(existing, 405)).toBe(405)
  })

  it('fills constant elevation grid', () => {
    const g = buildDesignGridConstant(dem, 42)
    expect(g.every(v => v === 42)).toBe(true)
  })

  it('parses xyz csv and interpolates', () => {
    const pts = parseXyzCsvText('55.005, 25.005, 10\n55.008, 25.008, 20')
    expect(pts.length).toBe(2)
    const grid = buildDesignGridFromXyz(dem, pts, 4)
    const center = grid[2 * dem.width + 2]!
    expect(Number.isFinite(center)).toBe(true)
    expect(center).toBeGreaterThan(5)
    expect(center).toBeLessThan(25)
  })
})
