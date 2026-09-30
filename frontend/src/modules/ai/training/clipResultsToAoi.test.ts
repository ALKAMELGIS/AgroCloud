import { describe, expect, it } from 'vitest'
import {
  aoiFeatureCollectionBbox,
  aoiFeatureCollectionSignature,
  aoiSourceLabel,
  clipFeatureCollectionToAoi,
  geometryToAoiFeatureCollection,
} from './clipResultsToAoi'

const aoi: GeoJSON.FeatureCollection = {
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
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      },
    },
  ],
}

describe('clipResultsToAoi', () => {
  it('clips polygons to AOI', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 1 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [1, 1],
                [3, 1],
                [3, 3],
                [1, 3],
                [1, 1],
              ],
            ],
          },
        },
      ],
    }
    const out = clipFeatureCollectionToAoi(fc, aoi)
    expect(out.features.length).toBe(1)
    const b = aoiFeatureCollectionBbox({
      type: 'FeatureCollection',
      features: out.features,
    })!
    expect(b[2]).toBeLessThanOrEqual(2.001)
    expect(b[3]).toBeLessThanOrEqual(2.001)
  })

  it('drops points outside AOI', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [1, 1] },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [9, 9] },
        },
      ],
    }
    const out = clipFeatureCollectionToAoi(fc, aoi)
    expect(out.features).toHaveLength(1)
  })

  it('does not keep full polygon when only partially overlapping AOI', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'straddle' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [1.5, 0.5],
                [3.5, 0.5],
                [3.5, 2.5],
                [1.5, 2.5],
                [1.5, 0.5],
              ],
            ],
          },
        },
      ],
    }
    const out = clipFeatureCollectionToAoi(fc, aoi)
    expect(out.features.length).toBe(1)
    const clippedBbox = aoiFeatureCollectionBbox(out)!
    expect(clippedBbox[0]).toBeGreaterThanOrEqual(-0.001)
    expect(clippedBbox[1]).toBeGreaterThanOrEqual(-0.001)
    expect(clippedBbox[2]).toBeLessThanOrEqual(2.001)
    expect(clippedBbox[3]).toBeLessThanOrEqual(2.001)
    expect(clippedBbox[2]).toBeLessThan(3)
  })

  it('normalizes geometry to feature collection and signature', () => {
    const fc = geometryToAoiFeatureCollection(aoi.features[0]!.geometry)
    expect(fc.features).toHaveLength(1)
    expect(aoiFeatureCollectionSignature(fc)).toContain('0.000000')
  })

  it('labels AOI sources', () => {
    expect(aoiSourceLabel('draw')).toContain('Edit')
    expect(aoiSourceLabel(null)).toContain('map extent')
  })
})
