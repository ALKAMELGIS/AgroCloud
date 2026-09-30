import { describe, expect, it } from 'vitest'
import type { DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import { worldPxToLngLat } from '@/modules/ai/detection/tree/webMercatorTiles'
import { buildCutFillClassPolygons } from './cutFillClassPolygons'

function dem(w: number, h: number): DemGrid {
  const zoom = 1
  const originWorldPxX = 100
  const originWorldPxY = 80
  return {
    width: w,
    height: h,
    elev: new Float32Array(w * h),
    bbox: { west: 0, east: 1, south: 0, north: 1 },
    zoom,
    originWorldPxX,
    originWorldPxY,
    metersPerPixel: 10,
    cornerCoords: [
      worldPxToLngLat(originWorldPxX, originWorldPxY, zoom),
      worldPxToLngLat(originWorldPxX + w, originWorldPxY, zoom),
      worldPxToLngLat(originWorldPxX + w, originWorldPxY + h, zoom),
      worldPxToLngLat(originWorldPxX, originWorldPxY + h, zoom),
    ],
    tilesLoaded: 1,
    tilesTotal: 1,
    pxToLngLat: (px, py) => worldPxToLngLat(originWorldPxX + px, originWorldPxY + py, zoom),
  }
}

describe('cutFill class polygons', () => {
  it('draws FILL quads only where the analysis grid is finite', () => {
    const grid = dem(6, 4)
    const n = 24
    const classification = new Uint8Array(n)
    const difference = new Float32Array(n).fill(NaN)
    for (let y = 1; y < 3; y += 1) {
      for (let x = 1; x < 5; x += 1) {
        const i = y * 6 + x
        classification[i] = 2
        difference[i] = -70
      }
    }
    const fc = buildCutFillClassPolygons(grid, classification, difference, {
      cut: true,
      fill: true,
      noChange: true,
    })
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0]?.properties?.cls).toBe(2)
    const polys = fc.features[0]?.geometry
    expect(polys?.type).toBe('MultiPolygon')
    if (polys?.type !== 'MultiPolygon') return
    const ring = polys.coordinates[0]?.[0]
    expect(ring?.[0]).toEqual(grid.pxToLngLat(1, 1))
    expect(ring?.[2]).toEqual(grid.pxToLngLat(5, 2))
  })
})
