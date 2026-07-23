/**
 * Weather – Temperature report model: multi-scale tables + analysis for Excel export.
 */
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import type { ClimateExportAggregation, WeatherClimateReportPayload } from './weatherClimateReportTypes'
import {
  buildClimatePeriodExportRows,
  climateAggregationLabel,
  type ClimatePeriodExportRow,
} from './weatherClimateAnalysisEngine'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** Cap hourly points used for native Excel charts (full series stays on Data Hourly). */
export const TEMP_CHART_HOURLY_CAP = 720

export type TempHourlyRow = {
  date: string
  time: string
  /** Hourly: Tmax = Tmin = Tavg = observed temp. */
  tmaxC: number | null
  tminC: number | null
  tavgC: number | null
  rainfallMm: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
}

export type TempPeriodRow = {
  period: string
  periodLabel: string
  tmaxC: number | null
  tminC: number | null
  tavgC: number | null
  diurnalRangeC: number | null
  rainfallMm: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  et0Mm: number | null
  anomalyC?: number | null
}

export type TempMonthlyNormal = {
  month: number
  monthLabel: string
  tmaxC: number | null
  tminC: number | null
  tavgC: number | null
  diurnalRangeC: number | null
  precipMm: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  et0Mm: number | null
}

export type TempDiurnalProfile = {
  hour: number
  label: string
  avgTempC: number | null
  /** Mean hourly precipitation rate (mm/h). */
  precipMmH: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
}

export type TempStatRow = {
  parameter: string
  count: number
  mean: number | null
  min: number | null
  max: number | null
  range: number | null
  stdDev: number | null
  p10: number | null
  p90: number | null
}

export type TempYoyRow = {
  year: number
  avgTempC: number | null
  tmaxC: number | null
  tminC: number | null
  deltaVsPrevC: number | null
}

export type TemperatureReportModel = {
  title: string
  locationLine: string
  sourceLine: string
  aggregation: ClimateExportAggregation
  aggregationLabel: string
  analysisStart: string
  analysisEnd: string
  timezone: string
  aoiName: string
  hourly: TempHourlyRow[]
  /** Subset of hourly for chart series (last N). */
  hourlyForCharts: TempHourlyRow[]
  daily: TempPeriodRow[]
  weekly: TempPeriodRow[]
  monthly: TempPeriodRow[]
  yearly: TempPeriodRow[]
  monthlyNormals: TempMonthlyNormal[]
  diurnalProfile: TempDiurnalProfile[]
  stats: TempStatRow[]
  yoy: TempYoyRow[]
  heatDays35: number
  heatDays40: number
  coolNights15: number
  coldNights10: number
  meanDiurnalRangeC: number | null
  /** Data sheet order: primary aggregation first, then remaining scales. */
  dataSheetOrder: Array<'hour' | 'day' | 'week' | 'month' | 'year'>
}

function round(n: number | null | undefined, digits = 1): number | null {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

function finite(vals: Array<number | null | undefined>): number[] {
  return vals.filter((v): v is number => v != null && Number.isFinite(v))
}

function mean(vals: number[]): number | null {
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function stdDev(vals: number[]): number | null {
  if (vals.length < 2) return null
  const m = mean(vals)!
  const v = vals.reduce((s, x) => s + (x - m) ** 2, 0) / (vals.length - 1)
  return Math.sqrt(v)
}

function percentile(vals: number[], p: number): number | null {
  if (!vals.length) return null
  const sorted = [...vals].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[idx] ?? null
}

function formatLatLng(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}°${ns}, ${Math.abs(lng).toFixed(4)}°${ew}`
}

function toPeriodRow(r: ClimatePeriodExportRow, anomalyC?: number | null): TempPeriodRow {
  const tmax = r.tempMaxC
  const tmin = r.tempMinC
  const range =
    tmax != null && tmin != null && Number.isFinite(tmax) && Number.isFinite(tmin) ? tmax - tmin : null
  return {
    period: r.period,
    periodLabel: r.periodLabel,
    tmaxC: round(tmax, 1),
    tminC: round(tmin, 1),
    tavgC: round(r.tempAvgC, 1),
    diurnalRangeC: round(range, 1),
    rainfallMm: round(r.rainfallMm, 2),
    humidityPct: round(r.humidityPct, 0),
    windSpeedKmh: round(r.windSpeedKmh, 1),
    et0Mm: round(r.et0Mm, 2),
    anomalyC: anomalyC != null ? round(anomalyC, 2) : undefined,
  }
}

function buildHourlyRows(points: OpenMeteoHourlyPoint[]): TempHourlyRow[] {
  return points.map(p => {
    const date = p.time.slice(0, 10)
    const time = p.time.length >= 16 ? p.time.slice(11, 16) : p.time.slice(11) || '00:00'
    const t = round(p.temperatureC, 1)
    return {
      date,
      time,
      tmaxC: t,
      tminC: t,
      tavgC: t,
      rainfallMm: round(p.precipitationMm, 2),
      humidityPct: round(p.humidityPct, 0),
      windSpeedKmh: round(p.windSpeedKmh, 1),
    }
  })
}

function buildMonthlyNormals(daily: TempPeriodRow[]): TempMonthlyNormal[] {
  const byMonth = new Map<number, TempPeriodRow[]>()
  daily.forEach(d => {
    const m = Number(d.period.slice(5, 7))
    if (!Number.isFinite(m) || m < 1 || m > 12) return
    const arr = byMonth.get(m) ?? []
    arr.push(d)
    byMonth.set(m, arr)
  })
  return MONTH_SHORT.map((label, i) => {
    const month = i + 1
    const rows = byMonth.get(month) ?? []
    const tmax = finite(rows.map(r => r.tmaxC))
    const tmin = finite(rows.map(r => r.tminC))
    const tavg = finite(rows.map(r => r.tavgC))
    const range = finite(rows.map(r => r.diurnalRangeC))
    const precip = finite(rows.map(r => r.rainfallMm))
    const humid = finite(rows.map(r => r.humidityPct))
    const wind = finite(rows.map(r => r.windSpeedKmh))
    const et0 = finite(rows.map(r => r.et0Mm))
    return {
      month,
      monthLabel: label,
      tmaxC: round(mean(tmax), 1),
      tminC: round(mean(tmin), 1),
      tavgC: round(mean(tavg), 1),
      diurnalRangeC: round(mean(range), 1),
      precipMm: round(mean(precip), 2),
      humidityPct: round(mean(humid), 0),
      windSpeedKmh: round(mean(wind), 1),
      et0Mm: round(mean(et0), 1),
    }
  })
}

function buildDiurnalProfile(hourly: TempHourlyRow[]): TempDiurnalProfile[] {
  const byHour = new Map<number, { t: number[]; p: number[]; h: number[]; w: number[] }>()
  hourly.forEach(r => {
    const hour = Number(r.time.slice(0, 2))
    if (!Number.isFinite(hour)) return
    const bucket = byHour.get(hour) ?? { t: [], p: [], h: [], w: [] }
    if (r.tavgC != null) bucket.t.push(r.tavgC)
    if (r.rainfallMm != null) bucket.p.push(r.rainfallMm)
    if (r.humidityPct != null) bucket.h.push(r.humidityPct)
    if (r.windSpeedKmh != null) bucket.w.push(r.windSpeedKmh)
    byHour.set(hour, bucket)
  })
  return Array.from({ length: 24 }, (_, hour) => {
    const b = byHour.get(hour) ?? { t: [], p: [], h: [], w: [] }
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      avgTempC: round(mean(b.t), 1),
      precipMmH: round(mean(b.p), 3),
      humidityPct: round(mean(b.h), 0),
      windSpeedKmh: round(mean(b.w), 1),
    }
  })
}

function buildStats(daily: TempPeriodRow[]): TempStatRow[] {
  const make = (parameter: string, vals: number[]): TempStatRow => {
    const mn = vals.length ? Math.min(...vals) : null
    const mx = vals.length ? Math.max(...vals) : null
    return {
      parameter,
      count: vals.length,
      mean: round(mean(vals), 2),
      min: round(mn, 1),
      max: round(mx, 1),
      range: mn != null && mx != null ? round(mx - mn, 1) : null,
      stdDev: round(stdDev(vals), 2),
      p10: round(percentile(vals, 10), 1),
      p90: round(percentile(vals, 90), 1),
    }
  }
  return [
    make('Daily Tavg (°C)', finite(daily.map(d => d.tavgC))),
    make('Daily Tmax (°C)', finite(daily.map(d => d.tmaxC))),
    make('Daily Tmin (°C)', finite(daily.map(d => d.tminC))),
    make('Diurnal range (°C)', finite(daily.map(d => d.diurnalRangeC))),
    make('Daily Precipitation (mm)', finite(daily.map(d => d.rainfallMm))),
    make('Daily Humidity (%)', finite(daily.map(d => d.humidityPct))),
    make('Daily Wind Speed (km/h)', finite(daily.map(d => d.windSpeedKmh))),
    make('Daily ET0 (mm)', finite(daily.map(d => d.et0Mm))),
  ]
}

function buildYoy(yearly: TempPeriodRow[]): TempYoyRow[] {
  return yearly.map((r, i) => {
    const year = Number(r.period.slice(0, 4)) || Number(r.periodLabel) || i
    const prev = yearly[i - 1]
    const delta =
      r.tavgC != null && prev?.tavgC != null ? r.tavgC - prev.tavgC : null
    return {
      year,
      avgTempC: r.tavgC,
      tmaxC: r.tmaxC,
      tminC: r.tminC,
      deltaVsPrevC: round(delta, 2),
    }
  })
}

function dataSheetOrder(primary: ClimateExportAggregation): Array<'hour' | 'day' | 'week' | 'month' | 'year'> {
  const all: Array<'hour' | 'day' | 'week' | 'month' | 'year'> = ['hour', 'day', 'week', 'month', 'year']
  return [primary, ...all.filter(a => a !== primary)]
}

export function buildTemperatureReportModel(payload: WeatherClimateReportPayload): TemperatureReportModel {
  const aggregation = payload.timeAggregation ?? 'day'
  const hourly = buildHourlyRows(payload.hourlyRecords)
  const dailyRaw = buildClimatePeriodExportRows(payload.hourlyRecords, payload.dailyRecords, 'day')
  const weeklyRaw = buildClimatePeriodExportRows(payload.hourlyRecords, payload.dailyRecords, 'week')
  const monthlyRaw = buildClimatePeriodExportRows(payload.hourlyRecords, payload.dailyRecords, 'month')
  const yearlyRaw = buildClimatePeriodExportRows(payload.hourlyRecords, payload.dailyRecords, 'year')

  const daily = dailyRaw.map(r => toPeriodRow(r))
  const longTermMean = mean(finite(daily.map(d => d.tavgC)))
  const yearly = yearlyRaw.map(r => {
    const anomaly =
      r.tempAvgC != null && longTermMean != null ? r.tempAvgC - longTermMean : null
    return toPeriodRow(r, anomaly)
  })

  const heatDays35 = daily.filter(d => d.tmaxC != null && d.tmaxC >= 35).length
  const heatDays40 = daily.filter(d => d.tmaxC != null && d.tmaxC >= 40).length
  const coolNights15 = daily.filter(d => d.tminC != null && d.tminC <= 15).length
  const coldNights10 = daily.filter(d => d.tminC != null && d.tminC <= 10).length

  return {
    title: `Weather – Temperature Report — ${payload.aoiName}`,
    locationLine: `${formatLatLng(payload.lat, payload.lng)} · ${payload.aoiLocation}`,
    sourceLine: payload.dataSource || 'Weather data by Open-Meteo.com (https://open-meteo.com)',
    aggregation,
    aggregationLabel: climateAggregationLabel(aggregation),
    analysisStart: payload.analysisStart,
    analysisEnd: payload.analysisEnd,
    timezone: payload.timezone || 'UTC',
    aoiName: payload.aoiName,
    hourly,
    hourlyForCharts: hourly.slice(-TEMP_CHART_HOURLY_CAP),
    daily,
    weekly: weeklyRaw.map(r => toPeriodRow(r)),
    monthly: monthlyRaw.map(r => toPeriodRow(r)),
    yearly,
    monthlyNormals: buildMonthlyNormals(daily),
    diurnalProfile: buildDiurnalProfile(hourly),
    stats: buildStats(daily),
    yoy: buildYoy(yearly),
    heatDays35,
    heatDays40,
    coolNights15,
    coldNights10,
    meanDiurnalRangeC: round(mean(finite(daily.map(d => d.diurnalRangeC))), 1),
    dataSheetOrder: dataSheetOrder(aggregation),
  }
}
