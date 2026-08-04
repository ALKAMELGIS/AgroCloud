/**
 * Production Estimation Sheet — NDVI vegetated / unplanned area + harvest production.
 * Used by Batch Export → Field Summary (Excel).
 */

import type { FieldSummaryModel } from './buildFieldSummaryModel'

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
  totalAreaHa: number | null
  plannedCropCoverageHa: number | null
  unplannedAreaHa: number | null
  vegetationCoveragePct: number | null
  averageNdvi: number | null
  stressLevel: NdviStressLevel | '—'
  expectedYieldTHa: number | null
  ndviHealthFactor: number | null
  estimatedHarvestProductionTons: number | null
}

export const PRODUCTION_ESTIMATION_HEADERS = [
  'Field ID',
  'Farm Name',
  'Crop Classification',
  'Total Area from Layer (ha)',
  'Planned Crop Coverage (NDVI Vegetated Area) (ha)',
  'Unplanned Area (NDVI Non-Vegetated Area) (ha)',
  'Vegetation Coverage (%)',
  'Average NDVI',
  'Stress Level',
  'Expected Yield (Ton/ha)',
  'Estimated Harvest Production (Ton)',
] as const

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

export function buildProductionEstimationRow(
  summary: FieldSummaryModel,
  opts?: { ndviMin?: number | null; ndviMax?: number | null },
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
  return {
    fieldId: summary.plotId || '—',
    farmName: summary.fieldName || '—',
    cropClassification: summary.cropType || '—',
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
  }
}

export function buildProductionEstimationRows(
  summaries: FieldSummaryModel[],
): ProductionEstimationRow[] {
  return summaries.map(s => buildProductionEstimationRow(s))
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
