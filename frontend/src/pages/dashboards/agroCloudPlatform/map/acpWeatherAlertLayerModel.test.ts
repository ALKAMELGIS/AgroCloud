import { describe, expect, it } from 'vitest'
import type { OpenMeteoWeatherSnapshot } from '../../../../lib/openMeteoWeather'
import {
  buildAcpFieldWeatherLayerEntries,
  buildWeatherAlertTypes,
  resolveWeatherAlertLevel,
} from './acpWeatherAlertLayerModel'
import type { AcpWeatherTickerField } from './acpWeatherAlertTickerModel'

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

const field: AcpWeatherTickerField = {
  fieldKey: 'OBJECTID:1',
  objectId: '1',
  displayName: 'North Pivot',
  country: 'UAE',
  lat: 24.5,
  lng: 55.3,
}

describe('acpWeatherAlertLayerModel', () => {
  it('maps high severity to red level', () => {
    expect(resolveWeatherAlertLevel(900)).toBe('red')
    expect(resolveWeatherAlertLevel(450)).toBe('orange')
    expect(resolveWeatherAlertLevel(120)).toBe('yellow')
    expect(resolveWeatherAlertLevel(20)).toBe('none')
  })

  it('builds alert types for thunderstorm and wind', () => {
    const alerts = buildWeatherAlertTypes(stubSnapshot())
    expect(alerts.some(a => a.type === 'thunderstorm')).toBe(true)
    expect(alerts.some(a => a.type === 'wind')).toBe(true)
  })

  it('builds layer entries with level metadata', () => {
    const weather = new Map<string, OpenMeteoWeatherSnapshot>([['OBJECTID:1', stubSnapshot()]])
    const entries = buildAcpFieldWeatherLayerEntries([field], weather)
    expect(entries[0]?.level).toBe('red')
    expect(entries[0]?.weatherIconClass).toContain('fa-')
    expect(entries[0]?.alertTypes.length).toBeGreaterThan(0)
  })
})
