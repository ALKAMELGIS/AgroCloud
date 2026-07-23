/**
 * Enriched weather analytics for Word Intelligence Report:
 * daily/monthly/yearly Temp Max·Mean·Min, cumulative rainfall, humidity shares, index comparisons.
 */
import {
  formatImageryTimePeriodLabel,
  imageryTimePeriodKey,
  type ImageryTimeSeriesLayerSeries,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import { kmhToMs } from './timeSeriesWeatherTimeline'

export type DailyWeatherRich = {
  date: string
  tempMeanC: number | null
  tempMinC: number | null
  tempMaxC: number | null
  humidityPct: number | null
  rainfallMm: number | null
  windSpeedMs: number | null
}

export type MonthlyWeatherRow = {
  monthKey: string
  label: string
  tempMeanC: number | null
  tempMinC: number | null
  tempMaxC: number | null
  humidityPct: number | null
  rainfallMm: number | null
  rainfallSharePct: number | null
  cumulativeRainfallMm: number | null
  windSpeedMs: number | null
}

export type YearlyWeatherRow = {
  yearKey: string
  label: string
  tempMeanC: number | null
  tempMinC: number | null
  tempMaxC: number | null
  humidityPct: number | null
  rainfallMm: number | null
  windSpeedMs: number | null
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function sum(nums: number[]): number | null {
  if (!nums.length) return null
  return nums.reduce((a, b) => a + b, 0)
}

function round(n: number | null, digits: number): number | null {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function buildDailyWeatherRichFromHourly(points: OpenMeteoHourlyPoint[]): DailyWeatherRich[] {
  const byDate = new Map<
    string,
    { temps: number[]; humids: number[]; rains: number[]; winds: number[] }
  >()
  for (const p of points) {
    const date = p.time.trim().slice(0, 10)
    if (!date) continue
    if (!byDate.has(date)) byDate.set(date, { temps: [], humids: [], rains: [], winds: [] })
    const bucket = byDate.get(date)!
    if (p.temperatureC != null && Number.isFinite(p.temperatureC)) bucket.temps.push(p.temperatureC)
    if (p.humidityPct != null && Number.isFinite(p.humidityPct)) bucket.humids.push(p.humidityPct)
    if (p.precipitationMm != null && Number.isFinite(p.precipitationMm)) bucket.rains.push(p.precipitationMm)
    const windMs = kmhToMs(p.windSpeedKmh)
    if (windMs != null) bucket.winds.push(windMs)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => ({
      date,
      tempMeanC: round(mean(bucket.temps), 2),
      tempMinC: bucket.temps.length ? round(Math.min(...bucket.temps), 2) : null,
      tempMaxC: bucket.temps.length ? round(Math.max(...bucket.temps), 2) : null,
      humidityPct: round(mean(bucket.humids), 1),
      rainfallMm: round(sum(bucket.rains), 2),
      windSpeedMs: round(mean(bucket.winds), 2),
    }))
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const mi = Number(m) - 1
  return `${names[mi] ?? m} ${y}`
}

export function buildMonthlyWeatherRows(daily: DailyWeatherRich[]): MonthlyWeatherRow[] {
  const buckets = new Map<
    string,
    { means: number[]; mins: number[]; maxs: number[]; humids: number[]; rains: number[]; winds: number[] }
  >()
  for (const row of daily) {
    const key = row.date.slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(key)) continue
    if (!buckets.has(key)) buckets.set(key, { means: [], mins: [], maxs: [], humids: [], rains: [], winds: [] })
    const b = buckets.get(key)!
    if (row.tempMeanC != null) b.means.push(row.tempMeanC)
    if (row.tempMinC != null) b.mins.push(row.tempMinC)
    if (row.tempMaxC != null) b.maxs.push(row.tempMaxC)
    if (row.humidityPct != null) b.humids.push(row.humidityPct)
    if (row.rainfallMm != null) b.rains.push(row.rainfallMm)
    if (row.windSpeedMs != null) b.winds.push(row.windSpeedMs)
  }
  const keys = [...buckets.keys()].sort()
  const rainTotals = keys.map(k => sum(buckets.get(k)!.rains) ?? 0)
  const rainSumAll = rainTotals.reduce((a, b) => a + b, 0)
  let cumulative = 0
  return keys.map((key, i) => {
    const b = buckets.get(key)!
    const rain = round(sum(b.rains), 2)
    cumulative += rain ?? 0
    const share =
      rainSumAll > 0 && rain != null ? round((rain / rainSumAll) * 100, 1) : rainSumAll === 0 ? 0 : null
    return {
      monthKey: key,
      label: monthLabel(key),
      tempMeanC: round(mean(b.means), 2),
      tempMinC: b.mins.length ? round(Math.min(...b.mins), 2) : null,
      tempMaxC: b.maxs.length ? round(Math.max(...b.maxs), 2) : null,
      humidityPct: round(mean(b.humids), 1),
      rainfallMm: rain,
      rainfallSharePct: share,
      cumulativeRainfallMm: round(cumulative, 2),
      windSpeedMs: round(mean(b.winds), 2),
    }
  })
}

export function buildYearlyWeatherRows(daily: DailyWeatherRich[]): YearlyWeatherRow[] {
  const buckets = new Map<
    string,
    { means: number[]; mins: number[]; maxs: number[]; humids: number[]; rains: number[]; winds: number[] }
  >()
  for (const row of daily) {
    const key = row.date.slice(0, 4)
    if (!/^\d{4}$/.test(key)) continue
    if (!buckets.has(key)) buckets.set(key, { means: [], mins: [], maxs: [], humids: [], rains: [], winds: [] })
    const b = buckets.get(key)!
    if (row.tempMeanC != null) b.means.push(row.tempMeanC)
    if (row.tempMinC != null) b.mins.push(row.tempMinC)
    if (row.tempMaxC != null) b.maxs.push(row.tempMaxC)
    if (row.humidityPct != null) b.humids.push(row.humidityPct)
    if (row.rainfallMm != null) b.rains.push(row.rainfallMm)
    if (row.windSpeedMs != null) b.winds.push(row.windSpeedMs)
  }
  return [...buckets.keys()]
    .sort()
    .map(key => {
      const b = buckets.get(key)!
      return {
        yearKey: key,
        label: key,
        tempMeanC: round(mean(b.means), 2),
        tempMinC: b.mins.length ? round(Math.min(...b.mins), 2) : null,
        tempMaxC: b.maxs.length ? round(Math.max(...b.maxs), 2) : null,
        humidityPct: round(mean(b.humids), 1),
        rainfallMm: round(sum(b.rains), 2),
        windSpeedMs: round(mean(b.winds), 2),
      }
    })
}

/** Align index series to calendar dates via period anchor / label keys when possible. */
export function alignIndexValuesToDates(input: {
  dates: string[]
  chartLabels: string[]
  periodAnchorDates: Record<string, string>
  layerSeries: ImageryTimeSeriesLayerSeries[]
  layerId: string
}): Array<number | null> {
  const series = input.layerSeries.find(s => s.layerId.toUpperCase() === input.layerId.toUpperCase())
  if (!series) return input.dates.map(() => null)

  const valueByDate = new Map<string, number>()
  for (let i = 0; i < input.chartLabels.length; i += 1) {
    const key = input.chartLabels[i]!
    const v = series.values[i]
    if (v == null || !Number.isFinite(v)) continue
    const scene = (input.periodAnchorDates[key] ?? key).trim().slice(0, 10)
    if (/^\d{4}-\d{2}-\d{2}$/.test(scene)) valueByDate.set(scene, v)
    // Also index by period key for week/month labels
    valueByDate.set(key, v)
  }

  return input.dates.map(d => {
    if (valueByDate.has(d)) return valueByDate.get(d)!
    // nearest same month mean of available scenes
    const ym = d.slice(0, 7)
    const monthVals: number[] = []
    for (const [k, v] of valueByDate) {
      if (k.startsWith(ym)) monthVals.push(v)
    }
    return monthVals.length ? mean(monthVals) : null
  })
}

export function sampleDailyRows(daily: DailyWeatherRich[], maxPoints = 62): DailyWeatherRich[] {
  if (daily.length <= maxPoints) return daily
  const out: DailyWeatherRich[] = []
  for (let i = 0; i < maxPoints; i += 1) {
    out.push(daily[Math.round((i * (daily.length - 1)) / (maxPoints - 1))]!)
  }
  return out
}

export function fmtWeatherCell(n: number | null | undefined, digits = 1, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}${suffix}`
}

/** Period-bucket temp min/mean/max from rich daily rows (matches chart aggregation). */
export function aggregateTempExtremesByPeriods(
  daily: DailyWeatherRich[],
  chartLabels: string[],
  displayLabels: string[],
  aggregation: 'day' | 'week' | 'month' | 'year',
): Array<{
  periodKey: string
  displayLabel: string
  tempMeanC: number | null
  tempMinC: number | null
  tempMaxC: number | null
  humidityPct: number | null
  rainfallMm: number | null
}> {
  const displayByKey = new Map(chartLabels.map((key, i) => [key, displayLabels[i] ?? key]))
  const buckets = new Map<
    string,
    { means: number[]; mins: number[]; maxs: number[]; humids: number[]; rains: number[] }
  >()
  for (const row of daily) {
    const key = imageryTimePeriodKey(row.date, aggregation)
    if (!key || !displayByKey.has(key)) continue
    if (!buckets.has(key)) buckets.set(key, { means: [], mins: [], maxs: [], humids: [], rains: [] })
    const b = buckets.get(key)!
    if (row.tempMeanC != null) b.means.push(row.tempMeanC)
    if (row.tempMinC != null) b.mins.push(row.tempMinC)
    if (row.tempMaxC != null) b.maxs.push(row.tempMaxC)
    if (row.humidityPct != null) b.humids.push(row.humidityPct)
    if (row.rainfallMm != null) b.rains.push(row.rainfallMm)
  }
  return chartLabels.map(key => {
    const b = buckets.get(key)
    return {
      periodKey: key,
      displayLabel: displayByKey.get(key) ?? formatImageryTimePeriodLabel(key, aggregation),
      tempMeanC: b ? round(mean(b.means), 2) : null,
      tempMinC: b?.mins.length ? round(Math.min(...b.mins), 2) : null,
      tempMaxC: b?.maxs.length ? round(Math.max(...b.maxs), 2) : null,
      humidityPct: b ? round(mean(b.humids), 1) : null,
      rainfallMm: b ? round(sum(b.rains), 2) : null,
    }
  })
}
