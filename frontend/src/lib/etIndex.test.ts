import { describe, expect, it } from 'vitest'
import {
  ET_REF_MM_DAY,
  SENTINEL_ET_10_CLASS_BREAKS,
  SENTINEL_ET_10_CLASS_LABELS,
  estimateEtMmDayFromMoisture,
  etCropCoefficientFromNdvi,
  etPercentileClassEdgesFromFineBins,
  etSeasonFactor,
  etWaterLossM3Day,
  etWaterLossM3HaDay,
  computeEtWaterLossIndexFraction,
  rebinFineHistogramToClassCounts,
} from './etIndex'

describe('etIndex', () => {
  it('defines 10 ET classes over 0–10 mm/day (absolute fallback)', () => {
    expect(SENTINEL_ET_10_CLASS_BREAKS).toHaveLength(9)
    expect(SENTINEL_ET_10_CLASS_LABELS).toHaveLength(10)
    expect(SENTINEL_ET_10_CLASS_LABELS[0]).toBe('Extremely Low ET')
    expect(SENTINEL_ET_10_CLASS_LABELS[9]).toBe('Exceptional ET')
    expect(ET_REF_MM_DAY).toBe(10)
  })

  it('estimates ET from moisture with season + Kc and volume conversions', () => {
    const frac = computeEtWaterLossIndexFraction(0.1, 0.05)
    expect(frac).toBeCloseTo(0.92, 2)
    const et = estimateEtMmDayFromMoisture(0.1, 0.05, {
      seasonFactor: 1,
      kc: 1,
    })
    expect(et).toBeCloseTo(frac * 10, 2)
    expect(etWaterLossM3HaDay(et)).toBeCloseTo(et * 10, 1)
    expect(etWaterLossM3Day(et, 100)).toBeCloseTo(et * 100 * 10, 0)
  })

  it('maps high moisture to low ET demand proxy', () => {
    const dry = estimateEtMmDayFromMoisture(-0.2, -0.1, { seasonFactor: 1, kc: 1 })
    const wet = estimateEtMmDayFromMoisture(0.4, 0.3, { seasonFactor: 1, kc: 1 })
    expect(dry).toBeGreaterThan(wet)
  })

  it('raises summer ET above winter for the same moisture', () => {
    const summer = estimateEtMmDayFromMoisture(0.05, 0, { sceneDate: '2025-07-15', ndvi: 0.6 })
    const winter = estimateEtMmDayFromMoisture(0.05, 0, { sceneDate: '2025-01-15', ndvi: 0.6 })
    expect(summer).toBeGreaterThan(winter)
    expect(etSeasonFactor('2025-07-15')).toBeGreaterThan(etSeasonFactor('2025-01-15'))
  })

  it('raises canopy Kc with NDVI', () => {
    expect(etCropCoefficientFromNdvi(0.8)).toBeGreaterThan(etCropCoefficientFromNdvi(0.2))
  })

  it('builds AOI percentile class edges as deciles', () => {
    // Uniform mass across 0–10 → breaks near 1,2,…,9
    const bins = Array.from({ length: 10 }, (_, i) => ({
      lowEdge: i,
      highEdge: i + 1,
      count: 100,
    }))
    const edges = etPercentileClassEdgesFromFineBins(bins, 10)
    expect(edges).toBeTruthy()
    expect(edges!).toHaveLength(11)
    const counts = rebinFineHistogramToClassCounts(bins, edges!)
    expect(counts).toHaveLength(10)
    expect(counts.every(c => c > 0)).toBe(true)
    const populated = counts.filter(c => c > 0).length
    expect(populated).toBe(10)
  })

  it('spreads skewed low-ET mass across all 10 classes (no collapsed zeros)', () => {
    // ~Real map case: almost all pixels in 0–1 mm/day, empty fine bins to 15.
    const bins = [
      { lowEdge: 0, highEdge: 0.25, count: 83000 },
      { lowEdge: 0.25, highEdge: 0.5, count: 39500 },
      { lowEdge: 0.5, highEdge: 0.75, count: 42200 },
      { lowEdge: 0.75, highEdge: 1, count: 42000 },
      ...Array.from({ length: 56 }, (_, i) => ({
        lowEdge: 1 + i * 0.25,
        highEdge: 1.25 + i * 0.25,
        count: 0,
      })),
    ]
    const edges = etPercentileClassEdgesFromFineBins(bins, 10)
    expect(edges).toBeTruthy()
    expect(edges!).toHaveLength(11)
    // High edge must be the data max (~1), not the empty histogram ceiling (15).
    expect(edges![edges!.length - 1]!).toBeLessThanOrEqual(1.05)
    // All interior breaks strictly increasing and within data span.
    for (let i = 1; i < edges!.length; i += 1) {
      expect(edges![i]!).toBeGreaterThan(edges![i - 1]!)
    }
    const counts = rebinFineHistogramToClassCounts(bins, edges!)
    expect(counts).toHaveLength(10)
    expect(counts.every(c => c > 0)).toBe(true)
    const total = counts.reduce((s, c) => s + c, 0)
    expect(total).toBe(83000 + 39500 + 42200 + 42000)
    // Each class ~10% of AOI mass (±3% tolerance for discrete rounding).
    for (const c of counts) {
      expect(c / total).toBeGreaterThan(0.05)
      expect(c / total).toBeLessThan(0.18)
    }
  })
})
