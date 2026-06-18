import {
  isCropAlertResultsCacheFresh,
  loadCropAlertResultsCache,
  persistCropAlertResultsCache,
  type CropAlertFieldResult,
  type CropAlertResultsCache,
} from '../../../lib/siCropAlertEngine'
import { ACP_CROP_ALERT_RESULTS_LS_KEY } from './acpPlatformConfig'

const ACP_CACHE_OPTS = { resultsKey: ACP_CROP_ALERT_RESULTS_LS_KEY }

export function loadAcpCropAlertResultsCache(
  referenceDate?: string,
  userRequestedDate?: string,
): CropAlertResultsCache | null {
  return loadCropAlertResultsCache(referenceDate, userRequestedDate, ACP_CACHE_OPTS)
}

export function persistAcpCropAlertResultsCache(cache: CropAlertResultsCache): void {
  persistCropAlertResultsCache(cache, ACP_CACHE_OPTS)
}

export function isAcpCropAlertResultsCacheFresh(
  cache: CropAlertResultsCache | null,
  referenceDate: string,
  refreshMinutes: number,
  userRequestedDate?: string,
): boolean {
  return isCropAlertResultsCacheFresh(cache, referenceDate, refreshMinutes, userRequestedDate)
}

/** Date-first cache: valid while referenceDate matches (no TTL re-fetch on pan/zoom). */
export function isAcpCropAlertResultsValidForReferenceDate(
  cache: CropAlertResultsCache | null,
  referenceDate: string,
): boolean {
  if (!cache?.results.length) return false
  const ref = referenceDate.trim()
  if (!ref) return false
  return cache.referenceDate.trim() === ref
}

export function hydrateAcpCropAlertEngineSnapshot(
  referenceDate: string,
  userRequestedDate: string,
): Pick<{ allResults: CropAlertFieldResult[]; lastEngineRunAt: number | null }, 'allResults' | 'lastEngineRunAt'> {
  const cached = loadAcpCropAlertResultsCache(referenceDate, userRequestedDate)
  if (!cached?.results.length) {
    return { allResults: [], lastEngineRunAt: null }
  }
  return {
    allResults: cached.results,
    lastEngineRunAt: cached.lastRunAt || null,
  }
}

export function hydrateAcpCropAlertResultsRef(
  referenceDate: string,
  userRequestedDate: string,
): Map<string, CropAlertFieldResult> {
  const cached = loadAcpCropAlertResultsCache(referenceDate, userRequestedDate)
  if (!cached?.results.length) return new Map()
  return new Map(cached.results.map(r => [r.fieldKey, r]))
}
