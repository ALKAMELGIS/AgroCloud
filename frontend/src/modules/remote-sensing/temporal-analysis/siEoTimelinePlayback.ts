/**
 * EO imagery timeline playback — rAF stepping and adjacent WMS tile warm-cache.
 */

export type SiEoWeeklyWindow = {
  weekIndex: number
  startDate: string
  endDate: string
}

export type SiEoRollingDateEntry = { full: Date }

/** Index of the weekly window containing `selectedIso`, or 0 if none match. */
export function resolveEoWeeklyCompositeIndex(
  weekly: SiEoWeeklyWindow[],
  selectedIso: string,
): number {
  if (!weekly.length) return 0
  const iso = String(selectedIso || '').trim().slice(0, 10)
  const hit = weekly.findIndex(w => iso >= w.startDate && iso <= w.endDate)
  return hit < 0 ? 0 : hit
}

export function stepEoWeeklyCompositeIndex(
  weekly: SiEoWeeklyWindow[],
  selectedIso: string,
  dir: -1 | 1,
): number {
  if (!weekly.length) return 0
  const i = resolveEoWeeklyCompositeIndex(weekly, selectedIso)
  return (i + dir + weekly.length) % weekly.length
}

export function stepEoRollingDateIndex(
  dates: SiEoRollingDateEntry[],
  selected: Date,
  dir: -1 | 1,
): number {
  if (!dates.length) return 0
  let index = dates.findIndex(d => d.full.toDateString() === selected.toDateString())
  if (index === -1) index = 0
  return (index + dir + dates.length) % dates.length
}

export type SiEoTimelineBlend = {
  fromIndex: number
  toIndex: number
  /** 0 = fully the earlier date, 1 = fully the later date. */
  t: number
}

/**
 * Continuous scrub position → the two nearest dates and the mix between them.
 * Endpoints stay on a single date (`t === 0`).
 */
export function eoTimelineBlendFromFraction(stepCount: number, fraction: number): SiEoTimelineBlend {
  if (stepCount <= 1) return { fromIndex: 0, toIndex: 0, t: 0 }
  const maxIndex = stepCount - 1
  const x = Math.max(0, Math.min(1, fraction)) * maxIndex
  const fromIndex = Math.min(maxIndex, Math.floor(x))
  const toIndex = Math.min(maxIndex, fromIndex + 1)
  const t = toIndex === fromIndex ? 0 : x - fromIndex
  return { fromIndex, toIndex, t }
}

/**
 * Move a 0–1 playhead by real elapsed time.
 * `stepIntervalMs` is the time to travel one gap between dates, not a dwell on a date.
 * The result wraps into [0, 1) so playback loops without pausing on an index.
 */
export function advanceEoTimelineFraction(
  fraction: number,
  stepCount: number,
  dtMs: number,
  stepIntervalMs: number,
): number {
  if (stepCount <= 1) return 0
  const duration = Math.max(48, stepIntervalMs) * (stepCount - 1)
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0
  const base = Number.isFinite(fraction) ? fraction : 0
  let next = base + dt / duration
  if (next >= 1) next %= 1
  if (next < 0) next = 0
  return next
}

export type SiEoTimelineRafLoopOptions = {
  isActive: () => boolean
  getStepIntervalMs: () => number
  onStep: () => void
}

/**
 * Fixed-interval steps driven by requestAnimationFrame (smooth UI thread, no setInterval drift).
 */
export function runSiEoTimelineRafLoop(options: SiEoTimelineRafLoopOptions): () => void {
  let rafId = 0
  let lastTs = 0
  let accMs = 0

  const frame = (ts: number) => {
    if (!options.isActive()) return
    if (!lastTs) lastTs = ts
    accMs += ts - lastTs
    lastTs = ts
    const interval = Math.max(16, options.getStepIntervalMs())
    while (accMs >= interval) {
      accMs -= interval
      options.onStep()
    }
    rafId = requestAnimationFrame(frame)
  }

  rafId = requestAnimationFrame(frame)
  return () => {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
    lastTs = 0
    accMs = 0
  }
}

const DEFAULT_PREFETCH_CACHE_MAX = 96

/** Warm browser HTTP cache for Sentinel WMS GetMap URLs (deduped, bounded). */
export function prefetchSentinelHubWmsTileUrls(
  urls: string[],
  cache: Set<string>,
  maxNew = 8,
): void {
  if (!urls.length || maxNew <= 0) return
  let queued = 0
  for (const raw of urls) {
    if (queued >= maxNew) break
    const url = String(raw || '').trim()
    if (!url || cache.has(url)) continue
    if (cache.size >= DEFAULT_PREFETCH_CACHE_MAX) {
      const first = cache.values().next().value
      if (first) cache.delete(first)
    }
    cache.add(url)
    queued += 1
    try {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
    } catch {
      /* ignore */
    }
  }
}
