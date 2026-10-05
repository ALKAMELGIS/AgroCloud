import { useEffect, useRef, useState, type RefObject } from 'react'

/** Medium–slow airport-board scroll (~26px/s). */
const DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC = 26

export function useDevelopEliteListAutoScroll(
  listRef: RefObject<HTMLUListElement | null>,
  playing: boolean,
) {
  useEffect(() => {
    if (!playing) return
    const el = listRef.current
    if (!el) return

    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.12)
      last = now
      const max = el.scrollHeight - el.clientHeight
      if (max > 2) {
        let next = el.scrollTop + DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC * dt
        if (next >= max) {
          el.scrollTop = 0
        } else {
          el.scrollTop = next
        }
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, listRef])
}

export function useDevelopEliteAirportListTicker(searchQuery: string) {
  const [playing, setPlaying] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)

  const tickerActive = playing && !searchQuery.trim()

  useDevelopEliteListAutoScroll(listRef, tickerActive)

  useEffect(() => {
    if (searchQuery.trim()) {
      setPlaying(false)
    }
  }, [searchQuery])

  const togglePlaying = () => setPlaying(prev => !prev)

  return { playing, togglePlaying, tickerActive, listRef }
}
