import { describe, expect, it } from 'vitest'
import { computeLayerLegendCloudCoverAreas, layerLegendSupportsCloudCoverStats } from './layerLegendCloudCoverStats'

describe('layerLegendCloudCoverStats', () => {
  it('supports sentinel index color-ramp layers', () => {
    expect(layerLegendSupportsCloudCoverStats('NDVI')).toBe(true)
    expect(layerLegendSupportsCloudCoverStats('TRUE_COLOR')).toBe(false)
  })

  it('computes cloud and clear areas from AOI area and percentages', () => {
    const row = computeLayerLegendCloudCoverAreas(1_000_000, { cloudPct: 10, clearPct: 90 })
    expect(row).not.toBeNull()
    expect(row!.cloudAreaM2).toBe(100_000)
    expect(row!.clearAreaM2).toBe(900_000)
    expect(row!.cloudPct).toBe(10)
  })

  it('returns null when no cloud in scene', () => {
    expect(computeLayerLegendCloudCoverAreas(1e6, { cloudPct: 0, clearPct: 100 })).toBeNull()
  })
})
