import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Medium–slow airport-board scroll (~26px/s). */
const DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC = 26

function listMaxScroll(el: HTMLUListElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

export function useDevelopEliteListAutoScroll(
  listRef: RefObject<HTMLUListElement | null>,
  playing: boolean,
) {
  useLayoutEffect(() => {
    if (!playing) return
    const el = listRef.current
    if (!el) return

    let raf = 0
    let last = performance.now()
    let layoutWaitSec = 0

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.12)
      last = now
      const max = listMaxScroll(el)
      if (max <= 1) {
        layoutWaitSec += dt
        if (layoutWaitSec < 3) {
          void el.offsetHeight
        }
      } else {
        layoutWaitSec = 0
        let next = el.scrollTop + DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC * dt
        if (next >= max - 0.5) {
          el.scrollTop = 0
        } else {
          el.scrollTop = next
        }
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
      if (!playing) return
      void el.offsetHeight
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [playing, listRef])
}

export function useDevelopEliteAirportListTicker(searchQuery: string) {
  const [playing, setPlaying] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  const tickerActive = playing && !searchQuery.trim()

  useDevelopEliteListAutoScroll(listRef, playing)

  useEffect(() => {
    if (searchQuery.trim()) {
      setPlaying(false)
    }
  }, [searchQuery])

  const togglePlaying = useCallback(() => {
    setPlaying(prev => {
      const next = !prev
      if (next && listRef.current) {
        listRef.current.scrollTop = 0
      }
      return next
    })
  }, [])

  return { playing, togglePlaying, tickerActive, listRef }
}
