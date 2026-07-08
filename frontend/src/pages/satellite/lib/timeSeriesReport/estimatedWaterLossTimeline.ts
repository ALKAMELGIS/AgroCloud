import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { geodesicAreaM2 } from '../../../../lib/siLayerClassAreaEngine'
import {
  evaluateImageryLayerDailyValue,
  type ImageryTimeSeriesLayerSeries,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { estimateNdwiFromNdmi } from './timeSeriesReportExecutive'
import type { TimeSeriesTrendLabel } from './timeSeriesReportTypes'
import type { VegetationCoveragePoint } from './vegetationCoverageTimeline'

import { estimateEtMmDayFromMoisture } from '../../../../lib/etIndex'

/**
 * Legacy mid-season ceiling (mm/day) for relative Water Loss Index % only.
 * Volumetric ET now uses seasonal/Kc-aware `estimateEtMmDayFromMoisture`.
 */
export const WATER_LOSS_INDEX_ET_REF_MM = 6

export type WaterStressLevel = 'Low' | 'Moderate' | 'High' | 'Critical'

export type EstimatedWaterLossSource = 'et' | 'satellite-index'

export type EstimatedWaterLossPoint = {
  date: string
  periodLabel: string
  /** Unitless moisture score before clipping: 0.6×NDMI + 0.4×NDWI */
  moistureScore: number | null
  /** Water Loss Index as 0–100 (%) */
  waterLossIndexPct: number
  /** Estimated / measured ET used for volumetric conversion (mm/day) */
  etMmDay: number | null
  waterLossM3Day: number
  waterLossM3HaDay: number
  ndmi: number | null
  ndwi: number | null
  ndwiEstimated: boolean
  vegetationCoveragePct: number
  vegetationAreaHa: number
  aoiAreaHa: number
  waterStressLevel: WaterStressLevel
  source: EstimatedWaterLossSource
  /** True when stress is High or Critical — for Excel / chart highlighting */
  highWaterLoss: boolean
  trend: TimeSeriesTrendLabel
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

export function computeMoistureScore(ndmi: number, ndwi: number): number {
  return 0.6 * ndmi + 0.4 * ndwi
}

/** Water Loss Index fraction: 1 − Moisture Score, clipped to [0, 1]. */
export function computeWaterLossIndexFraction(ndmi: number, ndwi: number): number {
  return clamp01(1 - computeMoistureScore(ndmi, ndwi))
}

export function classifyWaterStressLevel(waterLossIndexPct: number): WaterStressLevel {
  if (waterLossIndexPct >= 80) return 'Critical'
  if (waterLossIndexPct >= 60) return 'High'
  if (waterLossIndexPct >= 40) return 'Moderate'
  return 'Low'
}

export function waterStressHighlightColor(level: WaterStressLevel): string {
  switch (level) {
    case 'Critical':
      return '#dc2626'
    case 'High':
      return '#f97316'
    case 'Moderate':
      return '#eab308'
    default:
      return '#38bdf8'
  }
}

function resolveLayerMean(
  layerId: 'NDMI' | 'NDWI' | 'NDVI',
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

function assignTrends(points: EstimatedWaterLossPoint[]): EstimatedWaterLossPoint[] {
  if (!points.length) return points
  return points.map((p, i) => {
    if (i === 0) return { ...p, trend: 'Stable' as const }
    const prev = points[i - 1]!
    const delta = p.waterLossM3Day - prev.waterLossM3Day
    const base = Math.max(Math.abs(prev.waterLossM3Day), 1)
    const rel = delta / base
    if (rel > 0.08 || delta > 50) return { ...p, trend: 'Increasing' as const }
    if (rel < -0.08 || delta < -50) return { ...p, trend: 'Decreasing' as const }
    return { ...p, trend: 'Stable' as const }
  })
}

export type ComputeEstimatedWaterLossPointInput = {
  date: string
  periodLabel?: string
  aoiAreaHa: number
  ndmi: number | null
  ndwi: number | null
  /** Optional canopy vigor for Kc (crop stage). */
  ndvi?: number | null
  /** When set and finite, use physical ET formula instead of index×ref. */
  etMmDay?: number | null
  vegetationCoveragePct?: number
  vegetationAreaHa?: number
  ndwiEstimated?: boolean
}

/**
 * Single-date Estimated Water Loss for the active AOI.
 * ET path: Water Loss (m³/day) = ET (mm/day) × AOI (ha) × 10
 * Index path: Moisture Score → Water Loss Index → ET proxy × area × 10
 */
export function computeEstimatedWaterLossPoint(
  input: ComputeEstimatedWaterLossPointInput,
): EstimatedWaterLossPoint | null {
  const aoiAreaHa = input.aoiAreaHa
  if (!Number.isFinite(aoiAreaHa) || aoiAreaHa <= 0) return null

  let ndmi = input.ndmi
  let ndwi = input.ndwi
  let ndwiEstimated = !!input.ndwiEstimated

  if ((ndwi == null || !Number.isFinite(ndwi)) && ndmi != null && Number.isFinite(ndmi)) {
    ndwi = estimateNdwiFromNdmi(ndmi)
    ndwiEstimated = true
  }

  const hasIndices =
    ndmi != null && Number.isFinite(ndmi) && ndwi != null && Number.isFinite(ndwi)

  const etProvided =
    input.etMmDay != null && Number.isFinite(input.etMmDay) && input.etMmDay >= 0
      ? input.etMmDay
      : null

  let moistureScore: number | null = null
  let waterLossIndexPct = 0
  let etMmDay: number | null = etProvided
  let source: EstimatedWaterLossSource = 'et'

  if (etProvided != null) {
    source = 'et'
    if (hasIndices) {
      moistureScore = computeMoistureScore(ndmi!, ndwi!)
      waterLossIndexPct = Number((computeWaterLossIndexFraction(ndmi!, ndwi!) * 100).toFixed(1))
    } else {
      // Without indices, derive a relative index from ET vs the ref ceiling.
      waterLossIndexPct = Number(
        (clamp01(etProvided / WATER_LOSS_INDEX_ET_REF_MM) * 100).toFixed(1),
      )
    }
  } else if (hasIndices) {
    source = 'satellite-index'
    moistureScore = computeMoistureScore(ndmi!, ndwi!)
    const frac = computeWaterLossIndexFraction(ndmi!, ndwi!)
    waterLossIndexPct = Number((frac * 100).toFixed(1))
    // Seasonal energy + canopy Kc so summer / peak canopy differ from winter / bare soil.
    etMmDay = estimateEtMmDayFromMoisture(ndmi!, ndwi!, {
      sceneDate: input.date,
      ndvi: input.ndvi,
    })
  } else {
    return null
  }

  const etForVolume = etMmDay ?? 0
  const waterLossM3Day = Number((etForVolume * aoiAreaHa * 10).toFixed(2))
  const waterLossM3HaDay = Number((etForVolume * 10).toFixed(2))
  const waterStressLevel = classifyWaterStressLevel(waterLossIndexPct)

  return {
    date: input.date.slice(0, 10),
    periodLabel: input.periodLabel ?? input.date.slice(0, 10),
    moistureScore: moistureScore != null ? Number(moistureScore.toFixed(4)) : null,
    waterLossIndexPct,
    etMmDay,
    waterLossM3Day,
    waterLossM3HaDay,
    ndmi: ndmi != null && Number.isFinite(ndmi) ? Number(ndmi.toFixed(4)) : null,
    ndwi: ndwi != null && Number.isFinite(ndwi) ? Number(ndwi.toFixed(4)) : null,
    ndwiEstimated,
    vegetationCoveragePct: input.vegetationCoveragePct ?? 0,
    vegetationAreaHa: input.vegetationAreaHa ?? 0,
    aoiAreaHa: Number(aoiAreaHa.toFixed(aoiAreaHa >= 100 ? 1 : 2)),
    waterStressLevel,
    source,
    highWaterLoss: waterStressLevel === 'High' || waterStressLevel === 'Critical',
    trend: 'Stable',
  }
}

export type BuildEstimatedWaterLossTimelineInput = {
  geometry: GeoJSON.Geometry | null | undefined
  chartLabels: string[]
  displayLabels: string[]
  periodAnchorDates?: Record<string, string>
  dailyRows: SentinelHubDailyIndexMeans[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  /** Optional vegetation coverage timeline for Coverage % / Area columns */
  vegetationCoverageTimeline?: VegetationCoveragePoint[]
  /** Optional per-date ET (mm/day). Keys = YYYY-MM-DD */
  etMmDayByDate?: Record<string, number | null | undefined>
  signal?: AbortSignal
}

/**
 * Per-acquisition Estimated Water Loss for the active AOI.
 * Recalculates independently for each satellite date from NDMI/NDWI (or ET when provided).
 */
export function buildEstimatedWaterLossTimeline(
  input: BuildEstimatedWaterLossTimelineInput,
): EstimatedWaterLossPoint[] {
  if (input.signal?.aborted) return []
  const geometry = input.geometry ?? null
  const aoiAreaM2 = geometry ? geodesicAreaM2(geometry) : 0
  const aoiAreaHa = aoiAreaM2 / 10_000
  if (aoiAreaHa <= 0 || !input.chartLabels.length) return []

  const ndmiSeries =
    input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDMI') ?? null
  const ndwiSeries =
    input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDWI') ?? null
  const ndviSeries =
    input.layerSeries.find(s => s.layerId.toUpperCase() === 'NDVI') ?? null

  const vegByDate = new Map(
    (input.vegetationCoverageTimeline ?? []).map(p => [p.date, p]),
  )

  const byDate = new Map<
    string,
    { periodLabel: string; seriesIndex: number }
  >()

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
  const points: EstimatedWaterLossPoint[] = []

  for (const [sceneDate, meta] of unique) {
    if (input.signal?.aborted) break
    const ndmi = resolveLayerMean('NDMI', sceneDate, input.dailyRows, ndmiSeries, meta.seriesIndex)
    const ndwiRaw = resolveLayerMean('NDWI', sceneDate, input.dailyRows, ndwiSeries, meta.seriesIndex)
    const ndvi = resolveLayerMean('NDVI', sceneDate, input.dailyRows, ndviSeries, meta.seriesIndex)
    const veg = vegByDate.get(sceneDate)
    const etMmDay = input.etMmDayByDate?.[sceneDate] ?? null

    const point = computeEstimatedWaterLossPoint({
      date: sceneDate,
      periodLabel: meta.periodLabel,
      aoiAreaHa: veg?.aoiAreaHa && veg.aoiAreaHa > 0 ? veg.aoiAreaHa : aoiAreaHa,
      ndmi,
      ndwi: ndwiRaw,
      ndvi,
      etMmDay,
      vegetationCoveragePct: veg?.vegetationCoveragePct,
      vegetationAreaHa: veg?.vegetationAreaHa,
      ndwiEstimated: ndwiRaw == null,
    })
    if (point) points.push(point)
  }

  return assignTrends(points)
}

/** Align water-loss m³/day onto chart period keys. */
export function estimatedWaterLossSeriesForChart(
  chartLabels: string[],
  periodAnchorDates: Record<string, string> | undefined,
  timeline: EstimatedWaterLossPoint[],
): Array<number | null> {
  const byDate = new Map(timeline.map(p => [p.date, p.waterLossM3Day]))
  return chartLabels.map(key => {
    const scene = (periodAnchorDates?.[key] ?? key).trim().slice(0, 10)
    const v = byDate.get(scene)
    return v != null && Number.isFinite(v) ? Number(v.toFixed(2)) : null
  })
}

/** Align Water Loss Index % onto chart period keys. */
export function estimatedWaterLossIndexSeriesForChart(
  chartLabels: string[],
  periodAnchorDates: Record<string, string> | undefined,
  timeline: EstimatedWaterLossPoint[],
): Array<number | null> {
  const byDate = new Map(timeline.map(p => [p.date, p.waterLossIndexPct]))
  return chartLabels.map(key => {
    const scene = (periodAnchorDates?.[key] ?? key).trim().slice(0, 10)
    const v = byDate.get(scene)
    return v != null && Number.isFinite(v) ? Number(v.toFixed(1)) : null
  })
}

export function latestEstimatedWaterLossSummary(
  timeline: EstimatedWaterLossPoint[],
): EstimatedWaterLossPoint | null {
  if (!timeline.length) return null
  return timeline[timeline.length - 1] ?? null
}
