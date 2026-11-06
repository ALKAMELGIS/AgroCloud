import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Medium–slow airport-board scroll (~24px/s). */
const DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC = 24

function listMaxScroll(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

/** Duplicate rows for seamless airport-board loop (only while ticker runs). */
export function developEliteAirportTickerRows<T>(rows: T[], tickerActive: boolean): T[] {
  if (!tickerActive || rows.length < 2) return rows
  return [...rows, ...rows]
}

export function developEliteAirportTickerLoopHeight(scrollHeight: number, loopHalf: boolean): number {
  if (scrollHeight <= 1) return 0
  return loopHalf ? scrollHeight / 2 : scrollHeight
}

function clearTrackTransform(track: HTMLElement) {
  track.style.transform = ''
  track.style.willChange = ''
}

export function useDevelopEliteListAutoScroll(
  listRef: RefObject<HTMLUListElement | null>,
  viewportRef: RefObject<HTMLDivElement | null> | null,
  active: boolean,
  pausedRef: RefObject<boolean>,
  itemCount: number,
) {
  useLayoutEffect(() => {
    if (!active) return
    const track = listRef.current
    if (!track) return
    const viewport = viewportRef?.current ?? null
    const useTransform = viewport != null

    let raf = 0
    let last = performance.now()
    let offset = 0
    let layoutWaitSec = 0

    const loopHalf = track.dataset.tickerLoop === 'half'

    const measureLoopMax = (): number => {
      if (useTransform) {
        return developEliteAirportTickerLoopHeight(track.scrollHeight, loopHalf)
      }
      const max = listMaxScroll(track)
      return loopHalf && max > 2 ? max / 2 : max
    }

    const applyTransform = () => {
      track.style.willChange = 'transform'
      track.style.transform = `translate3d(0, ${-offset}px, 0)`
    }

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.12)
      last = now

      if (pausedRef.current) {
        raf = requestAnimationFrame(tick)
        return
      }

      const loopMax = measureLoopMax()
      if (loopMax <= 1) {
        layoutWaitSec += dt
        if (layoutWaitSec < 6) {
          void track.offsetHeight
        }
        raf = requestAnimationFrame(tick)
        return
      }
      layoutWaitSec = 0

      if (useTransform) {
        offset += DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC * dt
        if (offset >= loopMax - 0.5) {
          offset = 0
        }
        applyTransform()
      } else {
        let next = track.scrollTop + DEVELOP_ELITE_LIST_SCROLL_PX_PER_SEC * dt
        if (next >= loopMax - 0.5) {
          track.scrollTop = 0
        } else {
          track.scrollTop = next
        }
      }
      raf = requestAnimationFrame(tick)
    }

    const start = () => {
      cancelAnimationFrame(raf)
      offset = 0
      last = performance.now()
      layoutWaitSec = 0
      if (useTransform) {
        clearTrackTransform(track)
      }
      raf = requestAnimationFrame(tick)
    }

    start()

    const ro = new ResizeObserver(() => {
      if (!active) return
      void track.offsetHeight
    })
    ro.observe(track)
    if (viewport) ro.observe(viewport)

    const mo = new MutationObserver(() => {
      if (!active) return
      void track.offsetHeight
    })
    mo.observe(track, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      ro.disconnect()
      cancelAnimationFrame(raf)
      clearTrackTransform(track)
    }
  }, [active, itemCount, listRef, pausedRef, viewportRef])
}

type TickerOptions = {
  /** Clip list in a viewport and scroll via transform (reliable in grid sidebars). */
  clipViewport?: boolean
}

export function useDevelopEliteAirportListTicker(
  searchQuery: string,
  itemCount = 0,
  options?: TickerOptions,
) {
  const [playing, setPlaying] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const pausedByHoverRef = useRef(false)
  const clipViewport = options?.clipViewport ?? false

  const tickerActive = playing && !searchQuery.trim()

  useDevelopEliteListAutoScroll(
    listRef,
    clipViewport ? viewportRef : null,
    tickerActive,
    pausedByHoverRef,
    itemCount,
  )

  useEffect(() => {
    if (searchQuery.trim()) {
      setPlaying(false)
    }
  }, [searchQuery])

  useEffect(() => {
    if (!tickerActive) {
      pausedByHoverRef.current = false
    }
  }, [tickerActive])

  const togglePlaying = useCallback(() => {
    setPlaying(prev => {
      const next = !prev
      if (next && listRef.current) {
        listRef.current.scrollTop = 0
        listRef.current.style.transform = ''
      }
      return next
    })
  }, [])

  const onTickerPointerEnter = useCallback(() => {
    pausedByHoverRef.current = true
  }, [])

  const onTickerPointerLeave = useCallback(() => {
    pausedByHoverRef.current = false
  }, [])

  return {
    playing,
    togglePlaying,
    tickerActive,
    listRef,
    viewportRef: clipViewport ? viewportRef : undefined,
    tickerHoverHandlers: {
      onMouseEnter: onTickerPointerEnter,
      onMouseLeave: onTickerPointerLeave,
    },
  }
}
