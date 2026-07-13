import { describe, expect, it } from 'vitest'
import {
  aggregateWeatherByChartPeriods,
  buildDailyWeatherFromHourly,
  buildWeatherVegetationCorrelationNotes,
  kmhToMs,
  summarizeWeatherPoints,
} from './timeSeriesWeatherTimeline'
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'

function hourly(date: string, hour: number, overrides: Partial<OpenMeteoHourlyPoint> = {}): OpenMeteoHourlyPoint {
  return {
    time: `${date}T${String(hour).padStart(2, '0')}:00`,
    temperatureC: 25,
    weatherCode: 0,
    precipitationMm: 0,
    humidityPct: 50,
    windSpeedKmh: 18,
    windDirectionDeg: 90,
    pressureHpa: 1013,
    snowfallCm: null,
    et0Mm: null,
    shortwaveRadiationWm2: null,
    ...overrides,
  }
}

describe('timeSeriesWeatherTimeline', () => {
  it('converts wind km/h to m/s', () => {
    expect(kmhToMs(36)).toBeCloseTo(10, 2)
  })

  it('aggregates hourly points into daily weather', () => {
    const daily = buildDailyWeatherFromHourly([
      hourly('2026-06-01', 10, { temperatureC: 20, humidityPct: 40, precipitationMm: 1, windSpeedKmh: 18 }),
      hourly('2026-06-01', 14, { temperatureC: 30, humidityPct: 60, precipitationMm: 2, windSpeedKmh: 36 }),
      hourly('2026-06-02', 12, { temperatureC: 22, humidityPct: 55, precipitationMm: 0, windSpeedKmh: 9 }),
    ])
    expect(daily).toHaveLength(2)
    expect(daily[0]!.temperatureC).toBeCloseTo(25, 4)
    expect(daily[0]!.humidityPct).toBeCloseTo(50, 4)
    expect(daily[0]!.rainfallMm).toBeCloseTo(3, 4)
    expect(daily[0]!.windSpeedMs).toBeCloseTo(7.5, 2)
  })

  it('aligns weather buckets with chart period labels', () => {
    const daily = buildDailyWeatherFromHourly([
      hourly('2026-06-01', 10, { temperatureC: 20, precipitationMm: 2 }),
      hourly('2026-06-02', 10, { temperatureC: 24, precipitationMm: 1 }),
      hourly('2026-06-10', 10, { temperatureC: 28, precipitationMm: 4 }),
    ])
    const points = aggregateWeatherByChartPeriods(
      daily,
      ['2026-06-01', '2026-06-02', '2026-06-10'],
      ['2026-06-01', '2026-06-02', '2026-06-10'],
      'day',
    )
    expect(points).toHaveLength(3)
    expect(points[0]!.rainfallMm).toBeCloseTo(2, 4)
    expect(points[2]!.temperatureC).toBeCloseTo(28, 4)
  })

  it('summarizes weather statistics for the report', () => {
    const summary = summarizeWeatherPoints([
      {
        periodKey: '2026-06',
        displayLabel: '2026-06',
        temperatureC: 22,
        humidityPct: 60,
        rainfallMm: 12,
        windSpeedMs: 3.5,
      },
      {
        periodKey: '2026-07',
        displayLabel: '2026-07',
        temperatureC: 28,
        humidityPct: 40,
        rainfallMm: 8,
        windSpeedMs: 4.5,
      },
    ])
    expect(summary.avgTemperatureC).toBeCloseTo(25, 4)
    expect(summary.totalRainfallMm).toBeCloseTo(20, 4)
    expect(summary.avgHumidityPct).toBeCloseTo(50, 4)
    expect(summary.avgWindSpeedMs).toBeCloseTo(4, 4)
  })

  it('builds correlation notes between weather and vegetation indices', () => {
    const notes = buildWeatherVegetationCorrelationNotes(
      [
        {
          periodKey: 'd1',
          displayLabel: 'd1',
          temperatureC: 20,
          humidityPct: 70,
          rainfallMm: 5,
          windSpeedMs: 2,
        },
        {
          periodKey: 'd2',
          displayLabel: 'd2',
          temperatureC: 24,
          humidityPct: 60,
          rainfallMm: 10,
          windSpeedMs: 3,
        },
        {
          periodKey: 'd3',
          displayLabel: 'd3',
          temperatureC: 28,
          humidityPct: 50,
          rainfallMm: 15,
          windSpeedMs: 4,
        },
        {
          periodKey: 'd4',
          displayLabel: 'd4',
          temperatureC: 32,
          humidityPct: 40,
          rainfallMm: 20,
          windSpeedMs: 5,
        },
      ],
      [{ layerId: 'NDVI', values: [0.4, 0.45, 0.5, 0.55] }],
    )
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.some(n => n.includes('NDVI') || n.includes('vegetation'))).toBe(true)
  })
})
