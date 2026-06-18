import { describe, expect, it } from 'vitest'
import {
  filterWorldCountriesToPortfolio,
  resolveActivePortfolioCountryLabels,
  worldCountryFeatureMatchesPortfolioLabel,
} from './acpCountryBoundaries'

describe('acpCountryBoundaries', () => {
  it('matches UAE portfolio label to United Arab Emirates boundary feature', () => {
    expect(
      worldCountryFeatureMatchesPortfolioLabel({ COUNTRY: 'United Arab Emirates' }, 'UAE'),
    ).toBe(true)
  })

  it('filters World_Countries to active portfolio countries', () => {
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { COUNTRY: 'Morocco' },
          geometry: { type: 'Polygon', coordinates: [] },
        },
        {
          type: 'Feature',
          properties: { COUNTRY: 'France' },
          geometry: { type: 'Polygon', coordinates: [] },
        },
        {
          type: 'Feature',
          properties: { COUNTRY: 'United Arab Emirates' },
          geometry: { type: 'Polygon', coordinates: [] },
        },
      ],
    }
    const labels = resolveActivePortfolioCountryLabels(
      [
        { value: 'all', label: 'All countries' },
        { value: '1', label: 'UAE' },
        { value: '2', label: 'Morocco' },
      ],
      'all',
    )
    const filtered = filterWorldCountriesToPortfolio(geojson, labels)
    expect(filtered.features).toHaveLength(2)
    expect(filtered.features.map(f => f.properties?.COUNTRY)).toEqual([
      'Morocco',
      'United Arab Emirates',
    ])
  })

  it('filters to a single country when country filter is set', () => {
    const labels = resolveActivePortfolioCountryLabels(
      [
        { value: 'all', label: 'All countries' },
        { value: '3', label: 'Serbia' },
      ],
      '3',
    )
    expect(labels).toEqual(['Serbia'])
  })
})
