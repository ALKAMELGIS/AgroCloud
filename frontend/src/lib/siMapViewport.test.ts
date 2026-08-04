import { describe, expect, it } from 'vitest'
import {
  expandLngLatBBox,
  buildLngLatBBoxRefreshKey,
  easeMapCameraToLngLatBBoxWithMinZoom,
  filterFeatureCollectionByLngLatBBox,
  filterOuterRingsByLngLatBBox,
  intersectLngLatBboxes,
  lngLatBBoxCacheKey,
  lngLatBBoxContains,
  pointInLngLatBBox,
  viewportAoiMaskCacheKey,
} from './siMapViewport'

describe('siMapViewport', () => {
  it('expands bbox by prefetch ratio', () => {
    const bbox: [number, number, number, number] = [0, 0, 1, 1]
    const expanded = expandLngLatBBox(bbox, 0.1)
    expect(expanded[0]).toBeLessThan(0)
    expect(expanded[2]).toBeGreaterThan(1)
    expect(expanded[1]).toBeLessThan(0)
    expect(expanded[3]).toBeGreaterThan(1)
  })

  it('filters features by bbox intersection', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 1 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [0.5, 0],
                [0.5, 0.5],
                [0, 0.5],
                [0, 0],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { id: 2 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [5, 5],
                [6, 5],
                [6, 6],
                [5, 6],
                [5, 5],
              ],
            ],
          },
        },
      ],
    }
    const filtered = filterFeatureCollectionByLngLatBBox(fc, [0, 0, 1, 1])
    expect(filtered.features).toHaveLength(1)
    expect((filtered.features[0] as { properties?: { id?: number } }).properties?.id).toBe(1)
  })

  it('filters outer rings by bbox', () => {
    const rings: [number, number][][] = [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
      [
        [10, 10],
        [11, 10],
        [11, 11],
        [10, 11],
        [10, 10],
      ],
    ]
    expect(filterOuterRingsByLngLatBBox(rings, [0, 0, 2, 2])).toHaveLength(1)
  })

  it('pointInLngLatBBox detects inside points', () => {
    expect(pointInLngLatBBox(0.5, 0.5, [0, 0, 1, 1])).toBe(true)
    expect(pointInLngLatBBox(2, 2, [0, 0, 1, 1])).toBe(false)
  })

  it('lngLatBBoxCacheKey is stable for quantized tiles', () => {
    const a = lngLatBBoxCacheKey([0.01, 0.02, 0.05, 0.06])
    const b = lngLatBBoxCacheKey([0.02, 0.03, 0.04, 0.05])
    expect(a).toBe(b)
  })

  it('lngLatBBoxContains detects full containment', () => {
    expect(lngLatBBoxContains([0, 0, 10, 10], [2, 2, 4, 4])).toBe(true)
    expect(lngLatBBoxContains([0, 0, 3, 3], [2, 2, 4, 4])).toBe(false)
  })

  it('viewportAoiMaskCacheKey quantizes viewport tiles for WMS refresh', () => {
    expect(viewportAoiMaskCacheKey([0.01, 0.02, 0.05, 0.06], 12)).toContain(':n12')
    expect(viewportAoiMaskCacheKey(null, 0)).toBeNull()
  })

  it('intersectLngLatBboxes returns overlap or null', () => {
    const a: [number, number, number, number] = [0, 0, 2, 2]
    const b: [number, number, number, number] = [1, 1, 3, 3]
    expect(intersectLngLatBboxes(a, b)).toEqual([1, 1, 2, 2])
    expect(intersectLngLatBboxes(a, [5, 5, 6, 6])).toBeNull()
  })

  it('buildLngLatBBoxRefreshKey ties refresh to zoom and extent', () => {
    const bbox: [number, number, number, number] = [10, 20, 11, 21]
    expect(buildLngLatBBoxRefreshKey(bbox, 12.5, 'NDVI')).toContain('12.50')
    expect(buildLngLatBBoxRefreshKey(bbox, 12.5, 'NDVI')).toContain('10.0000')
    expect(buildLngLatBBoxRefreshKey(null, 8, 'x')).toBe('8.00:x')
  })

  it('easeMapCameraToLngLatBBoxWithMinZoom floors zoom when fit stays too low', () => {
    let easedZoom: number | null = null
    const map = {
      cameraForBounds: () => ({ center: [47, 25] as [number, number], zoom: 8.2, bearing: 0, pitch: 0 }),
      easeTo: (opts: { zoom?: number }) => {
        easedZoom = opts.zoom ?? null
      },
    }
    easeMapCameraToLngLatBBoxWithMinZoom(map, [46, 24, 48, 26], 12)
    expect(easedZoom).toBeCloseTo(12.75, 5)
  })
})
