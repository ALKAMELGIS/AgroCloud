/**
 * Adaptive Temporal Engine — auto/latest-valid and nearest-scene fallback for Sentinel Live.
 */

import { dateFromLocalIso, localIsoDate, subtractDaysFromIso } from './siSentinelImageryDate'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'

/** Max calendar days to search backward/forward for a valid observation. */
export const ADAPTIVE_TEMPORAL_FALLBACK_DAYS = 7

/** Rolling NDVI window size (uses up to this many valid scenes when available). */
export const ADAPTIVE_TEMPORAL_SCENE_WINDOW_MAX = 5

export const ADAPTIVE_TEMPORAL_SCENE_WINDOW_MIN = 3

export type AdaptiveSceneSearchDirection = 'exact' | 'backward' | 'forward' | 'nearest'

export type AdaptiveSceneResolution = {
  requestedDate: string
  resolvedDate: string | null
  fallbackUsed: boolean
  fallbackDays: number
  direction: AdaptiveSceneSearchDirection
}

function listValidObservationDates(daily: SentinelHubDailyIndexMeans[]): string[] {
  return daily
    .filter(d => d.ndvi != null || d.ndwi != null || d.ndmi != null)
    .map(d => d.date)
    .sort((a, b) => b.localeCompare(a))
}

function hasValidObservation(daily: SentinelHubDailyIndexMeans[], targetIso: string): boolean {
  const row = daily.find(d => d.date === targetIso.trim())
  if (!row) return false
  return row.ndvi != null || row.ndwi != null || row.ndmi != null
}

export function signedDaysBetweenIso(a: string, b: string): number {
  const ta = dateFromLocalIso(a.trim()).getTime()
  const tb = dateFromLocalIso(b.trim()).getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
  return Math.round((ta - tb) / 86_400_000)
}

export function absoluteDaysBetweenIso(a: string, b: string): number {
  return Math.abs(signedDaysBetweenIso(a, b))
}

/**
 * Pick the temporally nearest scene date to the request.
 * Prefers on-or-before the request when distances tie.
 */
export function resolveNearestValidSceneDate(
  requestedIso: string,
  candidateDates: string[],
  maxFallbackDays = ADAPTIVE_TEMPORAL_FALLBACK_DAYS,
): string | null {
  const req = requestedIso.trim()
  const unique = [...new Set(candidateDates.map(d => d.trim()).filter(Boolean))].sort((a, b) =>
    b.localeCompare(a),
  )
  if (!unique.length) return null
  if (unique.includes(req)) return req

  const withinRange = unique.filter(d => absoluteDaysBetweenIso(req, d) <= maxFallbackDays)
  const pool = withinRange.length ? withinRange : unique

  let best = pool[0]!
  let bestDist = absoluteDaysBetweenIso(req, best)
  for (const d of pool) {
    const dist = absoluteDaysBetweenIso(req, d)
    if (dist < bestDist || (dist === bestDist && d <= req)) {
      bestDist = dist
      best = d
    }
  }
  return best
}

/**
 * Fallback chain: exact → backward (≤ N days) → forward (≤ N days) → nearest overall.
 */
export function resolveAdaptiveSceneDate(
  requestedIso: string,
  candidateDates: string[],
  maxFallbackDays = ADAPTIVE_TEMPORAL_FALLBACK_DAYS,
): AdaptiveSceneResolution {
  const requestedDate = requestedIso.trim()
  const unique = [...new Set(candidateDates.map(d => d.trim()).filter(Boolean))]

  if (!unique.length) {
    return {
      requestedDate,
      resolvedDate: null,
      fallbackUsed: false,
      fallbackDays: 0,
      direction: 'nearest',
    }
  }

  if (unique.includes(requestedDate)) {
    return {
      requestedDate,
      resolvedDate: requestedDate,
      fallbackUsed: false,
      fallbackDays: 0,
      direction: 'exact',
    }
  }

  const withinRange = unique.filter(d => absoluteDaysBetweenIso(requestedDate, d) <= maxFallbackDays)
  if (withinRange.length) {
    const resolvedDate = resolveNearestValidSceneDate(requestedDate, withinRange, maxFallbackDays)!
    const signed = signedDaysBetweenIso(requestedDate, resolvedDate)
    return {
      requestedDate,
      resolvedDate,
      fallbackUsed: true,
      fallbackDays: absoluteDaysBetweenIso(requestedDate, resolvedDate),
      direction: signed > 0 ? 'backward' : signed < 0 ? 'forward' : 'nearest',
    }
  }

  const nearest = resolveNearestValidSceneDate(requestedDate, unique, maxFallbackDays)
  if (!nearest) {
    return {
      requestedDate,
      resolvedDate: null,
      fallbackUsed: false,
      fallbackDays: 0,
      direction: 'nearest',
    }
  }

  const signed = signedDaysBetweenIso(requestedDate, nearest)
  return {
    requestedDate,
    resolvedDate: nearest,
    fallbackUsed: nearest !== requestedDate,
    fallbackDays: absoluteDaysBetweenIso(requestedDate, nearest),
    direction: signed > 0 ? 'backward' : signed < 0 ? 'forward' : 'nearest',
  }
}

/** Auto mode: start at today, walk backward day-by-day until a catalog scene exists. */
export function resolveAutoLatestValidSceneDate(
  availableSceneIsos: string[],
  now: Date = new Date(),
  maxSearchDays = 45,
): string {
  const today = localIsoDate(now)
  const availableSet = new Set(
    availableSceneIsos.map(d => d.trim().slice(0, 10)).filter(Boolean),
  )
  if (!availableSet.size) return today

  for (let offset = 0; offset <= maxSearchDays; offset++) {
    const candidate = subtractDaysFromIso(today, offset)
    if (availableSet.has(candidate)) return candidate
  }

  const available = [...availableSet].sort((a, b) => b.localeCompare(a))
  return resolveNearestValidSceneDate(today, available, ADAPTIVE_TEMPORAL_FALLBACK_DAYS) ?? today
}

/** Scene immediately before current in the catalog (temporal, not calendar −1 day). */
export function resolvePreviousValidSceneDate(
  currentSceneIso: string,
  availableSceneIsos: string[],
): string | null {
  const current = currentSceneIso.trim().slice(0, 10)
  const available = [...new Set(availableSceneIsos.map(d => d.trim().slice(0, 10)).filter(Boolean))].sort(
    (a, b) => b.localeCompare(a),
  )
  if (!available.length || !current) return null

  const idx = available.indexOf(current)
  if (idx >= 0 && idx + 1 < available.length) return available[idx + 1]!

  return available.find(d => d < current) ?? null
}

export type AutoLiveScenePair = {
  currentSceneDate: string
  previousSceneDate: string | null
}

/** Auto Live Date: latest valid Sentinel scene + temporally previous scene. */
export function resolveAutoLiveScenePair(
  availableSceneIsos: string[],
  now: Date = new Date(),
): AutoLiveScenePair {
  const currentSceneDate = resolveAutoLatestValidSceneDate(availableSceneIsos, now)
  const previousSceneDate = resolvePreviousValidSceneDate(currentSceneDate, availableSceneIsos)
  return { currentSceneDate, previousSceneDate }
}

export function resolveAdaptiveFieldObservationDate(
  daily: SentinelHubDailyIndexMeans[],
  requestedDate: string,
  catalogSceneIsos?: string[],
  maxFallbackDays = ADAPTIVE_TEMPORAL_FALLBACK_DAYS,
): AdaptiveSceneResolution {
  const observationDates = listValidObservationDates(daily)
  const catalogDates = (catalogSceneIsos ?? [])
    .map(iso => iso.trim().slice(0, 10))
    .filter(Boolean)

  /** Field Statistical API dates are authoritative; catalog is fallback only. */
  const candidates = observationDates.length
    ? observationDates
    : [...new Set(catalogDates)].sort((a, b) => b.localeCompare(a))
  const resolution = resolveAdaptiveSceneDate(requestedDate, candidates, maxFallbackDays)

  if (!resolution.resolvedDate || !hasValidObservation(daily, resolution.resolvedDate)) {
    const fallbackNearest = resolveAdaptiveSceneDate(requestedDate, observationDates, maxFallbackDays)
    if (
      fallbackNearest.resolvedDate &&
      hasValidObservation(daily, fallbackNearest.resolvedDate)
    ) {
      return fallbackNearest
    }
    return { ...resolution, resolvedDate: null }
  }

  return resolution
}

export function formatAdaptiveFallbackMessage(resolution: AdaptiveSceneResolution): string | null {
  if (!resolution.resolvedDate || !resolution.fallbackUsed) return null
  const dir =
    resolution.direction === 'backward'
      ? 'searched backward'
      : resolution.direction === 'forward'
        ? 'searched forward'
        : 'nearest scene'
  return `⚠️ No data for ${resolution.requestedDate} · ${dir} · using ${resolution.resolvedDate} (−${resolution.fallbackDays}d)`
}
