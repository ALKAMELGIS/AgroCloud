/**
 * WAPI — Water Allocation Priority Index.
 *
 * WDSI = 0.40·NDMI + 0.35·NDWI + 0.15·NDVI + 0.10·SAVI
 * ΔWDSI = WDSI(current) − WDSI(previous)
 * ETstress = clamp(1 − (0.6·NDMI + 0.4·NDWI), 0, 1)
 *
 * WAPI = 0.40·WDSI + 0.20·ΔWDSI + 0.20·(1 − NDMI) + 0.10·ETstress + 0.10
 *
 * Map WMS uses ORBIT mosaicking for ΔWDSI. Single-scene / chart path uses ΔWDSI = 0.
 * Raster / Legend: discrete 10-class classification on WAPI pixel value [0, 1].
 */

export const WAPI_LAYER_ID = 'WAPI'

export const WAPI_SCIENTIFIC_NAME =
  'Water Allocation Priority Index (0.40·WDSI + 0.20·ΔWDSI + 0.20·(1−NDMI) + 0.10·ETstress + 0.10) · 10-class'

export const WAPI_WDSI_EXPR = '0.40 * ndmi + 0.35 * ndwi + 0.15 * ndvi + 0.10 * savi'

/** Moisture-driven ET stress fraction in [0, 1] (1 = dry / high demand). */
export const WAPI_ET_STRESS_EXPR =
  'Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi)))'

/**
 * Single-scene / chart expression (ΔWDSI = 0).
 * Used by resolveAgroCompositeExpr and standard delta DWAPI.
 */
export const WAPI_STATIC_EXPR =
  `0.40 * (${WAPI_WDSI_EXPR}) + 0.20 * (1 - ndmi) + 0.10 * (${WAPI_ET_STRESS_EXPR}) + 0.10`

/** Lookback for previous orbit so ΔWDSI can be computed (ORBIT mosaicking). */
export const WAPI_LOOKBACK_DAYS = 45

export const WAPI_VALUE_MIN = 0
export const WAPI_VALUE_MAX = 1

/**
 * Interior edges for classifyVal (low → high).
 * Class 0: &lt; 0.10 · Class 9: ≥ 0.90
 */
export const WAPI_CLASS_BREAKS: readonly number[] = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
]

/** Midpoints for legend / ramp sampling (Class 1 → Class 10). */
export const WAPI_CLASS_VALUES: readonly number[] = [
  0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95,
]

/** Class 1 (Normal) → Class 10 (Extreme Critical). */
export const WAPI_CLASS_LABELS: readonly string[] = [
  'Class 1 · Normal · 0.00–0.09',
  'Class 2 · Healthy · 0.10–0.19',
  'Class 3 · Low Stress · 0.20–0.29',
  'Class 4 · Low Moderate · 0.30–0.39',
  'Class 5 · Moderate · 0.40–0.49',
  'Class 6 · Moderate High · 0.50–0.59',
  'Class 7 · High Stress · 0.60–0.69',
  'Class 8 · Very High Stress · 0.70–0.79',
  'Class 9 · Critical · 0.80–0.89',
  'Class 10 · Extreme Critical · 0.90–1.00',
]

export const WAPI_CLASS_STATUS: readonly string[] = [
  'Normal',
  'Healthy',
  'Low Stress',
  'Low Moderate',
  'Moderate',
  'Moderate High',
  'High Stress',
  'Very High Stress',
  'Critical',
  'Extreme Critical',
]

export const WAPI_CLASS_ACTIONS: readonly string[] = [
  'No intervention required',
  'No action required',
  'Normal monitoring',
  'Weekly observation',
  'Monitor closely',
  'Increase monitoring',
  'Prioritize water allocation',
  'Irrigate within 24–48 hours',
  'Highest water priority',
  'Immediate irrigation / crop rescue',
]

/** Class 1 blue → Class 10 dark magenta. */
export const WAPI_CLASS_COLORS: readonly number[] = [
  0x5c6bc0, // 1 Normal
  0x43a047, // 2 Healthy
  0x26a69a, // 3 Low Stress
  0xfff176, // 4 Low Moderate
  0xfdd835, // 5 Moderate
  0xffb300, // 6 Moderate High
  0xef6c00, // 7 High Stress
  0xec407a, // 8 Very High Stress
  0xe91e63, // 9 Critical
  0xad1457, // 10 Extreme Critical
]

export function isWapiLayerId(layerId: string | null | undefined): boolean {
  const u = String(layerId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return u === 'WAPI'
}

/** Classify WAPI pixel into 0-based class index (0 = Class 1 … 9 = Class 10). */
export function classifyWapiClassIndex(wapi: number): number {
  const v = Number.isFinite(wapi) ? wapi : 0
  for (let i = 0; i < WAPI_CLASS_BREAKS.length; i++) {
    if (v < WAPI_CLASS_BREAKS[i]!) return i
  }
  return 9
}

/** 1-based class number for UI (1–10). */
export function classifyWapiClassNumber(wapi: number): number {
  return classifyWapiClassIndex(wapi) + 1
}

export function computeWdsiFromCore(input: {
  ndvi: number
  ndmi: number
  ndwi: number
  savi: number
}): number {
  return 0.4 * input.ndmi + 0.35 * input.ndwi + 0.15 * input.ndvi + 0.1 * input.savi
}

export function computeEtStressFromCore(input: { ndmi: number; ndwi: number }): number {
  const raw = 1 - (0.6 * input.ndmi + 0.4 * input.ndwi)
  return Math.max(0, Math.min(1, raw))
}

/** Full WAPI with optional ΔWDSI (defaults to 0). */
export function computeWapi(input: {
  ndvi: number
  ndmi: number
  ndwi: number
  savi: number
  deltaWdsi?: number | null
}): number {
  const wdsi = computeWdsiFromCore(input)
  const dWdsi =
    input.deltaWdsi != null && Number.isFinite(input.deltaWdsi) ? input.deltaWdsi : 0
  const etStress = computeEtStressFromCore(input)
  return 0.4 * wdsi + 0.2 * dWdsi + 0.2 * (1 - input.ndmi) + 0.1 * etStress + 0.1
}
