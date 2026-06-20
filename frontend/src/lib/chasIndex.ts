/**
 * CHAS — Crop Health Analysis Score (remote sensing valid).
 *
 * Fusion (primary): CHAS = w1·NDVI + w2·NDWI + w3·NDMI + w4·SAVI
 * Legacy fallback:   CHAS = w1·NDVI + w2·NDMI + w3·CI_RE (when NDWI/SAVI absent)
 *
 * ΔCHAS = CHAS(t) − CHAS(t−1) — computed outside this composite.
 */

/** Vegetation canopy density & vigor (NDVI). */
export const CHAS_FUSION_WEIGHT_NDVI = 0.35
/** Surface / canopy water (NDWI). */
export const CHAS_FUSION_WEIGHT_NDWI = 0.2
/** Canopy moisture & water stress (NDMI). */
export const CHAS_FUSION_WEIGHT_NDMI = 0.25
/** Soil-adjusted vegetation (SAVI). */
export const CHAS_FUSION_WEIGHT_SAVI = 0.2

export const AGRO_CHAS_FUSION_EXPR =
  `${CHAS_FUSION_WEIGHT_NDVI} * ndvi + ${CHAS_FUSION_WEIGHT_NDWI} * ndwi + ${CHAS_FUSION_WEIGHT_NDMI} * ndmi + ${CHAS_FUSION_WEIGHT_SAVI} * savi`

/** Primary WMS / raster expression — four-index fusion. */
export const AGRO_CHAS_EXPR = AGRO_CHAS_FUSION_EXPR

export const CHAS_FORMULA_DOC = `${CHAS_FUSION_WEIGHT_NDVI}·NDVI + ${CHAS_FUSION_WEIGHT_NDWI}·NDWI + ${CHAS_FUSION_WEIGHT_NDMI}·NDMI + ${CHAS_FUSION_WEIGHT_SAVI}·SAVI`

export const CHAS_FORMULA_POPUP = `CHAS = ${CHAS_FORMULA_DOC}`

export const CDSI_FORMULA_POPUP = `CDSI = ${CHAS_FORMULA_DOC}`

/** @deprecated Legacy red-edge weights — used only when NDWI/SAVI unavailable. */
export const CHAS_WEIGHT_NDVI = 0.4
export const CHAS_WEIGHT_NDMI = 0.35
export const CHAS_WEIGHT_CI_RE = 0.25

export type ChasFusionInputs = {
  ndvi: number
  ndwi: number
  ndmi: number
  savi: number
}

export type ChasIndexInputs = {
  ndvi: number
  ndmi: number
  ndwi?: number | null
  savi?: number | null
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

export function estimateSaviFromNdvi(ndvi: number): number {
  const v = Number.isFinite(ndvi) ? ndvi : 0
  return Math.max(-0.2, Math.min(1, v * 0.96 + 0.015))
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

export function computeChasFusion(inputs: ChasFusionInputs): number {
  const { ndvi, ndwi, ndmi, savi } = inputs
  if (![ndvi, ndwi, ndmi, savi].every(v => Number.isFinite(v))) return NaN
  const raw =
    CHAS_FUSION_WEIGHT_NDVI * ndvi +
    CHAS_FUSION_WEIGHT_NDWI * ndwi +
    CHAS_FUSION_WEIGHT_NDMI * ndmi +
    CHAS_FUSION_WEIGHT_SAVI * savi
  return Number(raw.toFixed(4))
}

export function computeChas(inputs: ChasIndexInputs): number {
  const ndvi = inputs.ndvi
  const ndmi = inputs.ndmi
  const ndwi = inputs.ndwi
  const savi =
    inputs.savi != null && Number.isFinite(inputs.savi)
      ? inputs.savi
      : Number.isFinite(ndvi)
        ? estimateSaviFromNdvi(ndvi)
        : NaN

  if (
    Number.isFinite(ndvi) &&
    Number.isFinite(ndmi) &&
    ndwi != null &&
    Number.isFinite(ndwi) &&
    Number.isFinite(savi)
  ) {
    return computeChasFusion({ ndvi, ndwi, ndmi, savi })
  }

  const ciRe = resolveCiReForChas(inputs)
  if (ciRe == null || !Number.isFinite(ndvi) || !Number.isFinite(ndmi)) return NaN
  const raw = CHAS_WEIGHT_NDVI * ndvi + CHAS_WEIGHT_NDMI * ndmi + CHAS_WEIGHT_CI_RE * ciRe
  return Number(raw.toFixed(4))
}

export type ChasDailyInputs = {
  ndvi?: number | null
  ndmi?: number | null
  ndwi?: number | null
  savi?: number | null
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
  const ndwi = day.ndwi ?? fallback?.ndwi
  const savi =
    day.savi ??
    fallback?.savi ??
    (Number.isFinite(ndvi) ? estimateSaviFromNdvi(ndvi) : null)
  return {
    ndvi,
    ndmi,
    ndwi,
    savi,
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

/** CDSI uses the same fusion formula as CHAS (latest scene). */
export const computeCdsi = computeChas
