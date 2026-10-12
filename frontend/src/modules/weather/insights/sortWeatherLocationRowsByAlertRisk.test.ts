import { describe, expect, it } from 'vitest'
import { sortWeatherLocationRowsByAlertRisk } from './sortWeatherLocationRowsByAlertRisk'
import type { WeatherLocationRow } from '../hooks/useWeatherLocationRows'
import { DEFAULT_WEATHER_OPERATIONS_THRESHOLDS } from '../config/weatherThresholds'

function row(id: string, label: string, temperatureC: number | null): WeatherLocationRow {
  return {
    id,
    label,
    temperatureC,
    humidityPct: 40,
    windSpeedKmh: 5,
    windDirectionDeg: 0,
    precipMm: 0,
    weatherCode: 0,
    dailyMinC: null,
    dailyMaxC: null,
  }
}

describe('sortWeatherLocationRowsByAlertRisk', () => {
  it('keeps All first and orders hot locations before calm ones', () => {
    const sorted = sortWeatherLocationRowsByAlertRisk(
      [
        row('b', 'Calm Farm', 22),
        row('all', 'All locations', 30),
        row('a', 'Hot Farm', 39),
      ],
      DEFAULT_WEATHER_OPERATIONS_THRESHOLDS,
    )
    expect(sorted.map(r => r.id)).toEqual(['all', 'a', 'b'])
  })
})
