/** Local calendar date helpers + Auto Live Date (latest valid Sentinel scene). */

import {
  ADAPTIVE_TEMPORAL_FALLBACK_DAYS,
  resolveAutoLatestValidSceneDate,
  resolveAutoLiveScenePair,
  resolveNearestValidSceneDate,
  resolvePreviousValidSceneDate,
  type AutoLiveScenePair,
} from './siAdaptiveTemporalEngine'

export {
  resolveAutoLatestValidSceneDate,
  resolveAutoLiveScenePair,
  resolvePreviousValidSceneDate,
  type AutoLiveScenePair,
}

export const SI_SENTINEL_TIME_SERIES_WINDOW_DAYS = 90

/** @deprecated Legacy constant; auto date no longer uses fixed calendar lag. */
export const SI_SENTINEL_PROCESSING_LAG_DAYS = 1

/** @deprecated Used only by legacy estimates when catalog is unavailable. */
export const SI_SENTINEL_FALLBACK_LATEST_SCENE_LAG_DAYS = 2

export const SI_SENTINEL_IMAGERY_DATE_BY_AOI_LS_KEY = 'si_sentinel_imagery_date_by_aoi_v1'

export type SiSentinelImageryDateAoiPrefs = {
  autoFollow: boolean
  manualIso?: string
}

/** YYYY-MM-DD in the user's local timezone (not UTC). */
export function localIsoDate(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse YYYY-MM-DD as local noon to avoid UTC day shifts in date inputs. */
export function dateFromLocalIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0)
}

export function subtractDaysFromIso(iso: string, days: number): string {
  const d = dateFromLocalIso(iso)
  d.setDate(d.getDate() - days)
  return localIsoDate(d)
}

/** Add calendar days to a local ISO date. */
export function addDaysToIso(iso: string, days: number): string {
  const d = dateFromLocalIso(iso)
  d.setDate(d.getDate() + days)
  return localIsoDate(d)
}

/** Heuristic latest scene date when catalog has not loaded yet. */
export function estimateLatestSentinelSceneIso(now: Date = new Date()): string {
  return subtractDaysFromIso(localIsoDate(now), SI_SENTINEL_FALLBACK_LATEST_SCENE_LAG_DAYS)
}

/**
 * Auto Live Date target for the picker before catalog loads.
 * When STAC catalog is ready, use resolveAutoLiveScenePair instead.
 */
export function computeAutoSentinelImageryIso(
  latestSceneIso?: string | null,
  now: Date = new Date(),
): string {
  const trimmed = latestSceneIso?.trim().slice(0, 10)
  if (trimmed) return trimmed
  return localIsoDate(now)
}

/** Default imagery date on first load (auto target, before catalog). */
export function getDefaultSentinelImageryDate(now: Date = new Date()): Date {
  return dateFromLocalIso(computeAutoSentinelImageryIso(null, now))
}

/** Rolling time-series window ending at the auto imagery target (or today). */
export function getDefaultSentinelTimeSeriesRange(
  now: Date = new Date(),
  endIso?: string,
): { start: string; end: string } {
  const end = endIso?.trim() || computeAutoSentinelImageryIso(null, now)
  const startDate = dateFromLocalIso(end)
  startDate.setDate(startDate.getDate() - SI_SENTINEL_TIME_SERIES_WINDOW_DAYS)
  return { start: localIsoDate(startDate), end }
}

/**
 * Pick the best fetch date for WMS + alerts:
 * exact request, or temporally nearest valid Sentinel scene (±fallback window).
 */
export function resolveSentinelFetchDate(
  requestedIso: string,
  availableSceneIsos: string[],
  options?: { autoMode?: boolean },
): string {
  if (options?.autoMode) {
    return resolveAutoLatestValidSceneDate(availableSceneIsos)
  }

  const req = requestedIso.trim()
  if (!req) return resolveAutoLatestValidSceneDate(availableSceneIsos)
  const available = [...new Set(availableSceneIsos.map(d => d.trim().slice(0, 10)).filter(Boolean))].sort(
    (a, b) => b.localeCompare(a),
  )
  if (!available.length) return req
  if (available.includes(req)) return req
  return resolveNearestValidSceneDate(req, available, ADAPTIVE_TEMPORAL_FALLBACK_DAYS) ?? req
}

export function loadSentinelImageryDatePrefsByAoi(): Record<string, SiSentinelImageryDateAoiPrefs> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SI_SENTINEL_IMAGERY_DATE_BY_AOI_LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, SiSentinelImageryDateAoiPrefs>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function getSentinelImageryDatePrefsForAoi(aoiKey: string): SiSentinelImageryDateAoiPrefs {
  const key = aoiKey.trim() || 'global'
  const all = loadSentinelImageryDatePrefsByAoi()
  return all[key] ?? { autoFollow: true }
}

export function saveSentinelImageryDatePrefsForAoi(
  aoiKey: string,
  prefs: SiSentinelImageryDateAoiPrefs,
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const key = aoiKey.trim() || 'global'
  try {
    const all = loadSentinelImageryDatePrefsByAoi()
    all[key] = prefs
    window.localStorage.setItem(SI_SENTINEL_IMAGERY_DATE_BY_AOI_LS_KEY, JSON.stringify(all))
  } catch {
    /* ignore quota */
  }
}
