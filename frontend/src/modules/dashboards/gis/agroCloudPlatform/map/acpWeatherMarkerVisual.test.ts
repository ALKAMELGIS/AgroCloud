import { describe, expect, it } from 'vitest'
import {
  formatAcpWeatherMarkerTemperature,
  resolveAcpWeatherMarkerCondition,
  resolveAcpWeatherMarkerVisual,
} from './acpWeatherMarkerVisual'

describe('acpWeatherMarkerVisual', () => {
  it('formats temperature as rounded degrees', () => {
    expect(formatAcpWeatherMarkerTemperature(31.6)).toBe('32°')
    expect(formatAcpWeatherMarkerTemperature(null)).toBe('—')
  })

  it('prioritises wind over generic cloud code', () => {
    expect(
      resolveAcpWeatherMarkerCondition({
        weatherCode: 3,
        windSpeedKmh: 30,
        precipMm: 0,
        conditionLabel: 'Overcast',
      }),
    ).toBe('wind')
  })

  it('resolves rain and clear conditions', () => {
    expect(
      resolveAcpWeatherMarkerCondition({
        weatherCode: 63,
        windSpeedKmh: 10,
        precipMm: 2,
        conditionLabel: 'Rain',
      }),
    ).toBe('rain')
    expect(
      resolveAcpWeatherMarkerCondition({
        weatherCode: 0,
        windSpeedKmh: 5,
        precipMm: 0,
        conditionLabel: 'Clear',
      }),
    ).toBe('clear')
  })

  it('builds marker visual with temperature and condition class', () => {
    const visual = resolveAcpWeatherMarkerVisual({
      temperatureC: 28,
      weatherCode: 0,
      windSpeedKmh: 8,
      precipMm: 0,
      conditionLabel: 'Clear',
    })
    expect(visual.temperatureLabel).toBe('28°')
    expect(visual.condition).toBe('clear')
    expect(visual.iconClass).toBe('fa-solid fa-sun')
    expect(visual.conditionClass).toBe('acp-weather-marker--cond-clear')
  })
})
