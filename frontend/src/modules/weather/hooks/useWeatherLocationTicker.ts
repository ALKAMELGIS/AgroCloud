import { type RefObject, useEffect, useRef } from 'react'

/** Moderate airport-board scroll — steady, not too fast. */
const TICKER_PX_PER_SEC = 24

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
  const scrollRemainderRef = useRef(0)
  const seamlessLoop = options?.seamlessLoop ?? false

  useEffect(() => {
    if (!enabled || paused || prefersReducedMotion()) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      lastTsRef.current = 0
      scrollRemainderRef.current = 0
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
        const dt = Math.min(Math.max(ts - last, 0), 32)
        lastTsRef.current = ts
        const delta = (TICKER_PX_PER_SEC * dt) / 1000 + scrollRemainderRef.current
        const pixels = delta >= 1 ? Math.floor(delta) : 0
        scrollRemainderRef.current = delta - pixels
        if (pixels > 0) node.scrollTop += pixels

        if (seamlessLoop && node.scrollHeight > node.clientHeight * 1.5) {
          const segment = node.scrollHeight / 2
          if (node.scrollTop >= segment) {
            node.scrollTop -= segment
          }
        } else if (node.scrollTop >= total - 0.5) {
          node.scrollTop = 0
          scrollRemainderRef.current = 0
        }
      }

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      lastTsRef.current = 0
      scrollRemainderRef.current = 0
    }
  }, [enabled, paused, itemCount, listRef, seamlessLoop])
}
