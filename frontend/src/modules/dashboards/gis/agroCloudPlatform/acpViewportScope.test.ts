import { describe, expect, it } from 'vitest'
import {
  isAcpDistributionMapLinked,
  isAcpViewportScopeActive,
  resolveAcpDistributionGeoFeatures,
  resolveAcpScopeGeoFeatures,
} from './acpViewportScope'

const fc: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { OBJECTID: 1, Country: 'UAE' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[55, 24], [55.1, 24], [55.1, 24.1], [55, 24.1], [55, 24]]],
      },
    },
    {
      type: 'Feature',
      properties: { OBJECTID: 2, Country: 'Serbia' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[20, 44], [20.1, 44], [20.1, 44.1], [20, 44.1], [20, 44]]],
      },
    },
  ],
}

describe('acpViewportScope', () => {
  it('activates viewport scope at field zoom', () => {
    expect(
      isAcpViewportScopeActive({ bbox: [54.5, 23.5, 55.5, 24.5], zoom: 12 }, 'viewport'),
    ).toBe(true)
    expect(
      isAcpViewportScopeActive({ bbox: [54.5, 23.5, 55.5, 24.5], zoom: 12 }, 'global'),
    ).toBe(false)
    expect(isAcpViewportScopeActive({ bbox: null, zoom: 12 }, 'viewport')).toBe(false)
  })

  it('filters features to map bbox in viewport mode', () => {
    const feats = resolveAcpScopeGeoFeatures(
      fc,
      { bbox: [54.5, 23.5, 55.5, 24.5], zoom: 12 },
      'viewport',
      'all',
    )
    expect(feats).toHaveLength(1)
    expect(feats[0]?.properties?.OBJECTID).toBe(1)
  })

  it('returns all country features in global mode', () => {
    const feats = resolveAcpScopeGeoFeatures(
      fc,
      { bbox: [54.5, 23.5, 55.5, 24.5], zoom: 12 },
      'global',
      'all',
    )
    expect(feats).toHaveLength(2)
  })

  it('links distribution to map bbox regardless of scope mode', () => {
    expect(isAcpDistributionMapLinked({ bbox: [54.5, 23.5, 55.5, 24.5], zoom: 4 })).toBe(true)
    expect(isAcpDistributionMapLinked({ bbox: null, zoom: 12 })).toBe(false)
  })

  it('filters distribution features to visible map extent on zoom and pan', () => {
    const feats = resolveAcpDistributionGeoFeatures(
      fc,
      { bbox: [54.5, 23.5, 55.5, 24.5], zoom: 10 },
      'all',
    )
    expect(feats).toHaveLength(1)
    expect(feats[0]?.properties?.OBJECTID).toBe(1)
  })
})
