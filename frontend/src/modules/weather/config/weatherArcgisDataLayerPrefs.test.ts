import { describe, expect, it } from 'vitest'
import { WEATHER_ARCGIS_DATA_LAYERS } from './weatherArcgisDataLayers'
import { loadWeatherArcgisDataLayerPrefs, patchWeatherArcgisDataLayerPref } from './weatherArcgisDataLayerPrefs'

describe('weatherArcgisDataLayerPrefs', () => {
  it('includes every catalog layer with defaults', () => {
    const prefs = loadWeatherArcgisDataLayerPrefs()
    for (const layer of WEATHER_ARCGIS_DATA_LAYERS) {
      expect(prefs[layer.id]).toBeDefined()
      expect(prefs[layer.id].visible).toBe(false)
    }
  })

  it('patches a single layer', () => {
    const base = loadWeatherArcgisDataLayerPrefs()
    const next = patchWeatherArcgisDataLayerPref(base, 'noaa_metar_wind', { visible: true })
    expect(next.noaa_metar_wind.visible).toBe(true)
    expect(next.viirs_cloud_cover.visible).toBe(false)
  })
})
