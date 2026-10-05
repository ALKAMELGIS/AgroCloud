import { describe, expect, it } from 'vitest'
import { openMeteoPastForecastDaysForChartRange } from './weatherChartDateRange'

describe('openMeteoPastForecastDaysForChartRange', () => {
  it('requests past_days for a 7-day lookback ending today', () => {
    const today = new Date()
    const end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const start = new Date(today)
    start.setDate(start.getDate() - 7)
    const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
    const { pastDays, forecastDays } = openMeteoPastForecastDaysForChartRange({
      startDate,
      endDate: end,
    })
    expect(pastDays).toBeGreaterThanOrEqual(6)
    expect(forecastDays).toBeGreaterThanOrEqual(1)
  })
})
