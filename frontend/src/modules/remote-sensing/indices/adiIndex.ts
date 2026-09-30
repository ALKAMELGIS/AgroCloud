/**
 * ADI — Anomaly Detection Index (z-score vs historical baseline).
 *
 * Current_Index = 0.5·NDVI + 0.3·NDMI + 0.2·NDRE
 *   NDVI = (B08−B04)/(B08+B04)
 *   NDMI = (B08−B11)/(B08+B11)
 *   NDRE = (B08−B05)/(B08+B05)
 *
 * ADI = (Current_Index − Historical_Mean_Index) / Historical_Std_Index
 */

export const ADI_LAYER_ID = 'ADI'

export const ADI_SCIENTIFIC_NAME =
  'Anomaly Detection Index — (Current − Historical Mean) / Historical Std · 10-class'

export const ADI_WEIGHT_NDVI = 0.5
export const ADI_WEIGHT_NDMI = 0.3
export const ADI_WEIGHT_NDRE = 0.2

/** Fusion used as Current_Index / historical samples. */
export const ADI_CURRENT_INDEX_EXPR =
  `${ADI_WEIGHT_NDVI} * ndvi + ${ADI_WEIGHT_NDMI} * ndmi + ${ADI_WEIGHT_NDRE} * ndre`

export const ADI_FORMULA_DOC =
  `(${ADI_WEIGHT_NDVI}·NDVI + ${ADI_WEIGHT_NDMI}·NDMI + ${ADI_WEIGHT_NDRE}·NDRE − μ_hist) / σ_hist`

/** Multi-orbit lookback for historical mean/std (days). */
export const ADI_HISTORICAL_LOOKBACK_DAYS = 90

/**
 * Interior class edges for classifyVal (low → high).
 * Class 0: < −2 · Class 9: ≥ 3
 */
export const ADI_CLASS_BREAKS: readonly number[] = [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2, 3]

/** Midpoints for legend / ramp sampling. */
export const ADI_CLASS_VALUES: readonly number[] = [
  -2.5, -1.75, -1.25, -0.75, 0, 0.75, 1.25, 1.75, 2.5, 3.5,
]

export const ADI_CLASS_LABELS: readonly string[] = [
  'Extreme Negative Anomaly · ADI < −2.0',
  'High Stress · −2.0 to −1.5',
  'Moderate Stress · −1.5 to −1.0',
  'Slight Negative Change · −1.0 to −0.5',
  'Normal Condition · −0.5 to 0.5',
  'Slight Positive Change · 0.5 to 1.0',
  'Moderate Positive Change · 1.0 to 1.5',
  'High Anomaly · 1.5 to 2.0',
  'Very High Anomaly · 2.0 to 3.0',
  'Extreme Positive Anomaly · ADI > 3.0',
]

/** Diverging palette: critical decline (red) → normal (amber) → strong gain (green). */
export const ADI_CLASS_COLORS: readonly number[] = [
  0x7f0000, 0xb22222, 0xd73027, 0xf46d43, 0xfee08b, 0xd9ef8b, 0xa6d96a, 0x66bb6a, 0x1a9850, 0x006837,
]

export function isAdiLayerId(layerId: string): boolean {
  return String(layerId || '').trim().toUpperCase() === ADI_LAYER_ID
}

export function computeAdiCurrentIndex(ndvi: number, ndmi: number, ndre: number): number {
  return ADI_WEIGHT_NDVI * ndvi + ADI_WEIGHT_NDMI * ndmi + ADI_WEIGHT_NDRE * ndre
}

export function computeAdiZScore(
  current: number,
  historicalMean: number,
  historicalStd: number,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(historicalMean)) return NaN
  const std = Number.isFinite(historicalStd) && historicalStd > 1e-6 ? historicalStd : 1e-6
  return (current - historicalMean) / std
}
