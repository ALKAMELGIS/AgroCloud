import { describe, expect, it } from 'vitest'
import type { GeoAiMapLayer } from './geoExplorerLayerContext'
import {
  isLayerAttributeQuestion,
  rewriteAttributeStatsQuery,
  runGeoAiLayerAttributeQuery,
} from './geoAiLayerAttributeQuery'

const DISTRICTS: GeoAiMapLayer = {
  name: 'Districts',
  clientLayerId: 'lyr-1',
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { NAME: 'Central', population: 120000, area_ha: 45.2 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [55.2, 25.2],
              [55.3, 25.2],
              [55.3, 25.3],
              [55.2, 25.3],
              [55.2, 25.2],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { NAME: 'East', population: 80000, area_ha: 30 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [55.4, 25.2],
              [55.5, 25.2],
              [55.5, 25.3],
              [55.4, 25.3],
              [55.4, 25.2],
            ],
          ],
        },
      },
    ],
  },
}

describe('geoAiLayerAttributeQuery', () => {
  it('detects layer attribute questions', () => {
    expect(isLayerAttributeQuestion('How many population on it', [DISTRICTS])).toBe(true)
    expect(isLayerAttributeQuestion('what is the population of Central', [DISTRICTS])).toBe(true)
    expect(isLayerAttributeQuestion('weather here', [DISTRICTS])).toBe(false)
  })

  it('rewrites how-many population into sum-friendly text', () => {
    expect(rewriteAttributeStatsQuery('How many population on it')).toMatch(/sum/i)
  })

  it('sums population across the layer and returns a handled reply', () => {
    const hit = runGeoAiLayerAttributeQuery('How many population on it', [DISTRICTS])
    expect(hit?.handled).toBe(true)
    expect(hit?.reply).toMatch(/200000|120000|SUM/i)
  })

  it('returns a short professional reply when no layer matches a population ask', () => {
    const hit = runGeoAiLayerAttributeQuery('Number of Popualtions in Dubai', [])
    expect(hit?.handled).toBe(true)
    expect(hit?.reply).toMatch(/No matching figures/i)
    expect(hit?.reply).toMatch(/Dubai/i)
    expect(hit?.reply).toMatch(/References/i)
    expect(hit?.reply).not.toMatch(/Could not find/i)
  })
})
