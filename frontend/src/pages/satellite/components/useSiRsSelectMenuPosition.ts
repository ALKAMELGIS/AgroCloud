import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

/**
 * Fixed position for RS select menus portaled to document.body.
 * Avoids clipping by `.si-sat-ctx-panel-wrap { overflow: hidden }` so full provider/layer lists stay visible.
 */
export function useSiRsSelectMenuPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  options?: { minWidth?: number; maxHeightCap?: number },
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({})
  const minWidth = options?.minWidth ?? 180
  const maxHeightCap = options?.maxHeightCap ?? 440

  useLayoutEffect(() => {
    if (!open) {
      setStyle({})
      return
    }

    const update = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const gap = 4
      const spaceBelow = window.innerHeight - r.bottom - gap - 8
      const spaceAbove = r.top - gap - 8
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
      const maxH = Math.min(maxHeightCap, Math.max(140, openUp ? spaceAbove : spaceBelow))
      const width = Math.max(r.width, minWidth)
      // Keep menu on-screen horizontally.
      const left = Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - width - 8))

      setStyle({
        position: 'fixed',
        left,
        width,
        zIndex: 10050,
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
  }, [open, triggerRef, minWidth, maxHeightCap])

  return style
}
