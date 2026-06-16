import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

type GisMapSaveOpenFlyoutProps = {
  open: boolean
  anchorRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  onSave: () => void
  onSaveAs: () => void
  onNewMap: () => void
  onOpenMap: () => void
}

const MENU_ITEMS: { id: string; label: string; icon: string; action: 'save' | 'saveAs' | 'newMap' | 'openMap' }[] = [
  { id: 'save', label: 'Save', icon: 'fa-solid fa-floppy-disk', action: 'save' },
  { id: 'save-as', label: 'Save as', icon: 'fa-solid fa-floppy-disk', action: 'saveAs' },
  { id: 'new-map', label: 'New map', icon: 'fa-regular fa-map', action: 'newMap' },
  { id: 'open-map', label: 'Open map', icon: 'fa-solid fa-folder-open', action: 'openMap' },
]

export function GisMapSaveOpenFlyout({
  open,
  anchorRef,
  onClose,
  onSave,
  onSaveAs,
  onNewMap,
  onOpenMap,
}: GisMapSaveOpenFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  const reposition = () => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
    setPos({
      top: rect.top,
      left: rtl ? rect.left : rect.right,
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onResize = () => reposition()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, anchorRef])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (flyoutRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
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
  }, [open, onClose, anchorRef])

  const runMenuAction = (action: (typeof MENU_ITEMS)[number]['action']) => {
    switch (action) {
      case 'save':
        onSave()
        break
      case 'saveAs':
        onSaveAs()
        break
      case 'newMap':
        onNewMap()
        break
      case 'openMap':
        onOpenMap()
        break
    }
  }

  if (!open || typeof document === 'undefined') return null

  const rtl = document.documentElement.dir === 'rtl'

  return createPortal(
    <div
      ref={flyoutRef}
      className="gis-save-open-flyout"
      style={{
        top: pos.top,
        left: pos.left,
        transform: rtl ? 'translateX(-100%)' : undefined,
      }}
      role="menu"
      aria-label="Save and open"
    >
      {MENU_ITEMS.map(item => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="gis-save-open-flyout__menu-item"
          onClick={() => runMenuAction(item.action)}
        >
          <i className={item.icon} aria-hidden />
          <span>{item.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  )
}

/** @deprecated Use GisMapSaveOpenFlyout */
export const GisMapSaveOpenPanel = GisMapSaveOpenFlyout
