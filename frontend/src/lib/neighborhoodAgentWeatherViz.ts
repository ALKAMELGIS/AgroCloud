/**
 * Lift narrative weather replies into compact tables the NAC UI can chart.
 */

import { splitTextIntoMarkdownSegments } from './geoAiMarkdownTable'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'

export type NeighborhoodAgentWeatherCondition =
  | 'clear'
  | 'clouds'
  | 'rain'
  | 'storm'
  | 'snow'
  | 'fog'
  | 'unknown'

export type NeighborhoodAgentWeatherLift = {
  text: string
  location?: string
  condition?: NeighborhoodAgentWeatherCondition
  conditionLabel?: string
  /** One-line climate interpretation for the current conditions. */
  climateLine?: string
  currentTable?: GeoExplorerDataTablePayload | null
  forecastTable?: GeoExplorerDataTablePayload | null
  /** Daily / weekly month outlook for charts + table. */
  monthOutlookTable?: GeoExplorerDataTablePayload | null
  weekOutlookTable?: GeoExplorerDataTablePayload | null
}

function stripMd(s: string): string {
  return s.replace(/\*\*/g, '').replace(/__/g, '').trim()
}

export function classifyWeatherCondition(desc: string): NeighborhoodAgentWeatherCondition {
  const d = desc.toLowerCase()
  if (/thunder|storm|برق|عاصف/.test(d)) return 'storm'
  if (/snow|ثلج/.test(d)) return 'snow'
  if (/rain|drizzle|shower|مطر|رذاذ/.test(d)) return 'rain'
  if (/fog|mist|haze|ضباب/.test(d)) return 'fog'
  if (/cloud|overcast|غيم|سحاب/.test(d)) return 'clouds'
  if (/clear|sun|صافي|مشمس/.test(d)) return 'clear'
  return 'unknown'
}

export function weatherConditionIcon(c: NeighborhoodAgentWeatherCondition): string {
  switch (c) {
    case 'clear':
      return 'fa-solid fa-sun'
    case 'clouds':
      return 'fa-solid fa-cloud'
    case 'rain':
      return 'fa-solid fa-cloud-rain'
    case 'storm':
      return 'fa-solid fa-cloud-bolt'
    case 'snow':
      return 'fa-solid fa-snowflake'
    case 'fog':
      return 'fa-solid fa-smog'
    default:
      return 'fa-solid fa-cloud-sun'
  }
}

/** Short professional climate reading for the current conditions. */
export function buildClimateInterpretationLine(input: {
  condition?: NeighborhoodAgentWeatherCondition
  conditionLabel?: string
  location?: string
  tempC?: number | null
  humidity?: number | null
  windMs?: number | null
}): string {
  const place = (input.location || 'This location').replace(/\(coordinates:.*\)/i, '').trim()
  const sky = (input.conditionLabel || input.condition || 'mixed skies').toLowerCase()
  const t = input.tempC
  const h = input.humidity
  const w = input.windMs
  const heat =
    t != null && t >= 38
      ? 'extreme heat'
      : t != null && t >= 33
        ? 'hot'
        : t != null && t >= 26
          ? 'warm'
          : t != null && t >= 18
            ? 'mild'
            : t != null && t >= 10
              ? 'cool'
              : t != null
                ? 'cold'
                : null
  const humidNote = h != null && h >= 70 ? ' with high humidity' : h != null && h <= 25 ? ' with dry air' : ''
  const windNote = w != null && w >= 8 ? '; breezy winds' : ''
  if (heat) {
    return `${place}: ${heat} ${sky} conditions dominate the current climate picture${humidNote}${windNote}.`
  }
  return `${place}: ${sky} conditions set the current climate picture${humidNote}${windNote}.`
}

function parseDailyOutlookLines(lines: string[]): Array<{
  lineIdx: number
  when: string
  max: number
  min: number
  precip: number
  sky: string
}> {
  const hits: Array<{ lineIdx: number; when: string; max: number; min: number; precip: number; sky: string }> = []
  for (let i = 0; i < lines.length; i++) {
    const raw = stripMd(lines[i]!)
    const m = raw.match(
      /^(?:[-*•]\s*)?(\d{4}-\d{2}-\d{2})\s*:\s*max\s+(-?\d+(?:\.\d+)?)°?C,\s*min\s+(-?\d+(?:\.\d+)?)°?C,\s*precip\s+(-?\d+(?:\.\d+)?)\s*mm(?:,\s*sky\s+(.+))?$/i,
    )
    if (!m) continue
    hits.push({
      lineIdx: i,
      when: m[1]!,
      max: Number(m[2]),
      min: Number(m[3]),
      precip: Number(m[4]),
      sky: (m[5] || 'n/a').trim(),
    })
  }
  return hits
}

function parseWeeklyOutlookLines(lines: string[]): Array<{
  lineIdx: number
  when: string
  max: number
  min: number
  precip: number
}> {
  const hits: Array<{ lineIdx: number; when: string; max: number; min: number; precip: number }> = []
  for (let i = 0; i < lines.length; i++) {
    const raw = stripMd(lines[i]!)
    const m = raw.match(
      /^(?:[-*•]\s*)?(W\d+)\s*:\s*avg max\s+(-?\d+(?:\.\d+)?)°?C,\s*avg min\s+(-?\d+(?:\.\d+)?)°?C,\s*precip\s+(-?\d+(?:\.\d+)?)\s*mm$/i,
    )
    if (!m) continue
    hits.push({
      lineIdx: i,
      when: m[1]!,
      max: Number(m[2]),
      min: Number(m[3]),
      precip: Number(m[4]),
    })
  }
  return hits
}

/** Drop meta / Evidence / OPENWEATHER boilerplate from user-facing prose. */
export function stripNeighborhoodAgentWeatherBoilerplate(text: string): string {
  const lines = text.split(/\r?\n/)
  const out: string[] = []
  let skipEvidence = false
  for (const line of lines) {
    const t = line.trim()
    if (/^evidence\s*:?\s*$/i.test(t) || /^###?\s*evidence\b/i.test(t)) {
      skipEvidence = true
      continue
    }
    if (skipEvidence) {
      if (/^(summary|short forecast|location|current|tomorrow|suggestions)\b/i.test(t)) {
        skipEvidence = false
      } else if (/^[-*•]/.test(t) || /read_live_map_state|LIVE MAP STATE|Camera:|OPENWEATHER|MAP_ACTION|GEO_AI_JSON/i.test(t)) {
        continue
      } else if (!t) {
        continue
      } else {
        skipEvidence = false
      }
    }
    if (/OPENWEATHER FACTS|OPEN-METEO|WEATHER_ANSWER_RULES|I will use the|based on the available data in the/i.test(t)) {
      continue
    }
    if (/^summary\s*:?\s*$/i.test(t)) continue
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function parseCurrentMetrics(paragraph: string): {
  conditionLabel?: string
  metrics: Array<{ label: string; value: number; unit: string }>
} | null {
  // Prose: "temperature of 27.7°C" / OpenWeather facts: "temp 32.1°C"
  const temp =
    paragraph.match(/temp(?:erature)?(?:\s+of)?\s+(-?\d+(?:\.\d+)?)\s*°?\s*C/i) ||
    paragraph.match(/(-?\d+(?:\.\d+)?)\s*°\s*C/)
  const feels = paragraph.match(/feels(?:\s+like)?\s+(-?\d+(?:\.\d+)?)\s*°?\s*C/i)
  const humidity = paragraph.match(/humidity\s+(?:at\s+)?(\d+(?:\.\d+)?)\s*%/i)
  const pressure = paragraph.match(/pressure\s+(?:at\s+)?(\d+(?:\.\d+)?)\s*hPa/i)
  const windMatch = paragraph.match(/wind[^.]*?(\d+(?:\.\d+)?)\s*(m\/s|km\/h)/i)
  const cond =
    paragraph.match(
      /^(?:Current(?:\s*\([^)]*\))?\s*:\s*)?(Clear sky|Few clouds|Scattered clouds|Broken clouds|Overcast clouds|Light rain|Moderate rain|Heavy rain|Thunderstorm|Snow|Fog|Mist|clear sky|few clouds|scattered clouds|broken clouds|overcast clouds)[^.]*?/i,
    )?.[1] ||
    paragraph.match(
      /\b(clear sky|few clouds|scattered clouds|broken clouds|overcast(?:\s+clouds)?|light rain|rain|snow|fog|mist)\b/i,
    )?.[1]

  const metrics: Array<{ label: string; value: number; unit: string }> = []
  if (temp) metrics.push({ label: 'Temp', value: Number(temp[1]), unit: '°C' })
  if (feels) metrics.push({ label: 'Feels', value: Number(feels[1]), unit: '°C' })
  if (humidity) metrics.push({ label: 'Humidity', value: Number(humidity[1]), unit: '%' })
  if (pressure) metrics.push({ label: 'Pressure', value: Number(pressure[1]), unit: 'hPa' })
  if (windMatch) metrics.push({ label: 'Wind', value: Number(windMatch[1]), unit: windMatch[2]! })
  if (metrics.length < 2) return null
  return { conditionLabel: cond ? cond.replace(/\b\w/g, c => c.toUpperCase()) : undefined, metrics }
}

type ForecastHit = { lineIdx: number; label: string; condition: string; temp: number; feels?: number }

function parseForecastLines(lines: string[]): ForecastHit[] {
  const hits: ForecastHit[] = []
  let dayPrefix = ''
  for (let i = 0; i < lines.length; i++) {
    const raw = stripMd(lines[i]!)
    const day = raw.match(/^(?:[-*•]\s*)?(Tomorrow|The next day|Today|غدا|اليوم)(?:\s*\(([^)]+)\))?\s*:?\s*$/i)
    if (day) {
      dayPrefix = day[2] ? day[2].slice(5) || day[1]! : day[1]! // prefer MM-DD from ISO if present
      if (day[2] && /^\d{4}-\d{2}-\d{2}$/.test(day[2])) dayPrefix = day[2].slice(5)
      else dayPrefix = (day[1] || '').slice(0, 12)
      continue
    }
    // OpenWeather facts: "2026-07-26 12:00:00: Few clouds, temp 34.6°C, feels 41.5°C"
    const owm = raw.match(
      /^(?:[-*•]\s*)?(\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?)\s*:\s*([^,]+),\s*temp(?:erature)?\s+(-?\d+(?:\.\d+)?)\s*°?\s*C(?:\s*,\s*feels(?:\s+like)?\s+(-?\d+(?:\.\d+)?)\s*°?\s*C)?/i,
    )
    if (owm) {
      hits.push({
        lineIdx: i,
        label: owm[1]!.replace(/:\d{2}$/, '').slice(0, 28),
        condition: owm[2]!.trim(),
        temp: Number(owm[3]),
        feels: owm[4] != null ? Number(owm[4]) : undefined,
      })
      continue
    }
    // Narrative: "12:00: Few clouds, temperature 29.4°C, feels like 29.1°C"
    const m = raw.match(
      /^(?:[-*•]\s*)?(\d{1,2}:\d{2})\s*:\s*([^,]+),\s*temp(?:erature)?\s+(-?\d+(?:\.\d+)?)\s*°?\s*C(?:\s*,\s*feels(?:\s+like)?\s+(-?\d+(?:\.\d+)?)\s*°?\s*C)?/i,
    )
    if (!m) continue
    const label = `${dayPrefix ? `${dayPrefix} ` : ''}${m[1]}`.trim()
    hits.push({
      lineIdx: i,
      label: label.slice(0, 28),
      condition: m[2]!.trim(),
      temp: Number(m[3]),
      feels: m[4] != null ? Number(m[4]) : undefined,
    })
  }
  return hits
}

/**
 * Convert long weather prose (current + forecast bullets) into compact tables + short lead.
 */
export function liftWeatherNarrativeFromText(text: string): NeighborhoodAgentWeatherLift {
  const cleaned = stripNeighborhoodAgentWeatherBoilerplate(text)
  if (!cleaned.trim()) return { text: cleaned }

  // Prefer structured markdown (fast pack / model tables) over prose parsing.
  const fromMd = liftWeatherFromMarkdownReply(cleaned)
  if (fromMd?.currentTable || fromMd?.forecastTable || fromMd?.monthOutlookTable) {
    return fromMd
  }

  const looksWeather =
    /temperature|feels\s+like|humidity|hPa|m\/s|short forecast|openweather|month outlook|daily outlook|°\s*C|طقس|حرارة|avg max|precip/i.test(
      cleaned,
    )
  if (!looksWeather) return { text: cleaned }

  const lines = cleaned.split(/\r?\n/)
  let location: string | undefined
  const drop = new Set<number>()

  for (let i = 0; i < lines.length; i++) {
    const loc = stripMd(lines[i]!).match(/^Location\s*:\s*(.+)$/i)
    if (loc) {
      location = loc[1]!.replace(/\(coordinates:.*\)/i, '').trim()
      drop.add(i)
    }
    const curName = stripMd(lines[i]!).match(/^Current\s*\(([^)]+)\)\s*:/i)
    if (curName && !location) location = curName[1]!.trim()
    if (/^Short forecast\s*:?\s*$/i.test(stripMd(lines[i]!))) drop.add(i)
  }

  let currentTable: GeoExplorerDataTablePayload | null = null
  let condition: NeighborhoodAgentWeatherCondition | undefined
  let conditionLabel: string | undefined

  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) continue
    const para = stripMd(lines[i]!)
    if (para.length < 40) continue
    if (!/temp|humidity|feels/i.test(para)) continue
    const parsed = parseCurrentMetrics(para)
    if (!parsed) continue
    conditionLabel = parsed.conditionLabel
    condition = classifyWeatherCondition(conditionLabel || para)
    currentTable = {
      kind: 'statistics',
      title: 'Now',
      columns: [
        { key: 'metric', label: 'Metric', align: 'left' },
        { key: 'value', label: 'Value', align: 'right' },
      ],
      rows: parsed.metrics.map(m => ({
        values: { metric: m.label, value: `${m.value} ${m.unit}` },
      })),
    }
    // Also a numeric-only companion for optional mini bars is built from forecast; current stays string values for compact display
    drop.add(i)
    break
  }

  // Rebuild current as numeric chartable table (value column numeric + unit in label)
  if (currentTable) {
    const numericRows: GeoExplorerDataTablePayload['rows'] = []
    for (const row of currentTable.rows) {
      const metric = String(row.values.metric ?? '')
      const raw = String(row.values.value ?? '')
      const n = Number(raw.replace(/[^\d.+-]/g, ''))
      if (!Number.isFinite(n)) continue
      if (/humidity/i.test(metric) || /temp|feels|wind/i.test(metric)) {
        numericRows.push({ values: { metric, value: n } })
      }
    }
    // Keep display table with units; chart uses a separate numeric table below if enough rows
    if (numericRows.length >= 2) {
      currentTable = {
        kind: 'statistics',
        title: 'Now',
        columns: [
          { key: 'metric', label: 'Metric', align: 'left' },
          { key: 'value', label: 'Value', align: 'right' },
        ],
        rows: currentTable.rows,
      }
    }
  }

  const forecastHits = parseForecastLines(lines)
  let forecastTable: GeoExplorerDataTablePayload | null = null
  if (forecastHits.length >= 2) {
    for (const h of forecastHits) drop.add(h.lineIdx)
    // Drop day header lines immediately above forecast times
    for (let i = 0; i < lines.length; i++) {
      if (/^(?:[-*•]\s*)?(Tomorrow|The next day|Today)\b/i.test(stripMd(lines[i]!))) drop.add(i)
    }
    forecastTable = {
      kind: 'statistics',
      title: 'Forecast °C',
      columns: [
        { key: 'when', label: 'When', align: 'left' },
        { key: 'sky', label: 'Sky', align: 'left' },
        { key: 'temp', label: 'Temp °C', align: 'right' },
        { key: 'feels', label: 'Feels °C', align: 'right', defaultVisible: false },
      ],
      rows: forecastHits.map(h => ({
        values: {
          when: h.label,
          sky: h.condition,
          temp: h.temp,
          feels: h.feels ?? null,
        },
      })),
    }
  }

  const dailyHits = parseDailyOutlookLines(lines)
  let monthOutlookTable: GeoExplorerDataTablePayload | null = null
  if (dailyHits.length >= 2) {
    for (const h of dailyHits) drop.add(h.lineIdx)
    monthOutlookTable = {
      kind: 'statistics',
      title: 'Month outlook (°C)',
      columns: [
        { key: 'when', label: 'Day', align: 'left' },
        { key: 'sky', label: 'Sky', align: 'left' },
        { key: 'temp', label: 'Max °C', align: 'right' },
        { key: 'min', label: 'Min °C', align: 'right' },
        { key: 'precip', label: 'Rain mm', align: 'right', defaultVisible: false },
      ],
      rows: dailyHits.slice(0, 16).map(h => ({
        values: {
          when: h.when.slice(5),
          sky: h.sky,
          temp: h.max,
          min: h.min,
          precip: h.precip,
        },
      })),
    }
    if (!conditionLabel && dailyHits[0]?.sky) {
      conditionLabel = dailyHits[0].sky
      condition = classifyWeatherCondition(dailyHits[0].sky)
    }
  }

  const weekHits = parseWeeklyOutlookLines(lines)
  let weekOutlookTable: GeoExplorerDataTablePayload | null = null
  if (weekHits.length >= 2) {
    for (const h of weekHits) drop.add(h.lineIdx)
    weekOutlookTable = {
      kind: 'statistics',
      title: 'Weekly outlook',
      columns: [
        { key: 'when', label: 'Week', align: 'left' },
        { key: 'temp', label: 'Avg max °C', align: 'right' },
        { key: 'min', label: 'Avg min °C', align: 'right' },
        { key: 'precip', label: 'Rain mm', align: 'right' },
      ],
      rows: weekHits.map(h => ({
        values: { when: h.when, temp: h.max, min: h.min, precip: h.precip },
      })),
    }
  }

  if (!currentTable && !forecastTable && !monthOutlookTable) return { text: cleaned }

  const tempC = (() => {
    if (!currentTable) return null
    for (const row of currentTable.rows) {
      if (/^temp/i.test(String(row.values.metric ?? ''))) {
        const n = Number(String(row.values.value ?? '').replace(/[^\d.+-]/g, ''))
        return Number.isFinite(n) ? n : null
      }
    }
    return null
  })()
  const humidity = (() => {
    if (!currentTable) return null
    for (const row of currentTable.rows) {
      if (/humidity/i.test(String(row.values.metric ?? ''))) {
        const n = Number(String(row.values.value ?? '').replace(/[^\d.+-]/g, ''))
        return Number.isFinite(n) ? n : null
      }
    }
    return null
  })()
  const windMs = (() => {
    if (!currentTable) return null
    for (const row of currentTable.rows) {
      if (/wind/i.test(String(row.values.metric ?? ''))) {
        const n = Number(String(row.values.value ?? '').replace(/[^\d.+-]/g, ''))
        return Number.isFinite(n) ? n : null
      }
    }
    return null
  })()

  const climateLine = buildClimateInterpretationLine({
    condition,
    conditionLabel,
    location,
    tempC,
    humidity,
    windMs,
  })

  return {
    text: climateLine.slice(0, 200),
    location,
    condition,
    conditionLabel,
    climateLine,
    currentTable,
    forecastTable,
    monthOutlookTable,
    weekOutlookTable,
  }
}

/** Chartable temp series from a forecast table (When + Temp °C). */
export function forecastTableToTempChartTable(
  forecast: GeoExplorerDataTablePayload,
): GeoExplorerDataTablePayload | null {
  const whenCol = forecast.columns.find(c => /when|time|وقت/i.test(c.key) || /when|time/i.test(c.label))
  const tempCol = forecast.columns.find(
    c => (/^temp/i.test(c.key) || /^temp/i.test(c.label)) && !/feels/i.test(c.key) && !/feels/i.test(c.label),
  )
  if (!whenCol || !tempCol) return null
  const rows = forecast.rows
    .map(r => {
      const label = String(r.values[whenCol.key] ?? '').trim()
      const temp = r.values[tempCol.key]
      const n = typeof temp === 'number' ? temp : Number(String(temp).replace(/[^\d.+-]/g, ''))
      if (!label || !Number.isFinite(n)) return null
      const short = label.replace(/:\d{2}$/, '').replace(/^\d{4}-/, '')
      return { values: { when: short.slice(0, 16), temp: n } }
    })
    .filter(Boolean) as GeoExplorerDataTablePayload['rows']
  if (rows.length < 2) return null
  return {
    kind: 'statistics',
    title: 'Temp °C',
    columns: [
      { key: 'when', label: 'When', align: 'left' },
      { key: 'temp', label: 'Temp °C', align: 'right' },
    ],
    rows,
  }
}

/** Feels-like series for dual bar when available. */
export function forecastTableToFeelsChartTable(
  forecast: GeoExplorerDataTablePayload,
): GeoExplorerDataTablePayload | null {
  const whenCol = forecast.columns.find(c => /when|time|وقت/i.test(c.key) || /when|time/i.test(c.label))
  const feelsCol = forecast.columns.find(c => /feels/i.test(c.key) || /feels/i.test(c.label))
  if (!whenCol || !feelsCol) return null
  const rows = forecast.rows
    .map(r => {
      const label = String(r.values[whenCol.key] ?? '').trim()
      const feels = r.values[feelsCol.key]
      const n = typeof feels === 'number' ? feels : Number(String(feels).replace(/[^\d.+-]/g, ''))
      if (!label || !Number.isFinite(n)) return null
      const short = label.replace(/:\d{2}$/, '').replace(/^\d{4}-/, '')
      return { values: { when: short.slice(0, 16), feels: n } }
    })
    .filter(Boolean) as GeoExplorerDataTablePayload['rows']
  if (rows.length < 2) return null
  return {
    kind: 'statistics',
    title: 'Feels °C',
    columns: [
      { key: 'when', label: 'When', align: 'left' },
      { key: 'feels', label: 'Feels °C', align: 'right' },
    ],
    rows,
  }
}

/** Pie of sky-condition counts from forecast rows. */
export function forecastTableToSkyPieTable(
  forecast: GeoExplorerDataTablePayload,
): GeoExplorerDataTablePayload | null {
  const skyCol = forecast.columns.find(c => /sky|cond|condition|سماء|حالة/i.test(c.key) || /sky|cond/i.test(c.label))
  if (!skyCol) return null
  const counts = new Map<string, number>()
  for (const r of forecast.rows) {
    const sky = String(r.values[skyCol.key] ?? '').trim()
    if (!sky) continue
    counts.set(sky, (counts.get(sky) || 0) + 1)
  }
  if (counts.size < 2) return null
  const rows = [...counts.entries()].map(([sky, n]) => ({ values: { sky, count: n } }))
  return {
    kind: 'statistics',
    title: 'Sky mix',
    columns: [
      { key: 'sky', label: 'Sky', align: 'left' },
      { key: 'count', label: 'Slots', align: 'right' },
    ],
    rows,
  }
}

/** Humidity pie from Now metrics (Humidity % vs remainder). */
export function currentTableToHumidityPie(
  current: GeoExplorerDataTablePayload,
): GeoExplorerDataTablePayload | null {
  for (const r of current.rows) {
    const metric = String(r.values.metric ?? r.values.Metric ?? '')
    if (!/humidity|رطوبة/i.test(metric)) continue
    const raw = r.values.value ?? r.values.Value
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^\d.+-]/g, ''))
    if (!Number.isFinite(n) || n < 0 || n > 100) continue
    return {
      kind: 'statistics',
      title: 'Humidity',
      columns: [
        { key: 'part', label: 'Part', align: 'left' },
        { key: 'share', label: 'Share %', align: 'right' },
      ],
      rows: [
        { values: { part: 'Humidity', share: Math.round(n * 10) / 10 } },
        { values: { part: 'Dry air', share: Math.round((100 - n) * 10) / 10 } },
      ],
    }
  }
  return null
}

export function isWeatherNowTable(table: GeoExplorerDataTablePayload): boolean {
  const title = (table.title || '').toLowerCase()
  const labels = table.columns.map(c => c.label.toLowerCase()).join(' ')
  const keys = table.columns.map(c => c.key.toLowerCase()).join(' ')
  if (/^now\b|current|الآن/.test(title)) return true
  if (/metric/.test(labels) && /value/.test(labels)) {
    const blob = table.rows
      .map(r => Object.values(r.values).join(' '))
      .join(' ')
      .toLowerCase()
    return /temp|humidity|pressure|wind|°c|hpa/.test(blob)
  }
  return /metric/.test(keys) && table.rows.some(r => /temp|humidity/i.test(String(r.values.metric ?? '')))
}

export function isWeatherForecastTable(table: GeoExplorerDataTablePayload): boolean {
  const title = (table.title || '').toLowerCase()
  const labels = table.columns.map(c => `${c.key} ${c.label}`).join(' ').toLowerCase()
  if (/forecast|توقعات/.test(title)) return true
  return /when|time/.test(labels) && /temp/.test(labels) && (/sky|cond/.test(labels) || /feels/.test(labels))
}

export function isWeatherMonthOutlookTable(table: GeoExplorerDataTablePayload): boolean {
  const title = (table.title || '').toLowerCase()
  const labels = table.columns.map(c => `${c.key} ${c.label}`).join(' ').toLowerCase()
  if (/month|outlook|daily/.test(title) && !/week/.test(title)) return true
  return /day|when/.test(labels) && /max|temp/.test(labels) && /min/.test(labels) && /sky|precip|rain/.test(labels)
}

export function isWeatherWeekOutlookTable(table: GeoExplorerDataTablePayload): boolean {
  const title = (table.title || '').toLowerCase()
  const labels = table.columns.map(c => `${c.key} ${c.label}`).join(' ').toLowerCase()
  if (/weekly|week outlook/.test(title)) return true
  return /week/.test(labels) && /max|temp/.test(labels) && /min/.test(labels)
}

/** True when reply looks like the fast weather markdown (Now / Forecast pipe tables). */
export function looksLikeWeatherMarkdownReply(text: string): boolean {
  const t = text || ''
  return (
    /\|\s*Metric\s*\|\s*Value\s*\|/i.test(t) ||
    (/\|\s*When\s*\|/i.test(t) && /\|\s*Sky\s*\|/i.test(t)) ||
    /###\s*(Now|Forecast|Month outlook|Weekly outlook)\b/i.test(t)
  )
}

/**
 * Repair common cases where pipe tables lost newlines (single-line markdown dump).
 */
export function normalizeWeatherMarkdownNewlines(text: string): string {
  let t = (text || '').replace(/\\n/g, '\n')
  if (t.includes('\n') && /\n\s*\|/.test(t)) return t
  if (!looksLikeWeatherMarkdownReply(t)) return t
  // Insert breaks before table rows / section headers when everything is one line.
  t = t
    .replace(/\s*(###\s*(?:Now|Forecast|Month outlook|Weekly outlook))\b/gi, '\n\n$1\n')
    .replace(/\s*\|\s*(?=Metric\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=When\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=Day\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=Week\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=---)/g, '\n| ')
    .replace(/\s*\|\s*(?=\d{4}-\d{2}-\d{2})/g, '\n| ')
    .replace(/\s*\|\s*(?=Temp\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=Feels\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=Humidity\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=Pressure\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=Wind\s*\|)/gi, '\n| ')
    .replace(/\s*\|\s*(?=W\d\s*\|)/gi, '\n| ')
    .replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

/**
 * Lift weather from markdown Now/Forecast/Month pipe tables (fast pack reply format).
 */
export function liftWeatherFromMarkdownReply(text: string): NeighborhoodAgentWeatherLift | null {
  const normalized = normalizeWeatherMarkdownNewlines(text)
  if (!looksLikeWeatherMarkdownReply(normalized)) return null

  const segs = splitTextIntoMarkdownSegments(normalized)
  let current: GeoExplorerDataTablePayload | null = null
  let forecast: GeoExplorerDataTablePayload | null = null
  let month: GeoExplorerDataTablePayload | null = null
  let week: GeoExplorerDataTablePayload | null = null
  const textBits: string[] = []

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!
    if (seg.type === 'text') {
      const cleaned = seg.text
        .replace(/^#+\s*(Now|Forecast|Month outlook|Weekly outlook)\s*$/gim, '')
        .replace(/^#+\s*/gm, '')
        .trim()
      if (cleaned) textBits.push(cleaned)
      // Infer titles from heading just before a table
      const heading = seg.text.match(/###\s*(Now|Forecast|Month outlook|Weekly outlook)\b/i)?.[1]
      const next = segs[i + 1]
      if (heading && next?.type === 'table') {
        const title =
          /now/i.test(heading) ? 'Now' : /forecast/i.test(heading) ? 'Forecast' : /month/i.test(heading) ? 'Month outlook' : 'Weekly outlook'
        next.table = { ...next.table, title }
      }
      continue
    }
    const table = seg.table
    if (!current && isWeatherNowTable(table)) {
      current = { ...table, title: table.title && table.title !== 'Summary table' ? table.title : 'Now' }
      continue
    }
    if (!forecast && isWeatherForecastTable(table)) {
      forecast = { ...table, title: table.title && table.title !== 'Summary table' ? table.title : 'Forecast' }
      continue
    }
    if (!month && isWeatherMonthOutlookTable(table)) {
      month = { ...table, title: table.title && table.title !== 'Summary table' ? table.title : 'Month outlook' }
      continue
    }
    if (!week && isWeatherWeekOutlookTable(table)) {
      week = { ...table, title: table.title && table.title !== 'Summary table' ? table.title : 'Weekly outlook' }
    }
  }

  if (!current && !forecast && !month) return null

  const lead = textBits.join(' ').replace(/\s+/g, ' ').trim().slice(0, 220)
  const lift = weatherLiftFromTables(current, forecast, lead)
  if (!lift) return null
  return {
    ...lift,
    monthOutlookTable: month ?? lift.monthOutlookTable ?? null,
    weekOutlookTable: week ?? lift.weekOutlookTable ?? null,
    climateLine: lift.climateLine || lead || undefined,
    text: (lift.climateLine || lead || lift.text).slice(0, 220),
  }
}

function parseMetricValue(v: string | number | null | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  const n = Number(String(v).replace(/[^\d.+-]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Build a weather lift object from markdown Now + Forecast tables already in the reply. */
export function weatherLiftFromTables(
  current: GeoExplorerDataTablePayload | null | undefined,
  forecast: GeoExplorerDataTablePayload | null | undefined,
  leadText = '',
): NeighborhoodAgentWeatherLift | null {
  if (!current && !forecast) return null
  let conditionLabel: string | undefined
  let condition: NeighborhoodAgentWeatherCondition | undefined
  if (forecast?.rows.length) {
    const skyCol = forecast.columns.find(c => /sky|cond/i.test(c.key) || /sky|cond/i.test(c.label))
    if (skyCol) {
      conditionLabel = String(forecast.rows[0]?.values[skyCol.key] ?? '').trim() || undefined
      if (conditionLabel) condition = classifyWeatherCondition(conditionLabel)
    }
  }
  if (!conditionLabel && current) {
    const tempRow = current.rows.find(r => /temp/i.test(String(r.values.metric ?? '')))
    if (tempRow) {
      conditionLabel = 'Weather'
      condition = 'unknown'
    }
  }
  const cleanedLead = stripNeighborhoodAgentWeatherBoilerplate(leadText)
    .replace(/^#+\s*/gm, '')
    .replace(/\bSummary\b/gi, '')
    .replace(/\bMap actions\b[\s\S]*$/i, '')
    .trim()

  let tempC: number | null = null
  let humidity: number | null = null
  let windMs: number | null = null
  if (current) {
    for (const row of current.rows) {
      const metric = String(row.values.metric ?? '')
      const n = parseMetricValue(row.values.value as string | number | null | undefined)
      if (n == null) continue
      if (/^temp/i.test(metric)) tempC = n
      else if (/humidity/i.test(metric)) humidity = n
      else if (/wind/i.test(metric)) windMs = n
    }
  }
  const climateLine = buildClimateInterpretationLine({
    condition,
    conditionLabel,
    tempC,
    humidity,
    windMs,
  })

  return {
    text: (cleanedLead || climateLine).slice(0, 200),
    condition,
    conditionLabel,
    climateLine,
    currentTable: current ?? null,
    forecastTable: forecast ?? null,
  }
}

export function metricIconForLabel(label: string): string {
  const l = label.toLowerCase()
  if (/temp|°c|حرارة/.test(l)) return 'fa-solid fa-temperature-half'
  if (/feels|إحساس/.test(l)) return 'fa-solid fa-temperature-high'
  if (/humidity|رطوبة/.test(l)) return 'fa-solid fa-droplet'
  if (/pressure|ضغط|hpa/.test(l)) return 'fa-solid fa-gauge'
  if (/wind|رياح/.test(l)) return 'fa-solid fa-wind'
  return 'fa-solid fa-circle-info'
}

export function formatMetricDisplay(label: string, value: string | number | null | undefined): string {
  if (value == null) return '—'
  const n = parseMetricValue(value)
  if (n == null) return String(value)
  if (/humidity/i.test(label)) return `${n}%`
  if (/pressure|hpa/i.test(label)) return `${n} hPa`
  if (/wind/i.test(label)) return `${n} m/s`
  if (/temp|feels|°/i.test(label)) return `${n}°C`
  return String(value)
}

/** Markdown tables the NAC UI already charts from (Now + Forecast + month). */
export function formatWeatherLiftAsMarkdown(lift: NeighborhoodAgentWeatherLift): string {
  const parts: string[] = []
  const lead = (lift.climateLine || lift.text || '').trim()
  if (lead) parts.push(lead)

  if (lift.currentTable?.rows.length) {
    parts.push('### Now')
    parts.push('| Metric | Value |')
    parts.push('| --- | ---: |')
    for (const row of lift.currentTable.rows) {
      const metric = String(row.values.metric ?? row.values.Metric ?? '').trim() || '—'
      const raw = row.values.value ?? row.values.Value
      const display = formatMetricDisplay(metric, raw as string | number | null | undefined)
      parts.push(`| ${metric} | ${display} |`)
    }
  }

  if (lift.forecastTable?.rows.length) {
    parts.push('### Forecast')
    parts.push('| When | Sky | Temp °C | Feels °C |')
    parts.push('| --- | --- | ---: | ---: |')
    const rows = lift.forecastTable.rows.slice(0, 8)
    for (const row of rows) {
      const when = String(row.values.when ?? '').trim() || '—'
      const sky = String(row.values.sky ?? '').trim() || '—'
      const temp = row.values.temp
      const feels = row.values.feels
      const t =
        typeof temp === 'number' && Number.isFinite(temp)
          ? temp.toFixed(1)
          : String(temp ?? '—')
      const f =
        typeof feels === 'number' && Number.isFinite(feels)
          ? feels.toFixed(1)
          : feels == null || feels === ''
            ? '—'
            : String(feels)
      parts.push(`| ${when} | ${sky} | ${t} | ${f} |`)
    }
  }

  if (lift.monthOutlookTable?.rows.length) {
    parts.push('### Month outlook')
    parts.push('| Day | Sky | Max °C | Min °C |')
    parts.push('| --- | --- | ---: | ---: |')
    for (const row of lift.monthOutlookTable.rows.slice(0, 16)) {
      const when = String(row.values.when ?? '').trim() || '—'
      const sky = String(row.values.sky ?? '').trim() || '—'
      const max = row.values.temp
      const min = row.values.min
      const mx = typeof max === 'number' ? max.toFixed(1) : String(max ?? '—')
      const mn = typeof min === 'number' ? min.toFixed(1) : String(min ?? '—')
      parts.push(`| ${when} | ${sky} | ${mx} | ${mn} |`)
    }
  }

  if (lift.weekOutlookTable?.rows.length) {
    parts.push('### Weekly outlook')
    parts.push('| Week | Avg max °C | Avg min °C | Rain mm |')
    parts.push('| --- | ---: | ---: | ---: |')
    for (const row of lift.weekOutlookTable.rows) {
      const when = String(row.values.when ?? '').trim() || '—'
      const max = row.values.temp
      const min = row.values.min
      const pr = row.values.precip
      const mx = typeof max === 'number' ? max.toFixed(1) : String(max ?? '—')
      const mn = typeof min === 'number' ? min.toFixed(1) : String(min ?? '—')
      const p = typeof pr === 'number' ? pr.toFixed(1) : String(pr ?? '—')
      parts.push(`| ${when} | ${mx} | ${mn} | ${p} |`)
    }
  }

  return parts.join('\n\n').trim()
}

/**
 * Build a ready-to-show weather reply from tool/OpenWeather fact text — no LLM.
 * Returns null when facts cannot be lifted into Now/Forecast tables.
 */
export function buildFastWeatherUserReplyFromFacts(facts: string): string | null {
  const lift = liftWeatherNarrativeFromText(facts)
  if (!lift.currentTable && !lift.forecastTable && !lift.monthOutlookTable) return null
  const body = formatWeatherLiftAsMarkdown(lift)
  return body.trim() ? body : null
}
