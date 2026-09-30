import { describe, expect, it } from 'vitest'
import {
  AGRO_CHAS_EXPR,
  AGRO_CHAS_FUSION_EXPR,
  CHAS_FUSION_WEIGHT_NDMI,
  CHAS_FUSION_WEIGHT_NDVI,
  CHAS_FUSION_WEIGHT_NDWI,
  CHAS_FUSION_WEIGHT_SAVI,
  CHAS_WEIGHT_CI_RE,
  CHAS_WEIGHT_NDMI,
  CHAS_WEIGHT_NDVI,
  computeChas,
  computeChasFusion,
  computeCiRe,
  computeCiReFromNdre,
} from './chasIndex'

describe('chasIndex', () => {
  it('fusion weights sum to 1 with positive components', () => {
    expect(CHAS_FUSION_WEIGHT_NDVI + CHAS_FUSION_WEIGHT_NDWI + CHAS_FUSION_WEIGHT_NDMI + CHAS_FUSION_WEIGHT_SAVI).toBe(1)
  })

  it('legacy CI_RE weights sum to 1', () => {
    expect(CHAS_WEIGHT_NDVI + CHAS_WEIGHT_NDMI + CHAS_WEIGHT_CI_RE).toBe(1)
  })

  it('computes CI_RE from Red Edge and NIR bands', () => {
    expect(computeCiRe(0.35, 0.4)).toBeCloseTo(-0.125, 4)
  })

  it('derives CI_RE from NDRE algebraically', () => {
    const ndre = 0.2
    expect(computeCiReFromNdre(ndre)).toBeCloseTo(-2 * ndre / (1 + ndre), 4)
  })

  it('computes CHAS fusion from four indices', () => {
    const chas = computeChasFusion({ ndvi: 0.7, ndwi: 0.12, ndmi: 0.35, savi: 0.68 })
    expect(chas).toBeCloseTo(
      CHAS_FUSION_WEIGHT_NDVI * 0.7 +
        CHAS_FUSION_WEIGHT_NDWI * 0.12 +
        CHAS_FUSION_WEIGHT_NDMI * 0.35 +
        CHAS_FUSION_WEIGHT_SAVI * 0.68,
      4,
    )
    expect(AGRO_CHAS_EXPR).toBe(AGRO_CHAS_FUSION_EXPR)
    expect(AGRO_CHAS_EXPR).toContain('ndwi')
    expect(AGRO_CHAS_EXPR).toContain('savi')
  })

  it('falls back to legacy CI_RE when NDWI is unavailable', () => {
    const chas = computeChas({ ndvi: 0.7, ndmi: 0.35, ciRe: 0.15 })
    expect(chas).toBeCloseTo(
      CHAS_WEIGHT_NDVI * 0.7 + CHAS_WEIGHT_NDMI * 0.35 + CHAS_WEIGHT_CI_RE * 0.15,
      4,
    )
  })
})
