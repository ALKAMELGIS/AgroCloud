import { describe, expect, it } from 'vitest'
import { buildWeatherAlerts } from './buildWeatherAlerts'
import { DEFAULT_WEATHER_OPERATIONS_THRESHOLDS } from '../config/weatherThresholds'

describe('buildWeatherAlerts', () => {
  it('creates high wind alert when above threshold', () => {
    const alerts = buildWeatherAlerts(
      {
        snapshot: {
          lat: 0,
          lng: 0,
          timezone: 'UTC',
          elevationM: null,
          observedAt: '2026-01-01T12:00',
          temperatureC: 20,
          weatherCode: 0,
          conditionLabel: 'Clear',
          windSpeedKmh: 32,
          windDirectionDeg: 200,
          windDirectionLabel: 'SW',
          humidityPct: 50,
          precipMm: 0,
          daily: [],
          nextHours: [],
        },
        hourly: [],
        hourlyForecast: [],
        daily7: [],
        fetchedAt: '',
        sourceLabel: 'Open-Meteo',
        resolutionLabel: 'test',
      },
      'Sivac',
      DEFAULT_WEATHER_OPERATIONS_THRESHOLDS,
    )
    expect(alerts.some(a => a.type === 'HIGH WIND')).toBe(true)
  })
})
