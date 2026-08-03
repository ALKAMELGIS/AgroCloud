import {
  computeImageryYieldEstimate,
  DEFAULT_POTATO_MAX_YIELD_T_HA,
} from '../../../../lib/imageryYieldEstimation'
import type { ImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { geodesicAreaM2 } from '../../../../lib/siLayerClassAreaEngine'
import {
  evaluateImageryLayerDailyValue,
  type ImageryTimeSeriesLayerSeries,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { TimeSeriesTrendLabel } from './timeSeriesReportTypes'

export type YieldClassLabel = 'Low' | 'Moderate' | 'Good' | 'High'

export type EstimatedYieldPoint = {
  date: string
  periodLabel: string
  ndvi: number
  ndmi: number
  ndre: number
  yieldFactor: number
  estimatedYieldTHa: number
  totalProductionTons: number
  areaHa: number
  maxYieldTHa: number
  cropLabel: string
  yieldClass: YieldClassLabel
  interpretation: string
  recommendations: string
  trend: TimeSeriesTrendLabel
}

function resolveLayerMean(
  layerId: 'NDVI' | 'NDMI' | 'NDRE',
  date: string,
  dailyRows: SentinelHubDailyIndexMeans[],
  series: ImageryTimeSeriesLayerSeries | null | undefined,
  seriesIndex: number | null,
): number | null {
  const row = dailyRows.find(r => r.date?.slice(0, 10) === date.slice(0, 10))
  if (row) {
    const v = evaluateImageryLayerDailyValue(layerId, row)
    if (v != null && Number.isFinite(v)) return v
  }
  if (series && seriesIndex != null) {
    const v = series.values[seriesIndex]
    if (v != null && Number.isFinite(v)) return v
  }
  return null
}

export function classifyYieldFactor(yieldFactor: number): YieldClassLabel {
  if (yieldFactor >= 0.7) return 'High'
  if (yieldFactor >= 0.55) return 'Good'
  if (yieldFactor >= 0.4) return 'Moderate'
  return 'Low'
}

export function buildYieldInterpretationText(input: {
  date: string
  yieldFactor: number
  estimatedYieldTHa: number
  totalProductionTons: number
  areaHa: number
  maxYieldTHa: number
  cropLabel: string
  ndvi: number
  ndmi: number
  ndre: number
  yieldClass: YieldClassLabel
  primary?: ImageryIndexInterpretation | null
}): string {
  const parts = [
    `On ${input.date}, Yield Factor ${input.yieldFactor.toFixed(3)} (${input.yieldClass}) from 0.5xNDVI(${input.ndvi.toFixed(2)}) + 0.3xNDMI(${input.ndmi.toFixed(2)}) + 0.2xNDRE(${input.ndre.toFixed(2)}).`,
    `Estimated yield ${input.estimatedYieldTHa.toFixed(1)} t/ha = ${input.maxYieldTHa} t/ha (${input.cropLabel}) x factor; total production ${input.totalProductionTons.toFixed(0)} tons over ${input.areaHa.toFixed(2)} ha.`,
  ]
  if (input.primary?.meanLabel) {
    parts.push(`Index context: ${input.primary.layerId} mean indicates ${input.primary.meanLabel.toLowerCase()}.`)
  }
  if (input.primary?.coverageLine) {
    parts.push(input.primary.coverageLine.replace(/\s*[·•]\s*/g, ' - '))
  }
  return parts.join(' ')
}

export function buildYieldRecommendationsText(input: {
  yieldClass: YieldClassLabel
  primary?: ImageryIndexInterpretation | null
}): string {
  const fromInterp =
    input.primary?.actions
      ?.map(a => a.text.replace(/\s*[·•]\s*/g, ' - '))
      .filter(Boolean)
      .slice(0, 3) ?? []
  if (fromInterp.length) return fromInterp.join(' | ')

  switch (input.yieldClass) {
    case 'High':
      return 'Maintain irrigation and nutrition; plan harvest logistics for high production.'
    case 'Good':
      return 'Continue standard agronomy; scout for localized stress that could trim yield.'
    case 'Moderate':
      return 'Inspect irrigation uniformity and nutrient availability in moderate-vigor zones.'
    default:
      return 'Prioritize field scouting and stress mitigation; yield potential is constrained.'
  }
}

function assignTrends(points: EstimatedYieldPoint[]): EstimatedYieldPoint[] {
  if (!points.length) return points
  return points.map((p, i) => {
    if (i === 0) return { ...p, trend: 'Stable' as const }
    const prev = points[i - 1]!
    const delta = p.estimatedYieldTHa - prev.estimatedYieldTHa
    const base = Math.max(Math.abs(prev.estimatedYieldTHa), 0.1)
    const rel = delta / base
    if (rel > 0.08 || delta > 1.5) return { ...p, trend: 'Increasing' as const }
    if (rel < -0.08 || delta < -1.5) return { ...p, trend: 'Decreasing' as const }
    return { ...p, trend: 'Stable' as const }
  })
}

export type BuildEstimatedYieldTimelineInput = {
  geometry: GeoJSON.Geometry | null | undefined
  chartLabels: string[]
  displayLabels: string[]
  periodAnchorDates?: Record<string, string>
  dailyRows: SentinelHubDailyIndexMeans[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  primaryInterpretation?: ImageryIndexInterpretation | null
  maxYieldTHa?: number
  cropLabel?: string
  signal?: AbortSignal
}

/**
 * Per-acquisition Estimated Yield (t/ha) and Total Production (tons)
 * using Yield Factor = 0.5*NDVI + 0.3*NDMI + 0.2*NDRE.
 */
export function buildEstimatedYieldTimeline(
  input: BuildEstimatedYieldTimelineInput,
): EstimatedYieldPoint[] {
  if (input.signal?.aborted) return []
  const geometry = input.geometry ?? null
  const aoiAreaM2 = geometry ? geodesicAreaM2(geometry) : 0
  const aoiAreaHa = aoiAreaM2 / 10_000
  if (aoiAreaHa <= 0 || !input.chartLabels.length) return []

  const maxYieldTHa = input.maxYieldTHa ?? DEFAULT_POTATO_MAX_YIELD_T_HA
  const cropLabel = input.cropLabel ?? 'Potato'

  const ndviSeries = input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDVI') ?? null
  const ndmiSeries = input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDMI') ?? null
  const ndreSeries = input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDRE') ?? null

  const byDate = new Map<string, { periodLabel: string; seriesIndex: number }>()
  for (let i = 0; i < input.chartLabels.length; i += 1) {
    const periodKey = input.chartLabels[i]!
    const sceneDate = (input.periodAnchorDates?.[periodKey] ?? periodKey).trim().slice(0, 10)
    if (!sceneDate) continue
    byDate.set(sceneDate, {
      periodLabel: input.displayLabels[i] ?? periodKey,
      seriesIndex: i,
    })
  }

  const unique = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const points: EstimatedYieldPoint[] = []

  for (const [sceneDate, meta] of unique) {
    if (input.signal?.aborted) break
    const ndvi = resolveLayerMean('NDVI', sceneDate, input.dailyRows, ndviSeries, meta.seriesIndex)
    const ndmi = resolveLayerMean('NDMI', sceneDate, input.dailyRows, ndmiSeries, meta.seriesIndex)
    const ndre = resolveLayerMean('NDRE', sceneDate, input.dailyRows, ndreSeries, meta.seriesIndex)
    const estimate = computeImageryYieldEstimate({
      ndvi,
      ndmi,
      ndre,
      areaHa: aoiAreaHa,
      maxYieldTHa,
      cropLabel,
    })
    if (!estimate) continue

    const yieldClass = classifyYieldFactor(estimate.yieldFactor)
    const primaryForDate =
      input.primaryInterpretation?.sceneDate?.slice(0, 10) === sceneDate
        ? input.primaryInterpretation
        : input.primaryInterpretation

    points.push({
      date: sceneDate,
      periodLabel: meta.periodLabel,
      ndvi: estimate.ndvi,
      ndmi: estimate.ndmi,
      ndre: estimate.ndre,
      yieldFactor: Number(estimate.yieldFactor.toFixed(4)),
      estimatedYieldTHa: Number(estimate.estimatedYieldTHa.toFixed(2)),
      totalProductionTons: Number(estimate.totalProductionTons.toFixed(1)),
      areaHa: Number(estimate.areaHa.toFixed(estimate.areaHa >= 100 ? 1 : 2)),
      maxYieldTHa: estimate.maxYieldTHa,
      cropLabel: estimate.cropLabel,
      yieldClass,
      interpretation: buildYieldInterpretationText({
        date: sceneDate,
        yieldFactor: estimate.yieldFactor,
        estimatedYieldTHa: estimate.estimatedYieldTHa,
        totalProductionTons: estimate.totalProductionTons,
        areaHa: estimate.areaHa,
        maxYieldTHa: estimate.maxYieldTHa,
        cropLabel: estimate.cropLabel,
        ndvi: estimate.ndvi,
        ndmi: estimate.ndmi,
        ndre: estimate.ndre,
        yieldClass,
        primary: primaryForDate,
      }),
      recommendations: buildYieldRecommendationsText({
        yieldClass,
        primary: primaryForDate,
      }),
      trend: 'Stable',
    })
  }

  return assignTrends(points)
}

export function latestEstimatedYieldSummary(
  timeline: EstimatedYieldPoint[],
): EstimatedYieldPoint | null {
  if (!timeline.length) return null
  return timeline[timeline.length - 1] ?? null
}
