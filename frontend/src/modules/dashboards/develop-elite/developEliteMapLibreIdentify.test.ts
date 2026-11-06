import { describe, expect, it } from 'vitest'
import {
  enrichDevelopEliteMapIdentifyFeature,
  fallbackDevelopEliteMapIdentifyAtLngLat,
  matchDevelopEliteMapSourceFeature,
} from './developEliteMapLibreIdentify'
import type { DevelopEliteMapSearchSources } from './developEliteMapSearch'

describe('developEliteMapLibreIdentify', () => {
  it('matches source features by OBJECTID', () => {
    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { OBJECTID: 42, Farm_Name: 'North Farm' },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    }
    const hit: GeoJSON.Feature = {
      type: 'Feature',
      properties: { OBJECTID: 42 },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    }
    expect(matchDevelopEliteMapSourceFeature(collection, hit)?.properties?.Farm_Name).toBe('North Farm')
  })

  it('enriches sparse rendered hits from loaded geojson', () => {
    const sources: DevelopEliteMapSearchSources = {
      structures: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { OBJECTID: 7, Farm_Code: 'AF204', Structure_Type: 'Greenhouse' },
            geometry: { type: 'Polygon', coordinates: [[[54.1, 24.1], [54.2, 24.1], [54.2, 24.2], [54.1, 24.1]]] },
          },
        ],
      },
      mapLayerVisibility: { 'agro-structures': true } as DevelopEliteMapSearchSources['mapLayerVisibility'],
    }
    const enriched = enrichDevelopEliteMapIdentifyFeature(
      { type: 'Feature', properties: { OBJECTID: 7 }, geometry: sources.structures.features[0]!.geometry },
      'agro-structures',
      sources,
    )
    expect(enriched.properties?.Farm_Code).toBe('AF204')
    expect(enriched.properties?.Structure_Type).toBe('Greenhouse')
  })

  it('falls back to polygon contains for 3D identify misses', () => {
    const sources: DevelopEliteMapSearchSources = {
      structures: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { OBJECTID: 1, Farm_Name: 'Liwa' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[53.99, 24.01], [54.01, 24.01], [54.01, 24.03], [53.99, 24.03], [53.99, 24.01]]],
            },
          },
        ],
      },
      mapLayerVisibility: { 'agro-structures': true } as DevelopEliteMapSearchSources['mapLayerVisibility'],
    }
    const picked = fallbackDevelopEliteMapIdentifyAtLngLat([54.0, 24.02], sources, true)
    expect(picked?.layerKey).toBe('agro-structures')
    expect(picked?.feature.properties?.Farm_Name).toBe('Liwa')
  })
})
