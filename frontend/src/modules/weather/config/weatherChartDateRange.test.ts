import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openMeteoPastForecastDaysForChartRange } from './weatherChartDateRange'

describe('openMeteoPastForecastDaysForChartRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 2, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('requests past_days for a 7-day lookback ending today', () => {
    const today = new Date()
    const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(end).toBe('2026-11-02')
    const start = new Date(today)
    start.setDate(start.getDate() - 7)
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    expect(startDate).toBe('2026-10-26')
    const { pastDays, forecastDays } = openMeteoPastForecastDaysForChartRange({
      startDate,
      endDate: end,
    })
    expect(pastDays).toBeGreaterThanOrEqual(6)
    expect(pastDays).toBe(8)
    expect(forecastDays).toBeGreaterThanOrEqual(1)
    expect(forecastDays).toBe(1)
  })
})
