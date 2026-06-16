/**
 * NDVI time-series analysis for Crop Alert Engine (Adaptive Temporal — up to 5 valid scenes).
 */

import {
  ADAPTIVE_TEMPORAL_SCENE_WINDOW_MAX,
  resolveAdaptiveFieldObservationDate,
} from './siAdaptiveTemporalEngine'
import type { CropAlertIndexSnapshot, CropAlertTrend } from './siCropAlertEngine'
import { computeTrend, deltaPercent, deriveCoherentIndicesFromNdvi } from './siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'

/** Default rolling window (uses 3–5 valid scenes when available). */
export const CROP_ALERT_NDVI_SCENE_COUNT = ADAPTIVE_TEMPORAL_SCENE_WINDOW_MAX

export type NdviSceneSample = {
  date: string
  ndvi: number
  ndwi: number | null
  ndmi: number | null
  ciRe: number | null
}

export type NdviSceneSeriesAnalysis = {
  /** Newest → oldest (max 5). */
  scenes: NdviSceneSample[]
  currentDate: string
  ndviCurrent: number
  /** Rolling mean across available valid scenes (3–5). */
  ndviMean3: number
  ndviDelta2: number
  ndviChangePct2: number
  ndwiCurrent: number
  ndmiCurrent: number
  /** Anchor date after adaptive temporal fallback. */
  anchorDate: string
  requestedDate: string
  fallbackUsed: boolean
}

export function pickLastNdviScenes(
  daily: SentinelHubDailyIndexMeans[],
  anchorDate: string,
  count = CROP_ALERT_NDVI_SCENE_COUNT,
): NdviSceneSample[] {
  return daily
    .filter(d => d.date <= anchorDate.trim() && d.ndvi != null && Number.isFinite(d.ndvi))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, count)
    .map(d => ({
      date: d.date,
      ndvi: d.ndvi!,
      ndwi: d.ndwi,
      ndmi: d.ndmi,
      ciRe: d.ciRe,
    }))
}

function listValidObservationDates(daily: SentinelHubDailyIndexMeans[]): string[] {
  return daily
    .filter(d => d.ndvi != null || d.ndwi != null || d.ndmi != null)
    .map(d => d.date)
    .sort((a, b) => b.localeCompare(a))
}

export function analyzeNdviSceneSeries(
  daily: SentinelHubDailyIndexMeans[],
  referenceDate: string,
  options?: { catalogSceneIsos?: string[]; maxScenes?: number; preferLatestAvailable?: boolean },
): NdviSceneSeriesAnalysis | null {
  const requestedDate = referenceDate.trim()
  const observationDates = listValidObservationDates(daily)

  let anchorDate = requestedDate
  let fallbackUsed = false

  if (options?.preferLatestAvailable && observationDates.length) {
    anchorDate = observationDates[0]!
    fallbackUsed = anchorDate !== requestedDate
  } else {
    const adaptive = resolveAdaptiveFieldObservationDate(
      daily,
      requestedDate,
      options?.catalogSceneIsos,
    )
    anchorDate = adaptive.resolvedDate ?? observationDates[0] ?? requestedDate
    fallbackUsed = adaptive.fallbackUsed || anchorDate !== requestedDate
  }

  const scenes = pickLastNdviScenes(daily, anchorDate, options?.maxScenes ?? CROP_ALERT_NDVI_SCENE_COUNT)
  if (!scenes.length) return null

  const current = scenes[0]!
  const previous = scenes[1]
  const ndviMean3 = scenes.reduce((s, x) => s + x.ndvi, 0) / scenes.length
  const ndviDelta2 = previous ? current.ndvi - previous.ndvi : 0
  const ndviChangePct2 = previous ? deltaPercent(current.ndvi, previous.ndvi) : 0

  return {
    scenes,
    currentDate: current.date,
    ndviCurrent: current.ndvi,
    ndviMean3: Number(ndviMean3.toFixed(4)),
    ndviDelta2: Number(ndviDelta2.toFixed(4)),
    ndviChangePct2,
    ndwiCurrent: current.ndwi ?? 0,
    ndmiCurrent: current.ndmi ?? 0,
    anchorDate,
    requestedDate,
    fallbackUsed,
  }
}

export function snapshotFromNdviScene(scene: NdviSceneSample): CropAlertIndexSnapshot {
  const derived = deriveCoherentIndicesFromNdvi(scene.ndvi, scene.date, scene.date)
  return {
    ndvi: scene.ndvi,
    ndwi: scene.ndwi ?? derived.ndwi,
    ndmi: scene.ndmi ?? derived.ndmi,
    evi: derived.evi,
    ciRe: scene.ciRe ?? derived.ciRe,
  }
}

export function resolveTrendFromDaily(
  daily: SentinelHubDailyIndexMeans[],
  currentDate: string,
): { trend: CropAlertTrend; previous7: CropAlertIndexSnapshot | null; previous30: CropAlertIndexSnapshot | null } {
  const byDate = new Map(daily.filter(d => d.ndvi != null).map(d => [d.date, d]))
  const current = byDate.get(currentDate)
  if (!current || current.ndvi == null) {
    return { trend: 'stable', previous7: null, previous30: null }
  }

  const sorted = [...byDate.keys()].sort((a, b) => b.localeCompare(a))
  const idx = sorted.indexOf(currentDate)

  const findNdviAtOffset = (offset: number): number | null => {
    const target = sorted[idx + offset]
    if (!target) return null
    const v = byDate.get(target)?.ndvi
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  }

  const ndviCurrent = current.ndvi
  const ndvi7 = findNdviAtOffset(1) ?? findNdviAtOffset(2) ?? ndviCurrent
  const ndvi30 = findNdviAtOffset(Math.min(4, sorted.length - idx - 1)) ?? ndvi7

  const snap7: CropAlertIndexSnapshot = {
    ndvi: ndvi7,
    ndwi: 0,
    ndmi: 0,
    evi: 0,
  }
  const snap30: CropAlertIndexSnapshot = {
    ndvi: ndvi30,
    ndwi: 0,
    ndmi: 0,
    evi: 0,
  }

  return {
    trend: computeTrend(ndviCurrent, ndvi7, ndvi30),
    previous7: snap7,
    previous30: snap30,
  }
}

export function formatNdviSeriesExplanation(series: NdviSceneSeriesAnalysis): string {
  const vals = series.scenes.map(s => s.ndvi.toFixed(2)).join(' → ')
  return `NDVI scenes (${series.scenes.map(s => s.date).join(', ')}): ${vals} · mean ${series.ndviMean3.toFixed(2)} · Δ ${series.ndviChangePct2}%`
}
