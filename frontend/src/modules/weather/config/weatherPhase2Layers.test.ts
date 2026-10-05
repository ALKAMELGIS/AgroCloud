import { describe, expect, it } from 'vitest'
import { DEFAULT_WEATHER_SATELLITE_TILE_URL, getWeatherSatelliteTileUrl } from './weatherPhase2Layers'

describe('getWeatherSatelliteTileUrl', () => {
  it('returns Esri World Imagery default when env unset', () => {
    expect(getWeatherSatelliteTileUrl()).toBe(DEFAULT_WEATHER_SATELLITE_TILE_URL)
  })
})
