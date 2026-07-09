import { describe, expect, it } from 'vitest'
import type { OpenMeteoHourlyPoint } from '../../../lib/openMeteoWeather'
import {
  buildStormAnalysis,
  scoreSnowStormHour,
  scoreStormHour,
} from './imageryStormAnalysis'

function hourly(overrides: Partial<OpenMeteoHourlyPoint> = {}): OpenMeteoHourlyPoint {
  return {
    time: '2026-01-15T12:00',
    temperatureC: 20,
    weatherCode: 0,
    precipitationMm: 0,
    snowfallCm: null,
    humidityPct: 60,
    windSpeedKmh: 10,
    windDirectionDeg: 180,
    pressureHpa: 1013,
    ...overrides,
  }
}

const polygon: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [55.1, 25.1],
      [55.2, 25.1],
      [55.2, 25.2],
      [55.1, 25.2],
      [55.1, 25.1],
    ],
  ],
}

describe('imageryStormAnalysis', () => {
  it('scores snow storm hours from cold snowfall conditions', () => {
    expect(scoreSnowStormHour(hourly({ temperatureC: 20, snowfallCm: 0.5 }))).toBe(0)
    const score = scoreSnowStormHour(
      hourly({ temperatureC: -2, snowfallCm: 0.8, windSpeedKmh: 45, weatherCode: 75 }),
    )
    expect(score).toBeGreaterThan(50)
  })

  it('scores thunderstorm hours as storms', () => {
    const score = scoreStormHour(
      hourly({ weatherCode: 95, precipitationMm: 8, windSpeedKmh: 55 }),
    )
    expect(score).toBeGreaterThan(60)
  })

  it('builds snow storm analysis with legend and affected area', () => {
    const points = [
      hourly({ time: '2026-01-10T08:00', temperatureC: -1, snowfallCm: 1.2, windSpeedKmh: 40, weatherCode: 73 }),
      hourly({ time: '2026-01-10T14:00', temperatureC: -3, snowfallCm: 2.0, windSpeedKmh: 50, weatherCode: 75 }),
    ]
    const result = buildStormAnalysis(
      'snow_storm',
      points,
      ['2026-01-10'],
      ['2026-01-10'],
      'day',
      polygon,
    )
    expect(result.peakEvent?.intensity).toBeGreaterThan(0)
    expect(result.legend).toHaveLength(5)
    expect(result.summary.affectedAreaHa).toBeGreaterThan(0)
    expect(result.interpretation).toMatch(/snow-storm/i)
  })

  it('builds general storm analysis for heavy rain and wind', () => {
    const points = [
      hourly({ time: '2026-03-05T10:00', weatherCode: 95, precipitationMm: 12, windSpeedKmh: 60 }),
    ]
    const result = buildStormAnalysis(
      'storm',
      points,
      ['2026-03-05'],
      ['2026-03-05'],
      'day',
      polygon,
    )
    expect(result.summary.peakSeverity).not.toBe('none')
    expect(result.mapFillColor).toBeTruthy()
  })
})
