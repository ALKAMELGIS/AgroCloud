import { useEffect, useRef } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  onSave: () => void
  onSaveAs: () => void
  anchorRef?: React.RefObject<HTMLElement | null>
}

export function AgroCloudDashboardSaveFlyout({ open, onClose, onSave, onSaveAs, anchorRef }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (anchorRef?.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={menuRef}
      className="agrocloud-dashboard-editor__save-flyout"
      role="menu"
      aria-label="Save options"
    >
      <button
        type="button"
        role="menuitem"
        className="agrocloud-dashboard-editor__save-flyout-item"
        onClick={() => {
          onClose()
          onSave()
        }}
      >
        <i className="fa-solid fa-floppy-disk" aria-hidden />
        Save
      </button>
      <button
        type="button"
        role="menuitem"
        className="agrocloud-dashboard-editor__save-flyout-item"
        onClick={() => {
          onClose()
          void onSaveAs()
        }}
      >
        <i className="fa-solid fa-floppy-disk" aria-hidden />
        Save as
      </button>
    </div>
  )
}
