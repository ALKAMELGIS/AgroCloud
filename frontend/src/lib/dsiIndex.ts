/**
 * DSI — Drought Severity Index.
 *
 * DSI = 0.50 × (1 − VCI) + 0.30 × (1 − SMCI) + 0.20 × (1 − NDMI_Normalized)
 *
 * Single-scene proxies (Sentinel-2):
 *   VCI            = norm(NDVI) over [0.05, 0.85]
 *   SMCI           = norm(0.7·NDMI + 0.3·NDWI) over [−0.3, 0.5]
 *   NDMI_Normalized = norm(NDMI) over [−0.8, 0.8]
 *
 * Higher DSI → greater drought severity. Map / legend: discrete 10-class [0, 1].
 */

export const DSI_LAYER_ID = 'DSI'

export const DSI_SCIENTIFIC_NAME =
  'Drought Severity Index (0.50·(1−VCI) + 0.30·(1−SMCI) + 0.20·(1−NDMI_norm)) · 10-class'

/** Evalscript — clamp NDVI to VCI ∈ [0, 1]. */
export const DSI_VCI_EXPR = 'Math.max(0, Math.min(1, (ndvi - 0.05) / 0.80))'

/** Evalscript — soil-moisture proxy SMCI ∈ [0, 1]. */
export const DSI_SMCI_EXPR =
  'Math.max(0, Math.min(1, (0.7 * ndmi + 0.3 * ndwi + 0.3) / 0.8))'

/** Evalscript — NDMI normalized to [0, 1]. */
export const DSI_NDMI_NORM_EXPR = 'Math.max(0, Math.min(1, (ndmi + 0.8) / 1.6))'

/** Single-scene composite expression (uses core ndvi / ndmi / ndwi). */
export const DSI_STATIC_EXPR = `0.50 * (1 - (${DSI_VCI_EXPR})) + 0.30 * (1 - (${DSI_SMCI_EXPR})) + 0.20 * (1 - (${DSI_NDMI_NORM_EXPR}))`

export const DSI_VALUE_MIN = 0
export const DSI_VALUE_MAX = 1

/** Interior class edges (class 0: val < 0.1 … class 9: val ≥ 0.9). */
export const DSI_CLASS_BREAKS: readonly number[] = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
]

export const DSI_CLASS_VALUES: readonly number[] = [
  0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95,
]

/** Class 1 (no drought) → Class 10 (extreme drought). */
export const DSI_CLASS_LABELS: readonly string[] = [
  'No Drought',
  'Very Low',
  'Low',
  'Mild',
  'Moderate',
  'Moderate-High',
  'High',
  'Severe',
  'Very Severe',
  'Extreme Drought',
]

export const DSI_CLASS_COLORS: readonly number[] = [
  0x006837,
  0x31a354,
  0x78c679,
  0xaddd8e,
  0xd9f0a3,
  0xfee08b,
  0xfdae61,
  0xf46d43,
  0xd73027,
  0x7f0000,
]

/** Legend / report range captions (equal decile bins on [0, 1]). */
export const DSI_CLASS_RANGE_LABELS: readonly string[] = [
  '0.00–0.10',
  '0.10–0.20',
  '0.20–0.30',
  '0.30–0.40',
  '0.40–0.50',
  '0.50–0.60',
  '0.60–0.70',
  '0.70–0.80',
  '0.80–0.90',
  '0.90–1.00',
]

/**
 * Default drought-area threshold (Mild class lower bound).
 * Drought Area = Σ class area where DSI ≥ threshold.
 */
export const DSI_DROUGHT_AREA_THRESHOLD = 0.3

export type DsiDroughtAreaSummary = {
  threshold: number
  areaM2: number
  areaHa: number
  areaKm2: number
  pctOfAoi: number
  sampleCount: number
}

export type DsiClassAreaRow = {
  classIndex: number
  count: number
  areaM2: number
  areaHa: number
  areaKm2: number
  pctOfAoi: number
}

/** Sum AOI area in DSI classes whose lower edge is ≥ `threshold`. */
export function computeDroughtAreaFromClassRows(
  rows: readonly DsiClassAreaRow[],
  threshold: number = DSI_DROUGHT_AREA_THRESHOLD,
): DsiDroughtAreaSummary {
  const t = Number.isFinite(threshold) ? threshold : DSI_DROUGHT_AREA_THRESHOLD
  const edges = [DSI_VALUE_MIN, ...DSI_CLASS_BREAKS, DSI_VALUE_MAX]
  let areaM2 = 0
  let sampleCount = 0
  let pctOfAoi = 0
  for (const row of rows) {
    const lo = edges[row.classIndex]
    if (lo == null || lo < t) continue
    areaM2 += row.areaM2
    sampleCount += row.count
    pctOfAoi += row.pctOfAoi
  }
  return {
    threshold: t,
    areaM2,
    areaHa: areaM2 / 10_000,
    areaKm2: areaM2 / 1_000_000,
    pctOfAoi,
    sampleCount,
  }
}

export function isDsiLayerId(layerId: string | null | undefined): boolean {
  return String(layerId || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') === 'DSI'
}

export type DsiCoreInput = { ndvi: number; ndmi: number; ndwi: number }

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

export function computeVciFromNdvi(ndvi: number): number {
  return clamp01((ndvi - 0.05) / 0.8)
}

export function computeSmciFromCore(input: DsiCoreInput): number {
  return clamp01((0.7 * input.ndmi + 0.3 * input.ndwi + 0.3) / 0.8)
}

export function computeNdmiNormalized(ndmi: number): number {
  return clamp01((ndmi + 0.8) / 1.6)
}

export function computeDsiFromCore(input: DsiCoreInput): number {
  const vci = computeVciFromNdvi(input.ndvi)
  const smci = computeSmciFromCore(input)
  const ndmiN = computeNdmiNormalized(input.ndmi)
  return 0.5 * (1 - vci) + 0.3 * (1 - smci) + 0.2 * (1 - ndmiN)
}
