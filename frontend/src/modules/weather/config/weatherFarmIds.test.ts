import { describe, expect, it } from 'vitest'
import {
  readAgriLocationDisplayName,
  structureBelongsToAgriLocation,
  weatherLocationIdFromFeature,
} from './weatherFarmIds'
import { buildWeatherFarmCatalog } from '../services/weatherFarmService'

describe('weatherLocationIdFromFeature', () => {
  it('reads OBJECTID from Agri_Location features', () => {
    const id = weatherLocationIdFromFeature({
      type: 'Feature',
      properties: { OBJECTID: 42, Name: 'Sivac' },
      geometry: { type: 'Point', coordinates: [19.5, 44.8] },
    })
    expect(id).toBe('loc-42')
  })
})

describe('structureBelongsToAgriLocation', () => {
  it('matches structure Farm_Name to location Name', () => {
    const loc = {
      type: 'Feature' as const,
      properties: { Name: 'Zobnatica', OBJECTID: 1 },
      geometry: { type: 'Point' as const, coordinates: [0, 0] },
    }
    const structure = {
      type: 'Feature' as const,
      properties: { Farm_Name: 'Zobnatica' },
      geometry: { type: 'Polygon' as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
    }
    expect(structureBelongsToAgriLocation(structure, loc)).toBe(true)
  })
})

describe('buildWeatherFarmCatalog', () => {
  it('builds sites from Agri_Location layer', () => {
    const catalog = buildWeatherFarmCatalog(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { Farm_Name: 'Sivac' },
            geometry: {
              type: 'Polygon',
              coordinates: [[[19.1, 44.1], [19.2, 44.1], [19.2, 44.2], [19.1, 44.1]]],
            },
          },
        ],
      },
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { OBJECTID: 7, Name: 'Sivac' },
            geometry: { type: 'Point', coordinates: [19.15, 44.15] },
          },
        ],
      },
    )
    expect(catalog.sites.some(s => s.id === 'loc-7' && s.label === 'Sivac')).toBe(true)
    expect(readAgriLocationDisplayName({ Name: 'Test' })).toBe('Test')
  })
})
