import { describe, expect, it } from 'vitest'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import { buildAnalyticsChartFromDailyRows } from './buildTimeSeriesReportPayload'

function row(date: string, ndvi: number | null, ndmi: number | null = null): SentinelHubDailyIndexMeans {
  return {
    date,
    ndvi,
    ndmi,
    ndwi: null,
    evi: null,
    savi: null,
    ciRe: null,
    ndre: null,
  }
}

describe('buildAnalyticsChartFromDailyRows', () => {
  it('includes all daily observation dates in range (not only the last scene)', () => {
    const daily: SentinelHubDailyIndexMeans[] = [
      row('2026-05-03', 0.42),
      row('2026-05-17', 0.51),
      row('2026-06-19', 0.55),
      row('2026-07-08', 0.48),
    ]
    const chart = buildAnalyticsChartFromDailyRows(
      'field-a',
      ['NDVI'],
      daily,
      '2026-05-01',
      '2026-08-16',
      'day',
    )
    expect(chart.labels).toEqual([
      '2026-05-03',
      '2026-05-17',
      '2026-06-19',
      '2026-07-08',
    ])
    expect(chart.series[0]?.values.filter(v => v != null)).toHaveLength(4)
  })

  it('aggregates to month buckets when timeAggregation is month', () => {
    const daily: SentinelHubDailyIndexMeans[] = [
      row('2026-05-03', 0.4),
      row('2026-05-20', 0.5),
      row('2026-06-19', 0.55),
      row('2026-07-08', 0.48),
    ]
    const chart = buildAnalyticsChartFromDailyRows(
      'field-a',
      ['NDVI'],
      daily,
      '2026-05-01',
      '2026-08-16',
      'month',
    )
    expect(chart.labels.length).toBeGreaterThanOrEqual(2)
    expect(chart.displayLabels.length).toBe(chart.labels.length)
  })
})
