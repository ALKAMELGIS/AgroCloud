import { describe, expect, it } from 'vitest'
import {
  developEliteArcgisCacheKey,
  developEliteArcgisLayerUrlsChanged,
  getDevelopEliteArcgisSessionCache,
  setDevelopEliteArcgisSessionCache,
} from './developEliteArcgisSessionCache'
import { loadDevelopEliteDashboardConfig } from './developEliteDashboardConfig'

describe('developEliteArcgisSessionCache', () => {
  it('cache key changes when any layer URL changes', () => {
    const base = loadDevelopEliteDashboardConfig()
    const other = { ...base, cropsTableUrl: `${base.cropsTableUrl}?x=1` }
    expect(developEliteArcgisCacheKey(base)).not.toBe(developEliteArcgisCacheKey(other))
    expect(developEliteArcgisLayerUrlsChanged(base, other)).toBe(true)
    expect(developEliteArcgisLayerUrlsChanged(base, { ...base })).toBe(false)
  })

  it('stores and reads snapshot by key', () => {
    const config = loadDevelopEliteDashboardConfig()
    const key = developEliteArcgisCacheKey(config)
    expect(getDevelopEliteArcgisSessionCache(key)).toBeUndefined()

    const snapshot = {
      structures: { type: 'FeatureCollection', features: [] },
      zoneLayerStructures: null,
      structuresDrawingInfo: null,
      cropRows: [],
      treeFeatures: [],
      treesDrawingInfo: null,
      agriLocationFeatures: [],
      agriLocationDrawingInfo: null,
      cropMeta: { cropTypeLabels: new Map() },
      countryLabels: new Map(),
      worldCountries: null,
      worldCountryDomain: new Map(),
      worldCountriesDrawingInfo: null,
      fetchedAt: 1,
    }
    setDevelopEliteArcgisSessionCache(key, snapshot)
    expect(getDevelopEliteArcgisSessionCache(key)).toBe(snapshot)
  })
})
