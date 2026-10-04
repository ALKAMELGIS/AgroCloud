import { useEffect, useRef } from 'react'
import type { DevelopEliteGridWidgetMenuAction } from './developEliteGridWidgetActions'

type Props = {
  open: boolean
  onClose: () => void
  onAction: (action: DevelopEliteGridWidgetMenuAction) => void
}

const ITEMS: Array<{ action: DevelopEliteGridWidgetMenuAction; label: string; icon: string }> = [
  { action: 'configure', label: 'Configure', icon: 'fa-gear' },
  { action: 'duplicate', label: 'Duplicate', icon: 'fa-clone' },
  { action: 'delete', label: 'Delete', icon: 'fa-trash-can' },
]

export function DevelopEliteGridWidgetMenu({ open, onClose, onAction }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={menuRef} className="develop-elite-grid-item__menu" role="menu">
      {ITEMS.map(item => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={`develop-elite-grid-item__menu-item${item.action === 'delete' ? ' is-danger' : ''}`}
          onClick={e => {
            e.stopPropagation()
            onAction(item.action)
            onClose()
          }}
        >
          <i className={`fa-solid ${item.icon}`} aria-hidden />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
