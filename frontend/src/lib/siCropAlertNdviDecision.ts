/**
 * NDVI Alert Decision System — two independent modes:
 *
 * 1. Current Plant Health — latest scene NDVI / NDWI / NDMI only (map alerts default).
 * 2. Change Detection — ΔNDVI / temporal trend / multi-scene rules (historical analysis).
 */

import type {
  CropAlertEngineSettings,
  CropAlertIndexSnapshot,
  CropAlertSeverity,
  CropAlertStatus,
  CropAlertTrend,
  CropAlertTypeId,
} from './siCropAlertEngine'
import { classifyNdviHealth } from './siCropAlertEngine'
import {
  buildLandActivityHistoryFromScenes,
  classifyLandActivity,
  isNoCropActivity,
  landActivityPresentation,
  qualifiesForCropHealthLabel,
} from './landActivityClassifier'
import type { NdviSceneSeriesAnalysis } from './siCropAlertNdviTimeSeries'

export type NdviAlertDecisionInput = {
  current: CropAlertIndexSnapshot
  trend: CropAlertTrend
  seasonalPeakNdvi: number
  series: NdviSceneSeriesAnalysis | null
  settings: CropAlertEngineSettings
}

export type NdviAlertDecision = {
  status: CropAlertStatus
  severity: CropAlertSeverity
  alertTypes: CropAlertTypeId[]
  ndviChangePct2: number
  ndviMean3: number | null
  ndviSceneDates: string[]
  ndviSceneValues: number[]
  reasonLines: string[]
  explanation: string
  trendLabel: string
}

function trendLabel(trend: CropAlertTrend): string {
  switch (trend) {
    case 'increasing':
      return 'Increasing (7–30 days)'
    case 'decreasing':
      return 'Slight Decrease (7 days)'
    default:
      return 'Stable (7–30 days)'
  }
}

function seriesMeta(series: NdviSceneSeriesAnalysis | null) {
  return {
    ndviChangePct2: series?.ndviChangePct2 ?? 0,
    ndviMean3: series?.ndviMean3 ?? null,
    ndviSceneDates: series?.scenes.map(s => s.date) ?? [],
    ndviSceneValues: series?.scenes.map(s => s.ndvi) ?? [],
  }
}

function gradualDeclineAcrossSeries(series: NdviSceneSeriesAnalysis): boolean {
  if (series.scenes.length < 2) return false
  for (let i = 0; i < series.scenes.length - 1; i++) {
    if (series.scenes[i]!.ndvi >= series.scenes[i + 1]!.ndvi) return false
  }
  return true
}

function meanOfOlderScenes(series: NdviSceneSeriesAnalysis): number | null {
  const older = series.scenes.slice(1)
  if (!older.length) return null
  return older.reduce((s, x) => s + x.ndvi, 0) / older.length
}

function resolveLandActivityStatus(
  ndvi: number,
  current: CropAlertIndexSnapshot,
  sceneValues: number[],
): { status: CropAlertStatus; explanation: string } | null {
  const landState = classifyLandActivity(
    buildLandActivityHistoryFromScenes(
      { NDVI: ndvi, NDMI: current.ndmi, NDWI: current.ndwi },
      sceneValues,
    ),
  )
  if (isNoCropActivity(landState)) {
    const ctx = landActivityPresentation(landState)
    return {
      status: 'no-crop-activity',
      explanation: ctx.interpretation,
    }
  }
  return null
}

function downgradeHealthyWithoutGrowth(
  status: CropAlertStatus,
  ndvi: number,
  current: CropAlertIndexSnapshot,
  sceneValues: number[],
): { status: CropAlertStatus; explanation?: string } {
  const landHistory = buildLandActivityHistoryFromScenes(
    { NDVI: ndvi, NDMI: current.ndmi, NDWI: current.ndwi },
    sceneValues,
  )
  const landState = classifyLandActivity(landHistory)
  if (
    (status === 'healthy' || status === 'growing' || status === 'harvest-approaching') &&
    !qualifiesForCropHealthLabel(ndvi, landHistory, landState)
  ) {
    return {
      status: ndvi < 0.25 ? 'water-stress' : 'watch',
      explanation:
        'NDVI alone is insufficient — no active crop growth pattern in recent scenes.',
    }
  }
  return { status }
}

/** Mode 1 — Current Plant Health: latest scene indices only (no Δ). */
export function decideCurrentPlantHealthStatus(input: NdviAlertDecisionInput): NdviAlertDecision {
  const { current, series, settings } = input
  const alertTypes: CropAlertTypeId[] = []
  const meta = seriesMeta(series)

  const ndvi = series?.ndviCurrent ?? current.ndvi
  const ndwi = current.ndwi
  const ndmi = current.ndmi
  const sceneValues = meta.ndviSceneValues

  const landGate = resolveLandActivityStatus(ndvi, current, sceneValues)
  if (landGate) {
    return {
      status: landGate.status,
      severity: 'normal',
      alertTypes: [],
      ...meta,
      reasonLines: [
        `NDVI current = ${ndvi.toFixed(2)}`,
        `NDWI current = ${ndwi.toFixed(2)}`,
        `NDMI current = ${ndmi.toFixed(2)}`,
      ],
      explanation: landGate.explanation,
      trendLabel: 'No crop activity',
    }
  }

  const ndwiLow = ndwi < 0.1
  const ndmiLow = ndmi < 0.2
  const ndwiStress = ndwi < 0.15
  const ndmiStress = ndmi < 0.25

  const reasonLines = [
    `NDVI current = ${ndvi.toFixed(2)}`,
    `NDWI current = ${ndwi.toFixed(2)}`,
    `NDMI current = ${ndmi.toFixed(2)}`,
  ]

  let status: CropAlertStatus = 'healthy'
  let severity: CropAlertSeverity = 'normal'
  let explanation = 'Crop indices stable at latest scene — no intervention needed.'

  if (ndvi < 0.05) {
    status = 'no-vegetation'
    severity = 'critical'
    explanation = 'Bare soil or no viable vegetation at latest scene.'
  } else if (ndvi < 0.2) {
    status = ndwiLow && ndmiLow ? 'bare-soil' : 'critical'
    severity = ndwiLow && ndmiLow ? 'warning' : 'critical'
    explanation = 'Very low vegetation vigor at latest scene.'
    if (settings.alertTypes['crop-stress']) alertTypes.push('crop-stress')
  } else if (ndvi < 0.35 && (ndwiStress || ndmiStress)) {
    status = 'water-stress'
    severity = 'high'
    explanation = 'Low NDVI with dry moisture signature at latest scene.'
    if (settings.alertTypes['water-stress']) alertTypes.push('water-stress')
    if (settings.alertTypes['irrigation-required']) alertTypes.push('irrigation-required')
  } else if (ndvi < 0.25) {
    status = 'water-stress'
    severity = 'high'
    explanation = 'High crop stress — low NDVI at latest scene.'
    if (settings.alertTypes['crop-stress']) alertTypes.push('crop-stress')
  } else if (ndvi < 0.4) {
    status = 'watch'
    severity = 'warning'
    explanation = 'Early vigor concern — monitor field (latest scene).'
    if (settings.alertTypes['crop-stress']) alertTypes.push('crop-stress')
  } else if (ndvi < 0.6) {
    status = 'healthy'
    severity = 'normal'
    explanation = 'Moderate canopy health at latest scene.'
    if (ndvi >= 0.35 && ndvi < 0.55 && ndwiStress && ndmiStress) {
      status = 'watch'
      severity = 'warning'
      explanation = 'Moderate NDVI but low moisture — possible irrigation need.'
      if (settings.alertTypes['irrigation-required']) alertTypes.push('irrigation-required')
    }
  } else if (ndvi < 0.75) {
    status = 'growing'
    severity = 'normal'
    explanation = 'Strong vegetation vigor at latest scene.'
    if (settings.alertTypes['vegetation-recovery']) alertTypes.push('vegetation-recovery')
  } else {
    status = 'harvest-approaching'
    severity = 'normal'
    explanation = 'Peak canopy maturity at latest scene.'
    if (settings.alertTypes['harvest-readiness']) alertTypes.push('harvest-readiness')
  }

  const downgraded = downgradeHealthyWithoutGrowth(status, ndvi, current, sceneValues)
  status = downgraded.status
  if (downgraded.explanation) explanation = downgraded.explanation

  return {
    status,
    severity,
    alertTypes,
    ...meta,
    reasonLines,
    explanation,
    trendLabel: 'Latest scene only',
  }
}

/** Mode 2 — Change Detection: ΔNDVI / trend / multi-scene temporal rules. */
export function decideChangeDetectionStatus(input: NdviAlertDecisionInput): NdviAlertDecision {
  const { current, trend, seasonalPeakNdvi, series, settings } = input
  const alertTypes: CropAlertTypeId[] = []
  const meta = seriesMeta(series)

  const ndviCurrent = series?.ndviCurrent ?? current.ndvi
  const ndviMean3 = meta.ndviMean3
  const ndviChangePct2 = meta.ndviChangePct2
  const sceneCount = series?.scenes.length ?? 0
  const sceneValues = meta.ndviSceneValues

  const landGate = resolveLandActivityStatus(ndviCurrent, current, sceneValues)
  if (landGate) {
    return {
      status: landGate.status,
      severity: 'normal',
      alertTypes: [],
      ...meta,
      reasonLines: [`NDVI current = ${ndviCurrent.toFixed(2)}`],
      explanation: landGate.explanation,
      trendLabel: 'No crop activity',
    }
  }

  const ndwiLow = current.ndwi < 0.1
  const ndmiLow = current.ndmi < 0.2
  const peak = Math.max(seasonalPeakNdvi, ndviMean3 ?? 0, ndviCurrent)
  const dropFromPeak = peak - ndviCurrent
  const meanDevPct =
    ndviMean3 != null && ndviMean3 > 0.05
      ? Number((((ndviCurrent - ndviMean3) / ndviMean3) * 100).toFixed(1))
      : 0
  const multiSceneDecline = series ? gradualDeclineAcrossSeries(series) : false
  const prePeakMean = series ? meanOfOlderScenes(series) : null

  const reasonLines: string[] = []
  if (ndviMean3 != null) reasonLines.push(`NDVI mean (3 scenes) = ${ndviMean3.toFixed(2)}`)
  reasonLines.push(`NDVI current = ${ndviCurrent.toFixed(2)}`)
  if (sceneCount >= 2) reasonLines.push(`NDVI change (latest vs previous) = ${ndviChangePct2}%`)
  if (ndviMean3 != null && meanDevPct !== 0) {
    reasonLines.push(`Current vs mean = ${meanDevPct > 0 ? '+' : ''}${meanDevPct}%`)
  }
  reasonLines.push(`Trend: ${trendLabel(trend)}`)

  let status: CropAlertStatus = 'healthy'
  let severity: CropAlertSeverity = 'normal'
  let explanation = 'No significant temporal change detected.'

  if (ndviChangePct2 <= -20) {
    status = 'critical'
    severity = 'critical'
    if (settings.alertTypes['crop-stress']) alertTypes.push('crop-stress')
    if (settings.alertTypes['drought-risk']) alertTypes.push('drought-risk')
    explanation = 'Severe NDVI decline vs previous scene — urgent field action.'
  } else if (
    ndviChangePct2 <= -15 &&
    ndwiLow &&
    ndmiLow &&
    trend === 'decreasing'
  ) {
    status = 'critical'
    severity = 'critical'
    if (settings.alertTypes['crop-stress']) alertTypes.push('crop-stress')
    if (settings.alertTypes['drought-risk']) alertTypes.push('drought-risk')
    explanation = 'Sharp NDVI drop with moisture stress signature.'
  } else if (
    peak >= 0.6 &&
    dropFromPeak >= 0.12 &&
    (ndviChangePct2 <= -15 || multiSceneDecline) &&
    trend === 'decreasing' &&
    !(ndwiLow && ndmiLow)
  ) {
    status = 'harvest-detected'
    severity = 'warning'
    if (settings.alertTypes['harvest-readiness']) alertTypes.push('harvest-readiness')
    explanation = 'Sharp NDVI drop after peak — harvest likely started.'
  } else if (
    ndviCurrent < 0.15 &&
    trend === 'decreasing' &&
    dropFromPeak >= 0.2
  ) {
    status = 'harvest-completed'
    severity = 'normal'
    if (settings.alertTypes['harvest-readiness']) alertTypes.push('harvest-readiness')
    explanation = 'Post-harvest bare soil signature after seasonal peak.'
  } else if (
    (ndviChangePct2 <= -10 && ndviChangePct2 > -20) ||
    ((ndwiLow || ndmiLow) && ndviChangePct2 < -5 && trend !== 'increasing') ||
    (multiSceneDecline && ndviChangePct2 <= -10)
  ) {
    status = 'water-stress'
    severity = 'high'
    if (settings.alertTypes['water-stress']) alertTypes.push('water-stress')
    if (settings.alertTypes['irrigation-required']) alertTypes.push('irrigation-required')
    explanation = 'Gradual NDVI decline (10–20%) — possible water or crop stress.'
  } else if (
    (ndviChangePct2 <= -5 && ndviChangePct2 > -10) ||
    (meanDevPct <= -5 && meanDevPct > -10) ||
    (multiSceneDecline && ndviChangePct2 < 0 && ndviChangePct2 > -10)
  ) {
    status = 'watch'
    severity = 'warning'
    if (settings.alertTypes['crop-stress']) alertTypes.push('crop-stress')
    explanation = 'Early gradual NDVI decline — monitor without urgent intervention.'
  } else if (trend === 'increasing' && ndviChangePct2 >= 5 && ndviCurrent < 0.65) {
    status = 'growing'
    severity = 'normal'
    if (settings.alertTypes['vegetation-recovery']) alertTypes.push('vegetation-recovery')
    explanation = 'Active vegetation recovery — NDVI rising vs prior scene.'
  } else if (ndviChangePct2 >= 10 && trend === 'increasing') {
    status = 'growing'
    severity = 'normal'
    if (settings.alertTypes['vegetation-recovery']) alertTypes.push('vegetation-recovery')
    explanation = 'Strong NDVI improvement vs previous scene.'
  } else if (
    ndviCurrent >= 0.72 &&
    ndviCurrent >= peak - 0.05 &&
    ndviChangePct2 <= 0 &&
    ndviChangePct2 >= -8 &&
    trend !== 'increasing'
  ) {
    status = 'harvest-approaching'
    severity = 'normal'
    if (settings.alertTypes['harvest-readiness']) alertTypes.push('harvest-readiness')
    explanation = 'NDVI near seasonal peak with stable temporal pattern.'
  } else if (prePeakMean != null && ndviCurrent >= prePeakMean - 0.02 && ndviChangePct2 >= -5) {
    status = 'healthy'
    severity = classifyNdviHealth(ndviCurrent)
    explanation = 'NDVI stable relative to recent Sentinel scenes.'
  } else if (ndviChangePct2 <= -5) {
    status = 'watch'
    severity = 'warning'
    explanation = 'Minor NDVI drift vs previous scene — keep monitoring.'
    if (settings.alertTypes['crop-stress']) alertTypes.push('crop-stress')
  } else {
    status = 'healthy'
    severity = classifyNdviHealth(ndviCurrent)
    explanation = 'Temporal indices within normal range — no significant change.'
  }

  const downgraded = downgradeHealthyWithoutGrowth(status, ndviCurrent, current, sceneValues)
  status = downgraded.status
  if (downgraded.explanation) explanation = downgraded.explanation

  return {
    status,
    severity,
    alertTypes,
    ...meta,
    reasonLines,
    explanation,
    trendLabel: trendLabel(trend),
  }
}

/** Routes to active mode from engine settings. */
export function decideNdviAlertStatus(input: NdviAlertDecisionInput): NdviAlertDecision {
  if (input.settings.analysisMode === 'change-detection') {
    return decideChangeDetectionStatus(input)
  }
  return decideCurrentPlantHealthStatus(input)
}

export function buildNdviAlertMessage(
  farmLabel: string,
  decision: NdviAlertDecision,
): string {
  const parts = decision.reasonLines.slice(0, 3).join(' · ')
  return `${farmLabel}: ${decision.explanation}${parts ? ` (${parts})` : ''}`
}
