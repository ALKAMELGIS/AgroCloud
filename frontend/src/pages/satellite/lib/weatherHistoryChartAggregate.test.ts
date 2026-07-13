import { describe, expect, it } from 'vitest'
import type { OpenMeteoHourlyPoint } from '../../../lib/openMeteoWeather'
import {
  aggregateWeatherChartSeries,
  buildWeatherDailySeries,
  buildWeatherHistoryChartSeries,
} from './weatherHistoryChartAggregate'

function hourly(time: string, temp: number, rain = 0): OpenMeteoHourlyPoint {
  return {
    time,
    temperatureC: temp,
    weatherCode: 0,
    precipitationMm: rain,
    snowfallCm: null,
    humidityPct: 50,
    windSpeedKmh: 10,
    windDirectionDeg: 90,
    pressureHpa: 1013,
    et0Mm: null,
    shortwaveRadiationWm2: null,
  }
}

describe('weatherHistoryChartAggregate', () => {
  it('aggregates hourly temperature to daily means', () => {
    const points = [
      hourly('2024-01-01T08:00', 20),
      hourly('2024-01-01T14:00', 30),
      hourly('2024-01-02T12:00', 24),
    ]
    const daily = buildWeatherDailySeries(points, 'temp')
    expect(daily).toHaveLength(2)
    expect(daily[0].value).toBe(25)
  })

  it('sums rainfall by month', () => {
    const daily = [
      { date: '2024-01-05', value: 10 },
      { date: '2024-01-20', value: 5 },
      { date: '2024-02-03', value: 8 },
    ]
    const monthly = aggregateWeatherChartSeries(daily, 'rain', 'month')
    expect(monthly.labels).toEqual(['2024-01', '2024-02'])
    expect(monthly.values[0]).toBe(15)
    expect(monthly.values[1]).toBe(8)
  })

  it('builds chart series with week buckets', () => {
    const points = [
      hourly('2024-01-01T12:00', 20),
      hourly('2024-01-08T12:00', 22),
      hourly('2024-01-15T12:00', 18),
    ]
    const series = buildWeatherHistoryChartSeries(points, 'temp', 'week')
    expect(series.values.length).toBeGreaterThan(0)
    expect(series.displayLabels.length).toBe(series.values.length)
  })
})
