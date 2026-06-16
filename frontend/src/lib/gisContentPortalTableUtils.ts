import {
  type GisContentRow,
  type GisContentSharing,
  type GisPortalTopTab,
  isGisPortalRowMapAddable,
} from '../pages/master/gisContentPortalData'
import type { GisContentItemDetails } from './gisContentPortalStore'
import type { GisContentItemStatus } from './gisContentRepository'
import {
  filterGisContentRowsForFolder,
  isGisContentRowInRecycle,
} from './gisContentPortalStore'

export type GisContentViewMode = 'table' | 'cards'
export type GisContentSortKey = 'title' | 'modified' | 'created' | 'type'
export type GisContentSortDir = 'asc' | 'desc'

export type GisContentTableQuery = {
  rows: GisContentRow[]
  folderId: string
  topTab: GisPortalTopTab
  favoriteIds: Set<string>
  searchQuery: string
  itemTypeFilters: Set<string>
  sortKey: GisContentSortKey
  sortDir: GisContentSortDir
  /** When set, only map-addable layer types (browse panel). */
  mapLayersOnly?: boolean
  /** Item details keyed by portal row id (tags, metadata, status filters). */
  itemDetails?: Record<string, GisContentItemDetails>
  /** Match any tag containing this text (case-insensitive). */
  tagQuery?: string
  sharingFilters?: Set<GisContentSharing>
  deleteProtectionOnly?: boolean
  statusFilters?: Set<GisContentItemStatus>
}

function parseModified(s: string): number {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

export function gisContentRowDateMs(row: GisContentRow, field: 'modified' | 'created'): number {
  const raw = field === 'created' ? (row.created ?? row.modified) : row.modified
  return parseModified(raw)
}

export function gisContentSortSelectFromKey(key: GisContentSortKey): string {
  switch (key) {
    case 'title':
      return 'title'
    case 'type':
      return 'type'
    case 'created':
      return 'date-created'
    case 'modified':
    default:
      return 'date-modified'
  }
}

/** Saved feature layers in GIS Content portal (for map pickers and browse panels). */
export function listGisContentPortalSavedLayers(rows: GisContentRow[]): GisContentRow[] {
  return filterAndSortGisContentRows({
    rows,
    folderId: 'all',
    topTab: 'my-content',
    favoriteIds: new Set(),
    searchQuery: '',
    itemTypeFilters: new Set(['layers']),
    sortKey: 'modified',
    sortDir: 'desc',
  })
}

/** Sidebar item-type filter ids → portal row types. */
export function gisContentRowMatchesItemTypeFilter(row: GisContentRow, filterId: string): boolean {
  switch (filterId) {
    case 'maps':
      return row.type === 'web-map' || row.type === 'dashboard'
    case 'layers':
      return row.type === 'feature-layer'
    case 'scenes':
      return row.type === 'scene' || row.type === 'three-d-layer'
    case 'apps':
      return row.type === 'instant-app' || row.type === 'app'
    case 'tools':
      return row.type === 'tool'
    case 'files':
      return row.type === 'file'
    case 'styles':
      return row.type === 'style'
    case 'notebooks':
      return row.type === 'notebook'
    case 'service-connections':
      return row.type === 'file' || row.type === 'tool'
    default:
      return false
  }
}

function rowTags(row: GisContentRow, itemDetails?: Record<string, GisContentItemDetails>): string[] {
  const details = itemDetails?.[row.id]
  return details?.tags ?? []
}

function rowStatus(
  row: GisContentRow,
  itemDetails?: Record<string, GisContentItemDetails>,
): GisContentItemStatus {
  return itemDetails?.[row.id]?.status ?? 'published'
}

export function listGisContentPortalTagSuggestions(
  rows: GisContentRow[],
  itemDetails?: Record<string, GisContentItemDetails>,
): string[] {
  const tags = new Set<string>()
  for (const row of rows) {
    for (const tag of rowTags(row, itemDetails)) {
      const trimmed = tag.trim()
      if (trimmed) tags.add(trimmed)
    }
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b))
}

export function applyGisContentSortSelect(value: string): {
  sortKey: GisContentSortKey
  sortDir: GisContentSortDir
} {
  switch (value) {
    case 'title':
      return { sortKey: 'title', sortDir: 'asc' }
    case 'type':
      return { sortKey: 'type', sortDir: 'asc' }
    case 'date-created':
      return { sortKey: 'created', sortDir: 'desc' }
    case 'date-modified':
    default:
      return { sortKey: 'modified', sortDir: 'desc' }
  }
}

export function filterAndSortGisContentRows(query: GisContentTableQuery): GisContentRow[] {
  let list = filterGisContentRowsForFolder(query.rows, query.folderId)

  if (query.topTab === 'favorites') {
    list = list.filter(r => query.favoriteIds.has(r.id) && !isGisContentRowInRecycle(r))
  }

  if (query.mapLayersOnly) {
    list = list.filter(r => isGisPortalRowMapAddable(r.type) && !isGisContentRowInRecycle(r))
  }

  const q = query.searchQuery.trim().toLowerCase()
  if (q) {
    list = list.filter(r => {
      const details = query.itemDetails?.[r.id]
      const tags = rowTags(r, query.itemDetails)
      const metadata = details?.metadata ?? {}
      const metadataText = Object.entries(metadata)
        .map(([key, value]) => `${key} ${value}`)
        .join(' ')
      return (
        r.title.toLowerCase().includes(q) ||
        r.typeLabel.toLowerCase().includes(q) ||
        tags.some(tag => tag.toLowerCase().includes(q)) ||
        metadataText.toLowerCase().includes(q)
      )
    })
  }

  const tagQ = query.tagQuery?.trim().toLowerCase()
  if (tagQ) {
    list = list.filter(r => rowTags(r, query.itemDetails).some(tag => tag.toLowerCase().includes(tagQ)))
  }

  if (query.sharingFilters && query.sharingFilters.size > 0) {
    list = list.filter(r => query.sharingFilters!.has(r.sharing))
  }

  if (query.deleteProtectionOnly) {
    list = list.filter(r => r.deleteProtected)
  }

  if (query.statusFilters && query.statusFilters.size > 0) {
    list = list.filter(r => query.statusFilters!.has(rowStatus(r, query.itemDetails)))
  }

  if (query.itemTypeFilters.size > 0) {
    list = list.filter(r =>
      Array.from(query.itemTypeFilters).some(fid => gisContentRowMatchesItemTypeFilter(r, fid)),
    )
  }

  const mul = query.sortDir === 'asc' ? 1 : -1
  list = [...list].sort((a, b) => {
    if (query.sortKey === 'title') return mul * a.title.localeCompare(b.title)
    if (query.sortKey === 'type') return mul * a.typeLabel.localeCompare(b.typeLabel)
    if (query.sortKey === 'created') {
      return mul * (gisContentRowDateMs(a, 'created') - gisContentRowDateMs(b, 'created'))
    }
    return mul * (gisContentRowDateMs(a, 'modified') - gisContentRowDateMs(b, 'modified'))
  })

  return list
}

export function gisContentPortalLayerUrl(rowId: string): string {
  return `gis-content://${rowId}`
}

export function parseGisContentPortalLayerUrl(url: string): string | null {
  const m = String(url || '').match(/^gis-content:\/\/(.+)$/)
  return m?.[1] ?? null
}
