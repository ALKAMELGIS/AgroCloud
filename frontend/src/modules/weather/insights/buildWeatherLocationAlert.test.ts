import { describe, expect, it } from 'vitest'
import { buildWeatherLocationAlert } from './buildWeatherLocationAlert'
import { DEFAULT_WEATHER_OPERATIONS_THRESHOLDS } from '../config/weatherThresholds'

const T = DEFAULT_WEATHER_OPERATIONS_THRESHOLDS

describe('buildWeatherLocationAlert', () => {
  it('returns null when no metrics', () => {
    expect(
      buildWeatherLocationAlert(
        {
          temperatureC: null,
          humidityPct: null,
          windSpeedKmh: null,
          precipMm: null,
          weatherCode: null,
        },
        T,
      ),
    ).toBeNull()
  })

  it('flags extreme heat', () => {
    const a = buildWeatherLocationAlert(
      { temperatureC: 40, humidityPct: 40, windSpeedKmh: 8, precipMm: 0, weatherCode: 0 },
      T,
    )
    expect(a?.id).toBe('extreme-heat')
    expect(a?.emoji).toBe('🥵')
  })

  it('prioritizes storm over heat', () => {
    const a = buildWeatherLocationAlert(
      { temperatureC: 40, humidityPct: 50, windSpeedKmh: 10, precipMm: 2, weatherCode: 95 },
      T,
    )
    expect(a?.id).toBe('thunderstorm')
  })

  it('detects heat humidity wind combo', () => {
    const a = buildWeatherLocationAlert(
      { temperatureC: 39, humidityPct: 88, windSpeedKmh: 20, precipMm: 0, weatherCode: 2 },
      T,
    )
    expect(a?.id).toBe('heat-humidity-wind')
  })
})
