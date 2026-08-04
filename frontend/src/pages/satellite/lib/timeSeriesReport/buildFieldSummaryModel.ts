/**
 * Slim one-pager field summary model for batch Field Summary PDF export.
 * Reuses yield / water-loss / health helpers without map snapshots or full report payload.
 */

import { estimateSaviFromNdvi } from '../../../../lib/chasIndex'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { geodesicAreaM2 } from '../../../../lib/siLayerClassAreaEngine'
import { classifyWapiHarvestStage } from '../../../../lib/siWapiAlertEngine'
import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { cleanAoiPlotDisplayId } from './aoiExcelExportShared'
import { resolveBatchPlotDisplayName } from './batchExportAnalyticsReportsExcel'
import { buildDayChartFromDailyRows } from './buildTimeSeriesReportPayload'
import {
  buildEstimatedWaterLossTimeline,
  type WaterStressLevel,
} from './estimatedWaterLossTimeline'
import {
  buildEstimatedYieldTimeline,
  latestEstimatedYieldSummary,
} from './estimatedYieldTimeline'
import {
  classifyAoiVegetationStatus,
  type AoiVegetationStatus,
} from './generateAoiRawDataByLayerExcel'
import { estimateNdwiFromNdmi } from './timeSeriesReportExecutive'

export type FieldHarvestWindowLabel =
  | 'Pre-peak'
  | 'Approaching harvest'
  | 'Harvest detected'
  | 'Harvest completed'
  | 'Insufficient data'

export type FieldIrrigationStatusLabel =
  | 'Adequate'
  | 'Monitor'
  | 'Irrigation advised'
  | 'Urgent irrigation'

export type FieldSummaryModel = {
  fieldName: string
  plotId: string
  cropType: string
  areaHa: number | null
  /** Product VHS = (NDVI + SAVI) / 2 on latest scene, 0–1. */
  vegetationHealthScore: number | null
  moistureScore: number | null
  waterStatus: WaterStressLevel | '—'
  /** Latest-scene NDVI used in yield factor (0.5·NDVI + 0.3·NDMI + 0.2·NDRE). */
  ndvi: number | null
  /** Optional zonal NDVI min/max for Production Estimation vegetated-area span. */
  ndviMin?: number | null
  ndviMax?: number | null
  ndmi: number | null
  ndre: number | null
  /** YieldFactor = 0.5·NDVI + 0.3·NDMI + 0.2·NDRE */
  yieldFactor: number | null
  /** Crop max yield ceiling (default potato 55 t/ha). */
  maxYieldTHa: number | null
  /** Estimated Yield (t/ha) = MaxYield × YieldFactor */
  yieldTHa: number | null
  /** Estimated Total Production (tons) = Estimated Yield × Area(ha) */
  productionTons: number | null
  harvestWindow: FieldHarvestWindowLabel
  irrigationStatus: FieldIrrigationStatusLabel | '—'
  overallFieldHealth: AoiVegetationStatus
  recommendation: string
  sceneDate: string | null
  fromDate: string
  toDate: string
}

export type FieldSummaryPortfolioStats = {
  fieldCount: number
  totalAreaHa: number
  totalProductionTons: number
  avgYieldTHa: number | null
  healthyCount: number
  moderateCount: number
  stressedCount: number
  avgHealthScore: number | null
  avgMoistureScore: number | null
  overallPortfolioStatus: AoiVegetationStatus
}

export type BuildFieldSummaryModelInput = {
  plot: CropAlertFieldInput
  dailyRows: SentinelHubDailyIndexMeans[]
  fromDate?: string
  toDate?: string
}

const SUMMARY_LAYER_IDS = ['NDVI', 'NDMI', 'NDWI', 'NDRE', 'SAVI'] as const

function cropFromPlot(plot: CropAlertFieldInput): string {
  const any = plot as CropAlertFieldInput & {
    cropType?: string
    crop?: string
    Crop_Type?: string
  }
  return String(any.cropType || any.crop || any.Crop_Type || '').trim() || '—'
}

function plotIdFromPlot(plot: CropAlertFieldInput): string {
  const raw = String(plot.objectId || '').trim()
  if (!raw) return '—'
  const cleaned = cleanAoiPlotDisplayId(raw)
  return cleaned && cleaned !== 'Plot' ? cleaned : raw || '—'
}

function areaHaFromGeometry(geometry: GeoJSON.Geometry | null | undefined): number | null {
  if (!geometry) return null
  const m2 = geodesicAreaM2(geometry)
  if (!Number.isFinite(m2) || m2 <= 0) return null
  return Number((m2 / 10_000).toFixed(3))
}

function sortedDailyRows(rows: SentinelHubDailyIndexMeans[]): SentinelHubDailyIndexMeans[] {
  return [...rows]
    .map(row => ({ ...row, date: String(row.date || '').trim().slice(0, 10) }))
    .filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function latestFiniteNdviRow(
  rows: SentinelHubDailyIndexMeans[],
): { row: SentinelHubDailyIndexMeans; ndvi: number } | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!
    const ndvi = evaluateImageryLayerDailyValue('NDVI', row)
    if (ndvi != null && Number.isFinite(ndvi)) return { row, ndvi }
  }
  return null
}

/** Product VHS = (NDVI + SAVI) / 2; estimate SAVI from NDVI when missing. */
export function computeVegetationHealthScore(
  row: SentinelHubDailyIndexMeans | null | undefined,
): number | null {
  if (!row) return null
  const direct = evaluateImageryLayerDailyValue('VHS', row)
  if (direct != null && Number.isFinite(direct)) return Number(direct.toFixed(4))

  const ndvi = evaluateImageryLayerDailyValue('NDVI', row)
  if (ndvi == null || !Number.isFinite(ndvi)) return null
  let savi = evaluateImageryLayerDailyValue('SAVI', row)
  if (savi == null || !Number.isFinite(savi)) savi = estimateSaviFromNdvi(ndvi)
  return Number(((ndvi + savi) / 2).toFixed(4))
}

/**
 * Harvest window from NDVI stage + optional HRI≥0.7 falling-NDVI signal (EHD-aligned).
 * Does not run the full WAPI alert pipeline.
 */
export function resolveFieldHarvestWindow(
  dailyRows: SentinelHubDailyIndexMeans[],
): FieldHarvestWindowLabel {
  const sorted = sortedDailyRows(dailyRows)
  const ndviPoints: Array<{ date: string; ndvi: number }> = []
  for (const row of sorted) {
    const ndvi = evaluateImageryLayerDailyValue('NDVI', row)
    if (ndvi != null && Number.isFinite(ndvi)) ndviPoints.push({ date: row.date, ndvi })
  }
  if (!ndviPoints.length) return 'Insufficient data'

  const latest = ndviPoints[ndviPoints.length - 1]!
  const previous = ndviPoints.length >= 2 ? ndviPoints[ndviPoints.length - 2]!.ndvi : null
  const seasonalPeakNdvi = Math.max(...ndviPoints.map(p => p.ndvi))

  let hriHarvestTriggered = false
  for (let i = 0; i < sorted.length; i += 1) {
    const hri = evaluateImageryLayerDailyValue('HRI', sorted[i]!)
    const ndvi = evaluateImageryLayerDailyValue('NDVI', sorted[i]!)
    const prev = i > 0 ? evaluateImageryLayerDailyValue('NDVI', sorted[i - 1]!) : null
    const trendDown = ndvi != null && prev != null && ndvi < prev
    if (!hriHarvestTriggered && hri != null && hri >= 0.7 && trendDown) {
      hriHarvestTriggered = true
    }
  }

  const stage = classifyWapiHarvestStage({
    ndvi: latest.ndvi,
    previousNdvi: previous,
    seasonalPeakNdvi,
  })

  if (stage === 'completed') return 'Harvest completed'
  if (stage === 'detected' || hriHarvestTriggered) return 'Harvest detected'
  if (stage === 'approaching') return 'Approaching harvest'
  if (stage === 'pre-peak') return 'Pre-peak'
  return 'Insufficient data'
}

export function mapWaterStressToIrrigationStatus(
  level: WaterStressLevel,
): FieldIrrigationStatusLabel {
  switch (level) {
    case 'Low':
      return 'Adequate'
    case 'Moderate':
      return 'Monitor'
    case 'High':
      return 'Irrigation advised'
    case 'Critical':
      return 'Urgent irrigation'
  }
}

function resolveRecommendation(yieldRecommendations: string | null | undefined): string {
  const text = String(yieldRecommendations || '').trim()
  if (!text) return '—'
  const parts = text
    .split(/\s*\|\s*/)
    .map(s => s.trim())
    .filter(Boolean)
  if (parts.length) return parts.slice(0, 2).join(' ')
  const lines = text
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
  return lines.slice(0, 2).join(' ') || '—'
}

function meanOf(nums: number[]): number | null {
  if (!nums.length) return null
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4))
}

export function buildFieldSummaryModel(input: BuildFieldSummaryModelInput): FieldSummaryModel {
  const plot = input.plot
  const dailyRows = sortedDailyRows(input.dailyRows)
  const fromDate =
    (input.fromDate || '').trim().slice(0, 10) || dailyRows[0]?.date || ''
  const toDate =
    (input.toDate || '').trim().slice(0, 10) ||
    dailyRows[dailyRows.length - 1]?.date ||
    fromDate

  const geometry = plot.geometry ?? null
  const areaHa = areaHaFromGeometry(geometry)
  const latest = latestFiniteNdviRow(dailyRows)
  const sceneDate = latest?.row.date ?? null

  const vegetationHealthScore = computeVegetationHealthScore(latest?.row ?? null)

  let ndviLatest: number | null = latest?.ndvi ?? null
  let ndmiLatest: number | null = null
  if (latest?.row) {
    ndmiLatest = evaluateImageryLayerDailyValue('NDMI', latest.row)
  }

  const chart = buildDayChartFromDailyRows([...SUMMARY_LAYER_IDS], dailyRows, fromDate, toDate)

  const waterTimeline =
    geometry && chart.labels.length
      ? buildEstimatedWaterLossTimeline({
          geometry,
          chartLabels: chart.labels,
          displayLabels: chart.displayLabels,
          periodAnchorDates: chart.periodAnchorDates,
          dailyRows,
          layerSeries: chart.series,
        })
      : []
  const latestWater = waterTimeline.length ? waterTimeline[waterTimeline.length - 1]! : null

  let moistureScore = latestWater?.moistureScore ?? null
  if (moistureScore == null && latest?.row) {
    const ndmi = evaluateImageryLayerDailyValue('NDMI', latest.row)
    let ndwi = evaluateImageryLayerDailyValue('NDWI', latest.row)
    if ((ndwi == null || !Number.isFinite(ndwi)) && ndmi != null && Number.isFinite(ndmi)) {
      ndwi = estimateNdwiFromNdmi(ndmi)
    }
    if (ndmi != null && Number.isFinite(ndmi) && ndwi != null && Number.isFinite(ndwi)) {
      moistureScore = Number((0.6 * ndmi + 0.4 * ndwi).toFixed(4))
    }
  }

  const waterStatus: WaterStressLevel | '—' = latestWater?.waterStressLevel ?? '—'
  const irrigationStatus: FieldIrrigationStatusLabel | '—' =
    waterStatus === '—' ? '—' : mapWaterStressToIrrigationStatus(waterStatus)

  const yieldTimeline =
    geometry && chart.labels.length
      ? buildEstimatedYieldTimeline({
          geometry,
          chartLabels: chart.labels,
          displayLabels: chart.displayLabels,
          periodAnchorDates: chart.periodAnchorDates,
          dailyRows,
          layerSeries: chart.series,
        })
      : []
  const latestYield = latestEstimatedYieldSummary(yieldTimeline)

  if (ndviLatest == null && latestYield) ndviLatest = latestYield.ndvi
  if (ndmiLatest == null && latestYield) ndmiLatest = latestYield.ndmi

  const ndviResolved = latestYield?.ndvi ?? ndviLatest
  const zonalNdvi = latest?.row.zonal?.ndvi
  const ndviMin =
    zonalNdvi?.min != null && Number.isFinite(zonalNdvi.min) ? zonalNdvi.min : null
  const ndviMax =
    zonalNdvi?.max != null && Number.isFinite(zonalNdvi.max) ? zonalNdvi.max : null

  return {
    fieldName: resolveBatchPlotDisplayName(plot),
    plotId: plotIdFromPlot(plot),
    cropType: cropFromPlot(plot),
    areaHa,
    vegetationHealthScore,
    moistureScore,
    waterStatus,
    ndvi: ndviResolved,
    ndviMin,
    ndviMax,
    ndmi: latestYield?.ndmi ?? ndmiLatest,
    ndre: latestYield?.ndre ?? null,
    yieldFactor: latestYield?.yieldFactor ?? null,
    maxYieldTHa: latestYield?.maxYieldTHa ?? null,
    yieldTHa: latestYield?.estimatedYieldTHa ?? null,
    productionTons: latestYield?.totalProductionTons ?? null,
    harvestWindow: resolveFieldHarvestWindow(dailyRows),
    irrigationStatus,
    overallFieldHealth: classifyAoiVegetationStatus(ndviLatest, ndmiLatest),
    recommendation: resolveRecommendation(latestYield?.recommendations),
    sceneDate,
    fromDate,
    toDate,
  }
}

/** Cover-page portfolio KPIs from successful field summaries. */
export function aggregateFieldSummaryPortfolio(
  models: FieldSummaryModel[],
): FieldSummaryPortfolioStats {
  const fieldCount = models.length
  const areas = models.map(m => m.areaHa).filter((v): v is number => v != null && Number.isFinite(v))
  const tons = models
    .map(m => m.productionTons)
    .filter((v): v is number => v != null && Number.isFinite(v))
  const yields = models.map(m => m.yieldTHa).filter((v): v is number => v != null && Number.isFinite(v))
  const healthScores = models
    .map(m => m.vegetationHealthScore)
    .filter((v): v is number => v != null && Number.isFinite(v))
  const moistureScores = models
    .map(m => m.moistureScore)
    .filter((v): v is number => v != null && Number.isFinite(v))

  let healthyCount = 0
  let moderateCount = 0
  let stressedCount = 0
  for (const m of models) {
    if (m.overallFieldHealth === 'Healthy') healthyCount += 1
    else if (m.overallFieldHealth === 'Moderate') moderateCount += 1
    else if (m.overallFieldHealth === 'Stress') stressedCount += 1
  }

  let overallPortfolioStatus: AoiVegetationStatus = 'Unknown'
  if (fieldCount > 0) {
    if (stressedCount >= healthyCount && stressedCount >= moderateCount && stressedCount > 0) {
      overallPortfolioStatus = 'Stress'
    } else if (healthyCount >= moderateCount && healthyCount >= stressedCount && healthyCount > 0) {
      overallPortfolioStatus = 'Healthy'
    } else if (moderateCount > 0 || healthyCount > 0 || stressedCount > 0) {
      overallPortfolioStatus = 'Moderate'
    }
  }

  return {
    fieldCount,
    totalAreaHa: Number(areas.reduce((a, b) => a + b, 0).toFixed(3)),
    totalProductionTons: Number(tons.reduce((a, b) => a + b, 0).toFixed(1)),
    avgYieldTHa: meanOf(yields) != null ? Number(meanOf(yields)!.toFixed(2)) : null,
    healthyCount,
    moderateCount,
    stressedCount,
    avgHealthScore: meanOf(healthScores),
    avgMoistureScore: meanOf(moistureScores),
    overallPortfolioStatus,
  }
}
