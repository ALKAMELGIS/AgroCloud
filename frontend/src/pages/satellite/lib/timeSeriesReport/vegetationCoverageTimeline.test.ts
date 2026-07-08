import { describe, expect, it } from 'vitest'
import {
  computeVegetationCoveragePoint,
  vegetationCoverageSeriesForChart,
} from './vegetationCoverageTimeline'

describe('vegetationCoverageTimeline', () => {
  it('computes independent planted vs bare shares for a date', () => {
    const point = computeVegetationCoveragePoint({
      date: '2026-07-07',
      aoiAreaM2: 968_000,
      ndviMean: 0.48,
      ndviMin: 0.25,
      ndviMax: 0.65,
    })
    expect(point).toBeTruthy()
    expect(point!.aoiAreaHa).toBeCloseTo(96.8, 1)
    expect(point!.vegetationCoveragePct).toBeGreaterThan(50)
    expect(point!.vegetationAreaHa).toBeCloseTo((96.8 * point!.vegetationCoveragePct) / 100, 1)
    expect(point!.dominantClass.length).toBeGreaterThan(3)
  })

  it('maps coverage series onto chart period keys', () => {
    const series = vegetationCoverageSeriesForChart(
      ['2026-W01', '2026-W02'],
      { '2026-W01': '2026-01-05', '2026-W02': '2026-01-12' },
      [
        {
          date: '2026-01-05',
          periodLabel: 'W01',
          ndviMean: 0.4,
          ndviMin: 0.3,
          ndviMax: 0.5,
          vegetationCoveragePct: 70,
          vegetationAreaHa: 50,
          vegetationAreaM2: 500000,
          bareCoveragePct: 30,
          bareAreaHa: 20,
          aoiAreaHa: 70,
          aoiAreaM2: 700000,
          dominantClass: 'Moderate',
          dominantTier: 'moderate',
          classes: [],
          source: 'mean-estimate',
          trend: 'Stable',
        },
      ],
    )
    expect(series[0]).toBe(70)
    expect(series[1]).toBeNull()
  })
})
