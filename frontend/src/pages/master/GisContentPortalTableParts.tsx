import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getGisContentRowMenuActions,
  gisContentPortalDisplayIconType,
  gisContentPortalDisplayTypeLabel,
  gisContentTypeIcon,
  gisContentTypeTone,
  gisSharingIcon,
  gisSharingLabel,
  isAgroCloudDashboardApp,
  isGisPortalRowMapAddable,
  type GisContentRow,
  type GisRowMenuAction,
} from './gisContentPortalData'
import { getGisContentItemDetails } from '../../lib/gisContentPortalStore'
import type { GisContentSortKey, GisContentSortDir, GisContentViewMode } from '../../lib/gisContentPortalTableUtils'

const ROW_MENU_WIDTH = 240
const ROW_MENU_GAP = 4
const ROW_MENU_VIEWPORT_MARGIN = 8
const ROW_MENU_EST_HEIGHT = 320

type RowMenuPosition = { top: number; left: number }

function computeRowMenuPosition(anchor: DOMRect, menuHeight: number): RowMenuPosition {
  const margin = ROW_MENU_VIEWPORT_MARGIN
  const menuW = ROW_MENU_WIDTH
  let left = anchor.right - menuW
  left = Math.min(Math.max(margin, left), window.innerWidth - menuW - margin)

  const spaceBelow = window.innerHeight - anchor.bottom - margin
  const spaceAbove = anchor.top - margin
  let top = anchor.bottom + ROW_MENU_GAP
  if (menuHeight + ROW_MENU_GAP > spaceBelow && spaceAbove > spaceBelow) {
    top = anchor.top - menuHeight - ROW_MENU_GAP
  }
  top = Math.max(margin, Math.min(top, window.innerHeight - menuHeight - margin))

  return { top, left }
}

export function GisContentPortalToolbar({
  viewMode,
  sortSelect,
  rangeLabel,
  allVisibleSelected,
  showSelectAll = true,
  bulkActions,
  onViewModeChange,
  onSortSelectChange,
  onToggleSelectAll,
}: {
  viewMode: GisContentViewMode
  sortSelect: string
  rangeLabel: string
  allVisibleSelected: boolean
  showSelectAll?: boolean
  bulkActions?: React.ReactNode
  onViewModeChange: (mode: GisContentViewMode) => void
  onSortSelectChange: (value: string) => void
  onToggleSelectAll: () => void
}) {
  return (
    <div className="gis-portal-main__toolbar">
      <div className="gis-portal-main__toolbar-left">
        {showSelectAll ? (
          <input
            type="checkbox"
            checked={allVisibleSelected}
            aria-label="Select all"
            onChange={onToggleSelectAll}
          />
        ) : null}
        <span>{rangeLabel}</span>
      </div>
      <div className="gis-portal-main__toolbar-right">
        <div className="gis-portal-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => onViewModeChange('table')}
          >
            <i className="fa-solid fa-table" aria-hidden />
            Table
          </button>
          <button
            type="button"
            className={viewMode === 'cards' ? 'active' : ''}
            onClick={() => onViewModeChange('cards')}
          >
            <i className="fa-solid fa-grip" aria-hidden />
            Cards
          </button>
        </div>
        {bulkActions ? <div className="gis-portal-main__toolbar-bulk">{bulkActions}</div> : null}
        <label className="gis-portal-sort">
          <span>Sort by</span>
          <select value={sortSelect} onChange={e => onSortSelectChange(e.target.value)}>
            <option value="date-modified">Date modified</option>
            <option value="date-created">Date created</option>
            <option value="title">Title</option>
            <option value="type">Type</option>
          </select>
        </label>
      </div>
    </div>
  )
}

function ItemMoreMenu({
  row,
  isFavorite,
  isInRecycle,
  open,
  onToggle,
  onClose,
  onAction,
}: {
  row: GisContentRow
  isFavorite: boolean
  isInRecycle: boolean
  open: boolean
  onToggle: () => void
  onClose: () => void
  onAction: (action: GisRowMenuAction) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<RowMenuPosition | null>(null)
  const actions = useMemo(
    () => getGisContentRowMenuActions(row, { isFavorite, isInRecycle }),
    [row, isFavorite, isInRecycle],
  )

  const updateMenuPosition = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const anchor = btn.getBoundingClientRect()
    const menuHeight = menuRef.current?.offsetHeight ?? ROW_MENU_EST_HEIGHT
    setMenuPos(computeRowMenuPosition(anchor, menuHeight))
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    updateMenuPosition()
    const raf = window.requestAnimationFrame(updateMenuPosition)
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, actions, updateMenuPosition])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const menu =
    open && typeof document !== 'undefined' ? (
      <div
        ref={menuRef}
        className="gis-portal-row-menu gis-portal-row-menu--fixed"
        role="menu"
        style={{
          top: menuPos?.top ?? -9999,
          left: menuPos?.left ?? -9999,
          width: ROW_MENU_WIDTH,
          visibility: menuPos ? 'visible' : 'hidden',
        }}
      >
        {actions.map(action => (
          <React.Fragment key={action.id}>
            {action.dividerBefore ? <hr className="gis-portal-row-menu__divider" /> : null}
            <button
              type="button"
              role="menuitem"
              className={`gis-portal-row-menu__item${action.danger ? ' gis-portal-row-menu__item--danger' : ''}${
                action.disabled ? ' gis-portal-row-menu__item--disabled' : ''
              }`}
              disabled={action.disabled}
              onClick={e => {
                e.stopPropagation()
                if (!action.disabled) {
                  onAction(action)
                  onClose()
                }
              }}
            >
              <span>{action.label}</span>
              {action.external ? (
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
              ) : null}
            </button>
          </React.Fragment>
        ))}
      </div>
    ) : null

  return (
    <div className="gis-portal-row-menu-wrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`gis-portal-icon-btn${open ? ' gis-portal-icon-btn--active' : ''}`}
        aria-label={`More actions for ${row.title}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={e => {
          e.stopPropagation()
          onToggle()
        }}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}

function resolvePrimaryAction(row: GisContentRow): GisRowMenuAction {
  if (isAgroCloudDashboardApp(row)) {
    return { id: 'open-dashboard', label: 'Open dashboard' }
  }
  if (isGisPortalRowMapAddable(row.type)) {
    return { id: 'add-to-map', label: 'Add to map' }
  }
  return { id: 'view-details', label: 'View details' }
}

function RowPrimaryActionButton({
  primary,
  label,
  onClick,
  disabled,
}: {
  primary: GisRowMenuAction
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  const isAdd = primary.id === 'add-to-map'
  const busy = /adding/i.test(label)
  const displayLabel = busy ? label : isAdd ? 'Add' : 'Preview'
  const iconClass = busy ? 'fa-solid fa-spinner fa-spin' : isAdd ? 'fa-solid fa-plus' : 'fa-solid fa-eye'

  return (
    <button
      type="button"
      className="gis-portal-btn gis-portal-btn--row-action"
      onClick={onClick}
      disabled={disabled || busy}
      aria-label={busy ? label : isAdd ? 'Add to map' : 'Preview item'}
    >
      <i className={`gis-portal-btn__icon ${iconClass}`} aria-hidden />
      <span className="gis-portal-btn__label">{displayLabel}</span>
    </button>
  )
}

function ContentTableRow({
  row,
  selected,
  onToggle,
  isFavorite,
  isInRecycle,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onMenuAction,
  showSharing = true,
  showCheckbox = true,
  primaryActionLabel,
  onOpenItem,
}: {
  row: GisContentRow
  selected: boolean
  onToggle: () => void
  isFavorite: boolean
  isInRecycle: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onMenuAction: (action: GisRowMenuAction, row: GisContentRow) => void
  showSharing?: boolean
  showCheckbox?: boolean
  primaryActionLabel?: string
  onOpenItem?: (row: GisContentRow) => void
}) {
  const primary = resolvePrimaryAction(row)
  const label = primaryActionLabel ?? (primary.id === 'add-to-map' ? 'Add' : 'Preview')
  const details = getGisContentItemDetails(row.id)
  const displayType = gisContentPortalDisplayIconType(row, details)
  const displayTypeLabel = gisContentPortalDisplayTypeLabel(row, details)

  return (
    <tr className={selected ? 'selected' : ''}>
      {showCheckbox ? (
        <td className="col-check">
          <input type="checkbox" checked={selected} aria-label={`Select ${row.title}`} onChange={onToggle} />
        </td>
      ) : null}
      <td className="col-title">
        <button
          type="button"
          className="gis-portal-title-link"
          onClick={() =>
            onOpenItem
              ? onOpenItem(row)
              : onMenuAction({ id: 'view-details', label: 'View details' }, row)
          }
        >
          {row.title}
        </button>
      </td>
      <td className="col-type">
        <div className="gis-portal-type-cell">
          <span className={`gis-portal-type-icon ${gisContentTypeTone(displayType)}`}>
            <i className={gisContentTypeIcon(displayType)} aria-hidden />
          </span>
          <span>{displayTypeLabel}</span>
        </div>
      </td>
      <td className="col-modified">{row.modified}</td>
      {showSharing ? (
        <td className="col-sharing">
          <span className="gis-portal-sharing" title={gisSharingLabel(row.sharing)}>
            <i className={gisSharingIcon(row.sharing)} aria-hidden />
          </span>
        </td>
      ) : null}
      <td className="col-actions">
        <div className="gis-portal-actions">
          <RowPrimaryActionButton primary={primary} label={label} onClick={() => onMenuAction(primary, row)} />
          <ItemMoreMenu
            row={row}
            isFavorite={isFavorite}
            isInRecycle={isInRecycle}
            open={menuOpen}
            onToggle={onMenuToggle}
            onClose={onMenuClose}
            onAction={action => onMenuAction(action, row)}
          />
        </div>
      </td>
    </tr>
  )
}

function ContentCard({
  row,
  selected,
  onToggle,
  isFavorite,
  isInRecycle,
  menuOpen,
  onMenuToggle,
  onMenuClose,
  onMenuAction,
  primaryActionLabel,
  onOpenItem,
}: {
  row: GisContentRow
  selected: boolean
  onToggle: () => void
  isFavorite: boolean
  isInRecycle: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
  onMenuAction: (action: GisRowMenuAction, row: GisContentRow) => void
  primaryActionLabel?: string
  onOpenItem?: (row: GisContentRow) => void
}) {
  const primary = resolvePrimaryAction(row)
  const label = primaryActionLabel ?? (primary.id === 'add-to-map' ? 'Add' : 'Preview')
  const details = getGisContentItemDetails(row.id)
  const displayType = gisContentPortalDisplayIconType(row, details)
  const displayTypeLabel = gisContentPortalDisplayTypeLabel(row, details)

  return (
    <article className={`gis-portal-card${selected ? ' gis-portal-card--selected' : ''}`}>
      <div className="gis-portal-card__head">
        <input type="checkbox" checked={selected} aria-label={`Select ${row.title}`} onChange={onToggle} />
        <span className={`gis-portal-type-icon ${gisContentTypeTone(displayType)}`}>
          <i className={gisContentTypeIcon(displayType)} aria-hidden />
        </span>
        <button
          type="button"
          className="gis-portal-card__title"
          onClick={() =>
            onOpenItem
              ? onOpenItem(row)
              : onMenuAction({ id: 'view-details', label: 'View details' }, row)
          }
        >
          {row.title}
        </button>
      </div>
      <p className="gis-portal-card__meta">
        {displayTypeLabel} · {row.modified}
      </p>
      <div className="gis-portal-card__foot">
        <span className="gis-portal-sharing" title={gisSharingLabel(row.sharing)}>
          <i className={gisSharingIcon(row.sharing)} aria-hidden />
        </span>
        <div className="gis-portal-actions">
          <RowPrimaryActionButton primary={primary} label={label} onClick={() => onMenuAction(primary, row)} />
          <ItemMoreMenu
            row={row}
            isFavorite={isFavorite}
            isInRecycle={isInRecycle}
            open={menuOpen}
            onToggle={onMenuToggle}
            onClose={onMenuClose}
            onAction={action => onMenuAction(action, row)}
          />
        </div>
      </div>
    </article>
  )
}

export function GisContentPortalTableView({
  rows,
  viewMode,
  sortKey,
  sortDir,
  selectedIds,
  favoriteIds,
  openRowMenuId,
  showSharing = true,
  showCheckboxes = true,
  primaryActionLabel,
  isInRecycle = row => row.folderId === 'recycle',
  onOpenItem,
  onToggleSort,
  onToggleRow,
  onOpenRowMenu,
  onMenuAction,
}: {
  rows: GisContentRow[]
  viewMode: GisContentViewMode
  sortKey: GisContentSortKey
  sortDir: GisContentSortDir
  selectedIds: Set<string>
  favoriteIds: Set<string>
  openRowMenuId: string | null
  showSharing?: boolean
  showCheckboxes?: boolean
  primaryActionLabel?: string
  isInRecycle?: (row: GisContentRow) => boolean
  onOpenItem?: (row: GisContentRow) => void
  onToggleSort: (key: GisContentSortKey) => void
  onToggleRow: (id: string) => void
  onOpenRowMenu: (id: string | null) => void
  onMenuAction: (action: GisRowMenuAction, row: GisContentRow) => void
}) {
  if (viewMode === 'cards') {
    return (
      <div className="gis-portal-cards" role="list">
        {rows.length === 0 ? (
          <p className="gis-portal-table__empty gis-portal-table__empty--cards">No items match your filters.</p>
        ) : (
          rows.map(row => (
            <ContentCard
              key={row.id}
              row={row}
              selected={selectedIds.has(row.id)}
              onToggle={() => onToggleRow(row.id)}
              isFavorite={favoriteIds.has(row.id)}
              isInRecycle={isInRecycle(row)}
              menuOpen={openRowMenuId === row.id}
              onMenuToggle={() => onOpenRowMenu(openRowMenuId === row.id ? null : row.id)}
              onMenuClose={() => onOpenRowMenu(null)}
              onMenuAction={onMenuAction}
              primaryActionLabel={primaryActionLabel}
              onOpenItem={onOpenItem}
            />
          ))
        )}
      </div>
    )
  }

  return (
    <div className="gis-portal-table-wrap">
      <table className="gis-portal-table">
        <thead>
          <tr>
            {showCheckboxes ? (
              <th className="col-check" scope="col">
                <span className="visually-hidden">Select</span>
              </th>
            ) : null}
            <th className="col-title" scope="col">
              <button type="button" onClick={() => onToggleSort('title')}>
                Title
                {sortKey === 'title' ? (
                  <i className={`fa-solid fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} aria-hidden />
                ) : null}
              </button>
            </th>
            <th className="col-type" scope="col">
              <button type="button" onClick={() => onToggleSort('type')}>
                Type
                {sortKey === 'type' ? (
                  <i className={`fa-solid fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} aria-hidden />
                ) : null}
              </button>
            </th>
            <th className="col-modified" scope="col">
              <button
                type="button"
                onClick={() => onToggleSort(sortKey === 'created' ? 'created' : 'modified')}
              >
                {sortKey === 'created' ? 'Created' : 'Modified'}
                {sortKey === 'modified' || sortKey === 'created' ? (
                  <i className={`fa-solid fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} aria-hidden />
                ) : null}
              </button>
            </th>
            {showSharing ? (
              <th className="col-sharing" scope="col">
                <span className="visually-hidden">Sharing</span>
              </th>
            ) : null}
            <th className="col-actions" scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={showSharing ? (showCheckboxes ? 6 : 5) : showCheckboxes ? 5 : 4}
                className="gis-portal-table__empty"
              >
                No items match your filters.
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <ContentTableRow
                key={row.id}
                row={row}
                selected={selectedIds.has(row.id)}
                onToggle={() => onToggleRow(row.id)}
                isFavorite={favoriteIds.has(row.id)}
                isInRecycle={isInRecycle(row)}
                menuOpen={openRowMenuId === row.id}
                onMenuToggle={() => onOpenRowMenu(openRowMenuId === row.id ? null : row.id)}
                onMenuClose={() => onOpenRowMenu(null)}
                onMenuAction={onMenuAction}
                showSharing={showSharing}
                showCheckbox={showCheckboxes}
                primaryActionLabel={primaryActionLabel}
                onOpenItem={onOpenItem}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
