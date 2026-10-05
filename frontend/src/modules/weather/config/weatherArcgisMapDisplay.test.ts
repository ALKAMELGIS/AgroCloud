import { describe, expect, it } from 'vitest'
import {
  arcgisDataLayerPrefsForDisplayView,
  decodeWeatherMapDisplayView,
  encodeWeatherMapDisplayView,
  weatherArcgisMapDisplayOptions,
} from './weatherArcgisMapDisplay'
import { loadWeatherArcgisDataLayerPrefs } from './weatherArcgisDataLayerPrefs'

describe('weatherArcgisMapDisplay', () => {
  it('round-trips open-meteo and arcgis selections', () => {
    const om = encodeWeatherMapDisplayView({ source: 'open-meteo', layerId: 'wind_speed' })
    expect(decodeWeatherMapDisplayView(om)).toEqual({ source: 'open-meteo', layerId: 'wind_speed' })
    const arc = encodeWeatherMapDisplayView({ source: 'arcgis-data', layerId: 'viirs_cloud_cover' })
    expect(decodeWeatherMapDisplayView(arc)?.layerId).toBe('viirs_cloud_cover')
  })

  it('lists live and arcgis options', () => {
    const opts = weatherArcgisMapDisplayOptions()
    expect(opts.some(o => o.group === 'live' && o.label.includes('Wind'))).toBe(true)
    expect(opts.some(o => o.group === 'arcgis' && o.label.includes('METAR'))).toBe(true)
  })

  it('enables only the selected arcgis layer', () => {
    const base = loadWeatherArcgisDataLayerPrefs()
    const next = arcgisDataLayerPrefsForDisplayView(
      { source: 'arcgis-data', layerId: 'world_cities' },
      base,
    )
    expect(next.world_cities.visible).toBe(true)
    expect(next.noaa_metar_wind.visible).toBe(false)
  })
})
