import { describe, expect, it } from 'vitest'
import { mapSitesToRowsFromApiEntries } from './openMeteoLocationBatch'
import type { WeatherFarmSite } from './weatherFarmService'

const site = (id: string, label: string): WeatherFarmSite => ({
  id: id as WeatherFarmSite['id'],
  label,
  countryLabel: '',
  lat: 24.5,
  lng: 54.3,
  featureCollection: { type: 'FeatureCollection', features: [] },
  farmNames: [],
  locationFeature: null,
})

describe('mapSitesToRowsFromApiEntries', () => {
  it('maps multi-location Open-Meteo array responses by index', () => {
    const sites = [site('loc-1', 'A'), site('loc-2', 'B')]
    const entries = [
      {
        current: {
          temperature_2m: 31.2,
          relative_humidity_2m: 42,
          wind_speed_10m: 18,
          precipitation: 0.1,
          weather_code: 1,
        },
      },
      {
        current: {
          temperature_2m: 28.5,
          relative_humidity_2m: 55,
          wind_speed_10m: 12,
          precipitation: 0,
          weather_code: 0,
        },
      },
    ]
    const rows = mapSitesToRowsFromApiEntries(sites, entries)
    expect(rows[0].temperatureC).toBe(31.2)
    expect(rows[1].temperatureC).toBe(28.5)
    expect(rows[0].humidityPct).toBe(42)
    expect(rows[1].weatherCode).toBe(0)
  })
})

