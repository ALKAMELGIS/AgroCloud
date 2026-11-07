import { describe, expect, it } from 'vitest'
import { resolveDevelopEliteMapFeatureLabel, searchDevelopEliteMapLocal } from './developEliteMapSearch'
import { DEFAULT_DEVELOP_ELITE_MAP_LAYER_VISIBILITY } from './developEliteMapDataLayers'

describe('developEliteMapSearch', () => {
  it('resolves feature label from Name', () => {
    const { label } = resolveDevelopEliteMapFeatureLabel({ Name: 'Palm Block A' })
    expect(label).toBe('Palm Block A')
  })

  it('finds tree and layer hits', () => {
    const hits = searchDevelopEliteMapLocal(
      'mango',
      {
        structures: { type: 'FeatureCollection', features: [] },
        trees: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [55.1, 25.2] },
              properties: { Name: 'Mango Grove 7' },
            },
          ],
        },
        mapLayerVisibility: DEFAULT_DEVELOP_ELITE_MAP_LAYER_VISIBILITY,
      },
    )
    expect(hits.some(h => h.kind === 'map-feature' && h.label.includes('Mango'))).toBe(true)
    expect(hits.some(h => h.kind === 'layer' && h.label === 'Tree')).toBe(false)
  })

  it('matches layer panel titles', () => {
    const hits = searchDevelopEliteMapLocal('agrolocation', {
      structures: { type: 'FeatureCollection', features: [] },
      mapLayerVisibility: DEFAULT_DEVELOP_ELITE_MAP_LAYER_VISIBILITY,
    })
    expect(hits.some(h => h.kind === 'layer' && h.label === 'AgroLocation')).toBe(true)
  })
})
