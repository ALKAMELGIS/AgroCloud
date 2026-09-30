/**
 * Water Requirement & Evapotranspiration Estimation (FAO-56 based).
 *
 * Definitions (do not conflate):
 * - ETc  = crop water demand (Kc × ET0)
 * - AET  = actual evapotranspiration (satellite product only — null when unavailable)
 * - Net Water Requirement ≈ ETc − effective rainfall (rainfall assumed 0 unless provided)
 * - Gross Irrigation Requirement = Net / irrigation efficiency
 * - Water Requirement (m³) = Gross mm/day × area(ha) × 10
 *
 * NDVI/NDWI/NDMI/NDII are auxiliary stress indicators — NOT converted to water volume.
 */

import {
  DEFAULT_NDVI_GROWTH_THRESHOLDS,
  type GrowthStage,
  getCropStageCoefficients,
  kcForGrowthStage,
  normalizeCropKey,
  resolveIrrigationEfficiency,
} from './cropCoefficients'
import { estimatePhenologyDates } from './agriculturalObjectIntelligenceMapper'

export type WaterCalculationStatus =
  | 'complete'
  | 'partial'
  | 'insufficient_data'

export type WaterRequirementSources = {
  etSource: string
  aetSource: string
  weatherSource: string
  satelliteDate: string | null
  kcSource: string
  calculationStatus: WaterCalculationStatus
}

export type FieldWaterRequirementInput = {
  fieldId: string
  cropType: string | null | undefined
  areaHa: number | null | undefined
  irrigationType?: string | null
  /** Observation / scene date (YYYY-MM-DD). */
  observationDate: string | null | undefined
  ndvi: number | null | undefined
  ndwi: number | null | undefined
  ndmi: number | null | undefined
  /** NDII = (NIR−SWIR1)/(NIR+SWIR1); falls back to NDMI when unavailable. */
  ndii: number | null | undefined
  /** Reference evapotranspiration mm/day (Open-Meteo FAO ET0). */
  et0MmDay: number | null | undefined
  /** Actual ET mm/day from satellite ET product (WaPOR, etc.) — null when unavailable. */
  aetMmDay?: number | null | undefined
  aetSource?: string | null
  /** Effective rainfall mm/day — default 0. */
  effectiveRainfallMmDay?: number | null
  /** Planting date ISO if known (layer or phenology). */
  plantingDate?: string | null
  /** Harvest / end date for season volume. */
  harvestDate?: string | null
  /** Report period length for season fallback (days). */
  periodDays?: number | null
  /** NDVI time series for growth-stage / phenology inference. */
  dailyNdvi?: Array<{ date: string; ndvi: number | null | undefined }>
}

export type FieldWaterRequirementResult = {
  fieldId: string
  cropType: string
  areaHa: number | null
  growthStage: GrowthStage | 'Unknown'
  et0MmDay: number | null
  kc: number | null
  etcMmDay: number | null
  aetMmDay: number | null
  ndvi: number | null
  ndwi: number | null
  ndmi: number | null
  ndii: number | null
  etConsumptionPercent: number | null
  waterStressPercent: number | null
  netWaterRequirementMmDay: number | null
  irrigationEfficiency: number | null
  grossIrrigationRequirementMmDay: number | null
  waterRequirementM3Day: number | null
  waterRequirementM3Week: number | null
  waterRequirementM3Month: number | null
  waterRequirementM3Season: number | null
  observationDate: string | null
  calculationStatus: WaterCalculationStatus
  sources: WaterRequirementSources
}

export type WaterRequirementBatchSummary = {
  totalFields: number
  totalAreaHa: number | null
  totalDailyWaterM3: number | null
  totalWeeklyWaterM3: number | null
  totalMonthlyWaterM3: number | null
  averageWaterStressPct: number | null
  averageEtConsumptionPct: number | null
}

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n)
}

function round(n: number, digits: number): number {
  return Number(n.toFixed(digits))
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = fromIso.trim().slice(0, 10)
  const b = toIso.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null
  const ms = new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()
  if (!Number.isFinite(ms)) return null
  return Math.max(0, Math.round(ms / 86_400_000))
}

/**
 * Growth stage from planting date + crop stage lengths, else NDVI thresholds.
 * Returns Unknown when data is insufficient — never invents planting date.
 */
export function inferGrowthStage(input: {
  cropType: string | null | undefined
  observationDate: string | null | undefined
  ndvi: number | null | undefined
  plantingDate?: string | null
  dailyNdvi?: Array<{ date: string; ndvi: number | null | undefined }>
}): GrowthStage | 'Unknown' {
  const obs = input.observationDate?.trim().slice(0, 10)
  let planting = input.plantingDate?.trim().slice(0, 10) || null

  if (!planting && input.dailyNdvi?.length) {
    const phenology = estimatePhenologyDates(input.dailyNdvi)
    planting = phenology?.planting ?? null
  }

  if (planting && obs) {
    const dap = daysBetween(planting, obs)
    if (dap != null) {
      const { stageDays } = getCropStageCoefficients(input.cropType)
      const d1 = stageDays.initial
      const d2 = d1 + stageDays.development
      const d3 = d2 + stageDays.mid
      if (dap <= d1) return 'Initial'
      if (dap <= d2) return 'Development'
      if (dap <= d3) return 'Mid-season'
      return 'Late-season'
    }
  }

  const ndvi = input.ndvi
  if (!finite(ndvi)) return 'Unknown'
  const t = DEFAULT_NDVI_GROWTH_THRESHOLDS
  if (ndvi < t.initialMax) return 'Initial'
  if (ndvi < t.developmentMax) return 'Development'
  if (ndvi < t.midMax) return 'Mid-season'
  return 'Late-season'
}

/** ETc = Kc × ET0 (FAO-56). */
export function calculateETc(kc: number | null, et0MmDay: number | null): number | null {
  if (!finite(kc) || !finite(et0MmDay) || et0MmDay <= 0) return null
  return round(kc * et0MmDay, 3)
}

/** ET Consumption (%) = (AET / ETc) × 100, clamped 0–100. */
export function calculateEtConsumptionPercent(
  aetMmDay: number | null,
  etcMmDay: number | null,
): number | null {
  if (!finite(aetMmDay) || !finite(etcMmDay) || etcMmDay <= 0) return null
  return round(Math.max(0, Math.min(100, (aetMmDay / etcMmDay) * 100)), 1)
}

/** Water Stress (%) = max(0, 1 − AET/ETc) × 100, clamped 0–100. */
export function calculateWaterStressPercent(
  aetMmDay: number | null,
  etcMmDay: number | null,
): number | null {
  if (!finite(aetMmDay) || !finite(etcMmDay) || etcMmDay <= 0) return null
  return round(Math.max(0, Math.min(100, (1 - aetMmDay / etcMmDay) * 100)), 1)
}

export type WaterLossFromEtDeficit = {
  waterLossIndexPct: number | null
  waterLossM3HaDay: number | null
  waterLossM3Day: number | null
  deficitMmDay: number | null
}

/**
 * Satellite water loss from ET deficit:
 *   Index (%) = (1 − ETa/ETc) × 100
 *   Loss (m³/ha/day) = max(0, ETc − ETa) × 10
 *   Loss (m³/day) = Loss (m³/ha/day) × area (ha)
 */
export function computeWaterLossFromEtDeficit(input: {
  etaMmDay: number | null
  etcMmDay: number | null
  areaHa: number | null
}): WaterLossFromEtDeficit {
  const etc = input.etcMmDay
  const eta = input.etaMmDay
  const areaHa = input.areaHa
  if (!finite(etc) || etc <= 0 || !finite(eta) || eta < 0) {
    return {
      waterLossIndexPct: null,
      waterLossM3HaDay: null,
      waterLossM3Day: null,
      deficitMmDay: null,
    }
  }
  const deficitMmDay = round(Math.max(0, etc - eta), 3)
  const waterLossIndexPct = calculateWaterStressPercent(eta, etc)
  const waterLossM3HaDay = round(deficitMmDay * 10, 2)
  const waterLossM3Day =
    finite(areaHa) && areaHa > 0 ? round(waterLossM3HaDay * areaHa, 2) : null
  return { waterLossIndexPct, waterLossM3HaDay, waterLossM3Day, deficitMmDay }
}

/**
 * Index-based stress classification (supplementary — NOT water volume).
 * Used when AET is unavailable.
 */
export function classifyIndexWaterStress(
  ndmi: number | null,
  ndwi: number | null,
): 'Low' | 'Moderate' | 'High' | 'Severe' | null {
  if (!finite(ndmi) && !finite(ndwi)) return null
  const score =
    finite(ndmi) && finite(ndwi)
      ? 0.6 * ndmi + 0.4 * ndwi
      : finite(ndmi)
        ? ndmi
        : ndwi!
  if (score >= 0.15) return 'Low'
  if (score >= 0.05) return 'Moderate'
  if (score >= -0.05) return 'High'
  return 'Severe'
}

/** Net requirement ≈ ETc − effective rainfall (default rain = 0). */
export function calculateNetWaterRequirementMmDay(input: {
  etcMmDay: number | null
  effectiveRainfallMmDay?: number | null
}): number | null {
  if (!finite(input.etcMmDay)) return null
  const rain = finite(input.effectiveRainfallMmDay) ? Math.max(0, input.effectiveRainfallMmDay) : 0
  return round(Math.max(0, input.etcMmDay - rain), 3)
}

export function calculateGrossIrrigationRequirementMmDay(
  netMmDay: number | null,
  irrigationEfficiency: number | null,
): number | null {
  if (!finite(netMmDay) || !finite(irrigationEfficiency) || irrigationEfficiency <= 0) return null
  return round(netMmDay / irrigationEfficiency, 3)
}

/** 1 mm over 1 ha = 10 m³ */
export function calculateWaterVolumeM3(
  grossMmDay: number | null,
  areaHa: number | null,
): number | null {
  if (!finite(grossMmDay) || !finite(areaHa) || areaHa <= 0) return null
  return round(grossMmDay * areaHa * 10, 1)
}

export function calculateSeasonDays(input: {
  plantingDate?: string | null
  harvestDate?: string | null
  periodDays?: number | null
}): number | null {
  const plant = input.plantingDate?.trim().slice(0, 10)
  const harvest = input.harvestDate?.trim().slice(0, 10)
  if (plant && harvest) {
    const d = daysBetween(plant, harvest)
    if (d != null && d > 0) return d
  }
  if (finite(input.periodDays) && input.periodDays > 0) return Math.round(input.periodDays)
  return null
}

export function calculateFieldWaterRequirement(
  input: FieldWaterRequirementInput,
): FieldWaterRequirementResult {
  const cropKey = normalizeCropKey(input.cropType)
  const cropLabel = String(input.cropType || '—').trim() || '—'
  const obs = input.observationDate?.trim().slice(0, 10) || null

  const growthStage = inferGrowthStage({
    cropType: input.cropType,
    observationDate: obs,
    ndvi: input.ndvi,
    plantingDate: input.plantingDate,
    dailyNdvi: input.dailyNdvi,
  })

  const kcFromStage = kcForGrowthStage(input.cropType, growthStage === 'Unknown' ? 'Unknown' : growthStage)
  const kcSource =
    kcFromStage != null
      ? `FAO-56 Kc (${cropKey}, ${growthStage})`
      : 'Kc unavailable — growth stage unknown'

  const et0 = finite(input.et0MmDay) ? input.et0MmDay : null
  const kc = kcFromStage
  const etc = calculateETc(kc, et0)

  // AET: only from explicit satellite ET product — never from NDVI/NDMI proxy.
  const aet = finite(input.aetMmDay) && input.aetMmDay >= 0 ? input.aetMmDay : null

  const etConsumption = calculateEtConsumptionPercent(aet, etc)
  const waterStress = calculateWaterStressPercent(aet, etc)

  const irrigationEfficiency = resolveIrrigationEfficiency(input.irrigationType)
  const netReq = calculateNetWaterRequirementMmDay({
    etcMmDay: etc,
    effectiveRainfallMmDay: input.effectiveRainfallMmDay ?? 0,
  })
  const grossReq = calculateGrossIrrigationRequirementMmDay(netReq, irrigationEfficiency)
  const areaHa = finite(input.areaHa) && input.areaHa > 0 ? input.areaHa : null
  const m3Day = calculateWaterVolumeM3(grossReq, areaHa)
  const m3Week = m3Day != null ? round(m3Day * 7, 1) : null
  const m3Month = m3Day != null ? round(m3Day * 30, 1) : null

  const seasonDays = calculateSeasonDays({
    plantingDate: input.plantingDate,
    harvestDate: input.harvestDate,
    periodDays: input.periodDays,
  })
  const m3Season =
    m3Day != null && seasonDays != null ? round(m3Day * seasonDays, 1) : null

  let calculationStatus: WaterCalculationStatus = 'insufficient_data'
  if (etc != null && m3Day != null) {
    calculationStatus = aet != null ? 'complete' : 'partial'
  } else if (etc != null || finite(input.ndvi)) {
    calculationStatus = 'partial'
  }

  return {
    fieldId: input.fieldId,
    cropType: cropLabel,
    areaHa,
    growthStage: growthStage === 'Unknown' ? 'Unknown' : growthStage,
    et0MmDay: et0,
    kc,
    etcMmDay: etc,
    aetMmDay: aet,
    ndvi: finite(input.ndvi) ? round(input.ndvi, 4) : null,
    ndwi: finite(input.ndwi) ? round(input.ndwi, 4) : null,
    ndmi: finite(input.ndmi) ? round(input.ndmi, 4) : null,
    ndii: finite(input.ndii) ? round(input.ndii, 4) : null,
    etConsumptionPercent: etConsumption,
    waterStressPercent: waterStress,
    netWaterRequirementMmDay: netReq,
    irrigationEfficiency: round(irrigationEfficiency, 2),
    grossIrrigationRequirementMmDay: grossReq,
    waterRequirementM3Day: m3Day,
    waterRequirementM3Week: m3Week,
    waterRequirementM3Month: m3Month,
    waterRequirementM3Season: m3Season,
    observationDate: obs,
    calculationStatus,
    sources: {
      etSource: etc != null ? 'FAO-56: ETc = Kc × ET0' : 'ETc unavailable',
      aetSource: aet != null ? (input.aetSource?.trim() || 'Satellite ET product (WaPOR AETI)') : 'AET not available — no satellite ET product',
      weatherSource: et0 != null ? 'Open-Meteo ERA5 ET0 (FAO)' : 'ET0 unavailable',
      satelliteDate: obs,
      kcSource,
      calculationStatus,
    },
  }
}

export function calculateBatchWaterRequirements(
  fields: FieldWaterRequirementInput[],
): FieldWaterRequirementResult[] {
  return fields.map(calculateFieldWaterRequirement)
}

export function summarizeWaterRequirements(
  results: FieldWaterRequirementResult[],
): WaterRequirementBatchSummary {
  const sum = (pick: (r: FieldWaterRequirementResult) => number | null): number | null => {
    const vals = results.map(pick).filter((v): v is number => finite(v))
    if (!vals.length) return null
    return round(vals.reduce((a, b) => a + b, 0), 1)
  }
  const mean = (pick: (r: FieldWaterRequirementResult) => number | null): number | null => {
    const vals = results.map(pick).filter((v): v is number => finite(v))
    if (!vals.length) return null
    return round(vals.reduce((a, b) => a + b, 0) / vals.length, 1)
  }

  return {
    totalFields: results.length,
    totalAreaHa: sum(r => r.areaHa),
    totalDailyWaterM3: sum(r => r.waterRequirementM3Day),
    totalWeeklyWaterM3: sum(r => r.waterRequirementM3Week),
    totalMonthlyWaterM3: sum(r => r.waterRequirementM3Month),
    averageWaterStressPct: mean(r => r.waterStressPercent),
    averageEtConsumptionPct: mean(r => r.etConsumptionPercent),
  }
}
