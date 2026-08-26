/**
 * Production Estimation Sheet — NDVI vegetated / unplanned area + harvest production.
 * Used by Batch Export → Field Summary (Excel).
 */

import type { FieldSummaryModel } from './buildFieldSummaryModel'
import type { GrowthStage } from './cropCoefficients'
import { estimateAetMmDayFromEtcAndIndices } from '../../../../lib/etIndex'
import { estimateNdwiFromNdmi } from './timeSeriesReportExecutive'
import {
  calculateEtConsumptionPercent,
  calculateFieldWaterRequirement,
  calculateWaterStressPercent,
  computeWaterLossFromEtDeficit,
  type FieldWaterRequirementResult,
  type WaterRequirementBatchSummary,
} from './waterRequirementService'

/** NDVI ≥ threshold → vegetated / planted; below → non-vegetated / unplanned. */
export const NDVI_VEGETATION_THRESHOLD = 0.2

/**
 * Soft canopy saturation for AOI-mean NDVI when pixel histograms are unavailable.
 * At NDVI ≈ 0.52 → ~85% coverage (matches the Production Estimation example).
 */
export const NDVI_FULL_CANOPY = 0.575

export type NdviStressLevel =
  | 'Healthy Crop'
  | 'Moderate Crop'
  | 'Stressed Crop'
  | 'Non-Vegetated / Unplanned'

export type ProductionEstimationRow = {
  fieldId: string
  farmName: string
  cropClassification: string
  irrigationType: string
  totalAreaHa: number | null
  plannedCropCoverageHa: number | null
  unplannedAreaHa: number | null
  vegetationCoveragePct: number | null
  averageNdvi: number | null
  stressLevel: NdviStressLevel | '—'
  expectedYieldTHa: number | null
  ndviHealthFactor: number | null
  estimatedHarvestProductionTons: number | null
  /** Satellite-derived estimated water loss (NDMI/NDWI + ET). */
  waterLossIndexPct: number | null
  waterLossM3Day: number | null
  waterLossM3HaDay: number | null
  /** Water requirement & ET estimation (FAO-56). */
  growthStage: GrowthStage | 'Unknown'
  et0MmDay: number | null
  kc: number | null
  etcMmDay: number | null
  aetMmDay: number | null
  etConsumptionPercent: number | null
  waterStressPercent: number | null
  ndwi: number | null
  ndmi: number | null
  ndii: number | null
  netWaterRequirementMmDay: number | null
  irrigationEfficiency: number | null
  grossIrrigationRequirementMmDay: number | null
  waterRequirementM3Day: number | null
  waterRequirementM3Week: number | null
  waterRequirementM3Month: number | null
  waterRequirementM3Season: number | null
  observationDate: string | null
  calculationStatus: string
}

export const PRODUCTION_ESTIMATION_HEADERS = [
  'Field ID',
  'Farm Name',
  'Crop Classification',
  'Irrigation Type',
  'Total Area from Layer (ha)',
  'Planned Crop Coverage (NDVI Vegetated Area) (ha)',
  'Unplanned Area (NDVI Non-Vegetated Area) (ha)',
  'Vegetation Coverage (%)',
  'Average NDVI',
  'Stress Level',
  'Expected Yield (Ton/ha)',
  'Estimated Harvest Production (Ton)',
] as const

export const WATER_LOSS_HEADERS = [
  'Water Loss Index %',
  'Loss (m3/day)',
  'Loss (m3/ha/day)',
] as const

export const WATER_REQUIREMENT_HEADERS = [
  'Growth Stage',
  'ET0 (mm/day)',
  'Kc',
  'ETc (mm/day)',
  'AET (mm/day)',
  'ET Consumption (%)',
  'Water Stress (%)',
  'NDWI',
  'NDMI',
  'NDII',
  'Net Water Requirement (mm/day)',
  'Irrigation Efficiency (%)',
  'Gross Irrigation Requirement (mm/day)',
  'Water Requirement (m³/day)',
  'Water Requirement (m³/week)',
  'Water Requirement (m³/month)',
  'Water Requirement (m³/season)',
  'Observation Date',
  'Calculation Status',
] as const

export const PRODUCTION_ESTIMATION_ALL_HEADERS = [
  ...PRODUCTION_ESTIMATION_HEADERS,
  ...WATER_LOSS_HEADERS,
  ...WATER_REQUIREMENT_HEADERS,
] as const

export type WaterLossPortfolioTotals = {
  /** Portfolio index: (sum loss m³/day ÷ sum water requirement m³/day) × 100. */
  totalWaterLossIndexPct: number | null
  totalWaterLossM3Day: number | null
  /** Portfolio flux: sum(m³/day) ÷ sum(area ha). */
  totalWaterLossM3HaDay: number | null
  /** Simple mean of field m³/ha/day values (TOTAL row "Mean"). */
  meanWaterLossM3HaDay: number | null
}

/** NDVI stress bands from the Production Estimation calculation method. */
export function classifyNdviStressLevel(
  ndvi: number | null | undefined,
): NdviStressLevel | '—' {
  if (ndvi == null || !Number.isFinite(ndvi)) return '—'
  if (ndvi > 0.6) return 'Healthy Crop'
  if (ndvi >= 0.4) return 'Moderate Crop'
  if (ndvi >= NDVI_VEGETATION_THRESHOLD) return 'Stressed Crop'
  return 'Non-Vegetated / Unplanned'
}

/**
 * Health factor applied in:
 * Estimated Harvest Production = Vegetated Area × Expected Yield × NDVI Health Factor
 */
export function ndviHealthFactorForStress(
  level: NdviStressLevel | '—',
): number | null {
  switch (level) {
    case 'Healthy Crop':
      return 1
    case 'Moderate Crop':
      return 0.85
    case 'Stressed Crop':
      return 0.65
    case 'Non-Vegetated / Unplanned':
      return 0
    default:
      return null
  }
}

export function ndviHealthFactor(ndvi: number | null | undefined): number | null {
  return ndviHealthFactorForStress(classifyNdviStressLevel(ndvi))
}

/**
 * Estimate vegetated / unplanned area inside the field polygon.
 * Prefer zonal min/max span above the NDVI threshold; otherwise soft coverage from AOI mean.
 */
export function estimateNdviVegetatedAreas(input: {
  areaHa: number | null | undefined
  ndviMean: number | null | undefined
  ndviMin?: number | null
  ndviMax?: number | null
}): {
  vegetatedAreaHa: number | null
  nonVegetatedAreaHa: number | null
  vegetationCoveragePct: number | null
} {
  const area = input.areaHa
  const ndvi = input.ndviMean
  if (
    area == null ||
    !Number.isFinite(area) ||
    area <= 0 ||
    ndvi == null ||
    !Number.isFinite(ndvi)
  ) {
    return { vegetatedAreaHa: null, nonVegetatedAreaHa: null, vegetationCoveragePct: null }
  }

  let coveragePct: number
  const hasZonalRange =
    input.ndviMin != null &&
    input.ndviMax != null &&
    Number.isFinite(input.ndviMin) &&
    Number.isFinite(input.ndviMax) &&
    input.ndviMin !== input.ndviMax

  if (hasZonalRange) {
    const lo = Math.min(input.ndviMin!, input.ndviMax!)
    const hi = Math.max(input.ndviMin!, input.ndviMax!)
    const span = hi - lo
    const vegetatedSpan = Math.max(0, hi - Math.max(lo, NDVI_VEGETATION_THRESHOLD))
    coveragePct = span > 1e-9 ? (vegetatedSpan / span) * 100 : ndvi >= NDVI_VEGETATION_THRESHOLD ? 100 : 0
  } else if (ndvi < NDVI_VEGETATION_THRESHOLD) {
    coveragePct = 0
  } else {
    const denom = NDVI_FULL_CANOPY - NDVI_VEGETATION_THRESHOLD
    coveragePct = Math.min(
      100,
      Math.max(0, ((ndvi - NDVI_VEGETATION_THRESHOLD) / denom) * 100),
    )
  }

  const vegetatedAreaHa = Number(((area * coveragePct) / 100).toFixed(3))
  const nonVegetatedAreaHa = Number(Math.max(0, area - vegetatedAreaHa).toFixed(3))
  return {
    vegetatedAreaHa,
    nonVegetatedAreaHa,
    vegetationCoveragePct: Number(coveragePct.toFixed(1)),
  }
}

export function estimateHarvestProductionTons(input: {
  vegetatedAreaHa: number | null | undefined
  expectedYieldTHa: number | null | undefined
  ndviHealthFactor: number | null | undefined
}): number | null {
  const area = input.vegetatedAreaHa
  const yieldTHa = input.expectedYieldTHa
  const factor = input.ndviHealthFactor
  if (
    area == null ||
    yieldTHa == null ||
    factor == null ||
    !Number.isFinite(area) ||
    !Number.isFinite(yieldTHa) ||
    !Number.isFinite(factor)
  ) {
    return null
  }
  return Number((area * yieldTHa * factor).toFixed(2))
}

export function mapWaterResultToProductionRow(
  water: FieldWaterRequirementResult,
): Pick<
  ProductionEstimationRow,
  | 'growthStage'
  | 'et0MmDay'
  | 'kc'
  | 'etcMmDay'
  | 'aetMmDay'
  | 'etConsumptionPercent'
  | 'waterStressPercent'
  | 'ndwi'
  | 'ndmi'
  | 'ndii'
  | 'netWaterRequirementMmDay'
  | 'irrigationEfficiency'
  | 'grossIrrigationRequirementMmDay'
  | 'waterRequirementM3Day'
  | 'waterRequirementM3Week'
  | 'waterRequirementM3Month'
  | 'waterRequirementM3Season'
  | 'observationDate'
  | 'calculationStatus'
> {
  return {
    growthStage: water.growthStage,
    et0MmDay: water.et0MmDay,
    kc: water.kc,
    etcMmDay: water.etcMmDay,
    aetMmDay: water.aetMmDay,
    etConsumptionPercent: water.etConsumptionPercent,
    waterStressPercent: water.waterStressPercent,
    ndwi: water.ndwi,
    ndmi: water.ndmi,
    ndii: water.ndii,
    netWaterRequirementMmDay: water.netWaterRequirementMmDay,
    irrigationEfficiency: water.irrigationEfficiency,
    grossIrrigationRequirementMmDay: water.grossIrrigationRequirementMmDay,
    waterRequirementM3Day: water.waterRequirementM3Day,
    waterRequirementM3Week: water.waterRequirementM3Week,
    waterRequirementM3Month: water.waterRequirementM3Month,
    waterRequirementM3Season: water.waterRequirementM3Season,
    observationDate: water.observationDate,
    calculationStatus: water.calculationStatus,
  }
}

export function resolveEffectiveAetMmDay(input: {
  aetMmDay?: number | null
  etcMmDay?: number | null
  ndmi?: number | null
  ndwi?: number | null
  ndvi?: number | null
  sceneDate?: string | null
}): { aetMmDay: number | null; fromSatellite: boolean } {
  if (input.aetMmDay != null && Number.isFinite(input.aetMmDay) && input.aetMmDay >= 0) {
    return { aetMmDay: input.aetMmDay, fromSatellite: true }
  }
  const etc = input.etcMmDay
  const ndmi = input.ndmi
  if (etc != null && etc > 0 && ndmi != null && Number.isFinite(ndmi)) {
    let ndwi = input.ndwi
    if (ndwi == null || !Number.isFinite(ndwi)) {
      ndwi = estimateNdwiFromNdmi(ndmi)
    }
    if (ndwi != null && Number.isFinite(ndwi)) {
      return {
        aetMmDay: estimateAetMmDayFromEtcAndIndices(etc, ndmi, ndwi),
        fromSatellite: false,
      }
    }
  }
  return { aetMmDay: null, fromSatellite: false }
}

/**
 * Field water-loss metrics (Batch Summary Excel).
 * Water Loss (%) = (1 − ETa/ETc) × 100
 * Loss (m³/ha/day) = max(0, ETc − ETa) × 10
 */
function resolveLayerIndicesForWaterLoss(input: {
  ndmi?: number | null
  ndwi?: number | null
}): { ndmi: number; ndwi: number } | null {
  const ndmi = input.ndmi
  if (ndmi == null || !Number.isFinite(ndmi)) return null
  let ndwi = input.ndwi
  if (ndwi == null || !Number.isFinite(ndwi)) {
    ndwi = estimateNdwiFromNdmi(ndmi)
  }
  if (ndwi == null || !Number.isFinite(ndwi)) return null
  return { ndmi, ndwi }
}

export function computeFieldWaterLossMetrics(input: {
  areaHa: number | null
  etcMmDay: number | null
  aetMmDay: number | null
  ndmi?: number | null
  ndwi?: number | null
}): Pick<ProductionEstimationRow, 'waterLossIndexPct' | 'waterLossM3Day' | 'waterLossM3HaDay'> {
  const areaHa =
    input.areaHa != null && Number.isFinite(input.areaHa) && input.areaHa > 0 ? input.areaHa : null
  const etc =
    input.etcMmDay != null && Number.isFinite(input.etcMmDay) && input.etcMmDay > 0
      ? input.etcMmDay
      : null

  let eta =
    input.aetMmDay != null && Number.isFinite(input.aetMmDay) && input.aetMmDay >= 0
      ? input.aetMmDay
      : null

  const indices = resolveLayerIndicesForWaterLoss(input)
  if (eta == null && etc != null && indices != null) {
    eta = estimateAetMmDayFromEtcAndIndices(etc, indices.ndmi, indices.ndwi)
  }

  const loss = computeWaterLossFromEtDeficit({
    etaMmDay: eta,
    etcMmDay: etc,
    areaHa,
  })
  return {
    waterLossIndexPct: loss.waterLossIndexPct,
    waterLossM3Day: loss.waterLossM3Day,
    waterLossM3HaDay: loss.waterLossM3HaDay,
  }
}

/** ETc crop-water demand volume (m³/day) = ETc (mm/day) × Area (ha) × 10. */
export function computeEtcVolumeM3Day(etcMmDay: number | null, areaHa: number | null): number | null {
  if (
    etcMmDay == null ||
    areaHa == null ||
    !Number.isFinite(etcMmDay) ||
    !Number.isFinite(areaHa) ||
    etcMmDay <= 0 ||
    areaHa <= 0
  ) {
    return null
  }
  return Number((etcMmDay * areaHa * 10).toFixed(2))
}

export function buildWaterRequirementForSummary(
  summary: FieldSummaryModel,
  opts?: { et0MmDay?: number | null; aetMmDay?: number | null; aetSource?: string | null },
): FieldWaterRequirementResult {
  return calculateFieldWaterRequirement({
    fieldId: summary.layerFieldId || summary.plotId || '—',
    cropType: summary.cropType,
    areaHa: summary.areaHa,
    irrigationType: summary.layerIrrigationType,
    observationDate: summary.sceneDate,
    ndvi: summary.ndvi,
    ndwi: summary.ndwi,
    ndmi: summary.ndmi,
    ndii: summary.ndii,
    et0MmDay: opts?.et0MmDay ?? summary.et0MmDay ?? null,
    aetMmDay: opts?.aetMmDay ?? null,
    aetSource:
      opts?.aetMmDay != null
        ? opts?.aetSource?.trim() || 'FAO WaPOR AETI (satellite ET product)'
        : undefined,
    effectiveRainfallMmDay: 0,
    plantingDate: summary.phenologyPlantingDate,
    harvestDate: summary.phenologyHarvestDate,
    periodDays: summary.periodDays,
  })
}
export function buildProductionEstimationRow(
  summary: FieldSummaryModel,
  opts?: {
    ndviMin?: number | null
    ndviMax?: number | null
    et0MmDay?: number | null
    aetMmDay?: number | null
    aetSource?: string | null
  },
): ProductionEstimationRow {
  const areas = estimateNdviVegetatedAreas({
    areaHa: summary.areaHa,
    ndviMean: summary.ndvi,
    ndviMin: opts?.ndviMin ?? summary.ndviMin ?? null,
    ndviMax: opts?.ndviMax ?? summary.ndviMax ?? null,
  })
  const stressLevel = classifyNdviStressLevel(summary.ndvi)
  const healthFactor = ndviHealthFactorForStress(stressLevel)
  const expectedYieldTHa = summary.yieldTHa
  const water = buildWaterRequirementForSummary(summary, {
    et0MmDay: opts?.et0MmDay,
    aetMmDay: opts?.aetMmDay ?? null,
    aetSource: opts?.aetMmDay != null ? opts?.aetSource : undefined,
  })
  const aetForLoss = resolveEffectiveAetMmDay({
    aetMmDay: opts?.aetMmDay ?? null,
    etcMmDay: water.etcMmDay,
    ndmi: summary.ndmi,
    ndwi: summary.ndwi,
    ndvi: summary.ndvi,
    sceneDate: summary.sceneDate || summary.toDate,
  }).aetMmDay
  const etConsumptionPercent = calculateEtConsumptionPercent(aetForLoss, water.etcMmDay)
  const waterStressPercent = calculateWaterStressPercent(aetForLoss, water.etcMmDay)
  const lossMetrics = computeFieldWaterLossMetrics({
    areaHa: summary.areaHa,
    etcMmDay: water.etcMmDay,
    aetMmDay: aetForLoss,
    ndmi: summary.ndmi,
    ndwi: summary.ndwi,
  })
  return {
    fieldId: summary.layerFieldId || summary.plotId || '—',
    farmName: summary.originalFieldName || summary.fieldName || '—',
    cropClassification: summary.cropType || '—',
    irrigationType: summary.layerIrrigationType || '—',
    totalAreaHa: summary.areaHa,
    plannedCropCoverageHa: areas.vegetatedAreaHa,
    unplannedAreaHa: areas.nonVegetatedAreaHa,
    vegetationCoveragePct: areas.vegetationCoveragePct,
    averageNdvi: summary.ndvi,
    stressLevel,
    expectedYieldTHa,
    ndviHealthFactor: healthFactor,
    estimatedHarvestProductionTons: estimateHarvestProductionTons({
      vegetatedAreaHa: areas.vegetatedAreaHa,
      expectedYieldTHa,
      ndviHealthFactor: healthFactor,
    }),
    waterLossIndexPct: lossMetrics.waterLossIndexPct,
    waterLossM3Day: lossMetrics.waterLossM3Day,
    waterLossM3HaDay: lossMetrics.waterLossM3HaDay,
    ...mapWaterResultToProductionRow(water),
    aetMmDay: aetForLoss,
    etConsumptionPercent,
    waterStressPercent,
  }
}

export function buildProductionEstimationRows(
  summaries: FieldSummaryModel[],
  opts?: {
    et0ByFieldKey?: Map<string, number>
    aetByFieldKey?: Map<string, number>
    /** Parallel plot.fieldKey for Map lookups (batch export). */
    fieldKeys?: string[]
  },
): ProductionEstimationRow[] {
  return summaries.map((s, i) => {
    const key = opts?.fieldKeys?.[i] ?? s.plotId ?? s.layerFieldId
    return buildProductionEstimationRow(s, {
      et0MmDay: opts?.et0ByFieldKey?.get(key) ?? s.et0MmDay ?? null,
      aetMmDay: opts?.aetByFieldKey?.get(key) ?? null,
      aetSource:
        opts?.aetByFieldKey?.get(key) != null
          ? 'FAO WaPOR AETI (satellite ET product)'
          : undefined,
    })
  })
}

export function sumWaterRequirementTotals(
  rows: ProductionEstimationRow[],
): WaterRequirementBatchSummary {
  const sum = (pick: (r: ProductionEstimationRow) => number | null): number | null => {
    const vals = rows.map(pick).filter((v): v is number => v != null && Number.isFinite(v))
    if (!vals.length) return null
    return Number(vals.reduce((a, b) => a + b, 0).toFixed(1))
  }
  const mean = (pick: (r: ProductionEstimationRow) => number | null): number | null => {
    const vals = rows.map(pick).filter((v): v is number => v != null && Number.isFinite(v))
    if (!vals.length) return null
    return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
  }

  const averageEta = mean(r => r.aetMmDay)
  const averageEtc = mean(r => r.etcMmDay)
  const portfolioEtConsumption =
    averageEta != null && averageEtc != null && averageEtc > 0
      ? calculateEtConsumptionPercent(averageEta, averageEtc)
      : mean(r => r.etConsumptionPercent)
  const portfolioWaterStress =
    averageEta != null && averageEtc != null && averageEtc > 0
      ? calculateWaterStressPercent(averageEta, averageEtc)
      : mean(r => r.waterStressPercent)

  return {
    totalFields: rows.length,
    totalAreaHa: sum(r => r.totalAreaHa),
    totalDailyWaterM3: sum(r => r.waterRequirementM3Day),
    totalWeeklyWaterM3: sum(r => r.waterRequirementM3Week),
    totalMonthlyWaterM3: sum(r => r.waterRequirementM3Month),
    averageWaterStressPct: portfolioWaterStress,
    averageEtConsumptionPct: portfolioEtConsumption,
  }
}

export function sumWaterLossTotals(rows: ProductionEstimationRow[]): WaterLossPortfolioTotals {
  const sum = (pick: (r: ProductionEstimationRow) => number | null): number | null => {
    const vals = rows.map(pick).filter((v): v is number => v != null && Number.isFinite(v))
    if (!vals.length) return null
    return Number(vals.reduce((a, b) => a + b, 0).toFixed(2))
  }
  const mean = (pick: (r: ProductionEstimationRow) => number | null): number | null => {
    const vals = rows.map(pick).filter((v): v is number => v != null && Number.isFinite(v))
    if (!vals.length) return null
    return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
  }

  const totalM3Day = sum(r => r.waterLossM3Day)
  const totalEtcVolumeM3Day = sum(r => computeEtcVolumeM3Day(r.etcMmDay, r.totalAreaHa))
  const totalArea = sum(r => r.totalAreaHa)
  const portfolioM3HaDay =
    totalM3Day != null && totalArea != null && totalArea > 0
      ? Number((totalM3Day / totalArea).toFixed(2))
      : null

  const totalWaterLossIndexPct =
    totalM3Day != null && totalEtcVolumeM3Day != null && totalEtcVolumeM3Day > 0
      ? Number(((totalM3Day / totalEtcVolumeM3Day) * 100).toFixed(1))
      : null

  return {
    totalWaterLossIndexPct,
    totalWaterLossM3Day: totalM3Day,
    totalWaterLossM3HaDay: portfolioM3HaDay,
    meanWaterLossM3HaDay: mean(r => r.waterLossM3HaDay),
  }
}

export function sumProductionEstimationTotals(
  rows: ProductionEstimationRow[],
): Pick<
  ProductionEstimationRow,
  | 'totalAreaHa'
  | 'plannedCropCoverageHa'
  | 'unplannedAreaHa'
  | 'estimatedHarvestProductionTons'
> {
  const sum = (pick: (r: ProductionEstimationRow) => number | null): number | null => {
    const vals = rows
      .map(pick)
      .filter((v): v is number => v != null && Number.isFinite(v))
    if (!vals.length) return null
    return Number(vals.reduce((a, b) => a + b, 0).toFixed(3))
  }
  return {
    totalAreaHa: sum(r => r.totalAreaHa),
    plannedCropCoverageHa: sum(r => r.plannedCropCoverageHa),
    unplannedAreaHa: sum(r => r.unplannedAreaHa),
    estimatedHarvestProductionTons: sum(r => r.estimatedHarvestProductionTons),
  }
}
