import { useEffect, useRef, useState } from 'react'

export type GisPortalFolderOptionsMenuProps = {
  disabled?: boolean
  canEditFolder: boolean
  testId?: string
  onEdit: () => void
  onDelete: () => void
}

export function GisPortalFolderOptionsMenu({
  disabled = false,
  canEditFolder,
  testId = 'gis-portal-folder-options-btn',
  onEdit,
  onDelete,
}: GisPortalFolderOptionsMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="gis-portal-folder-options-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`gis-portal-folder-options-btn${open ? ' gis-portal-folder-options-btn--active' : ''}`}
        title="Folder options"
        aria-label="Folder options"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        data-testid={testId}
        onClick={() => setOpen(o => !o)}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden />
      </button>
      {open ? (
        <div className="gis-portal-folder-options-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="gis-portal-folder-options-menu__item"
            disabled={!canEditFolder}
            onClick={() => {
              if (!canEditFolder) return
              setOpen(false)
              onEdit()
            }}
          >
            <i className="fa-solid fa-pen" aria-hidden />
            <span>Edit folder</span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="gis-portal-folder-options-menu__item gis-portal-folder-options-menu__item--danger"
            disabled={!canEditFolder}
            onClick={() => {
              if (!canEditFolder) return
              setOpen(false)
              onDelete()
            }}
          >
            <i className="fa-solid fa-trash-can" aria-hidden />
            <span>Delete folder</span>
          </button>
        </div>
      ) : null}
    </div>
  )
}
