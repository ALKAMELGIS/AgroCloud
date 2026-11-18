import { describe, expect, it } from 'vitest'
import {
  buildWorldCountryListItems,
  filterWorldCountriesForMap,
  findWorldCountryFeatureForFilter,
} from '@/modules/gis/portfolio/developEliteWorldCountries'

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
            // GeoJSON allows null geometry; the code under test must handle it.
        geometry: null as unknown as GeoJSON.Geometry,
          },
          {
            type: 'Feature',
            properties: { Country: 0, Status: 1 },
            // GeoJSON allows null geometry; the code under test must handle it.
        geometry: null as unknown as GeoJSON.Geometry,
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
            // GeoJSON allows null geometry; the code under test must handle it.
        geometry: null as unknown as GeoJSON.Geometry,
          },
          {
            type: 'Feature',
            properties: { Country: null, Status: 1, ALL_COUNTRY: 'Morocco' },
            // GeoJSON allows null geometry; the code under test must handle it.
        geometry: null as unknown as GeoJSON.Geometry,
          },
        ],
      },
      domain,
    )
    expect(list).toEqual([
      { code: '1', label: 'UAE', count: 1 },
      { code: '3', label: 'Morocco', count: 1 },
    ])
  })
})

describe('findWorldCountryFeatureForFilter', () => {
  const domain = new Map([
    ['1', 'UAE'],
    ['3', 'Morocco'],
  ])

  it('finds polygon by coded country and by ALL_COUNTRY portfolio label', () => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { Country: 3, Status: 1 },
          geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        },
        {
          type: 'Feature',
          properties: { Country: null, ALL_COUNTRY: 'UAE', Status: 1 },
          geometry: { type: 'Polygon', coordinates: [[[2, 0], [3, 0], [3, 1], [2, 0]]] },
        },
      ],
    }
    expect(findWorldCountryFeatureForFilter(fc, '3', domain)?.properties).toMatchObject({ Country: 3 })
    expect(findWorldCountryFeatureForFilter(fc, '1', domain)?.properties).toMatchObject({
      ALL_COUNTRY: 'UAE',
    })
  })
})

describe('filterWorldCountriesForMap', () => {
  it('drops Status 0 (not available) polygons', () => {
    const out = filterWorldCountriesForMap([
      { type: 'Feature', properties: { Country: 2, Status: 0 }, geometry: { type: 'Polygon', coordinates: [] } },
      { type: 'Feature', properties: { Country: 3, Status: 1 }, geometry: { type: 'Polygon', coordinates: [] } },
    ])
    expect(out).toHaveLength(1)
    expect((out[0]!.properties as { Country: number }).Country).toBe(3)
  })

  it('keeps portfolio rows with ALL_COUNTRY and geometry when Country is null', () => {
    const out = filterWorldCountriesForMap([
      {
        type: 'Feature',
        properties: { Country: null, ALL_COUNTRY: 'UAE', Status: 1 },
        geometry: { type: 'Polygon', coordinates: [] },
      },
    ])
    expect(out).toHaveLength(1)
  })
})
