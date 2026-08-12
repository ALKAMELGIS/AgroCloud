import { describe, expect, it } from 'vitest'
import * as turf from '@turf/turf'
import {
  exteriorRingOnly,
  mergeFieldDetections,
  refineFieldPolygonsToAoi,
  resolveFieldPolygonOverlaps,
  sanitizeFieldDisplayGeometry,
} from './fieldResultRefine'

function square(
  west: number,
  south: number,
  size: number,
  props: Record<string, unknown> = {},
): GeoJSON.Feature {
  const east = west + size
  const north = south + size
  return {
    type: 'Feature',
    properties: props,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  }
}

describe('fieldResultRefine', () => {
  it('clips polygons to AOI', () => {
    const aoi: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [square(0, 0, 0.01)],
    }
    const fields: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [square(-0.005, 0, 0.02, { confidence: 0.9 })],
    }
    const out = refineFieldPolygonsToAoi(fields, aoi, { minAreaM2: 1 })
    expect(out.features.length).toBe(1)
  })

  it('drops overlapping lower-confidence polygon (no stack)', () => {
    const a = square(0, 0, 0.01, { confidence: 0.9 })
    const b = square(0.001, 0.001, 0.01, { confidence: 0.4 })
    const out = resolveFieldPolygonOverlaps(
      { type: 'FeatureCollection', features: [a, b] },
      { minAreaM2: 1, dropIou: 0.15 },
    )
    expect(out.features.length).toBe(1)
    expect(out.features[0].properties?.confidence).toBe(0.9)
  })

  it('merges complementary detections without stacking', () => {
    const left = square(0, 0, 0.01, { confidence: 0.8 })
    const right = square(0.012, 0, 0.01, { confidence: 0.75 })
    const out = mergeFieldDetections(
      { type: 'FeatureCollection', features: [left] },
      { type: 'FeatureCollection', features: [right] },
      { minAreaM2: 1 },
    )
    expect(out.features.length).toBe(2)
  })

  it('strips interior rings that cause black strokes through fills', () => {
    const withHole: GeoJSON.Feature = {
      type: 'Feature',
      properties: { confidence: 0.9 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.02, 0],
            [0.02, 0.02],
            [0, 0.02],
            [0, 0],
          ],
          [
            [0.005, 0.005],
            [0.01, 0.005],
            [0.01, 0.01],
            [0.005, 0.01],
            [0.005, 0.005],
          ],
        ],
      },
    }
    const only = exteriorRingOnly(withHole)
    expect(only?.geometry.type).toBe('Polygon')
    expect((only?.geometry as GeoJSON.Polygon).coordinates.length).toBe(1)

    const cleaned = sanitizeFieldDisplayGeometry(
      { type: 'FeatureCollection', features: [withHole] },
      { minAreaM2: 1 },
    )
    expect(cleaned.features.length).toBe(1)
    expect((cleaned.features[0].geometry as GeoJSON.Polygon).coordinates.length).toBe(1)
  })

  it('carves small overlaps instead of leaving parcels stacked', () => {
    // 12% overlap — below dropIou, so both survive and must be made disjoint.
    const a = square(0, 0, 0.01, { confidence: 0.9 })
    const b = square(0.0088, 0, 0.01, { confidence: 0.5 })
    const out = resolveFieldPolygonOverlaps(
      { type: 'FeatureCollection', features: [a, b] },
      { minAreaM2: 1, dropIou: 0.3 },
    )
    expect(out.features.length).toBe(2)
    const inter = turf.intersect(
      turf.featureCollection([out.features[0] as any, out.features[1] as any]),
    )
    expect(inter?.geometry ? Math.round(turf.area(inter as any)) : 0).toBe(0)
    expect(out.features.some(f => f.properties?.overlap_carved === true)).toBe(true)
  })

  it('never carves a pivot circle — the neighbouring parcel yields', () => {
    const pivot = turf.circle(turf.point([55, 24]), 300, { steps: 96, units: 'meters' })
    const pivotField: GeoJSON.Feature = {
      ...(pivot as GeoJSON.Feature),
      properties: { confidence: 0.4, footprint_method: 'pivot-circle', field_shape: 'pivot' },
    }
    const mLon = 111_320 * Math.cos((24 * Math.PI) / 180)
    const neighbour = square(55 + 260 / mLon, 24 - 150 / 111_320, 400 / mLon, {
      confidence: 0.95,
    })
    const out = resolveFieldPolygonOverlaps(
      { type: 'FeatureCollection', features: [neighbour, pivotField] },
      { minAreaM2: 1, dropIou: 0.5 },
    )
    expect(out.features.length).toBe(2)
    const circle = out.features.find(f => f.properties?.footprint_method === 'pivot-circle')!
    // Full circle kept despite the higher-confidence neighbour.
    expect(Math.round(turf.area(circle as any))).toBe(Math.round(turf.area(pivot as any)))
    const other = out.features.find(f => f !== circle)!
    const inter = turf.intersect(turf.featureCollection([circle as any, other as any]))
    expect(inter?.geometry ? Math.round(turf.area(inter as any)) : 0).toBe(0)
  })

  it('drops LineString artifacts', () => {
    const line: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [0, 0],
          [0.01, 0.01],
        ],
      },
    }
    const cleaned = sanitizeFieldDisplayGeometry(
      { type: 'FeatureCollection', features: [line, square(0, 0, 0.01, { confidence: 0.8 })] },
      { minAreaM2: 1 },
    )
    expect(cleaned.features.every(f => f.geometry?.type === 'Polygon')).toBe(true)
  })
})
