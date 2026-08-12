import { describe, expect, it } from 'vitest'
import {
  boxToPixelRing,
  convexHull,
  maskToPixelRing,
  ringAreaPx,
  ringBBoxIoU,
} from './crownPolygonize'
import { isSentinelVegetationMode } from './vegetationZones'

describe('crownPolygonize', () => {
  it('boxToPixelRing closes rectangle', () => {
    const ring = boxToPixelRing({ xmin: 0, ymin: 0, xmax: 10, ymax: 8, score: 0.9, label: 'Tree' })
    expect(ring).toHaveLength(5)
    expect(ring[0]).toEqual(ring[4])
    expect(ringAreaPx(ring)).toBeCloseTo(80, 5)
  })

  it('maskToPixelRing returns hull for filled blob', () => {
    const w = 20
    const h = 20
    const mask = new Uint8Array(w * h)
    for (let y = 5; y < 15; y += 1) {
      for (let x = 5; x < 15; x += 1) mask[y * w + x] = 1
    }
    const ring = maskToPixelRing(mask, w, h, 1)
    expect(ring).not.toBeNull()
    expect(ring!.length).toBeGreaterThanOrEqual(4)
  })

  it('convexHull makes triangle', () => {
    const hull = convexHull([
      [0, 0],
      [2, 0],
      [1, 2],
      [1, 1],
    ])
    expect(hull.length).toBeGreaterThanOrEqual(3)
  })

  it('ringBBoxIoU is 1 for identical rings', () => {
    const a = boxToPixelRing({ xmin: 0, ymin: 0, xmax: 10, ymax: 10, score: 1, label: 'T' })
    expect(ringBBoxIoU(a, a)).toBeCloseTo(1, 5)
  })
})

describe('vegetationZones guard', () => {
  it('isSentinelVegetationMode only for sentinel2', () => {
    expect(isSentinelVegetationMode('sentinel2')).toBe(true)
    expect(isSentinelVegetationMode('esri')).toBe(false)
    expect(isSentinelVegetationMode(null)).toBe(false)
  })
})
