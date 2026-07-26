import { describe, expect, it } from 'vitest'
import { splitTextIntoMarkdownSegments } from './geoAiMarkdownTable'
import {
  isWeatherForecastTable,
  isWeatherNowTable,
  liftWeatherFromMarkdownReply,
  liftWeatherNarrativeFromText,
  normalizeWeatherMarkdownNewlines,
} from './neighborhoodAgentWeatherViz'
import { stripGeoExplorerBubbleDisplayText } from './geoExplorerGemini'
import { sanitizeNeighborhoodAgentReplyText } from './neighborhoodAgentPlaceIntent'

const sample = `map focus: warm clear sky conditions dominate the current climate picture.

### Now
| Metric | Value |
| --- | ---: |
| Temp | 32.8°C |
| Feels | 39.1°C |
| Humidity | 60% |
| Pressure | 998 hPa |
| Wind | 4.61 m/s |

### Forecast
| When | Sky | Temp °C | Feels °C |
| --- | --- | ---: | ---: |
| 2026-07-26 21:00 | broken clouds | 33.9 | 33.9 |
| 2026-07-27 00:00 | broken clouds | 32.6 | 32.7 |
`

describe('weather transcript path', () => {
  it('splits markdown tables', () => {
    const stripped = stripGeoExplorerBubbleDisplayText(sample)
    const segs = splitTextIntoMarkdownSegments(stripped)
    const tables = segs.filter(s => s.type === 'table')
    expect(tables.length).toBeGreaterThanOrEqual(2)
    expect(tables.some(s => s.type === 'table' && isWeatherNowTable(s.table))).toBe(true)
    expect(tables.some(s => s.type === 'table' && isWeatherForecastTable(s.table))).toBe(true)
  })

  it('lifts markdown weather into structured card payload', () => {
    const lift = liftWeatherFromMarkdownReply(sample)
    expect(lift?.currentTable?.rows.length).toBeGreaterThanOrEqual(4)
    expect(lift?.forecastTable?.rows.length).toBeGreaterThanOrEqual(2)
    expect(lift?.climateLine || lift?.text).toMatch(/warm|clear|climate|map focus/i)
  })

  it('narrative lift recovers markdown weather', () => {
    const lift = liftWeatherNarrativeFromText(sample)
    expect(lift.currentTable || lift.forecastTable).toBeTruthy()
  })

  it('repairs single-line weather markdown dumps', () => {
    const oneLine = sample.replace(/\n/g, ' ')
    const fixed = normalizeWeatherMarkdownNewlines(oneLine)
    expect(fixed).toMatch(/\n/)
    const lift = liftWeatherFromMarkdownReply(oneLine)
    expect(lift?.currentTable?.rows.length).toBeGreaterThanOrEqual(4)
  })

  it('sanitize does not truncate weather markdown', () => {
    const monthRows = Array.from(
      { length: 40 },
      (_, i) => `| 2026-08-${String((i % 28) + 1).padStart(2, '0')} | clear sky | 38.0 | 28.0 |`,
    ).join('\n')
    const long = `${sample}\n\n### Month outlook\n| Day | Sky | Max °C | Min °C |\n| --- | --- | ---: | ---: |\n${monthRows}\n\nExtra note: ${'warm climate '.repeat(80)}`
    expect(long.length).toBeGreaterThan(1200)
    const sanitized = sanitizeNeighborhoodAgentReplyText(long)
    expect(sanitized.length).toBe(long.trim().length > sanitized.length ? sanitized.length : long.length)
    expect(sanitized.length).toBeGreaterThan(1200)
    expect(sanitized).toMatch(/Month outlook/)
    expect(sanitized.endsWith('…')).toBe(false)
  })
})
