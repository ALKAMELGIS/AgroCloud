/**
 * Statistical analysis + native chart specs for Weather Intelligence DOCX (selected date range only).
 */
import type { OpenMeteoHourlyPoint } from '../openMeteoWeather'
import {
  buildWeatherNativeChartSpecs,
  type DocxNativeChartSpec,
  type DocxNativeChartSeries,
} from '../../temporal-analysis/timeSeriesReport/timeSeriesDocxNativeCharts'
import {
  buildDailyWeatherRichFromHourly,
  buildMonthlyWeatherRows,
  buildYearlyWeatherRows,
  sampleDailyRows,
  type DailyWeatherRich,
} from '../../temporal-analysis/timeSeriesReport/timeSeriesWeatherAnalytics'
import type { WeatherClimateReportPayload, WeatherDailyRecord } from './weatherClimateReportTypes'

export type DailyWeatherRhRich = DailyWeatherRich & {
  humidityMinPct: number | null
  humidityMaxPct: number | null
}

export type ClimateVariableStatRow = {
  variable: string
  minimum: string
  maximum: string
  average: string
  total: string
  stdDev: string
  observations: string
  missing: string
}

export type ClimatePeriodTrendRow = {
  period: string
  tempMax: string
  tempMean: string
  tempMin: string
  rhMean: string
  rhMin: string
  rhMax: string
  rainfall: string
}

export type WeatherClimateDocxAnalytics = {
  analysisStart: string
  analysisEnd: string
  calendarDays: number
  trendResolution: 'daily' | 'monthly'
  variableStats: ClimateVariableStatRow[]
  periodTrendHeaders: string[]
  periodTrendRows: string[][]
  nativeCharts: DocxNativeChartSpec[]
  methodologyNote: string
}

function finite(nums: Array<number | null | undefined>): number[] {
  return nums.filter((n): n is number => n != null && Number.isFinite(n))
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}

function stdDev(nums: number[]): number | null {
  if (nums.length < 2) return null
  const m = mean(nums)!
  const v = nums.reduce((s, x) => s + (x - m) ** 2, 0) / (nums.length - 1)
  return Math.sqrt(v)
}

function round(n: number | null | undefined, digits: number): number | null {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function fmtCell(n: number | null | undefined, digits = 1, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}${suffix}`
}

function dateOnly(iso: string): string {
  return iso.trim().slice(0, 10)
}

function calendarDaysInclusive(start: string, end: string): number {
  const s = Date.parse(`${dateOnly(start)}T00:00:00Z`)
  const e = Date.parse(`${dateOnly(end)}T00:00:00Z`)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0
  return Math.floor((e - s) / 86_400_000) + 1
}

function filterHourlyToRange(points: OpenMeteoHourlyPoint[], start: string, end: string): OpenMeteoHourlyPoint[] {
  const lo = dateOnly(start)
  const hi = dateOnly(end)
  return points.filter(p => {
    const d = p.time.slice(0, 10)
    return d >= lo && d <= hi
  })
}

function filterDailyToRange(rows: WeatherDailyRecord[], start: string, end: string): WeatherDailyRecord[] {
  const lo = dateOnly(start)
  const hi = dateOnly(end)
  return rows.filter(r => r.date >= lo && r.date <= hi)
}

/** Daily rows with RH min/max from hourly; falls back to daily records when hourly is empty. */
export function buildDailyRhRich(
  hourly: OpenMeteoHourlyPoint[],
  dailyRecords: WeatherDailyRecord[],
  rangeStart: string,
  rangeEnd: string,
): DailyWeatherRhRich[] {
  const filteredHourly = hourly
  if (filteredHourly.length) {
    const byDate = new Map<string, { humids: number[] }>()
    for (const p of filteredHourly) {
      const date = p.time.slice(0, 10)
      if (!date) continue
      if (!byDate.has(date)) byDate.set(date, { humids: [] })
      if (p.humidityPct != null && Number.isFinite(p.humidityPct)) {
        byDate.get(date)!.humids.push(p.humidityPct)
      }
    }
    const base = buildDailyWeatherRichFromHourly(filteredHourly)
    return base.map(row => {
      const bucket = byDate.get(row.date)
      const humids = bucket?.humids ?? []
      return {
        ...row,
        humidityMinPct: humids.length ? round(Math.min(...humids), 1) : null,
        humidityMaxPct: humids.length ? round(Math.max(...humids), 1) : null,
      }
    })
  }

  return filterDailyToRange(dailyRecords, rangeStart, rangeEnd).map(d => ({
    date: d.date,
    tempMeanC: round(d.tempAvgC, 2),
    tempMinC: round(d.tempMinC, 2),
    tempMaxC: round(d.tempMaxC, 2),
    humidityPct: round(d.humidityPct, 1),
    humidityMinPct: round(d.humidityPct, 1),
    humidityMaxPct: round(d.humidityPct, 1),
    rainfallMm: round(d.rainfallMm, 2),
    windSpeedMs: d.windSpeedKmh != null ? round(d.windSpeedKmh / 3.6, 2) : null,
  }))
}

function buildVariableStats(daily: DailyWeatherRhRich[], calendarDays: number): ClimateVariableStatRow[] {
  const tempMax = finite(daily.map(d => d.tempMaxC))
  const tempMin = finite(daily.map(d => d.tempMinC))
  const tempMean = finite(daily.map(d => d.tempMeanC))
  const rhMean = finite(daily.map(d => d.humidityPct))
  const rhMin = finite(daily.map(d => d.humidityMinPct))
  const rhMax = finite(daily.map(d => d.humidityMaxPct))
  const rain = finite(daily.map(d => d.rainfallMm))

  const obsTemp = daily.filter(d => d.tempMeanC != null || d.tempMaxC != null || d.tempMinC != null).length
  const obsRh = daily.filter(d => d.humidityPct != null).length
  const obsRain = daily.filter(d => d.rainfallMm != null).length

  return [
    {
      variable: 'Air temperature (°C)',
      minimum: fmtCell(tempMin.length ? Math.min(...tempMin) : null, 1),
      maximum: fmtCell(tempMax.length ? Math.max(...tempMax) : null, 1),
      average: fmtCell(mean(tempMean), 1),
      total: '—',
      stdDev: fmtCell(stdDev(tempMean), 2),
      observations: String(obsTemp),
      missing: String(Math.max(0, calendarDays - obsTemp)),
    },
    {
      variable: 'Relative humidity (%)',
      minimum: fmtCell(rhMin.length ? Math.min(...rhMin) : null, 0),
      maximum: fmtCell(rhMax.length ? Math.max(...rhMax) : null, 0),
      average: fmtCell(mean(rhMean), 0),
      total: '—',
      stdDev: fmtCell(stdDev(rhMean), 2),
      observations: String(obsRh),
      missing: String(Math.max(0, calendarDays - obsRh)),
    },
    {
      variable: 'Rainfall (mm)',
      minimum: fmtCell(rain.length ? Math.min(...rain) : null, 2),
      maximum: fmtCell(rain.length ? Math.max(...rain) : null, 2),
      average: fmtCell(mean(rain), 2),
      total: fmtCell(rain.length ? sum(rain) : null, 1),
      stdDev: fmtCell(stdDev(rain), 2),
      observations: String(obsRain),
      missing: String(Math.max(0, calendarDays - obsRain)),
    },
  ]
}

type MonthlyRhRow = {
  label: string
  tempMeanC: number | null
  tempMinC: number | null
  tempMaxC: number | null
  humidityPct: number | null
  humidityMinPct: number | null
  humidityMaxPct: number | null
  rainfallMm: number | null
}

function buildMonthlyRhRows(daily: DailyWeatherRhRich[]): MonthlyRhRow[] {
  const monthly = buildMonthlyWeatherRows(daily)
  const buckets = new Map<string, { rhMins: number[]; rhMaxs: number[] }>()
  for (const row of daily) {
    const key = row.date.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    if (!buckets.has(key)) buckets.set(key, { rhMins: [], rhMaxs: [] })
    const b = buckets.get(key)!
    if (row.humidityMinPct != null) b.rhMins.push(row.humidityMinPct)
    if (row.humidityMaxPct != null) b.rhMaxs.push(row.humidityMaxPct)
  }
  return monthly.map(m => {
    const b = buckets.get(m.monthKey)
    return {
      label: m.label,
      tempMeanC: m.tempMeanC,
      tempMinC: m.tempMinC,
      tempMaxC: m.tempMaxC,
      humidityPct: m.humidityPct,
      humidityMinPct: b?.rhMins.length ? round(Math.min(...b.rhMins), 1) : null,
      humidityMaxPct: b?.rhMaxs.length ? round(Math.max(...b.rhMaxs), 1) : null,
      rainfallMm: m.rainfallMm,
    }
  })
}

function tempExtremesSeries(rows: Array<{
  tempMeanC: number | null
  tempMinC: number | null
  tempMaxC: number | null
}>): DocxNativeChartSeries[] {
  return [
    { name: 'Temp Max (°C)', values: rows.map(r => r.tempMaxC), color: 'DC2626' },
    { name: 'Temp Mean (°C)', values: rows.map(r => r.tempMeanC), color: 'EA580C' },
    { name: 'Temp Min (°C)', values: rows.map(r => r.tempMinC), color: '2563EB' },
  ]
}

function rhExtremesSeries(rows: Array<{
  humidityPct: number | null
  humidityMinPct: number | null
  humidityMaxPct: number | null
}>): DocxNativeChartSeries[] {
  return [
    { name: 'RH Max (%)', values: rows.map(r => r.humidityMaxPct ?? r.humidityPct), color: '0D9488' },
    { name: 'RH Mean (%)', values: rows.map(r => r.humidityPct), color: '14B8A6' },
    { name: 'RH Min (%)', values: rows.map(r => r.humidityMinPct ?? r.humidityPct), color: '115E59' },
  ]
}

function nextChartId(counter: { v: number }): number {
  counter.v += 1
  return counter.v
}

function pushChart(
  out: DocxNativeChartSpec[],
  counter: { v: number },
  spec: Omit<DocxNativeChartSpec, 'rId' | 'fileStem'>,
): void {
  const id = nextChartId(counter)
  out.push({
    xAxisLabel: 'Period',
    ...spec,
    rId: `rIdChart${id}`,
    fileStem: `chart${id}`,
  })
}

/** Word requires unique chart part names and relationship ids (no gaps / no reuse). */
export function reindexDocxChartSpecs(charts: DocxNativeChartSpec[]): DocxNativeChartSpec[] {
  return charts.map((chart, index) => {
    const n = index + 1
    return { ...chart, rId: `rIdChart${n}`, fileStem: `chart${n}` }
  })
}

function maxAssignedChartIndex(charts: DocxNativeChartSpec[]): number {
  let max = 0
  for (const chart of charts) {
    const match = /^chart(\d+)$/.exec(chart.fileStem)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max
}

function buildClimateCharts(
  daily: DailyWeatherRhRich[],
  monthlyRh: MonthlyRhRow[],
  yearly: ReturnType<typeof buildYearlyWeatherRows>,
  trendResolution: 'daily' | 'monthly',
): DocxNativeChartSpec[] {
  const counter = { v: 0 }
  const out: DocxNativeChartSpec[] = []

  if (trendResolution === 'daily') {
    const chartDaily = sampleDailyRows(daily, 90)
    pushChart(out, counter, {
      title: 'Temperature — Daily Min · Mean · Max',
      yAxisLabel: 'Temperature (°C)',
      xAxisLabel: 'Date',
      yNumFmt: '0.0',
      categories: chartDaily.map(d => d.date),
      kind: 'line',
      series: tempExtremesSeries(chartDaily),
    })
    pushChart(out, counter, {
      title: 'Relative Humidity — Daily Min · Mean · Max',
      yAxisLabel: 'Relative humidity (%)',
      xAxisLabel: 'Date',
      yNumFmt: '0',
      categories: chartDaily.map(d => d.date),
      kind: 'line',
      series: rhExtremesSeries(chartDaily),
    })
    pushChart(out, counter, {
      title: 'Daily Rainfall Total',
      yAxisLabel: 'Rainfall (mm)',
      xAxisLabel: 'Date',
      yNumFmt: '0.0',
      categories: chartDaily.map(d => d.date),
      kind: 'bar',
      hideLegend: true,
      series: [
        {
          name: 'Rainfall (mm)',
          values: chartDaily.map(d => d.rainfallMm),
          color: '3B82F6',
          asBar: true,
        },
      ],
    })
  } else {
    const base = buildWeatherNativeChartSpecs({
      points: [],
      aggregationLabel: '',
      daily: [],
      monthly: monthlyRh.map(m => ({
        label: m.label,
        tempMeanC: m.tempMeanC,
        tempMinC: m.tempMinC,
        tempMaxC: m.tempMaxC,
        humidityPct: m.humidityPct,
        rainfallMm: m.rainfallMm,
      })),
      yearly,
      startIndex: 0,
    }).filter(c => c.kind !== 'pie' && !/Share/i.test(c.title))

    out.push(...base)

    counter.v = maxAssignedChartIndex(out)
    if (monthlyRh.length) {
      pushChart(out, counter, {
        title: 'Relative Humidity — Monthly Min · Mean · Max',
        yAxisLabel: 'Relative humidity (%)',
        xAxisLabel: 'Month',
        yNumFmt: '0',
        categories: monthlyRh.map(m => m.label),
        kind: 'line',
        series: rhExtremesSeries(monthlyRh),
      })
    }
  }

  const scatterSource = trendResolution === 'daily' ? sampleDailyRows(daily, 120) : monthlyRh
  const scatterPts = scatterSource
    .map(row => {
      const x = row.tempMeanC
      const y = row.humidityPct
      if (x == null || y == null) return null
      return { x, y }
    })
    .filter((p): p is { x: number; y: number } => p != null)

  if (scatterPts.length >= 3) {
    pushChart(out, counter, {
      title: 'Temperature vs Relative Humidity',
      yAxisLabel: 'Relative humidity (%)',
      xAxisLabel: 'Temperature (°C)',
      xNumFmt: '0.0',
      yNumFmt: '0',
      categories: [],
      kind: 'scatter',
      hideLegend: true,
      scatterSeries: [
        {
          name: 'Daily mean',
          points: scatterPts,
          color: '166534',
          showLine: false,
        },
      ],
      series: [],
    })
  }

  const comboRows = trendResolution === 'daily' ? sampleDailyRows(daily, 62) : monthlyRh
  if (comboRows.length >= 2) {
    pushChart(out, counter, {
      title: 'Temperature Mean vs Relative Humidity (time series)',
      yAxisLabel: 'Temperature (°C)',
      yAxisLabelSecondary: 'Relative humidity (%)',
      xAxisLabel: trendResolution === 'daily' ? 'Date' : 'Month',
      yNumFmt: '0.0',
      yNumFmtSecondary: '0',
      categories:
        trendResolution === 'daily'
          ? (comboRows as DailyWeatherRhRich[]).map(r => r.date)
          : (comboRows as MonthlyRhRow[]).map(r => r.label),
      kind: 'line',
      series: [
        { name: 'Temp mean (°C)', values: comboRows.map(r => r.tempMeanC), color: 'EA580C' },
        {
          name: 'RH mean (%)',
          values: comboRows.map(r => r.humidityPct),
          color: '0D9488',
          secondaryAxis: true,
        },
      ],
    })
  }

  return reindexDocxChartSpecs(out)
}

function buildPeriodTrendTable(
  daily: DailyWeatherRhRich[],
  monthlyRh: MonthlyRhRow[],
  trendResolution: 'daily' | 'monthly',
): { headers: string[]; rows: string[][] } {
  const headers = [
    'Period',
    'Temp max (°C)',
    'Temp mean (°C)',
    'Temp min (°C)',
    'RH mean (%)',
    'RH min (%)',
    'RH max (%)',
    'Rainfall (mm)',
  ]

  if (trendResolution === 'daily') {
    const rows = daily.map(d => [
      d.date,
      fmtCell(d.tempMaxC, 1),
      fmtCell(d.tempMeanC, 1),
      fmtCell(d.tempMinC, 1),
      fmtCell(d.humidityPct, 0),
      fmtCell(d.humidityMinPct, 0),
      fmtCell(d.humidityMaxPct, 0),
      fmtCell(d.rainfallMm, 2),
    ])
    return { headers, rows }
  }

  const rows = monthlyRh.map(m => [
    m.label,
    fmtCell(m.tempMaxC, 1),
    fmtCell(m.tempMeanC, 1),
    fmtCell(m.tempMinC, 1),
    fmtCell(m.humidityPct, 0),
    fmtCell(m.humidityMinPct, 0),
    fmtCell(m.humidityMaxPct, 0),
    fmtCell(m.rainfallMm, 1),
  ])
  return { headers, rows }
}

export function buildWeatherClimateDocxAnalytics(payload: WeatherClimateReportPayload): WeatherClimateDocxAnalytics {
  const analysisStart = dateOnly(payload.analysisStart)
  const analysisEnd = dateOnly(payload.analysisEnd)
  const calendarDays = calendarDaysInclusive(analysisStart, analysisEnd)

  const hourly = filterHourlyToRange(payload.hourlyRecords, analysisStart, analysisEnd)
  const dailyRecords = filterDailyToRange(payload.dailyRecords, analysisStart, analysisEnd)
  const daily = buildDailyRhRich(hourly, dailyRecords, analysisStart, analysisEnd)

  const trendResolution: 'daily' | 'monthly' = calendarDays <= 120 ? 'daily' : 'monthly'
  const monthlyRh = buildMonthlyRhRows(daily)
  const yearly = buildYearlyWeatherRows(daily)

  const variableStats = buildVariableStats(daily, calendarDays)
  const { headers, rows } = buildPeriodTrendTable(daily, monthlyRh, trendResolution)
  const nativeCharts = buildClimateCharts(daily, monthlyRh, yearly, trendResolution)

  const methodologyNote =
    trendResolution === 'daily'
      ? `Descriptive statistics and charts use ${daily.length} daily observation(s) between ${analysisStart} and ${analysisEnd} (${calendarDays} calendar day(s)).`
      : `Descriptive statistics use daily observations; trend charts aggregate to calendar months (${monthlyRh.length} month(s)) between ${analysisStart} and ${analysisEnd}.`

  return {
    analysisStart,
    analysisEnd,
    calendarDays,
    trendResolution,
    variableStats,
    periodTrendHeaders: headers,
    periodTrendRows: rows,
    nativeCharts,
    methodologyNote,
  }
}
