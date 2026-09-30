import { describe, expect, it } from 'vitest'
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
