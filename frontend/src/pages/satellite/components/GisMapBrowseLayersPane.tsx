import { useMemo, useState } from 'react'
import {
  gisContentPortalDisplayIconType,
  gisContentPortalDisplayTypeLabel,
  gisContentTypeIcon,
  gisContentTypeTone,
  isGisPortalRowMapAddable,
  type GisContentRow,
} from '@/pages/master/gisContentPortalData'
import { getGisContentItemDetails, isGisContentRowInRecycle, useGisContentPortal } from '@/lib/gisContentPortalStore'
import { filterAndSortGisContentRows } from '@/lib/gisContentPortalTableUtils'
import './GisMapBrowseLayersPane.css'

export type GisMapBrowseLayersPaneProps = {
  onAddRow: (row: GisContentRow) => void
  addingRowId?: string | null
  statusMessage?: string | null
}

const OWNER_LABEL = 'Elite Agro Projects LLC'

export function GisMapBrowseLayersPane({
  onAddRow,
  addingRowId = null,
  statusMessage,
}: GisMapBrowseLayersPaneProps) {
  const portal = useGisContentPortal()
  const [searchQuery, setSearchQuery] = useState('')
  const [folderId, setFolderId] = useState('all')
  const [folderMenuOpen, setFolderMenuOpen] = useState(false)

  const folderLabel = useMemo(
    () => portal.folders.find(f => f.id === folderId)?.name ?? 'All my content',
    [portal.folders, folderId],
  )

  const rows = useMemo(
    () =>
      filterAndSortGisContentRows({
        rows: portal.rows,
        folderId,
        topTab: 'my-content',
        favoriteIds: portal.favorites,
        searchQuery,
        itemTypeFilters: new Set(['layers']),
        sortKey: 'modified',
        sortDir: 'desc',
      }),
    [portal.rows, portal.favorites, folderId, searchQuery],
  )

  const selectableFolders = useMemo(
    () => portal.folders.filter(f => f.id !== 'recycle'),
    [portal.folders],
  )

  return (
    <div className="gis-map-browse-layers item-pane-container w-full" aria-label="Browse GIS Content layers">
      <div className="gis-map-browse-layers__toolbar">
        <div className="gis-map-browse-layers__source-row">
          <select
            className="gis-map-browse-layers__source-select"
            defaultValue="my-content"
            aria-label="Content source"
          >
            <option value="my-content">My content</option>
          </select>
        </div>
        <div className="gis-map-browse-layers__search-row">
          <label className="gis-map-browse-layers__search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden />
            <input
              type="search"
              placeholder="Search layers"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search layers"
            />
          </label>
          <button type="button" className="gis-map-browse-layers__filter-btn" aria-label="Filter layers" title="Filter">
            <i className="fa-solid fa-sliders" aria-hidden />
          </button>
        </div>
        <div className="gis-map-browse-layers__folder-wrap">
          <button
            type="button"
            className="gis-map-browse-layers__folder-row"
            aria-expanded={folderMenuOpen}
            onClick={() => setFolderMenuOpen(o => !o)}
          >
            <i className="fa-solid fa-layer-group" aria-hidden />
            <span>{folderLabel}</span>
            <i className={`fa-solid fa-chevron-${folderMenuOpen ? 'up' : 'down'}`} aria-hidden />
          </button>
          {folderMenuOpen ? (
            <div
              className="gis-tables-agol-add__menu gis-tables-agol-add__menu--align-start"
              role="menu"
            >
              {selectableFolders.map(folder => (
                <button
                  key={folder.id}
                  type="button"
                  className="gis-tables-agol-add__menu-item"
                  role="menuitem"
                  onClick={() => {
                    setFolderId(folder.id)
                    setFolderMenuOpen(false)
                  }}
                >
                  <i className="fa-solid fa-folder" aria-hidden />
                  <span>{folder.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <ul className="gis-map-browse-layers__list" role="list">
        {rows.length === 0 ? (
          <li className="gis-map-browse-layers__empty" role="status">
            No layers in GIS Content match your search. Add items from the Content portal or change the folder filter.
          </li>
        ) : (
          rows.map(row => {
            const inRecycle = isGisContentRowInRecycle(row)
            const addable = isGisPortalRowMapAddable(row.type) && !inRecycle
            const adding = addingRowId === row.id
            const details = getGisContentItemDetails(row.id)
            const displayType = gisContentPortalDisplayIconType(row, details)
            const displayTypeLabel = gisContentPortalDisplayTypeLabel(row, details)
            return (
              <li key={row.id} className="gis-map-browse-layers__card" role="listitem">
                <div className="gis-map-browse-layers__card-main">
                  <h3 className="gis-map-browse-layers__card-title" title={row.title}>
                    {row.title}
                  </h3>
                  <div className="gis-map-browse-layers__card-meta">
                    <span className={`gis-map-browse-layers__card-type-icon ${gisContentTypeTone(displayType)}`}>
                      <i className={gisContentTypeIcon(displayType)} aria-hidden />
                    </span>
                    <span className="gis-map-browse-layers__card-type-text">
                      <strong>{displayTypeLabel}</strong>
                      <span>{row.modified}</span>
                    </span>
                  </div>
                </div>
                <div className="gis-map-browse-layers__thumb" aria-hidden>
                  <i className={gisContentTypeIcon(displayType)} />
                </div>
                <div className="gis-map-browse-layers__card-foot">
                  <span className="gis-map-browse-layers__owner">
                    <span className="gis-map-browse-layers__owner-avatar">
                      <i className="fa-solid fa-building" aria-hidden />
                    </span>
                    <span>{OWNER_LABEL}</span>
                  </span>
                  <button
                    type="button"
                    className="gis-map-browse-layers__add-btn"
                    disabled={!addable || adding}
                    onClick={() => onAddRow(row)}
                  >
                    <i className="fa-solid fa-plus" aria-hidden />
                    {adding ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </li>
            )
          })
        )}
      </ul>

      {statusMessage ? (
        <p className="gis-map-browse-layers__status" role="status">
          {statusMessage}
        </p>
      ) : null}
    </div>
  )
}
