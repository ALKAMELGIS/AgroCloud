import { describe, expect, it } from 'vitest'
import { sliceHourlyForChartWindow } from '../services/openMeteoWeatherDashboard'
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

  it('keeps lookback hours in chart window slice', () => {
    const anchor = '2026-10-12T14:00'
    const points = [
      { time: '2026-10-05T15:00' },
      { time: '2026-10-11T10:00' },
      { time: '2026-10-12T15:00' },
      { time: '2026-10-13T10:00' },
    ] as Parameters<typeof sliceHourlyForChartWindow>[0]
    const out = sliceHourlyForChartWindow(points, anchor, 7, 1)
    expect(out.map(p => p.time)).toContain('2026-10-05T15:00')
    expect(out.map(p => p.time)).toContain('2026-10-11T10:00')
  })

  it('interpolates series at now between hourly samples', () => {
    const labels = ['2024-06-01T14:00', '2024-06-01T15:00']
    const mid = new Date('2024-06-01T14:30:00').getTime()
    expect(interpolateWeatherChartValue(labels, [20, 30], mid)).toBeCloseTo(25, 5)
  })
})
