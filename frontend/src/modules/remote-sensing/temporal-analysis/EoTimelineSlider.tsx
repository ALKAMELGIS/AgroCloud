import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { advanceEoTimelineFraction } from './siEoTimelinePlayback'

/** Fraction along timeline [0,1] → discrete step index (inclusive endpoints). */
export function eoTimelineIndexFromFraction(fraction: number, stepCount: number): number {
  if (stepCount <= 1) return 0
  const maxIndex = stepCount - 1
  const t = Math.max(0, Math.min(1, fraction))
  return Math.round(t * maxIndex)
}

export function eoTimelineFractionFromIndex(index: number, stepCount: number): number {
  if (stepCount <= 1) return 1
  const maxIndex = stepCount - 1
  const i = Math.max(0, Math.min(maxIndex, index))
  return i / maxIndex
}

export function eoTimelineFractionFromClientX(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
): number {
  if (trackWidth <= 0) return 0
  return Math.max(0, Math.min(1, (clientX - trackLeft) / trackWidth))
}

export type SiEoTimelineSliderStep = {
  id: string
  shortLabel: string
  fullDate: string
  mean?: number
}

type Props = {
  steps: SiEoTimelineSliderStep[]
  activeIndex: number
  onSelectIndex: (index: number) => void
  playing?: boolean
  /** Time to travel one gap between reference dates. The thumb does not dwell on the date. */
  playbackMs?: number
  onScrubStart?: () => void
  onScrubFraction?: (fraction: number) => void
  /** Pointer-up. Fraction is the exact 0–1 position, not a snapped date index. */
  onScrubEnd?: (fraction: number) => void
  /** Fired every animation frame while playing. Parent must not re-render the page from this. */
  onPlayProgress?: (fraction: number) => void
  /** @deprecated Play movement is owned by this slider. Kept so older callers still mount. */
  onBindVisualFraction?: (sink: ((fraction: number | null) => void) | null) => void
}

/** EO imagery timeline scrubber (Windows-safe module name — avoid `SiEoTimelineSlider` / `.ts` clash). */
export function SiEoTimelineSlider({
  steps,
  activeIndex,
  onSelectIndex,
  playing = false,
  playbackMs = 1400,
  onScrubStart,
  onScrubFraction,
  onScrubEnd,
  onPlayProgress,
  onBindVisualFraction,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const thumbRef = useRef<HTMLDivElement | null>(null)
  const fillRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dragFraction, setDragFraction] = useState<number | null>(null)
  const [heldFraction, setHeldFraction] = useState<number | null>(null)
  const playFractionRef = useRef<number | null>(null)
  const heldFractionRef = useRef<number | null>(null)
  const countRef = useRef(0)
  const activeIndexRef = useRef(activeIndex)
  const playbackMsRef = useRef(playbackMs)
  playbackMsRef.current = playbackMs
  const onPlayProgressRef = useRef(onPlayProgress)
  onPlayProgressRef.current = onPlayProgress
  const lastCommittedRef = useRef(activeIndex)
  const ignoreIndexSyncRef = useRef(false)
  const externalIndexRef = useRef(activeIndex)
  void onSelectIndex
  const rafRef = useRef(0)
  const onScrubFractionRef = useRef(onScrubFraction)
  onScrubFractionRef.current = onScrubFraction
  const onScrubEndRef = useRef(onScrubEnd)
  onScrubEndRef.current = onScrubEnd

  const paintThumb = (fraction: number) => {
    const clamped = Math.max(0, Math.min(1, fraction))
    const pct = clamped * 100
    if (thumbRef.current) thumbRef.current.style.left = `${pct}%`
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${clamped})`
    const track = trackRef.current
    if (track) {
      const shown = String(Math.round(pct))
      track.setAttribute('aria-valuenow', shown)
      track.setAttribute('aria-valuetext', `${shown}%`)
    }
  }

  useEffect(() => {
    if (!playing) return
    const countNow = countRef.current
    const max = Math.max(1, countNow - 1)
    let fraction =
      heldFractionRef.current ??
      playFractionRef.current ??
      Math.max(0, Math.min(max, activeIndexRef.current)) / max
    let lastTs = 0
    let rafId = 0
    const frame = (ts: number) => {
      if (!lastTs) lastTs = ts
      const dt = ts - lastTs
      lastTs = ts
      fraction = advanceEoTimelineFraction(fraction, countRef.current, dt, playbackMsRef.current)
      playFractionRef.current = fraction
      paintThumb(fraction)
      try {
        onPlayProgressRef.current?.(fraction)
      } catch {
        /* The thumb keeps moving even if a layer update fails. */
      }
      rafId = requestAnimationFrame(frame)
    }
    rafId = requestAnimationFrame(frame)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      const last = playFractionRef.current
      if (last != null) {
        ignoreIndexSyncRef.current = true
        heldFractionRef.current = last
        setHeldFraction(last)
      }
    }
  }, [playing])

  useEffect(() => {
    if (!onBindVisualFraction) return
    onBindVisualFraction(null)
    return () => onBindVisualFraction(null)
  }, [onBindVisualFraction])
  const pendingClientXRef = useRef<number | null>(null)

  const count = steps.length
  countRef.current = count
  activeIndexRef.current = activeIndex
  const maxIndex = Math.max(0, count - 1)
  const safeActive = Math.max(0, Math.min(maxIndex, activeIndex))

  useEffect(() => {
    lastCommittedRef.current = safeActive
    if (ignoreIndexSyncRef.current) {
      ignoreIndexSyncRef.current = false
      externalIndexRef.current = safeActive
      return
    }
    if (playing || dragging) return
    if (externalIndexRef.current === safeActive) return
    externalIndexRef.current = safeActive
    heldFractionRef.current = null
    setHeldFraction(null)
  }, [safeActive, playing, dragging])

  const parkedFraction = heldFraction ?? eoTimelineFractionFromIndex(safeActive, count)
  const fraction =
    dragging && dragFraction != null
      ? dragFraction
      : playing && playFractionRef.current != null
        ? playFractionRef.current
        : parkedFraction
  const progressNow = Math.round(Math.max(0, Math.min(1, fraction)) * 100)

  const applyClientX = useCallback(
    (clientX: number, commit: boolean) => {
      const track = trackRef.current
      if (!track || count <= 0) return
      const rect = track.getBoundingClientRect()
      const frac = eoTimelineFractionFromClientX(clientX, rect.left, rect.width)
      setDragFraction(frac)
      heldFractionRef.current = frac
      paintThumb(frac)
      onScrubFractionRef.current?.(frac)
      if (!commit) return
      ignoreIndexSyncRef.current = true
      setHeldFraction(frac)
      onScrubEndRef.current?.(frac)
    },
    [count, onSelectIndex],
  )

  const scheduleApply = useCallback(
    (clientX: number, commit: boolean) => {
      pendingClientXRef.current = clientX
      if (rafRef.current) return
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = 0
        const x = pendingClientXRef.current
        if (x == null) return
        applyClientX(x, commit)
      })
    },
    [applyClientX],
  )

  useEffect(
    () => () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (count <= 1) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    setDragging(true)
    setDragFraction(null)
    onScrubStart?.()
    e.currentTarget.setPointerCapture(e.pointerId)
    scheduleApply(e.clientX, false)
  }

  const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    e.preventDefault()
    scheduleApply(e.clientX, false)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    const x = pendingClientXRef.current
    setDragging(false)
    setDragFraction(null)
    if (x != null) applyClientX(x, true)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const nudgeFraction = (next: number) => {
    const frac = Math.max(0, Math.min(1, next))
    ignoreIndexSyncRef.current = true
    heldFractionRef.current = frac
    setHeldFraction(frac)
    paintThumb(frac)
    onScrubFractionRef.current?.(frac)
    onScrubEndRef.current?.(frac)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (count <= 1) return
    const current = heldFractionRef.current ?? fraction
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      nudgeFraction(current - 0.01)
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      nudgeFraction(current + 0.01)
    } else if (e.key === 'Home') {
      e.preventDefault()
      nudgeFraction(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      nudgeFraction(1)
    }
  }

  const rangeStart = steps[0]?.fullDate ?? '—'
  const rangeEnd = steps[count - 1]?.fullDate ?? '—'
  const ariaValueText = `${progressNow}%`

  return (
    <div className="si-eo-timeline-slider">
      <div className="si-eo-timeline-slider__range-labels" aria-hidden>
        <span title={rangeStart}>{rangeStart}</span>
        <span title={rangeEnd}>{rangeEnd}</span>
      </div>
      <div
        ref={trackRef}
        className={[
          'si-eo-timeline-slider__track',
          dragging ? 'is-dragging' : '',
          playing ? 'is-playing' : '',
          count <= 1 ? 'is-single' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressNow}
        aria-valuetext={ariaValueText}
        aria-label="Imagery timeline"
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div className="si-eo-timeline-slider__rail" aria-hidden />
        <div
          ref={fillRef}
          className="si-eo-timeline-slider__fill"
          style={{ transform: `scaleX(${fraction})` }}
          aria-hidden
        />
        {count > 1
          ? steps.map((step, i) => {
              const leftPct = eoTimelineFractionFromIndex(i, count) * 100
              return (
                <span
                  key={step.id}
                  className="si-eo-timeline-slider__tick"
                  style={{ left: `${leftPct}%` }}
                  title={
                    step.mean != null
                      ? `${step.fullDate} · mean ≈ ${step.mean.toFixed(3)}`
                      : step.fullDate
                  }
                />
              )
            })
          : null}
        <div
          ref={thumbRef}
          className="si-eo-timeline-slider__thumb"
          style={{ left: `${fraction * 100}%` }}
          aria-hidden
        />
      </div>
    </div>
  )
}
