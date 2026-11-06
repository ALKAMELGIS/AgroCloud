import { describe, expect, it } from 'vitest'
import { resolveDevelopEliteMapWorldCountriesGeoJson } from './developEliteMapWorldCountriesGeoJson'

describe('resolveDevelopEliteMapWorldCountriesGeoJson', () => {
  it('falls back to geometry when status filter would drop rows', () => {
    const fc = resolveDevelopEliteMapWorldCountriesGeoJson({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { ALL_COUNTRY: 'UAE', Status: 1 },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
      ],
    })
    expect(fc?.features).toHaveLength(1)
  })
})
