import { describe, expect, it } from 'vitest'
import type { OpenMeteoWeatherSnapshot } from '../../../../lib/openMeteoWeather'
import {
  buildAcpFieldWeatherTickerEntries,
  formatAcpFieldWeatherTickerSegment,
  joinAcpWeatherAlertTickerText,
  resolveAcpWeatherTickerScrollDurationS,
  resolveAcpWeatherTickerCountryLabel,
  scoreWeatherAlertSeverity,
  type AcpWeatherTickerField,
} from './acpWeatherAlertTickerModel'

function stubSnapshot(overrides: Partial<OpenMeteoWeatherSnapshot> = {}): OpenMeteoWeatherSnapshot {
  return {
    lat: 24.5,
    lng: 55.3,
    timezone: 'UTC',
    elevationM: null,
    observedAt: '2026-06-17T12:00',
    temperatureC: 38,
    weatherCode: 95,
    conditionLabel: 'Thunderstorm',
    windSpeedKmh: 45,
    windDirectionDeg: 180,
    windDirectionLabel: 'S',
    humidityPct: 55,
    precipMm: 2,
    daily: [],
    nextHours: [],
    ...overrides,
  }
}

const fieldA: AcpWeatherTickerField = {
  fieldKey: 'a',
  objectId: '1',
  displayName: 'North Pivot',
  country: 'UAE',
  lat: 24.5,
  lng: 55.3,
}

const fieldB: AcpWeatherTickerField = {
  fieldKey: 'b',
  objectId: '2',
  displayName: 'South Plot',
  country: 'Libya',
  lat: 30.1,
  lng: 20.2,
}

describe('acpWeatherAlertTickerModel', () => {
  it('formats field segment with temp rain humidity wind', () => {
    const segment = formatAcpFieldWeatherTickerSegment(fieldA, stubSnapshot())
    expect(segment).toContain('North Pivot')
    expect(segment).toContain('UAE')
    expect(segment).toContain('38°C')
    expect(segment).toContain('Rain 2.0 mm')
    expect(segment).toContain('RH 55%')
    expect(segment).toContain('Wind 45 km/h S')
  })

  it('scores thunderstorm higher than clear weather', () => {
    const storm = scoreWeatherAlertSeverity(stubSnapshot({ weatherCode: 95 }))
    const clear = scoreWeatherAlertSeverity(stubSnapshot({ weatherCode: 0, precipMm: 0, windSpeedKmh: 5 }))
    expect(storm).toBeGreaterThan(clear)
  })

  it('sorts entries by alert severity then name', () => {
    const weather = new Map<string, OpenMeteoWeatherSnapshot>([
      ['a', stubSnapshot({ weatherCode: 0, precipMm: 0, windSpeedKmh: 8 })],
      ['b', stubSnapshot({ weatherCode: 95, precipMm: 12, windSpeedKmh: 50 })],
    ])
    const entries = buildAcpFieldWeatherTickerEntries([fieldA, fieldB], weather)
    expect(entries[0]?.fieldKey).toBe('b')
    expect(entries[1]?.fieldKey).toBe('a')
  })

  it('joins items with field separator', () => {
    const text = joinAcpWeatherAlertTickerText(['A', 'B'])
    expect(text).toContain('A')
    expect(text).toContain('B')
    expect(text).toContain('◆')
  })

  it('uses slow scroll duration scaled by field count', () => {
    expect(resolveAcpWeatherTickerScrollDurationS(1)).toBe(200)
    expect(resolveAcpWeatherTickerScrollDurationS(10)).toBe(200)
    expect(resolveAcpWeatherTickerScrollDurationS(20)).toBe(400)
  })

  it('maps country coded values to ArcGIS descriptions', () => {
    const map = new Map([['3', 'Egypt']])
    expect(resolveAcpWeatherTickerCountryLabel('3', map)).toBe('Egypt')
    expect(resolveAcpWeatherTickerCountryLabel('UAE', map)).toBe('UAE')
  })
})
