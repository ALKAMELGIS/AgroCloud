import { useEffect, useId, useRef } from 'react'
import type { GisContentFolder } from './gisContentPortalData'

export type MoveItemsModalProps = {
  open: boolean
  itemCount: number
  folders: GisContentFolder[]
  selectedFolderId: string
  onFolderChange: (folderId: string) => void
  onClose: () => void
  onMove: () => void
}

export function MoveItemsModal({
  open,
  itemCount,
  folders,
  selectedFolderId,
  onFolderChange,
  onClose,
  onMove,
}: MoveItemsModalProps) {
  const selectId = useId()
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => selectRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open) return null

  const movableFolders = folders.filter(f => f.id !== 'all' && f.id !== 'recycle')

  return (
    <div className="gis-portal-modal-backdrop gis-portal-modal-backdrop--light" role="presentation" onClick={onClose}>
      <div
        className="gis-fl-wizard gis-fl-wizard--folder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gis-move-items-title"
        onClick={e => e.stopPropagation()}
      >
        <header className="gis-fl-wizard__header">
          <h2 id="gis-move-items-title" className="gis-fl-wizard__title">
            Move {itemCount} item{itemCount === 1 ? '' : 's'}
          </h2>
          <button type="button" className="gis-fl-wizard__icon-btn" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden />
          </button>
        </header>

        <div className="gis-fl-wizard__body gis-fl-wizard__body--folder">
          <label className="gis-fl-wizard__field-label" htmlFor={selectId}>
            Destination folder
          </label>
          <select
            ref={selectRef}
            id={selectId}
            className="gis-fl-wizard__input"
            value={selectedFolderId}
            onChange={e => onFolderChange(e.target.value)}
          >
            {movableFolders.map(folder => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </div>

        <footer className="gis-fl-wizard__footer">
          <div className="gis-fl-wizard__footer-right gis-fl-wizard__footer-right--end">
            <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="gis-fl-wizard__btn gis-fl-wizard__btn--primary" onClick={onMove}>
              Move
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
