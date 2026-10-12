import { describe, expect, it } from 'vitest'
import {
  computeWeatherChartNowIndex,
  floorToOpenMeteoHourIso,
  interpolateWeatherChartValue,
  weatherChartLiveCadenceMs,
} from './weatherArcgisChartLive'

describe('weatherArcgisChartLive', () => {
  it('maps cadence to interval ms', () => {
    expect(weatherChartLiveCadenceMs('1s')).toBe(1_000)
    expect(weatherChartLiveCadenceMs('1m')).toBe(60_000)
    expect(weatherChartLiveCadenceMs('1h')).toBe(3_600_000)
  })

  it('floors to Open-Meteo hour key', () => {
    const ms = new Date('2024-06-01T14:37:00').getTime()
    expect(floorToOpenMeteoHourIso(ms)).toBe('2024-06-01T14:00')
  })

  it('computes fractional now index between hourly labels', () => {
    const labels = ['2024-06-01T14:00', '2024-06-01T15:00', '2024-06-01T16:00']
    const mid = new Date('2024-06-01T14:30:00').getTime()
    const idx = computeWeatherChartNowIndex(labels, mid)
    expect(idx).toBeCloseTo(0.5, 5)
  })

  it('interpolates series at now between hourly samples', () => {
    const labels = ['2024-06-01T14:00', '2024-06-01T15:00']
    const mid = new Date('2024-06-01T14:30:00').getTime()
    expect(interpolateWeatherChartValue(labels, [20, 30], mid)).toBeCloseTo(25, 5)
  })
})
