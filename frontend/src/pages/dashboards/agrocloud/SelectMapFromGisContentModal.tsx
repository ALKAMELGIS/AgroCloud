import { useEffect, useMemo, useState } from 'react'
import {
  GIS_CONTENT_DEFAULT_OWNER,
  gisContentTypeIcon,
  type GisContentItemType,
  type GisContentRow,
} from '../../master/gisContentPortalData'
import {
  getGisContentItemDetails,
  getGisContentPortalFolders,
  getGisContentPortalRows,
  isGisContentRowInRecycle,
} from '../../../lib/gisContentPortalStore'
import { readGisWebMapSnapshot } from '../../../lib/gisWebMapPortal'

type SelectMapTab = 'my-content' | 'shared-content'

const MAP_SELECTABLE_TYPES: GisContentItemType[] = ['web-map', 'scene', 'three-d-layer', 'feature-layer']

export function isGisContentMapSelectable(row: GisContentRow): boolean {
  return MAP_SELECTABLE_TYPES.includes(row.type) && !isGisContentRowInRecycle(row)
}

function mapTypeBadgeLabel(type: GisContentItemType): string {
  switch (type) {
    case 'web-map':
      return 'Web Map'
    case 'scene':
    case 'three-d-layer':
      return 'Web Scene'
    case 'feature-layer':
      return 'Hosted feature layer'
    default:
      return 'Map'
  }
}

function MapSelectCard({
  row,
  selected,
  onSelect,
}: {
  row: GisContentRow
  selected: boolean
  onSelect: () => void
}) {
  const details = getGisContentItemDetails(row.id)
  const owner = row.owner ?? GIS_CONTENT_DEFAULT_OWNER
  const thumbUrl = details.thumbnailDataUrl

  return (
    <button
      type="button"
      className={`agrocloud-select-map__card${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="agrocloud-select-map__card-thumb">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" />
        ) : (
          <div className={`agrocloud-select-map__card-placeholder agrocloud-select-map__card-placeholder--${row.type}`}>
            <i className={gisContentTypeIcon(row.type)} aria-hidden />
          </div>
        )}
      </div>
      <div className="agrocloud-select-map__card-body">
        <h3 className="agrocloud-select-map__card-title">{row.title}</h3>
        <p className="agrocloud-select-map__card-owner">by {owner}</p>
        <p className="agrocloud-select-map__card-date">Last update: {row.modified}</p>
        <div className="agrocloud-select-map__card-foot">
          <span className="agrocloud-select-map__type-badge">
            <i className={gisContentTypeIcon(row.type)} aria-hidden />
            {mapTypeBadgeLabel(row.type)}
          </span>
          <span className="agrocloud-select-map__card-icons" aria-hidden>
            <i className="fa-regular fa-circle-info" />
            <i className="fa-solid fa-check" />
          </span>
        </div>
      </div>
    </button>
  )
}

export type SelectMapFromGisContentModalProps = {
  open: boolean
  onClose: () => void
  onSelect: (row: GisContentRow) => void
  title?: string
  excludeGisContentId?: string | null
  /** When true, only portal Web Map items with a saved map snapshot are listed. */
  webMapsOnly?: boolean
  /** Render above another dashboard modal. */
  stacked?: boolean
}

export function SelectMapFromGisContentModal({
  open,
  onClose,
  onSelect,
  title = 'Select a map',
  excludeGisContentId = null,
  webMapsOnly = false,
  stacked = false,
}: SelectMapFromGisContentModalProps) {
  const [tab, setTab] = useState<SelectMapTab>('my-content')
  const [folderId, setFolderId] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | GisContentItemType>('all')
  const [filterOpen, setFilterOpen] = useState(false)

  const folders = useMemo(() => getGisContentPortalFolders().filter(f => f.id !== 'recycle'), [])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return getGisContentPortalRows()
      .filter(isGisContentMapSelectable)
      .filter(row => {
        if (webMapsOnly) {
          return row.type === 'web-map' && readGisWebMapSnapshot(getGisContentItemDetails(row.id)) != null
        }
        return true
      })
      .filter(row => {
        if (tab === 'shared-content') {
          return row.sharing === 'shared' || row.sharing === 'organization' || row.sharing === 'public'
        }
        return true
      })
      .filter(row => (folderId === 'all' ? true : row.folderId === folderId))
      .filter(row => (typeFilter === 'all' ? true : row.type === typeFilter))
      .filter(row => !excludeGisContentId || row.id !== excludeGisContentId)
      .filter(row => !q || row.title.toLowerCase().includes(q) || row.typeLabel.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
  }, [folderId, searchQuery, tab, typeFilter, open, excludeGisContentId, webMapsOnly])

  useEffect(() => {
    if (!open) return
    setTab('my-content')
    setFolderId('all')
    setSearchQuery('')
    setSelectedId(null)
    setTypeFilter('all')
    setFilterOpen(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleCardSelect = (row: GisContentRow) => {
    setSelectedId(row.id)
    onSelect(row)
  }

  return (
    <div
      className={`agrocloud-select-map-backdrop${stacked ? ' agrocloud-select-map-backdrop--stacked' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="agrocloud-select-map"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agrocloud-select-map-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="agrocloud-select-map__header">
          <h2 id="agrocloud-select-map-title">{title}</h2>
          <button type="button" className="agrocloud-select-map__close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="agrocloud-select-map__tabs" role="tablist" aria-label="Content scope">
          <button
            type="button"
            role="tab"
            className={`agrocloud-select-map__tab${tab === 'my-content' ? ' is-active' : ''}`}
            aria-selected={tab === 'my-content'}
            onClick={() => setTab('my-content')}
          >
            My content
          </button>
          <button
            type="button"
            role="tab"
            className={`agrocloud-select-map__tab${tab === 'shared-content' ? ' is-active' : ''}`}
            aria-selected={tab === 'shared-content'}
            onClick={() => setTab('shared-content')}
          >
            Shared content
          </button>
        </div>

        <div className="agrocloud-select-map__toolbar">
          <select
            className="agrocloud-select-map__folder"
            value={folderId}
            aria-label="Content folder"
            onChange={e => setFolderId(e.target.value)}
          >
            <option value="all">All my content</option>
            {folders
              .filter(f => f.id !== 'all')
              .map(f => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
          <label className="agrocloud-select-map__search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input
              type="search"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </label>
          <button type="button" className="agrocloud-select-map__tool-btn" title="Most recent" aria-pressed="true">
            <i className="fa-regular fa-clock" aria-hidden />
            Most Recent
          </button>
          <div className="agrocloud-select-map__filter-wrap">
            <button
              type="button"
              className={`agrocloud-select-map__tool-btn${filterOpen ? ' is-active' : ''}`}
              title="Filter by"
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen(o => !o)}
            >
              <i className="fa-solid fa-filter" aria-hidden />
              Filter by
            </button>
            {filterOpen ? (
              <div className="agrocloud-select-map__filter-menu" role="menu">
                {(
                  [
                    ['all', 'All types'],
                    ['web-map', 'Web Map'],
                    ['scene', 'Web Scene'],
                    ['feature-layer', 'Feature Layer'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    className={`agrocloud-select-map__filter-item${typeFilter === id ? ' is-active' : ''}`}
                    onClick={() => {
                      setTypeFilter(id)
                      setFilterOpen(false)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="agrocloud-select-map__grid-wrap">
          {filteredRows.length === 0 ? (
            <p className="agrocloud-select-map__empty">No maps or layers match your filters.</p>
          ) : (
            <div className="agrocloud-select-map__grid">
              {filteredRows.map(row => (
                <MapSelectCard
                  key={row.id}
                  row={row}
                  selected={selectedId === row.id}
                  onSelect={() => handleCardSelect(row)}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="agrocloud-select-map__footer">
          <button type="button" className="agrocloud-select-map__cancel" onClick={onClose}>
            Cancel
          </button>
        </footer>
      </div>
    </div>
  )
}
