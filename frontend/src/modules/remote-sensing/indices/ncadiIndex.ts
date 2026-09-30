/**
 * NCADI — Newly Cultivated / Abandoned Detection Index.
 *
 * NDVI = (B08−B04)/(B08+B04)
 * NDMI = (B08−B11)/(B08+B11)
 * ΔNDVI = NDVI_Current − NDVI_Previous
 * ΔNDMI = NDMI_Current − NDMI_Previous
 *
 * NCADI = 0.7·ΔNDVI + 0.3·ΔNDMI
 */

export const NCADI_LAYER_ID = 'NCADI'

export const NCADI_SCIENTIFIC_NAME =
  'Newly Cultivated / Abandoned Detection Index — 0.7·ΔNDVI + 0.3·ΔNDMI · 10-class'

export const NCADI_WEIGHT_DNDVI = 0.7
export const NCADI_WEIGHT_DNDMI = 0.3

/** Fusion of scene deltas (evalscript / docs). */
export const NCADI_EXPR = `${NCADI_WEIGHT_DNDVI} * dNdvi + ${NCADI_WEIGHT_DNDMI} * dNdmi`

/** Equivalent static fusion so Δ(fusion) = 0.7·ΔNDVI + 0.3·ΔNDMI. */
export const NCADI_FUSION_EXPR =
  `${NCADI_WEIGHT_DNDVI} * ndvi + ${NCADI_WEIGHT_DNDMI} * ndmi`

export const NCADI_FORMULA_DOC =
  `${NCADI_WEIGHT_DNDVI}·ΔNDVI + ${NCADI_WEIGHT_DNDMI}·ΔNDMI`

/** Lookback for previous orbit when no explicit previous date is set. */
export const NCADI_LOOKBACK_DAYS = 60

/**
 * Interior class edges for classifyVal (low → high).
 * Class 0: < −0.35 · Class 9: ≥ 0.50
 */
export const NCADI_CLASS_BREAKS: readonly number[] = [
  -0.35, -0.2, -0.1, -0.03, 0.03, 0.1, 0.2, 0.35, 0.5,
]

/** Midpoints for legend / ramp sampling. */
export const NCADI_CLASS_VALUES: readonly number[] = [
  -0.42, -0.275, -0.15, -0.065, 0, 0.065, 0.15, 0.275, 0.425, 0.58,
]

export const NCADI_CLASS_LABELS: readonly string[] = [
  'Extreme Abandonment · NCADI < −0.35',
  'High Abandonment Risk · −0.35 to −0.20',
  'Moderate Decline · −0.20 to −0.10',
  'Slight Vegetation Decline · −0.10 to −0.03',
  'Stable Condition · −0.03 to 0.03',
  'Slight Cultivation Gain · 0.03 to 0.10',
  'Moderate Cultivation Gain · 0.10 to 0.20',
  'High Cultivation Gain · 0.20 to 0.35',
  'Very High Cultivation Gain · 0.35 to 0.50',
  'Extreme Cultivation Gain · NCADI > 0.50',
]

/** Diverging palette: abandonment (brown/red) → stable (amber) → cultivation gain (green). */
export const NCADI_CLASS_COLORS: readonly number[] = [
  0x543005, 0x8c510a, 0xbf812d, 0xdfc27d, 0xf6e8c3, 0xc7eae5, 0x80cdc1, 0x35978f, 0x01665e, 0x003c30,
]

export function isNcadiLayerId(layerId: string): boolean {
  return String(layerId || '').trim().toUpperCase() === NCADI_LAYER_ID
}

export function computeNcadi(dNdvi: number, dNdmi: number): number {
  return NCADI_WEIGHT_DNDVI * dNdvi + NCADI_WEIGHT_DNDMI * dNdmi
}
