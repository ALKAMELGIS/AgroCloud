import { describe, expect, it } from 'vitest'
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import {
  aggregateDailyFromHourly,
  buildWeatherClimateReportPayload,
} from './weatherClimateAnalysisEngine'

function hourlyPoint(time: string, temp: number, rain = 0): OpenMeteoHourlyPoint {
  return {
    time,
    temperatureC: temp,
    weatherCode: 0,
    precipitationMm: rain,
    snowfallCm: null,
    humidityPct: 50,
    windSpeedKmh: 10,
    windDirectionDeg: 180,
    pressureHpa: 1013,
    et0Mm: 0.2,
    shortwaveRadiationWm2: 250,
  }
}

describe('weatherClimateAnalysisEngine', () => {
  it('aggregates hourly records into daily summaries', () => {
    const points = [
      hourlyPoint('2024-06-01T08:00', 20, 0),
      hourlyPoint('2024-06-01T14:00', 32, 2),
      hourlyPoint('2024-06-02T10:00', 18, 5),
    ]
    const daily = aggregateDailyFromHourly(points)
    expect(daily).toHaveLength(2)
    expect(daily[0].tempMaxC).toBe(32)
    expect(daily[0].tempMinC).toBe(20)
    expect(daily[0].rainfallMm).toBe(2)
    expect(daily[0].et0Mm).toBeCloseTo(0.4, 5)
  })

  it('builds a climate report payload with risks and forecast rows', () => {
    const points: OpenMeteoHourlyPoint[] = []
    for (let d = 1; d <= 365; d += 1) {
      const day = String(d).padStart(3, '0')
      const temp = 20 + Math.sin(d / 30) * 8
      points.push(hourlyPoint(`2023-01-${day.slice(-2)}T12:00`, temp, d % 30 === 0 ? 40 : 0))
    }
    const payload = buildWeatherClimateReportPayload({
      aoiName: 'Test Field',
      aoiLocation: '24.5, 46.7',
      lat: 24.5,
      lng: 46.7,
      timezone: 'Asia/Riyadh',
      analysisStart: '2023-01-01',
      analysisEnd: '2023-12-31',
      loadedStart: '2023-01-01',
      loadedEnd: '2023-12-31',
      hourlyRecords: points,
    })
    expect(payload.dailyRecords.length).toBeGreaterThan(0)
    expect(payload.climateRisks).toHaveLength(3)
    expect(payload.forecastRows.some(r => r.year === 2050)).toBe(true)
    expect(payload.executiveSummary.mainFindings.length).toBeGreaterThan(0)
  })
})
