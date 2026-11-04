import { describe, expect, it, vi } from 'vitest'
import {
  buildBasemapCatalog,
  catalogEntryById,
  MAPBOX_BASEMAP_IDS,
  MAPBOX_SATELLITE_BASEMAP_ID,
} from './basemapCatalog'

describe('buildBasemapCatalog Mapbox', () => {
  it('includes Mapbox entries when a token is provided', () => {
    const catalog = buildBasemapCatalog('pk.test-token')
    for (const id of MAPBOX_BASEMAP_IDS) {
      expect(catalogEntryById(catalog, id)?.requiresMapboxToken).toBe(true)
    }
  })

  it('omits Mapbox entries without a token', () => {
    const catalog = buildBasemapCatalog('', { includeMapboxBasemaps: true })
    expect(catalogEntryById(catalog, 'mapbox-streets')).toBeUndefined()
  })

  it('resolvePreferredBasemapId prefers Mapbox Satellite when a token is configured', async () => {
    // basemapCatalog is already cached via the static import above; reset so doMock applies.
    vi.resetModules()
    vi.doMock('@/core/config/mapboxAccessToken', () => ({
      getMapboxAccessToken: () => 'pk.test-token',
      getMapboxAccessTokenFromEnv: () => 'pk.test-token',
    }))
    const { resolvePreferredBasemapId: resolvePreferred } = await import('./basemapCatalog')
    expect(resolvePreferred()).toBe(MAPBOX_SATELLITE_BASEMAP_ID)
    vi.doUnmock('@/core/config/mapboxAccessToken')
    vi.resetModules()
  })

  it('resolvePreferredBasemapId falls back to the default basemap without a token', async () => {
    vi.resetModules()
    vi.doMock('@/core/config/mapboxAccessToken', () => ({
      getMapboxAccessToken: () => '',
      getMapboxAccessTokenFromEnv: () => '',
    }))
    const mod = await import('./basemapCatalog')
    expect(mod.resolvePreferredBasemapId()).toBe(mod.DEFAULT_BASEMAP_ID)
    vi.doUnmock('@/core/config/mapboxAccessToken')
    vi.resetModules()
  })
})
