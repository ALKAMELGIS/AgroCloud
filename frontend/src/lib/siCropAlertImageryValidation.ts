/**
 * Crop Alert Engine — Sentinel imagery date verification before issuing alerts.
 */

import { dateFromLocalIso, localIsoDate } from './siSentinelImageryDate'
import {
  resolveAdaptiveFieldObservationDate,
  resolveAdaptiveSceneDate,
  type AdaptiveSceneResolution,
} from './siAdaptiveTemporalEngine'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'
import { pickCatalogSceneDatesForFetch } from './sentinelHubStatisticsApi'

export const CROP_ALERT_DATA_SOURCE = 'Sentinel Live' as const

/** Max calendar days behind latest AOI scene before global alerts are blocked (auto mode). */
export const CROP_ALERT_MAX_SCENE_STALENESS_DAYS = 21

export type CropAlertDataQuality = 'verified' | 'scene-mismatch' | 'outdated' | 'no-live-data'

export type CropAlertImageryContext = {
  userRequestedDate: string
  imageDate: string
  analysisDate: string
  latestSceneDate: string | null
  dataSource: typeof CROP_ALERT_DATA_SOURCE
  quality: CropAlertDataQuality
  warningMessage: string | null
}

export type CropAlertFieldImageryMeta = {
  imageDate: string | null
  sensingDate: string | null
  analysisDate: string
  requestedDate: string
  dataSource: typeof CROP_ALERT_DATA_SOURCE | 'Unavailable'
  dataQuality: CropAlertDataQuality
  liveVerified: boolean
  warningMessage: string | null
  dataReason: string | null
  adaptiveResolution?: AdaptiveSceneResolution | null
}

export function daysBetweenIso(a: string, b: string): number {
  const ta = dateFromLocalIso(a.trim()).getTime()
  const tb = dateFromLocalIso(b.trim()).getTime()
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0
  return Math.round(Math.abs(ta - tb) / 86_400_000)
}

/** Observation row for the exact calendar day — no nearest-date fallback. */
export function findExactObservationRow(
  daily: SentinelHubDailyIndexMeans[],
  targetIso: string,
): SentinelHubDailyIndexMeans | null {
  const row = daily.find(d => d.date === targetIso.trim())
  if (!row) return null
  if (row.ndvi == null && row.ndwi == null && row.ndmi == null) return null
  return row
}

/** All sensing dates with at least one valid index in the Statistical API series. */
export function listObservationDates(daily: SentinelHubDailyIndexMeans[]): string[] {
  return daily
    .filter(d => d.ndvi != null || d.ndwi != null || d.ndmi != null)
    .map(d => d.date)
    .sort((a, b) => b.localeCompare(a))
}

/**
 * Latest field observation — delegates to Adaptive Temporal Engine (±7 day fallback).
 */
export function resolveFieldObservationDate(
  daily: SentinelHubDailyIndexMeans[],
  fetchDate: string,
  catalogSceneIsos?: string[],
): string | null {
  return resolveAdaptiveFieldObservationDate(daily, fetchDate, catalogSceneIsos).resolvedDate
}

export { resolveAdaptiveFieldObservationDate, type AdaptiveSceneResolution }

/** Professional alert copy: requested vs used scene dates. */
export function formatCropAlertSceneDateReason(
  requestedDate: string,
  usedDate: string | null,
): { summary: string; reason: string | null } {
  const req = requestedDate.trim()
  const used = usedDate?.trim() || null
  if (!used) {
    return {
      summary: `Requested Date: ${req} · Used Date: —`,
      reason: 'No Sentinel data available for current date',
    }
  }
  if (used === req) {
    return {
      summary: `Requested Date: ${req} · Used Date: ${used}`,
      reason: null,
    }
  }
  return {
    summary: `Requested Date: ${req} · Used Date: ${used} (Latest Valid Scene)`,
    reason: 'No Sentinel data available for current date',
  }
}

export function buildCropAlertImageryContext(input: {
  userRequestedDate: string
  fetchDate: string
  latestSceneIso?: string | null
  autoFollowImagery?: boolean
}): CropAlertImageryContext {
  const userRequestedDate = input.userRequestedDate.trim()
  const imageDate = input.fetchDate.trim()
  const latestSceneDate = input.latestSceneIso?.trim() || null
  const analysisDate = localIsoDate()

  let quality: CropAlertDataQuality = 'verified'
  let warningMessage: string | null = null

  if (imageDate !== userRequestedDate) {
    quality = 'scene-mismatch'
    warningMessage = `⚠️ Analysis Based on Older Imagery (Image ${imageDate}, selected ${userRequestedDate})`
  }

  if (
    input.autoFollowImagery !== false &&
    latestSceneDate &&
    imageDate < latestSceneDate &&
    daysBetweenIso(imageDate, latestSceneDate) > 0
  ) {
    quality = 'scene-mismatch'
    warningMessage = `⚠️ Analysis Based on Older Imagery (Image ${imageDate}, latest ${latestSceneDate})`
  }

  if (
    latestSceneDate &&
    daysBetweenIso(imageDate, latestSceneDate) > CROP_ALERT_MAX_SCENE_STALENESS_DAYS
  ) {
    quality = 'outdated'
    warningMessage = `⚠️ Data Outdated (Image ${imageDate}, latest ${latestSceneDate})`
  }

  return {
    userRequestedDate,
    imageDate,
    analysisDate,
    latestSceneDate,
    dataSource: CROP_ALERT_DATA_SOURCE,
    quality,
    warningMessage,
  }
}

export function buildFieldImageryMeta(
  daily: SentinelHubDailyIndexMeans[],
  fetchDate: string,
  global: CropAlertImageryContext,
  seriesSource: 'live' | 'sample',
  options?: { catalogSceneIsos?: string[]; preferLatestAvailable?: boolean },
): CropAlertFieldImageryMeta {
  if (global.quality === 'outdated') {
    return {
      imageDate: null,
      sensingDate: null,
      analysisDate: global.analysisDate,
      requestedDate: fetchDate.trim(),
      dataSource: 'Unavailable',
      dataQuality: 'outdated',
      liveVerified: false,
      warningMessage: global.warningMessage,
      dataReason: 'Sentinel imagery is outdated for this field',
    }
  }

  const requestedDate = fetchDate.trim()
  const buildVerifiedMeta = (
    resolvedDate: string,
    exactMatch: boolean,
    effectiveAdaptive: AdaptiveSceneResolution,
  ): CropAlertFieldImageryMeta => {
    const dateInfo = formatCropAlertSceneDateReason(requestedDate, resolvedDate)
    let warningMessage = global.warningMessage
    if (dateInfo.summary) {
      warningMessage = warningMessage ? `${warningMessage} · ${dateInfo.summary}` : dateInfo.summary
    }
    return {
      imageDate: resolvedDate,
      sensingDate: resolvedDate,
      analysisDate: global.analysisDate,
      requestedDate,
      dataSource: CROP_ALERT_DATA_SOURCE,
      dataQuality: exactMatch ? global.quality : 'scene-mismatch',
      liveVerified: true,
      warningMessage,
      dataReason: dateInfo.reason,
      adaptiveResolution: effectiveAdaptive,
    }
  }

  const observationDates = listObservationDates(daily)

  if (options?.preferLatestAvailable && observationDates.length) {
    const resolvedDate = observationDates[0]!
    const observation = findExactObservationRow(daily, resolvedDate)
    if (observation) {
      const exactMatch = resolvedDate === requestedDate
      const effectiveAdaptive: AdaptiveSceneResolution = !exactMatch
        ? {
            requestedDate,
            resolvedDate,
            fallbackUsed: true,
            fallbackDays: daysBetweenIso(requestedDate, resolvedDate),
            direction: resolvedDate < requestedDate ? 'backward' : 'forward',
          }
        : {
            requestedDate,
            resolvedDate,
            fallbackUsed: false,
            fallbackDays: 0,
            direction: 'exact',
          }
      return buildVerifiedMeta(resolvedDate, exactMatch, effectiveAdaptive)
    }
  }

  const adaptive = resolveAdaptiveFieldObservationDate(
    daily,
    fetchDate,
    options?.catalogSceneIsos,
  )
  let resolvedDate = adaptive.resolvedDate
  let observation = resolvedDate ? findExactObservationRow(daily, resolvedDate) : null

  if (!observation && !observationDates.length && options?.catalogSceneIsos?.length) {
    const catalogDates = options.catalogSceneIsos.map(iso => iso.trim().slice(0, 10)).filter(Boolean)
    const catalogAdaptive = resolveAdaptiveSceneDate(fetchDate, catalogDates)
    if (catalogAdaptive.resolvedDate) {
      resolvedDate = catalogAdaptive.resolvedDate
    }
  }

  if (!observationDates.length || !resolvedDate) {
    const catalogUsed = pickCatalogSceneDatesForFetch(options?.catalogSceneIsos ?? [], requestedDate, 1)[0]
    if (catalogUsed) {
      const effectiveAdaptive: AdaptiveSceneResolution = {
        requestedDate,
        resolvedDate: catalogUsed,
        fallbackUsed: catalogUsed !== requestedDate,
        fallbackDays: daysBetweenIso(requestedDate, catalogUsed),
        direction: catalogUsed < requestedDate ? 'backward' : 'forward',
      }
      return buildVerifiedMeta(catalogUsed, catalogUsed === requestedDate, effectiveAdaptive)
    }
    const dateInfo = formatCropAlertSceneDateReason(requestedDate, null)
    return {
      imageDate: null,
      sensingDate: null,
      analysisDate: global.analysisDate,
      requestedDate,
      dataSource: CROP_ALERT_DATA_SOURCE,
      dataQuality: 'scene-mismatch',
      liveVerified: true,
      warningMessage: dateInfo.summary,
      dataReason: dateInfo.reason,
      adaptiveResolution: adaptive,
    }
  }

  observation = findExactObservationRow(daily, resolvedDate)
  if (!observation) {
    resolvedDate = observationDates[0]!
    observation = findExactObservationRow(daily, resolvedDate)
  }

  if (!observation || !resolvedDate) {
    const catalogUsed = pickCatalogSceneDatesForFetch(options?.catalogSceneIsos ?? [], requestedDate, 1)[0]
    if (catalogUsed) {
      const effectiveAdaptive: AdaptiveSceneResolution = {
        requestedDate,
        resolvedDate: catalogUsed,
        fallbackUsed: catalogUsed !== requestedDate,
        fallbackDays: daysBetweenIso(requestedDate, catalogUsed),
        direction: catalogUsed < requestedDate ? 'backward' : 'forward',
      }
      return buildVerifiedMeta(catalogUsed, catalogUsed === requestedDate, effectiveAdaptive)
    }
    const dateInfo = formatCropAlertSceneDateReason(requestedDate, null)
    return {
      imageDate: null,
      sensingDate: null,
      analysisDate: global.analysisDate,
      requestedDate,
      dataSource: CROP_ALERT_DATA_SOURCE,
      dataQuality: 'scene-mismatch',
      liveVerified: true,
      warningMessage: dateInfo.summary,
      dataReason: dateInfo.reason,
      adaptiveResolution: adaptive,
    }
  }

  const exactMatch = resolvedDate === requestedDate
  const effectiveAdaptive: AdaptiveSceneResolution = !exactMatch
    ? {
        requestedDate,
        resolvedDate,
        fallbackUsed: true,
        fallbackDays: daysBetweenIso(requestedDate, resolvedDate),
        direction: resolvedDate < requestedDate ? 'backward' : 'forward',
      }
    : adaptive

  return buildVerifiedMeta(resolvedDate, exactMatch, effectiveAdaptive)
}

export function shouldIssueCropHealthAlert(meta: CropAlertFieldImageryMeta): boolean {
  if (meta.dataQuality === 'outdated') return false
  return meta.liveVerified
}

export function cropAlertDataQualityTitle(quality: CropAlertDataQuality): string {
  switch (quality) {
    case 'outdated':
      return 'Data Outdated'
    case 'scene-mismatch':
      return 'Older Imagery'
    case 'no-live-data':
      return 'No Live Data'
    default:
      return 'Verified'
  }
}
