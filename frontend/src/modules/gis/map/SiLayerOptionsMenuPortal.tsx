import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './SiLayerOptionsMenu.css'

export function SiLayerOptionsMenuPortal({
  open,
  layerLabel,
  onToggleOpen,
  children,
}: {
  open: boolean
  layerLabel: string
  onToggleOpen: () => void
  children: ReactNode
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; maxHeight: number } | null>(null)

  const place = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const width = 224
    const margin = 8
    const gap = 6
    const measured = popRef.current?.scrollHeight ?? 0
    const estHeight = Math.min(Math.max(measured || 380, 220), window.innerHeight - margin * 2)
    let left = r.right - width
    if (left < margin) left = margin
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width

    const spaceBelow = window.innerHeight - r.bottom - gap - margin
    const spaceAbove = r.top - gap - margin
    let top: number
    let maxHeight: number
    if (estHeight <= spaceBelow || spaceBelow >= spaceAbove) {
      top = r.bottom + gap
      maxHeight = Math.max(160, Math.min(estHeight, spaceBelow))
    } else {
      maxHeight = Math.max(160, Math.min(estHeight, spaceAbove))
      top = Math.max(margin, r.top - gap - maxHeight)
    }
    setCoords({ top, left, maxHeight })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
    else setCoords(null)
  }, [open, place])

  useLayoutEffect(() => {
    if (!open) return
    const el = popRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => place())
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onReflow = () => place()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, place])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={'si-env-layer-action-btn si-env-layer-action-btn--menu' + (open ? ' is-active' : '')}
        title="Layer options (zoom, table, symbology, pop-ups, opacity, order...)"
        aria-label={`Layer options for ${layerLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={e => {
          e.stopPropagation()
          onToggleOpen()
        }}
      >
        <i className="fa-solid fa-ellipsis" aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={popRef}
              className="si-env-layer-options-menu si-env-layer-options-menu--floating"
              role="menu"
              style={{
                position: 'fixed',
                top: coords ? coords.top : -9999,
                left: coords ? coords.left : -9999,
                maxHeight: coords ? coords.maxHeight : undefined,
                visibility: coords ? 'visible' : 'hidden',
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

export function SiLayerOptionsMenuItem({
  label,
  icon,
  onSelect,
  danger,
  disabled,
  hint,
}: {
  label: string
  icon: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={
        'si-env-layer-options-menu__item' +
        (danger ? ' si-env-layer-options-menu__item--danger' : '') +
        (disabled ? ' si-env-layer-options-menu__item--disabled' : '')
      }
      disabled={disabled}
      title={hint}
      onClick={e => {
        e.stopPropagation()
        if (!disabled) onSelect()
      }}
    >
      <i className={icon} aria-hidden />
      <span>{label}</span>
    </button>
  )
}

export function SiLayerOptionsMenuSep() {
  return <div className="si-env-layer-options-menu__sep" role="separator" />
}
