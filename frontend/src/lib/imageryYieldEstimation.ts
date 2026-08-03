/**
 * Composite yield estimation from NDVI / NDMI / NDRE (latest scene).
 *
 * YieldFactor = 0.5*NDVI + 0.3*NDMI + 0.2*NDRE
 * EstimatedYield (t/ha) = MaxYield * YieldFactor
 * TotalProduction (tons) = EstimatedYield * Area(ha)
 */

export const DEFAULT_POTATO_MAX_YIELD_T_HA = 55

export type ImageryYieldEstimateInput = {
  ndvi: number | null | undefined
  ndmi: number | null | undefined
  ndre: number | null | undefined
  areaHa: number
  maxYieldTHa?: number
  cropLabel?: string
}

export type ImageryYieldEstimate = {
  yieldFactor: number
  estimatedYieldTHa: number
  totalProductionTons: number
  areaHa: number
  maxYieldTHa: number
  cropLabel: string
  ndvi: number
  ndmi: number
  ndre: number
  missing: Array<'NDVI' | 'NDMI' | 'NDRE'>
}

function finiteIndex(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return v
}

/** Clamp index contribution into a sensible [0, 1] band for yield weighting. */
function clampIndex(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

export function computeImageryYieldEstimate(
  input: ImageryYieldEstimateInput,
): ImageryYieldEstimate | null {
  const ndvi = finiteIndex(input.ndvi)
  const ndmi = finiteIndex(input.ndmi)
  const ndre = finiteIndex(input.ndre)
  const areaHa = Number.isFinite(input.areaHa) && input.areaHa > 0 ? input.areaHa : 0
  const maxYieldTHa =
    input.maxYieldTHa != null && Number.isFinite(input.maxYieldTHa) && input.maxYieldTHa > 0
      ? input.maxYieldTHa
      : DEFAULT_POTATO_MAX_YIELD_T_HA

  const missing: Array<'NDVI' | 'NDMI' | 'NDRE'> = []
  if (ndvi == null) missing.push('NDVI')
  if (ndmi == null) missing.push('NDMI')
  if (ndre == null) missing.push('NDRE')
  if (missing.length || areaHa <= 0) return null

  const yieldFactor =
    0.5 * clampIndex(ndvi) + 0.3 * clampIndex(ndmi) + 0.2 * clampIndex(ndre)
  const estimatedYieldTHa = maxYieldTHa * yieldFactor
  const totalProductionTons = estimatedYieldTHa * areaHa

  return {
    yieldFactor,
    estimatedYieldTHa,
    totalProductionTons,
    areaHa,
    maxYieldTHa,
    cropLabel: (input.cropLabel || 'Potato').trim() || 'Potato',
    ndvi,
    ndmi,
    ndre,
    missing,
  }
}
