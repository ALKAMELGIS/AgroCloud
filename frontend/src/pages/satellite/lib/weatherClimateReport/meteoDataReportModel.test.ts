import { describe, expect, it } from 'vitest'
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import {
  approximateDaylightHours,
  buildMeteoDailyBundles,
  buildMeteoDataReportModel,
} from './meteoDataReportModel'

function hourly(time: string, temp: number, rain = 0, et0 = 0.2, rh = 50, wind = 10, sw = 250): OpenMeteoHourlyPoint {
  return {
    time,
    temperatureC: temp,
    weatherCode: 0,
    precipitationMm: rain,
    snowfallCm: null,
    humidityPct: rh,
    windSpeedKmh: wind,
    windDirectionDeg: 180,
    pressureHpa: 1013,
    et0Mm: et0,
    shortwaveRadiationWm2: sw,
  }
}

describe('meteoDataReportModel', () => {
  it('estimates daylight hours near equator around 12h', () => {
    const h = approximateDaylightHours(9.4, '2024-06-15')
    expect(h).toBeGreaterThan(11)
    expect(h).toBeLessThan(13.5)
  })

  it('builds daily bundles and monthly normals like GeoSyntra Data sheet', () => {
    const points: OpenMeteoHourlyPoint[] = []
    for (let day = 1; day <= 5; day++) {
      const d = `2024-01-${String(day).padStart(2, '0')}`
      points.push(hourly(`${d}T08:00`, 18, 0, 0.1, 55, 12, 80))
      points.push(hourly(`${d}T14:00`, 32, 1, 0.3, 40, 20, 600))
    }
    for (let day = 1; day <= 3; day++) {
      const d = `2024-06-${String(day).padStart(2, '0')}`
      points.push(hourly(`${d}T12:00`, 36, 0, 0.5, 35, 30, 700))
    }

    const daily = buildMeteoDailyBundles(points, 9.4)
    expect(daily.length).toBe(8)
    expect(daily[0].tmaxC).toBe(32)
    expect(daily[0].rainfallMm).toBe(1)

    const model = buildMeteoDataReportModel({
      aoiName: 'Test Field',
      aoiLocation: 'Burao',
      lat: 9.3867,
      lng: 45.4264,
      analysisStart: '2024-01-01',
      analysisEnd: '2024-06-30',
      hourlyRecords: points,
      timeAggregation: 'month',
    })
    expect(model.normalsTitle).toBe('Monthly Climate Normals')
    expect(model.normals.some(r => r.periodLabel === 'Jan')).toBe(true)
    expect(model.normals.some(r => r.periodLabel === 'Jun')).toBe(true)
    expect(model.yearMatrices.length).toBe(6)
    expect(model.annualSummary.some(r => r.year === 2024)).toBe(true)
    expect(model.cumulativeDeficit.length).toBeGreaterThan(0)
    expect(model.cumulativeByYear?.years).toContain(2024)
    expect(model.cumulativeByYear?.rows).toHaveLength(12)
  })

  it('exports hourly series when aggregation is hour', () => {
    const points = [
      hourly('2024-03-01T08:00', 22, 0.2),
      hourly('2024-03-01T09:00', 24, 0),
      hourly('2024-03-01T10:00', 26, 0.5),
    ]
    const model = buildMeteoDataReportModel({
      aoiName: 'AOI',
      aoiLocation: 'AOI',
      lat: 9.4,
      lng: 45.4,
      analysisStart: '2024-03-01',
      analysisEnd: '2024-03-01',
      hourlyRecords: points,
      timeAggregation: 'hour',
    })
    expect(model.normalsTitle).toBe('Hourly Climate Series')
    expect(model.normals).toHaveLength(3)
    expect(model.normals[0].periodLabel).toContain('08:00')
  })

  it('exports week buckets for week aggregation', () => {
    const points = [
      hourly('2024-01-01T12:00', 20, 1, 0.4),
      hourly('2024-01-08T12:00', 22, 2, 0.5),
    ]
    const model = buildMeteoDataReportModel({
      aoiName: 'AOI',
      aoiLocation: 'AOI',
      lat: 9.4,
      lng: 45.4,
      analysisStart: '2024-01-01',
      analysisEnd: '2024-01-15',
      hourlyRecords: points,
      timeAggregation: 'week',
    })
    expect(model.normalsTitle).toBe('Weekly Climate Series')
    expect(model.normals.length).toBeGreaterThanOrEqual(1)
  })
})
