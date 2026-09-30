import { describe, expect, it } from 'vitest'
import {
  orientedBoundingRect,
  regularizeAoiFeatureCollection,
  regularizeFieldFootprints,
  regularizePolygonFootprint,
} from './fieldFootprintRegularize'

const tiltedRect: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: 'Feature',
  properties: { field_id: 'T1' },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [55.0, 24.0],
        [55.002, 24.001],
        [55.001, 24.003],
        [54.999, 24.002],
        [55.0, 24.0],
      ],
    ],
  },
}

describe('fieldFootprintRegularize', () => {
  it('builds an oriented bounding rect for a tilted polygon', () => {
    const obb = orientedBoundingRect(tiltedRect)
    expect(obb?.geometry?.type).toBe('Polygon')
    expect(obb!.geometry.coordinates[0].length).toBeGreaterThanOrEqual(5)
  })

  it('marks regularized field footprints', () => {
    const out = regularizePolygonFootprint(tiltedRect)
    expect(out.properties?.footprint_regularized).toBe(true)
    expect(out.geometry?.type).toBe('Polygon')
  })

  it('regularizes AOI into a FeatureCollection with aoi_regularized', () => {
    const fc = regularizeAoiFeatureCollection(tiltedRect.geometry)
    expect(fc.features).toHaveLength(1)
    expect(fc.features[0].properties?.aoi_regularized).toBe(true)
  })

  it('regularizes a field FeatureCollection', () => {
    const fc = regularizeFieldFootprints({
      type: 'FeatureCollection',
      features: [tiltedRect],
    })
    expect(fc.features[0].properties?.footprint_regularized).toBe(true)
    expect(Number(fc.features[0].properties?.area_m2)).toBeGreaterThan(0)
  })
})
