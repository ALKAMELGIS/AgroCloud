import { describe, expect, it } from 'vitest'
import { computeImageryYieldEstimate, DEFAULT_POTATO_MAX_YIELD_T_HA } from './imageryYieldEstimation'

describe('imageryYieldEstimation', () => {
  it('matches the potato worked example', () => {
    const result = computeImageryYieldEstimate({
      ndvi: 0.82,
      ndmi: 0.41,
      ndre: 0.56,
      areaHa: 39.26,
      maxYieldTHa: 55,
    })
    expect(result).not.toBeNull()
    expect(result!.yieldFactor).toBeCloseTo(0.645, 3)
    expect(result!.estimatedYieldTHa).toBeCloseTo(35.475, 2)
    expect(result!.totalProductionTons).toBeCloseTo(1392.75, 0)
    expect(result!.maxYieldTHa).toBe(DEFAULT_POTATO_MAX_YIELD_T_HA)
  })

  it('returns null when an index is missing', () => {
    expect(
      computeImageryYieldEstimate({
        ndvi: 0.82,
        ndmi: null,
        ndre: 0.56,
        areaHa: 10,
      }),
    ).toBeNull()
  })

  it('returns null when area is zero', () => {
    expect(
      computeImageryYieldEstimate({
        ndvi: 0.5,
        ndmi: 0.4,
        ndre: 0.3,
        areaHa: 0,
      }),
    ).toBeNull()
  })
})
