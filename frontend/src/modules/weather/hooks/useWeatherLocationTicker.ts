import { type RefObject, useEffect, useRef } from 'react'

/** Moderate–slow airport-board scroll (~30 px/s). */
const TICKER_PX_PER_SEC = 30

export function useWeatherLocationTicker(
  enabled: boolean,
  paused: boolean,
  listRef: RefObject<HTMLElement | null>,
  itemCount: number,
) {
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)

  useEffect(() => {
    if (!enabled || paused) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      lastTsRef.current = 0
      return
    }

    const el = listRef.current
    if (!el || itemCount < 2) return

    const step = (ts: number) => {
      const node = listRef.current
      if (!node) return

      const maxScroll = node.scrollHeight - node.clientHeight
      if (maxScroll > 6) {
        const last = lastTsRef.current || ts
        const dt = Math.min(ts - last, 48)
        lastTsRef.current = ts
        node.scrollTop += (TICKER_PX_PER_SEC * dt) / 1000
        if (node.scrollTop >= maxScroll - 1) {
          node.scrollTop = 0
          lastTsRef.current = ts
        }
      }

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      lastTsRef.current = 0
    }
  }, [enabled, paused, itemCount, listRef])
}
