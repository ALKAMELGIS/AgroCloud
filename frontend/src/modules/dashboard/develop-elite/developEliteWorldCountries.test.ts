import { describe, expect, it } from 'vitest'
import { filterDevelopEliteMapOverlayGeoJson } from './developEliteMapOverlayFilter'
import { buildWorldCountryListItems, filterWorldCountriesForMap } from './developEliteWorldCountries'

describe('filterDevelopEliteMapOverlayGeoJson world-countries', () => {
  const fc: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { Country: 3, ZONE_ID: '', Status: 1 },
        geometry: { type: 'Polygon', coordinates: [] },
      },
    ],
  }

  it('ignores zone filter for world-countries layer', () => {
    const out = filterDevelopEliteMapOverlayGeoJson(
      fc,
      { country: 'all', zoneId: 'MH', selectedFieldKey: null, locationSearch: '' },
      'world-countries',
      new Map([['3', 'Morocco']]),
    )
    expect(out.features).toHaveLength(1)
  })

  it('applies zone filter to zones layer', () => {
    const out = filterDevelopEliteMapOverlayGeoJson(
      fc,
      { country: 'all', zoneId: 'MH', selectedFieldKey: null, locationSearch: '' },
      'zones',
    )
    expect(out.features).toHaveLength(0)
  })
})

describe('buildWorldCountryListItems', () => {
  const domain = new Map([
    ['1', 'UAE'],
    ['3', 'Morocco'],
  ])

  it('lists active countries from World_Countries attributes', () => {
    const list = buildWorldCountryListItems(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { Country: 3, Status: 1 },
            geometry: null,
          },
          {
            type: 'Feature',
            properties: { Country: 0, Status: 1 },
            geometry: null,
          },
        ],
      },
      domain,
    )
    expect(list).toEqual([{ code: '3', label: 'Morocco', count: 1 }])
  })

  it('resolves portfolio code from ALL_COUNTRY when Country is null', () => {
    const list = buildWorldCountryListItems(
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { Country: null, Status: 1, ALL_COUNTRY: 'UAE' },
            geometry: null,
          },
          {
            type: 'Feature',
            properties: { Country: null, Status: 1, ALL_COUNTRY: 'Morocco' },
            geometry: null,
          },
        ],
      },
      domain,
    )
    expect(list).toEqual([
      { code: '3', label: 'Morocco', count: 1 },
      { code: '1', label: 'UAE', count: 1 },
    ])
  })
})

describe('filterWorldCountriesForMap', () => {
  it('drops Status 0 (not available) polygons', () => {
    const out = filterWorldCountriesForMap([
      { type: 'Feature', properties: { Country: 2, Status: 0 }, geometry: null },
      { type: 'Feature', properties: { Country: 3, Status: 1 }, geometry: null },
    ])
    expect(out).toHaveLength(1)
    expect((out[0]!.properties as { Country: number }).Country).toBe(3)
  })
})
