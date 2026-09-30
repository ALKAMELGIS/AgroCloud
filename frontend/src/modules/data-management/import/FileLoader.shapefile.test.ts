import { describe, expect, it } from 'vitest'
import { mergeShpLikeToFeatureCollection } from './FileLoader'

describe('mergeShpLikeToFeatureCollection', () => {
  it('merges an array of feature collections from multi-layer shapefile output', () => {
    const out = mergeShpLikeToFeatureCollection([
      {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: { a: 1 }, geometry: { type: 'Point', coordinates: [1, 2] } }],
      },
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { b: 2 },
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          },
        ],
      },
    ])
    expect(out.features).toHaveLength(2)
  })

  it('merges object-map layer dictionaries from shpjs', () => {
    const out = mergeShpLikeToFeatureCollection({
      parcels: {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [46, 24] } }],
      },
    })
    expect(out.features).toHaveLength(1)
  })
})
