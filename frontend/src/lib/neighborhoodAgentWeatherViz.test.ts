import { describe, expect, it } from 'vitest'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'
import {
  classifyWeatherCondition,
  currentTableToHumidityPie,
  forecastTableToSkyPieTable,
  forecastTableToTempChartTable,
  isWeatherForecastTable,
  isWeatherNowTable,
  liftWeatherNarrativeFromText,
  buildFastWeatherUserReplyFromFacts,
  weatherLiftFromTables,
} from './neighborhoodAgentWeatherViz'

const SAMPLE = `Summary
I will use the OPENWEATHER FACTS block to answer this question.

Location: Vračar (coordinates: latitude 44.79654, longitude 20.49004)

Clear sky with a temperature of 27.7°C, feels like 28.0°C, humidity at 48%, and pressure at 1011 hPa. The wind is blowing at 3.13 m/s from the east (180°).

Short forecast:
- Tomorrow (2026-07-26):
  - 12:00: Few clouds, temperature 29.4°C, feels like 29.1°C.
  - 15:00: Scattered clouds, temperature 31.8°C, feels like 30.4°C.
  - 18:00: Light rain, temperature 23.5°C, feels like 23.6°C.
- The next day (2026-07-27):
  - 12:00: Scattered clouds, temperature 29.9°C, feels like 28.9°C.

The forecast is based on the available data in the OPENWEATHER FACTS block.

Evidence
- read_live_map_state: ### LIVE MAP STATE
Camera: center 20.49004, 44.79654 · zoom 16.0 · 2D`

const NOW_TABLE: GeoExplorerDataTablePayload = {
  kind: 'statistics',
  title: 'Now',
  columns: [
    { key: 'metric', label: 'Metric', align: 'left' },
    { key: 'value', label: 'Value', align: 'right' },
  ],
  rows: [
    { values: { metric: 'Temp °C', value: '34.7°C' } },
    { values: { metric: 'Feels °C', value: '41.7°C' } },
    { values: { metric: 'Humidity %', value: '59%' } },
    { values: { metric: 'Pressure hPa', value: '998 hPa' } },
    { values: { metric: 'Wind m/s', value: '5.07 m/s' } },
  ],
}

const FORECAST_TABLE: GeoExplorerDataTablePayload = {
  kind: 'statistics',
  title: 'Forecast',
  columns: [
    { key: 'when', label: 'When', align: 'left' },
    { key: 'sky', label: 'Sky', align: 'left' },
    { key: 'temp', label: 'Temp °C', align: 'right' },
    { key: 'feels', label: 'Feels °C', align: 'right' },
  ],
  rows: [
    { values: { when: '2026-07-26 12:00:00', sky: 'Few clouds', temp: 34.6, feels: 41.5 } },
    { values: { when: '2026-07-26 15:00:00', sky: 'Broken clouds', temp: 33.1, feels: 39.2 } },
    { values: { when: '2026-07-26 18:00:00', sky: 'Broken clouds', temp: 32.2, feels: 37.8 } },
    { values: { when: '2026-07-27 00:00:00', sky: 'Few clouds', temp: 32.8, feels: 38.1 } },
  ],
}

describe('neighborhoodAgentWeatherViz', () => {
  it('classifies sky conditions', () => {
    expect(classifyWeatherCondition('Clear sky')).toBe('clear')
    expect(classifyWeatherCondition('Light rain')).toBe('rain')
    expect(classifyWeatherCondition('Scattered clouds')).toBe('clouds')
  })

  it('lifts narrative weather into current + forecast tables', () => {
    const lift = liftWeatherNarrativeFromText(SAMPLE)
    expect(lift.location).toMatch(/Vračar/)
    expect(lift.condition).toBe('clear')
    expect(lift.currentTable?.rows.length).toBeGreaterThanOrEqual(4)
    expect(lift.forecastTable?.rows.length).toBe(4)
    expect(lift.text).not.toMatch(/OPENWEATHER FACTS/i)
    expect(lift.text).not.toMatch(/Evidence/i)
    expect(lift.text.length).toBeLessThan(120)

    const chart = forecastTableToTempChartTable(lift.forecastTable!)
    expect(chart?.rows.map(r => r.values.temp)).toEqual([29.4, 31.8, 23.5, 29.9])
  })

  it('detects markdown Now/Forecast tables and builds chart payloads', () => {
    expect(isWeatherNowTable(NOW_TABLE)).toBe(true)
    expect(isWeatherForecastTable(FORECAST_TABLE)).toBe(true)

    const lift = weatherLiftFromTables(NOW_TABLE, FORECAST_TABLE, '### Summary\nWeather')
    expect(lift?.condition).toBe('clouds')
    expect(lift?.forecastTable?.rows.length).toBe(4)

    const humidity = currentTableToHumidityPie(NOW_TABLE)
    expect(humidity?.rows.map(r => r.values.share)).toEqual([59, 41])

    const sky = forecastTableToSkyPieTable(FORECAST_TABLE)
    expect(sky?.rows.length).toBe(2)

    const timeline = forecastTableToTempChartTable(FORECAST_TABLE)
    expect(timeline?.rows.map(r => r.values.temp)).toEqual([34.6, 33.1, 32.2, 32.8])
  })

  it('lifts OpenWeather FACTS lines and builds a fast markdown reply', () => {
    const facts = `Location: Dubai (coordinates: latitude 25.20480, longitude 55.27080)

### OPENWEATHER FACTS
Point: latitude 25.20480, longitude 55.27080
Current (Dubai): clear sky — temp 34.7°C, feels 41.7°C, humidity 59%, pressure 998 hPa, wind 5.07 m/s @ 180°.
Next intervals (3 h steps, first rows):
  - 2026-07-26 12:00:00: few clouds, temp 34.6°C, feels 41.5°C, precip prob 10%
  - 2026-07-26 15:00:00: broken clouds, temp 33.1°C, feels 39.2°C, precip prob 20%
  - 2026-07-26 18:00:00: light rain, temp 32.2°C, feels 37.8°C, precip prob 40%

### MONTH OUTLOOK
Daily outlook:
  - 2026-07-27: max 38.0°C, min 28.0°C, precip 0.0 mm, sky clear
  - 2026-07-28: max 37.2°C, min 27.5°C, precip 1.2 mm, sky rain
Weekly aggregates (month window):
  - W1: avg max 37.5°C, avg min 27.8°C, precip 1.2 mm
  - W2: avg max 36.1°C, avg min 26.9°C, precip 4.0 mm`

    const lift = liftWeatherNarrativeFromText(facts)
    expect(lift.location).toMatch(/Dubai/)
    expect(lift.climateLine).toMatch(/Dubai|hot|clear/i)
    expect(lift.currentTable?.rows.length).toBeGreaterThanOrEqual(4)
    expect(lift.forecastTable?.rows.length).toBe(3)
    expect(lift.monthOutlookTable?.rows.length).toBe(2)
    expect(lift.weekOutlookTable?.rows.length).toBe(2)

    const reply = buildFastWeatherUserReplyFromFacts(facts)
    expect(reply).toMatch(/### Now/)
    expect(reply).toMatch(/### Forecast/)
    expect(reply).toMatch(/### Month outlook/)
    expect(reply).toMatch(/34\.7/)
    expect(reply).not.toMatch(/OPENWEATHER FACTS/i)
  })
})
