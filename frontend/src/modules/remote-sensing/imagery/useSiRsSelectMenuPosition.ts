import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

export type SiRsSelectMenuPositionOptions = {
  minWidth?: number
  maxHeightCap?: number
  /** Clamp menu + backdrop to this element’s screen rect (e.g. Develop Elite map viewport). */
  boundsRef?: RefObject<HTMLElement | null>
  edgePad?: number
}

type SiRsSelectMenuPositionResult = {
  menuStyle: CSSProperties
  backdropStyle: CSSProperties
}

const MENU_Z = 10050

function readBoundsRect(
  boundsRef: RefObject<HTMLElement | null> | undefined,
  edgePad: number,
): { left: number; top: number; right: number; bottom: number } {
  const el = boundsRef?.current
  if (el) {
    const b = el.getBoundingClientRect()
    return {
      left: b.left + edgePad,
      top: b.top + edgePad,
      right: b.right - edgePad,
      bottom: b.bottom - edgePad,
    }
  }
  const pad = edgePad
  return {
    left: pad,
    top: pad,
    right: window.innerWidth - pad,
    bottom: window.innerHeight - pad,
  }
}

/**
 * Fixed position for RS select menus portaled to document.body.
 * Avoids clipping by `.si-sat-ctx-panel-wrap { overflow: hidden }` so full provider/layer lists stay visible.
 */
export function useSiRsSelectMenuPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  options?: SiRsSelectMenuPositionOptions,
): SiRsSelectMenuPositionResult {
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [backdropStyle, setBackdropStyle] = useState<CSSProperties>({ position: 'fixed', inset: 0, zIndex: MENU_Z - 5 })
  const minWidth = options?.minWidth ?? 180
  const maxHeightCap = options?.maxHeightCap ?? 440
  const boundsRef = options?.boundsRef
  const edgePad = options?.edgePad ?? 8

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle({})
      setBackdropStyle({ position: 'fixed', inset: 0, zIndex: MENU_Z - 5 })
      return
    }

    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const bounds = readBoundsRect(boundsRef, edgePad)
      const gap = 4

      const spaceBelow = Math.max(0, bounds.bottom - r.bottom - gap)
      const spaceAbove = Math.max(0, r.top - bounds.top - gap)
      const openUp = spaceBelow < 120 && spaceAbove > spaceBelow
      const maxH = Math.min(maxHeightCap, Math.max(96, openUp ? spaceAbove : spaceBelow))

      const maxWidth = Math.max(120, bounds.right - bounds.left)
      const width = Math.min(maxWidth, Math.max(r.width, minWidth))
      const left = Math.min(Math.max(bounds.left, r.left), Math.max(bounds.left, bounds.right - width))

      setBackdropStyle({
        position: 'fixed',
        left: bounds.left - edgePad,
        top: bounds.top - edgePad,
        width: bounds.right - bounds.left + edgePad * 2,
        height: bounds.bottom - bounds.top + edgePad * 2,
        zIndex: MENU_Z - 5,
      })

      setMenuStyle({
        position: 'fixed',
        left,
        width,
        zIndex: MENU_Z,
        maxHeight: maxH,
        overflowY: 'auto',
        ...(openUp
          ? { bottom: window.innerHeight - r.top + gap, top: 'auto' }
          : { top: r.bottom + gap, bottom: 'auto' }),
      })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, triggerRef, minWidth, maxHeightCap, boundsRef, edgePad])

  return { menuStyle, backdropStyle }
}
