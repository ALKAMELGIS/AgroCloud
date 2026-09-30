import { describe, expect, it } from 'vitest'
import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import { CUT_FILL_CLASS_CUT } from './cutFillEngine'
import { buildCutFillAoiRaster } from './cutFillAoiRaster'

function grid(): DemGrid {
  const width = 4
  const height = 4
  return {
    width,
    height,
    elev: new Float32Array(width * height),
    bbox: { west: 0, south: -4, east: 4, north: 0 },
    zoom: 10,
    originWorldPxX: 0,
    originWorldPxY: 0,
    metersPerPixel: 1,
    cornerCoords: [
      [0, 0],
      [4, 0],
      [4, -4],
      [0, -4],
    ],
    tilesLoaded: 1,
    tilesTotal: 1,
    pxToLngLat: (cx, cy) => [cx, -cy],
  }
}

describe('buildCutFillAoiRaster', () => {
  it('keeps the smooth cut color inside the AOI and transparent outside it', () => {
    const dem = grid()
    const difference = new Float32Array(dem.width * dem.height).fill(4)
    const classification = new Uint8Array(dem.width * dem.height).fill(CUT_FILL_CLASS_CUT)
    const aoi: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [1, -1],
          [3, -1],
          [3, -3],
          [1, -3],
          [1, -1],
        ],
      ],
    }
    const raster = buildCutFillAoiRaster(dem, difference, aoi, classification, {
      cut: true,
      fill: true,
      noChange: true,
    }, 8)
    expect(raster).not.toBeNull()
    const { width, rgba } = raster!
    const alphaAt = (x: number, y: number) => rgba[(y * width + x) * 4 + 3]
    const redAt = (x: number, y: number) => rgba[(y * width + x) * 4]
    const greenAt = (x: number, y: number) => rgba[(y * width + x) * 4 + 1]
    expect(alphaAt(0, 0)).toBe(0)
    expect(alphaAt(7, 7)).toBe(0)
    expect(alphaAt(4, 4)).toBeGreaterThan(160)
    expect(redAt(4, 4)).toBeGreaterThan(greenAt(4, 4))
  })
})
