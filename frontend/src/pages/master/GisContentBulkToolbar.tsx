import { useEffect, useRef, useState } from 'react'
import type { GisContentFolder, GisContentRow } from './gisContentPortalData'

export type GisContentBulkToolbarProps = {
  selectedRows: GisContentRow[]
  folders: GisContentFolder[]
  onShare: () => void
  onDelete: () => void
  onMove: () => void
  onRestore?: () => void
  onChangeOwner: () => void
  onEnableDeleteProtection: () => void
  onDisableDeleteProtection: () => void
  onAddToMap?: () => void
}

export function GisContentBulkToolbar({
  selectedRows,
  onShare,
  onDelete,
  onMove,
  onRestore,
  onChangeOwner,
  onEnableDeleteProtection,
  onDisableDeleteProtection,
  onAddToMap,
}: GisContentBulkToolbarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const count = selectedRows.length

  const allProtected = count > 0 && selectedRows.every(r => r.deleteProtected)
  const noneProtected = count > 0 && selectedRows.every(r => !r.deleteProtected)
  const allInRecycle = count > 0 && selectedRows.every(r => r.folderId === 'recycle')

  useEffect(() => {
    if (!moreOpen) return
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current?.contains(e.target as Node)) return
      setMoreOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  if (count === 0) return null

  return (
    <div className="gis-portal-bulk-toolbar" role="toolbar" aria-label="Bulk actions">
      <button type="button" className="gis-portal-bulk-toolbar__btn" onClick={onShare}>
        <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden />
        <span>Share</span>
      </button>
      <button
        type="button"
        className={`gis-portal-bulk-toolbar__btn${allInRecycle ? ' gis-portal-bulk-toolbar__btn--danger' : ''}`}
        onClick={onDelete}
      >
        <i className="fa-solid fa-trash-can" aria-hidden />
        <span>{allInRecycle ? 'Delete permanently' : 'Delete'}</span>
      </button>
      <button type="button" className="gis-portal-bulk-toolbar__btn" onClick={onMove}>
        <i className={`fa-solid ${allInRecycle ? 'fa-rotate-left' : 'fa-folder-arrow-right'}`} aria-hidden />
        <span>{allInRecycle ? 'Restore to folder' : 'Move'}</span>
      </button>
      {onAddToMap ? (
        <button
          type="button"
          className="gis-portal-bulk-toolbar__btn"
          onClick={onAddToMap}
          disabled={allInRecycle}
          title={allInRecycle ? 'Restore items before adding to the map' : undefined}
        >
          <i className="fa-solid fa-map" aria-hidden />
          <span>Add to map</span>
        </button>
      ) : null}
      <div className="gis-portal-bulk-toolbar__more-wrap" ref={moreRef}>
        <button
          type="button"
          className={`gis-portal-bulk-toolbar__btn gis-portal-bulk-toolbar__btn--more${moreOpen ? ' gis-portal-bulk-toolbar__btn--active' : ''}`}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen(o => !o)}
        >
          <span>More</span>
          <i className={`fa-solid fa-chevron-${moreOpen ? 'up' : 'down'}`} aria-hidden />
        </button>
        {moreOpen ? (
          <div className="gis-portal-bulk-toolbar__menu" role="menu">
            {allInRecycle && onRestore ? (
              <button
                type="button"
                role="menuitem"
                className="gis-portal-bulk-toolbar__menu-item"
                onClick={() => {
                  setMoreOpen(false)
                  onRestore()
                }}
              >
                <i className="fa-solid fa-rotate-left" aria-hidden />
                <span>Restore to original folder</span>
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="gis-portal-bulk-toolbar__menu-item"
              disabled={allInRecycle}
              onClick={() => {
                if (allInRecycle) return
                setMoreOpen(false)
                onChangeOwner()
              }}
            >
              <i className="fa-solid fa-user" aria-hidden />
              <span>Change owner</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="gis-portal-bulk-toolbar__menu-item"
              disabled={allProtected || allInRecycle}
              onClick={() => {
                if (allProtected || allInRecycle) return
                setMoreOpen(false)
                onEnableDeleteProtection()
              }}
            >
              <span>Enable delete protection</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="gis-portal-bulk-toolbar__menu-item"
              disabled={noneProtected || allInRecycle}
              onClick={() => {
                if (noneProtected || allInRecycle) return
                setMoreOpen(false)
                onDisableDeleteProtection()
              }}
            >
              <span>Disable delete protection</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
