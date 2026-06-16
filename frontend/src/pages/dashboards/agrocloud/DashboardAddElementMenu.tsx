import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AGROCLOUD_DASHBOARD_ELEMENT_OPTIONS, type AgroCloudDashboardElementKind } from './agroCloudDashboardData'

export type DashboardAddElementMenuPlacement = 'rail' | 'below' | 'inline' | 'panel'

export type DashboardAddElementMenuProps = {
  open: boolean
  onClose: () => void
  onSelect: (kind: AgroCloudDashboardElementKind, label: string) => void
  className?: string
  anchorRef?: React.RefObject<HTMLElement | null>
  /** Rail = flyout beside sidebar; below = dropdown under + trigger; inline = in-panel dropdown. */
  placement?: DashboardAddElementMenuPlacement
}

const PORTAL_PLACEMENTS = new Set<DashboardAddElementMenuPlacement>(['rail', 'below'])

const MENU_WIDTH = 200
const MENU_GAP = 8
const VIEWPORT_MARGIN = 8

function computeRailMenuPosition(anchor: DOMRect, menuHeight: number): { top: number; left: number } {
  let left = anchor.right + MENU_GAP
  let top = anchor.top

  const maxLeft = window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN
  left = Math.min(Math.max(VIEWPORT_MARGIN, left), maxLeft)

  const maxTop = window.innerHeight - menuHeight - VIEWPORT_MARGIN
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, maxTop))

  return { top, left }
}

function computeBelowMenuPosition(anchor: DOMRect, menuHeight: number): { top: number; left: number } {
  let left = anchor.left + anchor.width / 2 - MENU_WIDTH / 2
  let top = anchor.bottom + MENU_GAP

  left = Math.min(Math.max(VIEWPORT_MARGIN, left), window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN)

  const maxTop = window.innerHeight - menuHeight - VIEWPORT_MARGIN
  top = Math.max(VIEWPORT_MARGIN, Math.min(top, maxTop))

  return { top, left }
}

export function DashboardAddElementMenu({
  open,
  onClose,
  onSelect,
  className,
  anchorRef,
  placement = anchorRef ? 'rail' : 'inline',
}: DashboardAddElementMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)

  const updateMenuPosition = () => {
    const anchor = anchorRef?.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const menuHeight = wrapRef.current?.offsetHeight ?? 320
    if (placement === 'below') {
      setMenuPos(computeBelowMenuPosition(rect, menuHeight))
      return
    }
    setMenuPos(computeRailMenuPosition(rect, menuHeight))
  }

  useLayoutEffect(() => {
    if (!open || !PORTAL_PLACEMENTS.has(placement) || !anchorRef?.current) {
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
  }, [open, placement, anchorRef])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
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

  const menuClass = [
    'agrocloud-dashboard-editor__add-menu',
    placement === 'inline' ? 'agrocloud-dashboard-editor__add-menu--inline' : '',
    placement === 'panel' ? 'agrocloud-dashboard-editor__add-menu--panel' : '',
    placement === 'rail' ? 'agrocloud-dashboard-editor__add-menu--fixed' : '',
    placement === 'below' ? 'agrocloud-dashboard-editor__add-menu--fixed agrocloud-dashboard-editor__add-menu--below' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const menu = (
    <div
      ref={wrapRef}
      className={menuClass}
      role="menu"
      style={
        PORTAL_PLACEMENTS.has(placement)
          ? {
              top: menuPos?.top ?? -9999,
              left: menuPos?.left ?? -9999,
              width: MENU_WIDTH,
              visibility: menuPos ? 'visible' : 'hidden',
            }
          : undefined
      }
    >
      {AGROCLOUD_DASHBOARD_ELEMENT_OPTIONS.map(opt => (
        <button
          key={opt.kind}
          type="button"
          role="menuitem"
          className="agrocloud-dashboard-editor__add-menu-item"
          onClick={() => {
            onSelect(opt.kind, opt.label)
            onClose()
          }}
        >
          <i className={opt.icon} aria-hidden />
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  )

  if (PORTAL_PLACEMENTS.has(placement) && typeof document !== 'undefined') {
    return createPortal(menu, document.body)
  }

  return menu
}
