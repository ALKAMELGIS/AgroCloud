import { type RefObject, useEffect, useRef } from 'react'

/** Moderate airport-board scroll (~28 px/s). */
const TICKER_PX_PER_SEC = 28

type Options = {
  /** When list content is duplicated, loop at half scroll height for seamless scroll. */
  seamlessLoop?: boolean
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useWeatherLocationTicker(
  enabled: boolean,
  paused: boolean,
  listRef: RefObject<HTMLElement | null>,
  itemCount: number,
  options?: Options,
) {
  const rafRef = useRef(0)
  const lastTsRef = useRef(0)
  const seamlessLoop = options?.seamlessLoop ?? false

  useEffect(() => {
    if (!enabled || paused || prefersReducedMotion()) {
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

      const total = node.scrollHeight - node.clientHeight
      if (total > 6) {
        const last = lastTsRef.current || ts
        const dt = Math.min(ts - last, 48)
        lastTsRef.current = ts
        node.scrollTop += (TICKER_PX_PER_SEC * dt) / 1000

        if (seamlessLoop && node.scrollHeight > node.clientHeight * 1.5) {
          const segment = node.scrollHeight / 2
          if (node.scrollTop >= segment - 1) {
            node.scrollTop -= segment
            lastTsRef.current = ts
          }
        } else if (node.scrollTop >= total - 1) {
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
  }, [enabled, paused, itemCount, listRef, seamlessLoop])
}
