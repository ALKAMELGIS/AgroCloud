import type { StressZoneTier } from './siStressZonesMapping'
import { STRESS_ZONE_CLASS_INDEX } from './siStressZonesMapping'

/** Stress Zones tool — user-specified CHAS fusion weights. */
export const STRESS_ZONES_CHAS_WEIGHTS = {
  ndvi: 0.4,
  ndmi: 0.25,
  savi: 0.2,
  ndwi: 0.15,
} as const

export const STRESS_ZONES_CHAS_EXPR =
  `${STRESS_ZONES_CHAS_WEIGHTS.ndvi} * ndvi + ${STRESS_ZONES_CHAS_WEIGHTS.ndmi} * ndmi + ${STRESS_ZONES_CHAS_WEIGHTS.savi} * savi + ${STRESS_ZONES_CHAS_WEIGHTS.ndwi} * ndwi`

export type StressZoneIndexInputs = {
  ndvi: number
  ndmi: number
  savi: number
  ndwi: number
}

export type StressZoneAnalysis = {
  chas: number
  stressScore: number
  tier: StressZoneTier
  riskCause: string
  recommendation: string
}

export function computeStressZonesChas(inputs: StressZoneIndexInputs): number {
  const { ndvi, ndmi, savi, ndwi } = inputs
  if (![ndvi, ndmi, savi, ndwi].every(v => Number.isFinite(v))) return NaN
  const raw =
    STRESS_ZONES_CHAS_WEIGHTS.ndvi * ndvi +
    STRESS_ZONES_CHAS_WEIGHTS.ndmi * ndmi +
    STRESS_ZONES_CHAS_WEIGHTS.savi * savi +
    STRESS_ZONES_CHAS_WEIGHTS.ndwi * ndwi
  return Number(raw.toFixed(4))
}

export function computeStressScore(chas: number): number {
  if (!Number.isFinite(chas)) return NaN
  return Number(Math.max(0, Math.min(1, 1 - chas)).toFixed(4))
}

export function classifyStressZoneTier(ndvi: number, stressScore: number): StressZoneTier {
  if (!Number.isFinite(ndvi) || ndvi < 0.15) return 'bare'
  if (!Number.isFinite(stressScore)) return 'moderate'
  if (stressScore >= 0.6) return 'severe'
  if (stressScore >= 0.4) return 'moderate'
  if (stressScore >= 0.2) return 'mild'
  return 'healthy'
}

export function inferStressRiskCause(
  inputs: StressZoneIndexInputs,
  tier: StressZoneTier,
): string {
  const { ndvi, ndmi, ndwi } = inputs
  if (tier === 'bare') return 'Low vegetation cover — exposed soil or fallow surface.'
  if (ndmi < 0.12 && ndwi < 0.1) return 'Canopy water limitation — moisture stress limiting vigor.'
  if (ndvi < 0.35 && ndmi >= 0.15) return 'Vegetation stress with adequate moisture — possible nutrient or biotic pressure.'
  if (ndvi >= 0.55 && ndmi < 0.15) return 'High vigor but declining canopy moisture — early water stress signal.'
  if (tier === 'severe') return 'Combined vegetation and moisture deficit across the AOI.'
  if (tier === 'moderate') return 'Moderate canopy stress — monitor irrigation and field scouting.'
  if (tier === 'mild') return 'Early stress signal — within normal seasonal variability.'
  return 'Stable vegetation condition — continue routine monitoring.'
}

export function buildStressRecommendation(tier: StressZoneTier, riskCause: string): string {
  if (tier === 'bare') {
    return 'Confirm land use (harvest, tillage, or bare fallow). Reschedule analysis after emergence or planting.'
  }
  if (tier === 'severe') {
    return 'Priority field visit within 48h. Verify irrigation, drainage, and pest pressure in red zones.'
  }
  if (tier === 'moderate') {
    return 'Targeted scouting in orange zones; compare NDMI trend over the next two scenes for recovery.'
  }
  if (tier === 'mild') {
    return 'Watch yellow zones on the next acquisition; no immediate intervention unless trend worsens.'
  }
  return 'Maintain current management. Use time-series comparison to track seasonal trajectory.'
}

export function analyzeStressZone(inputs: StressZoneIndexInputs): StressZoneAnalysis {
  const chas = computeStressZonesChas(inputs)
  const stressScore = computeStressScore(chas)
  const tier = classifyStressZoneTier(inputs.ndvi, stressScore)
  const riskCause = inferStressRiskCause(inputs, tier)
  const recommendation = buildStressRecommendation(tier, riskCause)
  return { chas, stressScore, tier, riskCause, recommendation }
}

export function stressZoneClassIndexForTier(tier: StressZoneTier): number {
  return STRESS_ZONE_CLASS_INDEX[tier]
}
