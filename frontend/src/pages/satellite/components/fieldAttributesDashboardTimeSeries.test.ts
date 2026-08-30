import { describe, expect, it } from 'vitest'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
import { aggregateAoiIndexTimeSeries } from './fieldAttributesDashboardTimeSeries'

function row(date: string, overrides: Partial<SentinelHubDailyIndexMeans> = {}): SentinelHubDailyIndexMeans {
  return {
    date,
    ndvi: 0.4,
    ndwi: 0.1,
    ndmi: 0.05,
    evi: 0.35,
    savi: 0.38,
    ndre: 0.32,
    ...overrides,
  }
}

describe('aggregateAoiIndexTimeSeries', () => {
  it('returns null when fewer than two dates', () => {
    const map = new Map([['f1', [row('2026-06-01')]]])
    expect(aggregateAoiIndexTimeSeries(map)).toBeNull()
  })

  it('averages indices across fields per date', () => {
    const map = new Map([
      ['f1', [row('2026-06-01', { ndvi: 0.4 }), row('2026-06-15', { ndvi: 0.6 })]],
      ['f2', [row('2026-06-01', { ndvi: 0.2 }), row('2026-06-15', { ndvi: 0.4 })]],
    ])
    const ts = aggregateAoiIndexTimeSeries(map)
    expect(ts).not.toBeNull()
    expect(ts!.dates).toEqual(['2026-06-01', '2026-06-15'])
    expect(ts!.indices.NDVI[0]).toBe(0.3)
    expect(ts!.indices.NDVI[1]).toBe(0.5)
    expect(ts!.indices.NDRE[0]).toBe(0.32)
  })
})
