import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Medium–slow airport-board scroll (~22px/s). */
export const DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC = 22

function listContentHeight(listEl: HTMLElement): number {
  return listEl.offsetHeight
}

/** Duplicate rows for seamless airport-board loop (only while ticker runs). */
export function developEliteAirportTickerRows<T>(rows: T[], tickerActive: boolean): T[] {
  if (!tickerActive || rows.length < 2) return rows
  return [...rows, ...rows]
}

export function useDevelopEliteListAutoScroll(
  viewportRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLUListElement | null>,
  active: boolean,
  itemCount: number,
  loopHalf: boolean,
) {
  const offsetRef = useRef(0)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const list = listRef.current
    if (!active || !viewport || !list) {
      if (list) list.style.transform = ''
      offsetRef.current = 0
      return
    }

    let raf = 0
    let last = performance.now()
    let layoutWaitSec = 0

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.12)
      last = now
      const contentH = listContentHeight(list)
      const viewH = viewport.clientHeight
      const loopEnd = loopHalf ? contentH / 2 : Math.max(0, contentH - viewH)
      if (loopHalf && contentH / 2 <= 1) {
        layoutWaitSec += dt
        if (layoutWaitSec < 6) void list.offsetHeight
        list.style.transform = ''
        offsetRef.current = 0
      } else if (!loopHalf && loopEnd <= 1) {
        layoutWaitSec += dt
        if (layoutWaitSec < 6) void list.offsetHeight
        list.style.transform = ''
        offsetRef.current = 0
      } else {
        layoutWaitSec = 0
        let next = offsetRef.current + DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC * dt
        if (next >= loopEnd - 0.5) {
          next = 0
        }
        offsetRef.current = next
        list.style.transform = `translate3d(0, ${-next}px, 0)`
      }
      raf = requestAnimationFrame(tick)
    }

    const start = () => {
      cancelAnimationFrame(raf)
      last = performance.now()
      layoutWaitSec = 0
      raf = requestAnimationFrame(tick)
    }

    start()
    const ro = new ResizeObserver(() => {
      if (!active) return
      void list.offsetHeight
    })
    ro.observe(viewport)
    ro.observe(list)
    const mo = new MutationObserver(() => {
      if (!active) return
      void list.offsetHeight
    })
    mo.observe(list, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      ro.disconnect()
      cancelAnimationFrame(raf)
      list.style.transform = ''
      offsetRef.current = 0
    }
  }, [active, itemCount, loopHalf, listRef, viewportRef])
}

export function useDevelopEliteAirportListTicker(searchQuery: string, itemCount = 0) {
  const [playing, setPlaying] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const tickerActive = playing && !searchQuery.trim()
  const loopHalf = tickerActive && itemCount >= 2

  useDevelopEliteListAutoScroll(viewportRef, listRef, tickerActive, itemCount, loopHalf)

  useEffect(() => {
    if (searchQuery.trim()) {
      setPlaying(false)
    }
  }, [searchQuery])

  const togglePlaying = useCallback(() => {
    setPlaying(prev => !prev)
  }, [])

  return { playing, togglePlaying, tickerActive, viewportRef, listRef }
}
