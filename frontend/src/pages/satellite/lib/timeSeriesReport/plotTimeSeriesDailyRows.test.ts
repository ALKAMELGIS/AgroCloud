import { describe, expect, it } from 'vitest'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import {
  dailyRowsInRange,
  dailyRowsSatisfyExportWindow,
  describeEmptyExportWindow,
} from './plotTimeSeriesDailyRows'

function row(date: string, ndvi = 0.4): SentinelHubDailyIndexMeans {
  return { date, ndvi, ndmi: 0.2, ndwi: 0.1, savi: 0.35 }
}

describe('plotTimeSeriesDailyRows', () => {
  it('clips rows to inclusive ISO date window', () => {
    const rows = [row('2026-04-28'), row('2026-05-01'), row('2026-08-26'), row('2026-09-01')]
    const clipped = dailyRowsInRange(rows, '2026-05-01', '2026-08-26')
    expect(clipped.map(r => r.date)).toEqual(['2026-05-01', '2026-08-26'])
  })

  it('rejects stale cache outside export window', () => {
    const stale = [row('2026-01-15'), row('2026-02-01')]
    expect(dailyRowsSatisfyExportWindow(stale, '2026-05-01', '2026-08-26', ['NDVI'])).toBe(false)
    expect(dailyRowsSatisfyExportWindow(stale, '2026-01-01', '2026-03-01', ['NDVI'])).toBe(true)
  })

  it('requires at least one finite layer value in window', () => {
    const rows: SentinelHubDailyIndexMeans[] = [{ date: '2026-06-01' }]
    expect(dailyRowsSatisfyExportWindow(rows, '2026-05-01', '2026-08-26', ['NDVI'])).toBe(false)
  })

  it('describeEmptyExportWindow mentions the selected range', () => {
    const msg = describeEmptyExportWindow('2026-05-01', '2026-08-26', ['NDVI', 'NDMI'])
    expect(msg).toContain('2026-05-01')
    expect(msg).toContain('2026-08-26')
    expect(msg).toContain('NDVI')
  })
})
