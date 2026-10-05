import { describe, expect, it } from 'vitest'
import { buildOperationalWeatherIndicators } from './buildOperationalWeatherIndicators'
import type { OpenMeteoDashboardBundle } from '../services/openMeteoWeatherDashboard'

function bundle(wind: number, precipProb = 10): OpenMeteoDashboardBundle {
  return {
    snapshot: {
      lat: 44,
      lng: 20,
      timezone: 'UTC',
      elevationM: 100,
      observedAt: '2026-10-05T12:00',
      temperatureC: 22,
      weatherCode: 1,
      conditionLabel: 'Clear',
      windSpeedKmh: wind,
      windDirectionDeg: 180,
      windDirectionLabel: 'S',
      humidityPct: 55,
      precipMm: 0,
      daily: [],
      nextHours: [],
    },
    hourly: [],
    hourlyForecast: Array.from({ length: 6 }, (_, i) => ({
      time: `2026-10-05T${12 + i}:00`,
      temperatureC: 22,
      apparentTemperatureC: 22,
      weatherCode: 1,
      precipitationMm: 0,
      precipitationProbabilityPct: precipProb,
      rainMm: 0,
      snowfallCm: null,
      humidityPct: 55,
      dewPointC: 10,
      cloudCoverPct: 20,
      visibilityKm: 10,
      windSpeedKmh: wind,
      windDirectionDeg: 180,
      pressureHpa: 1013,
      et0Mm: null,
      shortwaveRadiationWm2: null,
    })),
    daily7: [],
    fetchedAt: new Date().toISOString(),
    sourceLabel: 'Open-Meteo',
    resolutionLabel: 'test',
  }
}

describe('buildOperationalWeatherIndicators', () => {
  it('warns on high wind for spraying', () => {
    const items = buildOperationalWeatherIndicators(bundle(28))
    const spray = items.find(i => i.id === 'spray')
    expect(spray?.status).toBe('warning')
  })

  it('flags rain probability', () => {
    const items = buildOperationalWeatherIndicators(bundle(8, 72))
    const rain = items.find(i => i.id === 'rain')
    expect(rain?.status).toBe('warning')
  })
})
