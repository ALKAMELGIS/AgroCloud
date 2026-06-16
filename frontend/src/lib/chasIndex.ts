/**
 * CHAS — Crop Health Analysis Score (remote sensing valid).
 *
 * CHAS_t = w1·NDVI + w2·NDMI + w3·CI_RE
 * NDVI   = (NIR − RED) / (NIR + RED)
 * NDMI   = (NIR − SWIR) / (NIR + SWIR)
 * CI_RE  = RE / NIR − 1  (Sentinel-2 B05/B08; Landsat red-edge / NIR equivalent)
 *
 * ΔCHAS = CHAS(t) − CHAS(t−1) — computed outside this composite.
 *
 * Constraint: w1 + w2 + w3 = 1, w_i > 0
 */

/** Vegetation canopy density & vigor (NDVI). */
export const CHAS_WEIGHT_NDVI = 0.4
/** Canopy moisture & water stress (NDMI). */
export const CHAS_WEIGHT_NDMI = 0.35
/** Chlorophyll activity & plant vitality (Red Edge CI). */
export const CHAS_WEIGHT_CI_RE = 0.25

export const AGRO_CHAS_EXPR = `${CHAS_WEIGHT_NDVI} * ndvi + ${CHAS_WEIGHT_NDMI} * ndmi + ${CHAS_WEIGHT_CI_RE} * ci_re`

export const CHAS_FORMULA_DOC = `${CHAS_WEIGHT_NDVI}·NDVI + ${CHAS_WEIGHT_NDMI}·NDMI + ${CHAS_WEIGHT_CI_RE}·CI_RE`

export const CHAS_FORMULA_POPUP = `CHAS = ${CHAS_FORMULA_DOC} · CI_RE = RE/NIR − 1`

export const CDSI_FORMULA_POPUP = `CDSI = ${CHAS_FORMULA_DOC}`

export type ChasIndexInputs = {
  ndvi: number
  ndmi: number
  ciRe?: number | null
  /** Optional NDRE = (NIR−RE)/(NIR+RE) — derives CI_RE algebraically when ciRe absent. */
  ndre?: number | null
}

/** Red Edge Chlorophyll Index: CI_RE = RE/NIR − 1. */
export function computeCiRe(redEdge: number, nir: number): number {
  if (!Number.isFinite(redEdge) || !Number.isFinite(nir) || nir <= 1e-6) return NaN
  return redEdge / nir - 1
}

/** CI_RE from NDRE = (NIR−RE)/(NIR+RE) — exact inverse of the red-edge ratio. */
export function computeCiReFromNdre(ndre: number): number {
  if (!Number.isFinite(ndre)) return NaN
  const denom = 1 + ndre
  if (Math.abs(denom) < 1e-6) return NaN
  return -2 * ndre / denom
}

export function estimateCiReFromNdvi(ndvi: number): number {
  const v = Number.isFinite(ndvi) ? ndvi : 0
  return Number((0.76 + v * 0.44 - 1).toFixed(4))
}

export function resolveCiReForChas(inputs: ChasIndexInputs): number | null {
  if (inputs.ciRe != null && Number.isFinite(inputs.ciRe)) return inputs.ciRe
  if (inputs.ndre != null && Number.isFinite(inputs.ndre)) {
    const v = computeCiReFromNdre(inputs.ndre)
    return Number.isFinite(v) ? v : null
  }
  if (Number.isFinite(inputs.ndvi)) return estimateCiReFromNdvi(inputs.ndvi)
  return null
}

export function computeChas(inputs: ChasIndexInputs): number {
  const ciRe = resolveCiReForChas(inputs)
  if (ciRe == null || !Number.isFinite(inputs.ndvi) || !Number.isFinite(inputs.ndmi)) return NaN
  const raw =
    CHAS_WEIGHT_NDVI * inputs.ndvi + CHAS_WEIGHT_NDMI * inputs.ndmi + CHAS_WEIGHT_CI_RE * ciRe
  return Number(raw.toFixed(4))
}

export type ChasDailyInputs = {
  ndvi?: number | null
  ndmi?: number | null
  ciRe?: number | null
  zonal?: { ciRe?: { mean: number } }
}

/** Build CHAS inputs from Statistical API daily row (+ optional snapshot fallback). */
export function chasInputsFromDaily(
  day: ChasDailyInputs,
  fallback?: ChasIndexInputs | null,
): ChasIndexInputs | null {
  const ndvi = day.ndvi ?? fallback?.ndvi
  const ndmi = day.ndmi ?? fallback?.ndmi
  if (ndvi == null || ndmi == null || !Number.isFinite(ndvi) || !Number.isFinite(ndmi)) return null
  return {
    ndvi,
    ndmi,
    ciRe: day.ciRe ?? day.zonal?.ciRe?.mean ?? fallback?.ciRe,
    ndre: fallback?.ndre,
  }
}

export function computeChasFromDaily(
  day: ChasDailyInputs,
  fallback?: ChasIndexInputs | null,
): number | null {
  const inputs = chasInputsFromDaily(day, fallback)
  if (!inputs) return null
  const value = computeChas(inputs)
  return Number.isFinite(value) ? value : null
}

/** CDSI uses the same weighted core-index formula as CHAS (latest scene). */
export const computeCdsi = computeChas
