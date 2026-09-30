import { useEffect, useMemo, useState, type RefObject } from 'react'

const VIRTUALIZE_MIN_ROWS = 60
const DEFAULT_OVERSCAN = 8

export type VirtualRowSlice<T> = {
  visibleItems: Array<{ item: T; index: number }>
  paddingTop: number
  paddingBottom: number
  virtualized: boolean
}

/** Windowed slice for long field lists — keeps DOM light on large portfolios. */
export function useAcpVirtualRows<T>(
  items: T[],
  containerRef: RefObject<HTMLElement | null>,
  rowHeight: number,
): VirtualRowSlice<T> {
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const sync = () => {
      setScrollTop(el.scrollTop)
      setViewportHeight(el.clientHeight)
    }

    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [containerRef, items.length])

  return useMemo(() => {
    const virtualized = items.length >= VIRTUALIZE_MIN_ROWS
    if (!virtualized) {
      return {
        visibleItems: items.map((item, index) => ({ item, index })),
        paddingTop: 0,
        paddingBottom: 0,
        virtualized: false,
      }
    }

    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - DEFAULT_OVERSCAN)
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + DEFAULT_OVERSCAN * 2
    const end = Math.min(items.length, start + visibleCount)

    return {
      visibleItems: items.slice(start, end).map((item, i) => ({ item, index: start + i })),
      paddingTop: start * rowHeight,
      paddingBottom: Math.max(0, (items.length - end) * rowHeight),
      virtualized: true,
    }
  }, [items, scrollTop, viewportHeight, rowHeight])
}
