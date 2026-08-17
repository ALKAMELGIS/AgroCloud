import { describe, expect, it } from 'vitest'
import {
  aoiFeatureCollectionBbox,
  aoiSourceLabel,
  clipFeatureCollectionToAoi,
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

  it('labels AOI sources', () => {
    expect(aoiSourceLabel('draw')).toContain('Edit')
    expect(aoiSourceLabel(null)).toContain('map extent')
  })
})
