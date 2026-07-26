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
  it('detects explicit layer attribute questions only', () => {
    expect(isLayerAttributeQuestion('How many population on it', [DISTRICTS])).toBe(true)
    expect(isLayerAttributeQuestion('what is the population of Central on this layer', [DISTRICTS])).toBe(
      true,
    )
    expect(isLayerAttributeQuestion('population in dubai 2020', [DISTRICTS])).toBe(false)
    expect(isLayerAttributeQuestion('what is the population of Central', [DISTRICTS])).toBe(false)
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

  it('leaves world-knowledge population asks for AI / web (no layer hijack)', () => {
    expect(runGeoAiLayerAttributeQuery('population in dubai 2020', [DISTRICTS])).toBeNull()
    expect(runGeoAiLayerAttributeQuery('Number of Popualtions in Dubai', [])).toBeNull()
    expect(runGeoAiLayerAttributeQuery('Number of Popualtions in Dubai', [DISTRICTS])).toBeNull()
  })

  it('does not hijack AOI / NDVI class compare follow-ups onto vector layers', () => {
    const q =
      'Compare the main categories from your last breakdown in a short table and highlight the dominant share.'
    expect(isLayerAttributeQuestion(q, [DISTRICTS])).toBe(false)
    expect(runGeoAiLayerAttributeQuery(q, [DISTRICTS])).toBeNull()
  })

  it('does not hijack Deeper AOI analysis onto Layers panel vectors', () => {
    const q =
      'Analyze this AOI in more depth using the drawn AOI remote-sensing classes (NDVI / active index), AOI metrics, and weather — not loaded GIS layers from the Layers panel.'
    expect(isLayerAttributeQuestion(q, [DISTRICTS])).toBe(false)
    expect(runGeoAiLayerAttributeQuery(q, [DISTRICTS])).toBeNull()
  })
})
