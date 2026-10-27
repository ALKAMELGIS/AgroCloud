import { describe, expect, it, vi } from 'vitest'
import {
  buildBasemapCatalog,
  catalogEntryById,
  MAPBOX_BASEMAP_IDS,
  MAPBOX_SATELLITE_BASEMAP_ID,
  resolvePreferredBasemapId,
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
    vi.doMock('@/core/config/mapboxAccessToken', () => ({
      getMapboxAccessToken: () => 'pk.test-token',
      getMapboxAccessTokenFromEnv: () => 'pk.test-token',
    }))
    const { resolvePreferredBasemapId: resolvePreferred } = await import('./basemapCatalog')
    expect(resolvePreferred()).toBe(MAPBOX_SATELLITE_BASEMAP_ID)
    vi.doUnmock('@/core/config/mapboxAccessToken')
  })
})
