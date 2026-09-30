import { describe, expect, it } from 'vitest'
import { stripKmlPointFeatures } from './FileLoader'

describe('stripKmlPointFeatures', () => {
  it('removes Point and MultiPoint placemarks but keeps polygons and lines', () => {
    const out = stripKmlPointFeatures({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'icon' },
          geometry: { type: 'Point', coordinates: [46, 24] },
        },
        {
          type: 'Feature',
          properties: { name: 'aoi' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [46, 24],
                [46.1, 24],
                [46.1, 24.1],
                [46, 24],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'MultiPoint',
            coordinates: [
              [46, 24],
              [46.2, 24.2],
            ],
          },
        },
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [46, 24],
              [46.1, 24.1],
            ],
          },
        },
      ],
    })
    expect(out.features).toHaveLength(2)
    expect(out.features.map((f: any) => f.geometry.type)).toEqual(['Polygon', 'LineString'])
  })

  it('keeps Point placemarks when the file is point-only', () => {
    const out = stripKmlPointFeatures({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'well-1' },
          geometry: { type: 'Point', coordinates: [46.12, 24.08] },
        },
        {
          type: 'Feature',
          properties: { name: 'well-2' },
          geometry: { type: 'Point', coordinates: [46.22, 24.18] },
        },
      ],
    })
    expect(out.features).toHaveLength(2)
    expect(out.features.every((f: any) => f.geometry.type === 'Point')).toBe(true)
  })
})
