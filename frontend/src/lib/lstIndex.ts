/**
 * Land Surface Temperature (LST) proxy for AgroCloud Remote Sensing (°C).
 *
 * Sentinel-2 has no thermal band. Until Landsat Collection 2 L2 ST is wired into
 * Layer Live WMS, AgroCloud estimates LST from canopy vigor (NDVI), moisture
 * (NDMI), and seasonal energy — matching the field-alert NDVI→°C proxy with
 * dryness / season refinement for map visualization.
 *
 *   seasonBase ≈ 18 + 24 × seasonFactor   (°C; winter cooler, summer hotter)
 *   LST = seasonBase − 12×NDVI + 8×dryness
 *   dryness = clamp(0.5 − 0.5×NDMI, 0, 1)
 *   clamp → 5…55 °C
 */

import { clamp, clamp01, etSeasonFactor } from './etIndex'

/** Fallback absolute breaks (°C) for 10-class legend / WMS. */
export const SENTINEL_LST_10_CLASS_BREAKS: readonly number[] = [
  12, 16, 20, 24, 28, 32, 36, 40, 44,
]

export const SENTINEL_LST_10_CLASS_LABELS = [
  'Very cold surface',
  'Cold',
  'Cool',
  'Mild cool',
  'Mild',
  'Warm',
  'Hot',
  'Very hot',
  'Extreme heat',
  'Critical heat',
] as const

/** Representative class centers (°C) for ColorRampVisualizer. */
export const SENTINEL_LST_10_CLASS_VALUES: readonly number[] = [
  10, 14, 18, 22, 26, 30, 34, 38, 42, 48,
]

/** Cool (blue) → warm (yellow) → hot (red) thermal palette. */
export const SENTINEL_LST_10_CLASS_COLORS: readonly number[] = [
  0x1e3a8a, // Very cold
  0x1d4ed8, // Cold
  0x0ea5e9, // Cool
  0x22c55e, // Mild cool
  0xa3e635, // Mild
  0xfde047, // Warm
  0xfbbf24, // Hot
  0xf97316, // Very hot
  0xef4444, // Extreme
  0x991b1b, // Critical
]

type RampStop = [number, number]

export const SENTINEL_LST_RAMP: RampStop[] = SENTINEL_LST_10_CLASS_VALUES.map((v, i) => [
  v,
  SENTINEL_LST_10_CLASS_COLORS[i]!,
])

export type EstimateLstOptions = {
  sceneDate?: string | null
  /** Override season factor (tests / external climate). */
  seasonFactor?: number | null
}

/** Dryness fraction from NDMI (−1 moist … +1 dry → reverse). */
export function lstDrynessFromNdmi(ndmi: number): number {
  if (!Number.isFinite(ndmi)) return 0.5
  return clamp01(0.5 - 0.5 * clamp(ndmi, -1, 1))
}

/**
 * Estimated LST (°C) from NDVI + NDMI + seasonal energy.
 * Typical agricultural surfaces: ~15–48 °C depending on season and canopy.
 */
export function estimateLstCelsius(
  ndvi: number,
  ndmi: number,
  options?: EstimateLstOptions,
): number {
  const season =
    options?.seasonFactor != null && Number.isFinite(options.seasonFactor)
      ? clamp(options.seasonFactor, 0.35, 1.15)
      : etSeasonFactor(options?.sceneDate)
  const base = 18 + 24 * season
  const veg = Number.isFinite(ndvi) ? clamp(ndvi, -0.2, 1) : 0.3
  const dryness = lstDrynessFromNdmi(ndmi)
  const lst = base - 12 * veg + 8 * dryness
  return Number(clamp(lst, 5, 55).toFixed(2))
}

/** Evalscript CORE_INDICES_BLOCK expression (ndvi, ndmi already defined). */
export function buildLstIndexExpr(seasonFactor = 0.85): string {
  const s = Number(seasonFactor.toFixed(4))
  return `Math.max(5, Math.min(55, (18 + 24 * ${s}) - 12 * Math.max(-0.2, Math.min(1, ndvi)) + 8 * Math.max(0, Math.min(1, 0.5 - 0.5 * Math.max(-1, Math.min(1, ndmi))))))`
}

export const LST_INDEX_EXPR = buildLstIndexExpr(0.85)

/** Inline band math for WMS ColorRampVisualizer (season plugged at build time). */
export function buildLstWmsIndexSetup(seasonFactor = 0.85): string {
  const s = Number(seasonFactor.toFixed(4))
  return `let ndvi = index(samples.B08, samples.B04);
  let ndmi = index(samples.B08, samples.B11);
  let dryness = Math.max(0, Math.min(1, 0.5 - 0.5 * Math.max(-1, Math.min(1, ndmi))));
  let lst = Math.max(5, Math.min(55, (18 + 24 * ${s}) - 12 * Math.max(-0.2, Math.min(1, ndvi)) + 8 * dryness));`
}

/** @deprecated Prefer buildLstWmsIndexSetup(scene season). */
export const LST_WMS_INDEX_SETUP = buildLstWmsIndexSetup(0.85)

/** Mid-values for ColorRampVisualizer given ascending edges. */
export function lstClassCenterValues(edges: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < edges.length - 1; i += 1) {
    out.push(Number(((edges[i]! + edges[i + 1]!) / 2).toFixed(2)))
  }
  return out
}
