/**
 * FAO-56 crop coefficient (Kc) configuration by crop type and growth stage.
 * Values are indicative defaults — adjust per local calibration.
 * @see FAO Irrigation and Drainage Paper 56
 */

export type GrowthStage = 'Initial' | 'Development' | 'Mid-season' | 'Late-season' | 'Unknown'

export type CropStageCoefficients = {
  initial: number
  development: number
  mid: number
  late: number
  /** Typical cumulative days per stage (for phenology-based stage inference). */
  stageDays: { initial: number; development: number; mid: number; late: number }
}

/** NDVI thresholds for stage inference when planting date is unavailable. */
export type NdviGrowthStageThresholds = {
  initialMax: number
  developmentMax: number
  midMax: number
}

export const DEFAULT_NDVI_GROWTH_THRESHOLDS: NdviGrowthStageThresholds = {
  initialMax: 0.2,
  developmentMax: 0.4,
  midMax: 0.7,
}

/** Default irrigation system efficiency when type is unknown. */
export const DEFAULT_IRRIGATION_EFFICIENCY = 0.8

/**
 * FAO-56 Kc tables (single crop coefficient per stage).
 * Sources: FAO-56 Table 12 + common regional values.
 */
export const CROP_COEFFICIENTS: Record<string, CropStageCoefficients> = {
  potato: {
    initial: 0.5,
    development: 0.75,
    mid: 1.15,
    late: 0.85,
    stageDays: { initial: 25, development: 30, mid: 45, late: 30 },
  },
  wheat: {
    initial: 0.3,
    development: 0.7,
    mid: 1.15,
    late: 0.25,
    stageDays: { initial: 20, development: 35, mid: 50, late: 30 },
  },
  maize: {
    initial: 0.3,
    development: 0.75,
    mid: 1.2,
    late: 0.6,
    stageDays: { initial: 20, development: 35, mid: 40, late: 30 },
  },
  corn: {
    initial: 0.3,
    development: 0.75,
    mid: 1.2,
    late: 0.6,
    stageDays: { initial: 20, development: 35, mid: 40, late: 30 },
  },
  barley: {
    initial: 0.3,
    development: 0.65,
    mid: 1.1,
    late: 0.25,
    stageDays: { initial: 20, development: 30, mid: 45, late: 25 },
  },
  rice: {
    initial: 1.05,
    development: 1.1,
    mid: 1.2,
    late: 0.95,
    stageDays: { initial: 25, development: 35, mid: 50, late: 30 },
  },
  soybean: {
    initial: 0.4,
    development: 0.75,
    mid: 1.15,
    late: 0.5,
    stageDays: { initial: 20, development: 30, mid: 40, late: 25 },
  },
  sunflower: {
    initial: 0.35,
    development: 0.7,
    mid: 1.15,
    late: 0.35,
    stageDays: { initial: 25, development: 35, mid: 45, late: 25 },
  },
  sugar_beet: {
    initial: 0.35,
    development: 0.7,
    mid: 1.2,
    late: 0.7,
    stageDays: { initial: 25, development: 35, mid: 50, late: 30 },
  },
  default: {
    initial: 0.35,
    development: 0.7,
    mid: 1.05,
    late: 0.65,
    stageDays: { initial: 25, development: 35, mid: 45, late: 30 },
  },
}

const CROP_ALIASES: Record<string, string> = {
  potatoes: 'potato',
  patato: 'potato',
  'sugar beet': 'sugar_beet',
  sugarbeet: 'sugar_beet',
  soya: 'soybean',
  soya_bean: 'soybean',
  maize_corn: 'maize',
}

export function normalizeCropKey(cropType: string | null | undefined): string {
  const raw = String(cropType || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s-]+/g, '_')
  if (!raw || raw === '—' || raw === 'unknown') return 'default'
  if (CROP_COEFFICIENTS[raw]) return raw
  if (CROP_ALIASES[raw]) return CROP_ALIASES[raw]!
  for (const [alias, key] of Object.entries(CROP_ALIASES)) {
    if (raw.includes(alias.replace(/_/g, '')) || raw.includes(alias)) return key
  }
  for (const key of Object.keys(CROP_COEFFICIENTS)) {
    if (key !== 'default' && raw.includes(key)) return key
  }
  return 'default'
}

export function getCropStageCoefficients(cropType: string | null | undefined): CropStageCoefficients {
  return CROP_COEFFICIENTS[normalizeCropKey(cropType)] ?? CROP_COEFFICIENTS.default!
}

export function kcForGrowthStage(
  cropType: string | null | undefined,
  stage: GrowthStage,
): number | null {
  const coeffs = getCropStageCoefficients(cropType)
  if (stage === 'Unknown') return coeffs.mid
  switch (stage) {
    case 'Initial':
      return coeffs.initial
    case 'Development':
      return coeffs.development
    case 'Mid-season':
      return coeffs.mid
    case 'Late-season':
      return coeffs.late
    default:
      return null
  }
}

export function resolveIrrigationEfficiency(irrigationType: string | null | undefined): number {
  const t = String(irrigationType || '').trim().toLowerCase()
  if (!t || t === '—') return DEFAULT_IRRIGATION_EFFICIENCY
  if (t.includes('drip') || t.includes('micro')) return 0.9
  if (t.includes('pivot') || t.includes('sprinkler') || t.includes('center')) return 0.85
  if (t.includes('flood') || t.includes('surface') || t.includes('furrow')) return 0.6
  if (t.includes('rain')) return 0.95
  return DEFAULT_IRRIGATION_EFFICIENCY
}
