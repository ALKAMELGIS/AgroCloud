import { describe, expect, it } from 'vitest'
import { buildWeatherIndexInterpretation } from './imageryWeatherCompare'
import type {
  TimeSeriesWeatherPoint,
  TimeSeriesWeatherSummary,
} from './timeSeriesReport/timeSeriesWeatherTimeline'

const points: TimeSeriesWeatherPoint[] = [
  {
    periodKey: '2024-01-01',
    displayLabel: 'Jan 2024',
    temperatureC: 36,
    humidityPct: 28,
    rainfallMm: 0,
    windSpeedMs: 4.2,
  },
  {
    periodKey: '2024-02-01',
    displayLabel: 'Feb 2024',
    temperatureC: 38,
    humidityPct: 25,
    rainfallMm: 0,
    windSpeedMs: 5.1,
  },
]

const summary: TimeSeriesWeatherSummary = {
  avgTemperatureC: 37,
  totalRainfallMm: 2,
  avgHumidityPct: 26,
  avgWindSpeedMs: 4.6,
}

describe('buildWeatherIndexInterpretation', () => {
  it('flags heat stress when temperature is high and NDVI declines', () => {
    const text = buildWeatherIndexInterpretation(
      'temperature',
      points,
      'NDVI',
      [0.62, 0.55],
      summary,
    )
    expect(text).toMatch(/High temperature/i)
    expect(text).toMatch(/NDVI/i)
    expect(text).toMatch(/stress/i)
  })

  it('flags water deficit when rainfall is low and index declines', () => {
    const text = buildWeatherIndexInterpretation(
      'rainfall',
      points,
      'NDVI',
      [0.58, 0.5],
      summary,
    )
    expect(text).toMatch(/Low rainfall/i)
    expect(text).toMatch(/water-deficit/i)
  })

  it('returns guidance when weather or index data is missing', () => {
    const text = buildWeatherIndexInterpretation('humidity', [], 'NDVI', [], summary)
    expect(text).toMatch(/Run satellite analysis/i)
  })
})
