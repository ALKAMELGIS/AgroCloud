import { describe, expect, it } from 'vitest'
import {
  analyzeStressZone,
  classifyStressZoneTier,
  computeStressScore,
  computeStressZonesChas,
  STRESS_ZONES_CHAS_WEIGHTS,
} from './siStressZonesEngine'

describe('siStressZonesEngine', () => {
  it('computes CHAS with user-specified weights', () => {
    const chas = computeStressZonesChas({ ndvi: 0.8, ndmi: 0.4, savi: 0.7, ndwi: 0.2 })
    const expected =
      STRESS_ZONES_CHAS_WEIGHTS.ndvi * 0.8 +
      STRESS_ZONES_CHAS_WEIGHTS.ndmi * 0.4 +
      STRESS_ZONES_CHAS_WEIGHTS.savi * 0.7 +
      STRESS_ZONES_CHAS_WEIGHTS.ndwi * 0.2
    expect(chas).toBeCloseTo(Number(expected.toFixed(4)), 4)
  })

  it('computes stress score as 1 minus CHAS', () => {
    expect(computeStressScore(0.65)).toBe(0.35)
    expect(computeStressScore(1.2)).toBe(0)
    expect(computeStressScore(-0.1)).toBe(1)
  })

  it('classifies tiers from NDVI and stress score thresholds', () => {
    expect(classifyStressZoneTier(0.1, 0.1)).toBe('bare')
    expect(classifyStressZoneTier(0.5, 0.65)).toBe('severe')
    expect(classifyStressZoneTier(0.5, 0.45)).toBe('moderate')
    expect(classifyStressZoneTier(0.5, 0.25)).toBe('mild')
    expect(classifyStressZoneTier(0.5, 0.1)).toBe('healthy')
  })

  it('returns full analysis with risk cause and recommendation', () => {
    const analysis = analyzeStressZone({ ndvi: 0.55, ndmi: 0.08, savi: 0.5, ndwi: 0.05 })
    expect(analysis.chas).toBeGreaterThan(0)
    expect(analysis.stressScore).toBeCloseTo(1 - analysis.chas, 4)
    expect(analysis.tier).toBeTruthy()
    expect(analysis.riskCause.length).toBeGreaterThan(10)
    expect(analysis.recommendation.length).toBeGreaterThan(10)
  })
})
