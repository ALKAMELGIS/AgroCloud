import { classifySeriesTrend, computeLayerStatistics } from './buildTimeSeriesReportPayload'
import { describe, expect, it } from 'vitest'

describe('time series report stats', () => {
  it('computes layer statistics and trend', () => {
    const stats = computeLayerStatistics('NDVI', [0.2, 0.35, 0.5, 0.62])
    expect(stats.mean).toBeCloseTo(0.4175, 3)
    expect(stats.min).toBe(0.2)
    expect(stats.max).toBe(0.62)
    expect(stats.trend).toBe('Increasing')
    expect(stats.observationCount).toBe(4)
  })

  it('classifies stable short series', () => {
    expect(classifySeriesTrend([0.4, 0.4, 0.4])).toBe('Stable')
  })
})
