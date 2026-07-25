import { describe, expect, it } from 'vitest'
import { maskChirpsRasterToPolygon, unwrapPolygonGeometry } from './chirpsRasterMask'
import type { ChirpsRasterResponse } from './chirpsClient'
import { CHIRPS_NODATA } from './chirpsIndices'

describe('chirpsRasterMask', () => {
  it('unwraps FeatureCollection to MultiPolygon', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
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
          },
        },
      ],
    }
    expect(unwrapPolygonGeometry(fc)?.type).toBe('Polygon')
  })

  it('clears cells outside the AOI polygon', () => {
    // 2x2 grid covering [0,0]–[2,2]; AOI is only the SW cell corner area [0,0]–[1,1]
    const raster: ChirpsRasterResponse = {
      source: 'test',
      product: 'daily',
      date: '2024-01-01',
      aggregation: 'daily',
      unit: 'mm',
      nodata: CHIRPS_NODATA,
      width: 2,
      height: 2,
      west: 0,
      south: 0,
      east: 2,
      north: 2,
      stats: { min: 1, max: 4, mean: 2.5, validCount: 4 },
      values: [1, 2, 3, 4],
      previewDataUrl: 'data:image/png;base64,xx',
      coordinates: [
        [0, 2],
        [2, 2],
        [2, 0],
        [0, 0],
      ],
    }
    const aoi: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1.05, 0],
          [1.05, 1.05],
          [0, 1.05],
          [0, 0],
        ],
      ],
    }
    // Cell centers: (0.5,1.5)=NW, (1.5,1.5)=NE, (0.5,0.5)=SW, (1.5,0.5)=SE
    // Only SW (index 2) is inside AOI for this orientation (row0=north).
    const masked = maskChirpsRasterToPolygon(raster, aoi)
    expect(masked.values[2]).toBe(3)
    expect(masked.values[0]).toBe(CHIRPS_NODATA)
    expect(masked.values[1]).toBe(CHIRPS_NODATA)
    expect(masked.values[3]).toBe(CHIRPS_NODATA)
    expect(masked.stats.validCount).toBe(1)
    expect(masked.previewDataUrl.startsWith('data:image/png')).toBe(true)
  })
})
