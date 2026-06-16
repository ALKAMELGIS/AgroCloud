import { describe, expect, it } from 'vitest'
import { GIS_CONTENT_TEST_FIXTURE_ROWS } from '../pages/master/gisContentPortalData'
import {
  applyGisContentSortSelect,
  filterAndSortGisContentRows,
  gisContentRowMatchesItemTypeFilter,
  parseGisContentPortalLayerUrl,
} from './gisContentPortalTableUtils'

describe('gisContentPortalTableUtils', () => {
  it('filters by item type and favorites tab', () => {
    const layers = filterAndSortGisContentRows({
      rows: GIS_CONTENT_TEST_FIXTURE_ROWS,
      folderId: 'all',
      topTab: 'my-content',
      favoriteIds: new Set(['4']),
      searchQuery: '',
      itemTypeFilters: new Set(['layers']),
      sortKey: 'title',
      sortDir: 'asc',
      mapLayersOnly: false,
    })
    expect(layers.every(r => gisContentRowMatchesItemTypeFilter(r, 'layers'))).toBe(true)
    expect(layers.some(r => r.id === '3')).toBe(true)

    const favorites = filterAndSortGisContentRows({
      rows: GIS_CONTENT_TEST_FIXTURE_ROWS,
      folderId: 'all',
      topTab: 'favorites',
      favoriteIds: new Set(['4']),
      searchQuery: '',
      itemTypeFilters: new Set(),
      sortKey: 'modified',
      sortDir: 'desc',
      mapLayersOnly: false,
    })
    expect(favorites.map(r => r.id)).toEqual(['4'])
  })

  it('parses portal layer urls', () => {
    expect(parseGisContentPortalLayerUrl('gis-content://7')).toBe('7')
    expect(parseGisContentPortalLayerUrl('https://example.com')).toBeNull()
    expect(applyGisContentSortSelect('type')).toEqual({ sortKey: 'type', sortDir: 'asc' })
    expect(applyGisContentSortSelect('date-created')).toEqual({ sortKey: 'created', sortDir: 'desc' })
    expect(applyGisContentSortSelect('date-modified')).toEqual({ sortKey: 'modified', sortDir: 'desc' })
  })

  it('sorts by created date distinctly from modified', () => {
    const byModified = filterAndSortGisContentRows({
      rows: GIS_CONTENT_TEST_FIXTURE_ROWS,
      folderId: 'all',
      topTab: 'my-content',
      favoriteIds: new Set(),
      searchQuery: '',
      itemTypeFilters: new Set(),
      sortKey: 'modified',
      sortDir: 'desc',
      mapLayersOnly: false,
    })
    const byCreated = filterAndSortGisContentRows({
      rows: GIS_CONTENT_TEST_FIXTURE_ROWS,
      folderId: 'all',
      topTab: 'my-content',
      favoriteIds: new Set(),
      searchQuery: '',
      itemTypeFilters: new Set(),
      sortKey: 'created',
      sortDir: 'desc',
      mapLayersOnly: false,
    })
    expect(byModified.map(r => r.id)).not.toEqual(byCreated.map(r => r.id))
    expect(byCreated[0]?.id).toBe('10')
  })
})
