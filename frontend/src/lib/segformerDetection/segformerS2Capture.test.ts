import { describe, expect, it } from 'vitest'
import {
  bbox4326To3857,
  buildSegFormerTemporalCandidateDates,
  clipBboxToRasterExtent,
  resolveSegFormerCapturePixelSize,
  resolveSegFormerTrueColorLayerName,
} from './segformerS2Capture'

describe('segformerS2Capture', () => {
  it('resolves TRUE_COLOR / 1_TRUE_COLOR from catalog', () => {
    expect(
      resolveSegFormerTrueColorLayerName([
        { name: '3_NDVI', title: 'NDVI' },
        { name: '1_TRUE_COLOR', title: 'True Color' },
      ]),
    ).toBe('1_TRUE_COLOR')

    expect(
      resolveSegFormerTrueColorLayerName([
        { name: 'TRUE_COLOR', title: 'True Color' },
        { name: 'NDVI', title: 'NDVI' },
      ]),
    ).toBe('TRUE_COLOR')
  })

  it('builds aspect-correct capture size within max edge', () => {
    const square = resolveSegFormerCapturePixelSize([10, 20, 10.1, 20.1], 1024)
    expect(square.width).toBeGreaterThanOrEqual(64)
    expect(square.height).toBeGreaterThanOrEqual(64)
    expect(Math.max(square.width, square.height)).toBeLessThanOrEqual(1024)

    const wide = resolveSegFormerCapturePixelSize([10, 20, 10.4, 20.05], 1536)
    expect(wide.width).toBeGreaterThan(wide.height)
    expect(Math.max(wide.width, wide.height)).toBeLessThanOrEqual(1536)

    const field = resolveSegFormerCapturePixelSize([10, 20, 10.2, 20.2], 2048)
    expect(Math.max(field.width, field.height)).toBeLessThanOrEqual(2048)
  })

  it('builds temporal candidate dates around the primary scene', () => {
    const dates = buildSegFormerTemporalCandidateDates('2024-06-15', 3)
    expect(dates[0]).toBe('2024-06-15')
    expect(dates).toHaveLength(3)
    expect(dates.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true)
  })

  it('converts WGS84 bbox to Web Mercator', () => {
    const [minX, minY, maxX, maxY] = bbox4326To3857([10, 20, 11, 21])
    expect(maxX).toBeGreaterThan(minX)
    expect(maxY).toBeGreaterThan(minY)
  })

  it('clips AOI bbox to raster extent for uploaded capture', () => {
    expect(
      clipBboxToRasterExtent([10, 20, 12, 22], { west: 10.5, south: 20.5, east: 11.5, north: 21.5 }),
    ).toEqual([10.5, 20.5, 11.5, 21.5])

    expect(clipBboxToRasterExtent([10, 20, 11, 21], null)).toEqual([10, 20, 11, 21])

    expect(
      clipBboxToRasterExtent([0, 0, 1, 1], { west: 10, south: 10, east: 11, north: 11 }),
    ).toBeNull()
  })
})
