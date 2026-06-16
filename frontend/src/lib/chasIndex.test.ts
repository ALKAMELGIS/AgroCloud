import { describe, expect, it } from 'vitest'
import {
  AGRO_CHAS_EXPR,
  CHAS_WEIGHT_CI_RE,
  CHAS_WEIGHT_NDMI,
  CHAS_WEIGHT_NDVI,
  computeChas,
  computeCiRe,
  computeCiReFromNdre,
} from './chasIndex'

describe('chasIndex', () => {
  it('weights sum to 1 with positive components', () => {
    expect(CHAS_WEIGHT_NDVI + CHAS_WEIGHT_NDMI + CHAS_WEIGHT_CI_RE).toBe(1)
    expect(CHAS_WEIGHT_NDVI).toBeGreaterThan(0)
    expect(CHAS_WEIGHT_NDMI).toBeGreaterThan(0)
    expect(CHAS_WEIGHT_CI_RE).toBeGreaterThan(0)
  })

  it('computes CI_RE from Red Edge and NIR bands', () => {
    expect(computeCiRe(0.35, 0.4)).toBeCloseTo(-0.125, 4)
  })

  it('derives CI_RE from NDRE algebraically', () => {
    const ndre = 0.2
    expect(computeCiReFromNdre(ndre)).toBeCloseTo(-2 * ndre / (1 + ndre), 4)
  })

  it('computes CHAS from NDVI, NDMI, and CI_RE', () => {
    const chas = computeChas({ ndvi: 0.7, ndmi: 0.35, ciRe: 0.15 })
    expect(chas).toBeCloseTo(
      CHAS_WEIGHT_NDVI * 0.7 + CHAS_WEIGHT_NDMI * 0.35 + CHAS_WEIGHT_CI_RE * 0.15,
      4,
    )
    expect(AGRO_CHAS_EXPR).toContain('ci_re')
  })
})
