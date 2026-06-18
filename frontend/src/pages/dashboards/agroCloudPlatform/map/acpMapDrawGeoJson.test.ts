import { describe, expect, it } from 'vitest'
import { resolveAcpMapDrawGeoJson } from './acpMapDrawGeoJson'

describe('resolveAcpMapDrawGeoJson', () => {
  const mask: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { OBJECTID: 1, Country: 'UAE', Structure_Type: 1006 },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      },
    ],
  }

  const outline: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { OBJECTID: 2, Country: 'UAE', Structure_Type: 1000 },
        geometry: { type: 'Polygon', coordinates: [[[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]]] },
      },
    ],
  }

  it('merges mask and outline features', () => {
    const merged = resolveAcpMapDrawGeoJson(mask, outline, 'all')
    expect(merged?.features).toHaveLength(2)
  })

  it('falls back to mask when outline missing', () => {
    const merged = resolveAcpMapDrawGeoJson(mask, null, 'all')
    expect(merged?.features).toHaveLength(1)
  })

  it('filters by country', () => {
    const merged = resolveAcpMapDrawGeoJson(mask, outline, 'Morocco')
    expect(merged).toBeNull()
  })
})
