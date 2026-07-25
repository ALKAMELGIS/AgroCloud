/**
 * GeoSyntra-style meteo tables for Climate Report XLSX.
 * Columns and sections mirror Somaliland-RhodesGrass-MeteoDataReport layout.
 */
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import {
  formatImageryTimePeriodLabel,
  imageryTimePeriodKey,
  type ImageryTimeAggregation,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ClimateExportAggregation } from './weatherClimateReportTypes'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** Max number of hourly rows to plot on native hourly charts (keeps charts readable). */
export const METEO_HOURLY_CHART_CAP = 800

export type MeteoDiurnalPoint = { hour: number; meanTempC: number | null }

export type MeteoClimateRow = {
  period: string
  periodLabel: string
  tmaxC: number | null
  tminC: number | null
  tavgC: number | null
  rainfallMm: number | null
  et0Mm: number | null
  /** Water deficit in m³/ha = max(0, ET0 − Rainfall) × 10 */
  waterDeficitM3Ha: number | null
  sunshineHPerDay: number | null
  daylightHPerDay: number | null
  windMaxKmh: number | null
  maxGustKmh: number | null
  rhPct: number | null
}

export type MeteoYearMatrix = {
  title: string
  years: number[]
  /** 12 month rows; values aligned to years[] */
  rows: Array<{ monthLabel: string; values: Array<number | null> }>
}

export type MeteoRiskRow = {
  periodLabel: string
  heatDays35: number
  heatDays40: number
  coolNights15: number
  coldNights10: number
  highGustDays50: number
  extremeGustDays60: number
  rhHighHours: number
  rhLowHours: number
  irrigationDemandM3Ha: number | null
}

export type MeteoAnnualSummaryRow = {
  year: number
  rainfallMm: number | null
  et0Mm: number | null
  waterDeficitMm: number | null
}

export type MeteoDataReportModel = {
  title: string
  locationLine: string
  sourceLine: string
  aggregation: ClimateExportAggregation
  aggregationLabel: string
  normalsTitle: string
  normals: MeteoClimateRow[]
  /** Monthly climate normals (Jan–Dec) — always present for the Data Monthly sheet. */
  monthlyNormals: MeteoClimateRow[]
  /** One row per calendar day — always present for the Data Daily sheet. */
  dailySeries: MeteoClimateRow[]
  /** One row per hour of raw record — always present for the Data Hourly sheet. */
  hourlySeries: MeteoClimateRow[]
  /** Mean temperature by hour of day (0–23) for the diurnal profile chart. */
  diurnalProfile: MeteoDiurnalPoint[]
  yearMatrices: MeteoYearMatrix[]
  annualSummary: MeteoAnnualSummaryRow[]
  riskRows: MeteoRiskRow[]
  /** Pooled monthly cumulative deficit (GeoSyntra Cumulative Annual chart). */
  cumulativeDeficit: Array<{ periodLabel: string; cumulativeMm: number }>
  /** Month × year cumulative water deficit (mm) for multi-year comparison lines. */
  cumulativeByYear: MeteoYearMatrix | null
  /** Month × year cumulative rainfall (mm) — year-to-year precipitation comparison. */
  cumulativeRainfallByYear: MeteoYearMatrix | null
}

type DailyBundle = {
  date: string
  year: number
  month: number
  tmaxC: number | null
  tminC: number | null
  tavgC: number | null
  rainfallMm: number
  et0Mm: number
  sunshineH: number
  daylightH: number
  windMaxKmh: number | null
  maxGustKmh: number | null
  rhPct: number | null
  heat35: number
  heat40: number
  cool15: number
  cold10: number
  gust50: number
  gust60: number
  rhHighHours: number
  rhLowHours: number
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

function round(n: number | null, digits = 1): number | null {
  if (n == null || !Number.isFinite(n)) return null
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** Approximate daylight hours from latitude and Julian day (Cooper 1969). */
export function approximateDaylightHours(latDeg: number, isoDate: string): number {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return 12
  const start = Date.UTC(d.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((d.getTime() - start) / 86_400_000)
  const lat = (latDeg * Math.PI) / 180
  const decl = 0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39)
  const cosHa = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(decl)))
  const ha = Math.acos(cosHa)
  return round((24 / Math.PI) * ha, 2) ?? 12
}

function estimatedGustKmh(windKmh: number | null): number | null {
  if (windKmh == null || !Number.isFinite(windKmh)) return null
  return round(windKmh * 1.75, 1)
}

function waterDeficitM3Ha(et0Mm: number | null, rainMm: number | null): number | null {
  if (et0Mm == null || rainMm == null) return null
  return round(Math.max(0, et0Mm - rainMm) * 10, 0)
}

function periodKeyForAggregation(isoDateOrTime: string, aggregation: ClimateExportAggregation): string {
  if (aggregation === 'hour') {
    const raw = isoDateOrTime.trim()
    if (raw.length >= 16) return raw.slice(0, 16)
    if (raw.length >= 13) return `${raw.slice(0, 13)}:00`
    return raw.slice(0, 10)
  }
  const day = isoDateOrTime.slice(0, 10)
  if (aggregation === 'day') return day
  return imageryTimePeriodKey(day, aggregation as ImageryTimeAggregation)
}

function periodLabelForKey(key: string, aggregation: ClimateExportAggregation): string {
  if (aggregation === 'hour') {
    return key.length >= 16 ? `${key.slice(5, 10)} ${key.slice(11, 16)}` : key
  }
  if (aggregation === 'day') return key
  if (aggregation === 'month' && /^\d{4}-\d{2}$/.test(key)) {
    const m = Number(key.slice(5, 7))
    return `${MONTH_SHORT[m - 1] ?? key} ${key.slice(0, 4)}`
  }
  if (aggregation === 'year') return key
  return formatImageryTimePeriodLabel(key, aggregation as ImageryTimeAggregation)
}

function normalsTitle(aggregation: ClimateExportAggregation): string {
  switch (aggregation) {
    case 'hour':
      return 'Hourly Climate Series'
    case 'day':
      return 'Daily Climate Series'
    case 'week':
      return 'Weekly Climate Series'
    case 'month':
      return 'Monthly Climate Normals'
    case 'year':
      return 'Yearly Climate Series'
    default:
      return 'Climate Series'
  }
}

/** Build one calendar-day climate bundle from hourly points. */
export function buildMeteoDailyBundles(
  points: OpenMeteoHourlyPoint[],
  lat: number,
): DailyBundle[] {
  const byDate = new Map<string, OpenMeteoHourlyPoint[]>()
  points.forEach(p => {
    const d = p.time.slice(0, 10)
    const arr = byDate.get(d) ?? []
    arr.push(p)
    byDate.set(d, arr)
  })

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => {
      const temps = finite(rows.map(r => r.temperatureC))
      const rains = finite(rows.map(r => r.precipitationMm))
      const et0s = finite(rows.map(r => r.et0Mm))
      const winds = finite(rows.map(r => r.windSpeedKmh))
      const rhs = finite(rows.map(r => r.humidityPct))
      const sunshineH = rows.filter(
        r => r.shortwaveRadiationWm2 != null && r.shortwaveRadiationWm2 > 120,
      ).length
      const tmax = temps.length ? Math.max(...temps) : null
      const tmin = temps.length ? Math.min(...temps) : null
      const windMax = winds.length ? Math.max(...winds) : null
      const gustMax = estimatedGustKmh(windMax)
      const year = Number(date.slice(0, 4))
      const month = Number(date.slice(5, 7))
      return {
        date,
        year,
        month,
        tmaxC: tmax,
        tminC: tmin,
        tavgC: mean(temps),
        rainfallMm: sum(rains),
        et0Mm: sum(et0s),
        sunshineH,
        daylightH: approximateDaylightHours(lat, date),
        windMaxKmh: windMax,
        maxGustKmh: gustMax,
        rhPct: mean(rhs),
        heat35: tmax != null && tmax > 35 ? 1 : 0,
        heat40: tmax != null && tmax > 40 ? 1 : 0,
        cool15: tmin != null && tmin < 15 ? 1 : 0,
        cold10: tmin != null && tmin < 10 ? 1 : 0,
        gust50: gustMax != null && gustMax > 50 ? 1 : 0,
        gust60: gustMax != null && gustMax > 60 ? 1 : 0,
        rhHighHours: rows.filter(r => r.humidityPct != null && r.humidityPct > 80).length,
        rhLowHours: rows.filter(r => r.humidityPct != null && r.humidityPct < 30).length,
      }
    })
}

function mergeDailyToRow(
  period: string,
  periodLabel: string,
  days: DailyBundle[],
  aggregation: ClimateExportAggregation,
): MeteoClimateRow {
  const tmax = finite(days.map(d => d.tmaxC))
  const tmin = finite(days.map(d => d.tminC))
  const tavg = finite(days.map(d => d.tavgC))
  const rain = sum(days.map(d => d.rainfallMm))
  const et0 = sum(days.map(d => d.et0Mm))
  const wind = finite(days.map(d => d.windMaxKmh))
  const gust = finite(days.map(d => d.maxGustKmh))
  const rh = finite(days.map(d => d.rhPct))
  const sunshineMean = mean(days.map(d => d.sunshineH))
  const daylightMean = mean(days.map(d => d.daylightH))
  // Hourly table: expose values for that hour's parent day metrics where relevant —
  // sunshine/daylight stay as daily means for context.
  if (aggregation === 'hour' && days.length === 1) {
    /* use day bundle as container; period is hour — caller overrides temps from hour */
  }
  return {
    period,
    periodLabel,
    tmaxC: round(tmax.length ? Math.max(...tmax) : null, 1),
    tminC: round(tmin.length ? Math.min(...tmin) : null, 1),
    tavgC: round(mean(tavg), 1),
    rainfallMm: round(rain, 1),
    et0Mm: round(et0, 1),
    waterDeficitM3Ha: waterDeficitM3Ha(et0, rain),
    sunshineHPerDay: round(sunshineMean, 1),
    daylightHPerDay: round(daylightMean, 1),
    windMaxKmh: round(wind.length ? Math.max(...wind) : null, 1),
    maxGustKmh: round(gust.length ? Math.max(...gust) : null, 1),
    rhPct: round(mean(rh), 0),
  }
}

function buildNormalsFromDaily(
  daily: DailyBundle[],
  aggregation: ClimateExportAggregation,
): MeteoClimateRow[] {
  if (aggregation === 'month') {
    // Climate normals by calendar month (Jan–Dec), pooling all years.
    return MONTH_SHORT.map((label, idx) => {
      const month = idx + 1
      const days = daily.filter(d => d.month === month)
      if (!days.length) {
        return {
          period: String(month).padStart(2, '0'),
          periodLabel: label,
          tmaxC: null,
          tminC: null,
          tavgC: null,
          rainfallMm: null,
          et0Mm: null,
          waterDeficitM3Ha: null,
          sunshineHPerDay: null,
          daylightHPerDay: null,
          windMaxKmh: null,
          maxGustKmh: null,
          rhPct: null,
        }
      }
      // Mean of each year's monthly totals for rain/et0; mean of daily extremes otherwise.
      const byYear = new Map<number, DailyBundle[]>()
      days.forEach(d => {
        const arr = byYear.get(d.year) ?? []
        arr.push(d)
        byYear.set(d.year, arr)
      })
      const yearRows = [...byYear.values()].map(yd => mergeDailyToRow('', '', yd, 'month'))
      return {
        period: String(month).padStart(2, '0'),
        periodLabel: label,
        tmaxC: round(mean(finite(yearRows.map(r => r.tmaxC))), 1),
        tminC: round(mean(finite(yearRows.map(r => r.tminC))), 1),
        tavgC: round(mean(finite(yearRows.map(r => r.tavgC))), 1),
        rainfallMm: round(mean(finite(yearRows.map(r => r.rainfallMm))), 1),
        et0Mm: round(mean(finite(yearRows.map(r => r.et0Mm))), 1),
        waterDeficitM3Ha: round(mean(finite(yearRows.map(r => r.waterDeficitM3Ha))), 0),
        sunshineHPerDay: round(mean(finite(yearRows.map(r => r.sunshineHPerDay))), 1),
        daylightHPerDay: round(mean(finite(yearRows.map(r => r.daylightHPerDay))), 1),
        windMaxKmh: round(mean(finite(yearRows.map(r => r.windMaxKmh))), 1),
        maxGustKmh: round(mean(finite(yearRows.map(r => r.maxGustKmh))), 1),
        rhPct: round(mean(finite(yearRows.map(r => r.rhPct))), 0),
      }
    }).filter(r => r.tmaxC != null || r.rainfallMm != null || r.et0Mm != null)
  }

  const buckets = new Map<string, DailyBundle[]>()
  const order: string[] = []
  daily.forEach(d => {
    const key = periodKeyForAggregation(d.date, aggregation)
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(d)
  })
  return order.map(key =>
    mergeDailyToRow(key, periodLabelForKey(key, aggregation), buckets.get(key) ?? [], aggregation),
  )
}

/** Hourly normals: one row per hour from raw points (temps/rain/et0/rh/wind), with daily sunshine/daylight joined. */
function buildHourlyNormals(points: OpenMeteoHourlyPoint[], daily: DailyBundle[]): MeteoClimateRow[] {
  const dayMap = new Map(daily.map(d => [d.date, d]))
  return points
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .map(p => {
      const key = periodKeyForAggregation(p.time, 'hour')
      const day = dayMap.get(p.time.slice(0, 10))
      const rain = p.precipitationMm
      const et0 = p.et0Mm
      const wind = p.windSpeedKmh
      const gust = estimatedGustKmh(wind)
      return {
        period: key,
        periodLabel: periodLabelForKey(key, 'hour'),
        tmaxC: round(p.temperatureC, 1),
        tminC: round(p.temperatureC, 1),
        tavgC: round(p.temperatureC, 1),
        rainfallMm: round(rain, 2),
        et0Mm: round(et0, 2),
        waterDeficitM3Ha: waterDeficitM3Ha(et0, rain),
        sunshineHPerDay: day ? round(day.sunshineH, 1) : null,
        daylightHPerDay: day ? round(day.daylightH, 1) : null,
        windMaxKmh: round(wind, 1),
        maxGustKmh: gust,
        rhPct: round(p.humidityPct, 0),
      }
    })
}

/** One climate row per calendar day, straight from the daily bundle. */
function dailyBundleToRow(d: DailyBundle): MeteoClimateRow {
  return {
    period: d.date,
    periodLabel: d.date,
    tmaxC: round(d.tmaxC, 1),
    tminC: round(d.tminC, 1),
    tavgC: round(d.tavgC, 1),
    rainfallMm: round(d.rainfallMm, 1),
    et0Mm: round(d.et0Mm, 1),
    waterDeficitM3Ha: waterDeficitM3Ha(d.et0Mm, d.rainfallMm),
    sunshineHPerDay: round(d.sunshineH, 1),
    daylightHPerDay: round(d.daylightH, 1),
    windMaxKmh: round(d.windMaxKmh, 1),
    maxGustKmh: round(d.maxGustKmh, 1),
    rhPct: round(d.rhPct, 0),
  }
}

/** Mean temperature per hour of day (0–23) from raw hourly points. */
function buildDiurnalProfile(points: OpenMeteoHourlyPoint[]): MeteoDiurnalPoint[] {
  const byHour = new Map<number, number[]>()
  points.forEach(p => {
    const hour = Number(p.time.slice(11, 13))
    if (!Number.isFinite(hour) || p.temperatureC == null || !Number.isFinite(p.temperatureC)) return
    const arr = byHour.get(hour) ?? []
    arr.push(p.temperatureC)
    byHour.set(hour, arr)
  })
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    meanTempC: round(mean(byHour.get(hour) ?? []), 1),
  }))
}

function buildYearMatrices(daily: DailyBundle[]): MeteoYearMatrix[] {
  const years = [...new Set(daily.map(d => d.year))].sort((a, b) => a - b)
  if (!years.length) return []

  const specs: Array<{
    title: string
    pick: (days: DailyBundle[]) => number | null
  }> = [
    {
      title: 'T-max by Year',
      pick: days => {
        const v = finite(days.map(d => d.tmaxC))
        return v.length ? round(Math.max(...v), 1) : null
      },
    },
    {
      title: 'T-min by Year',
      pick: days => {
        const v = finite(days.map(d => d.tminC))
        return v.length ? round(Math.min(...v), 1) : null
      },
    },
    {
      title: 'Rainfall by Year',
      pick: days => round(sum(days.map(d => d.rainfallMm)), 1),
    },
    {
      title: 'ET0 by Year',
      pick: days => round(sum(days.map(d => d.et0Mm)), 1),
    },
    {
      title: 'Water Deficit by Year',
      pick: days => {
        const et0 = sum(days.map(d => d.et0Mm))
        const rain = sum(days.map(d => d.rainfallMm))
        return waterDeficitM3Ha(et0, rain)
      },
    },
    {
      title: 'RH by Year',
      pick: days => round(mean(finite(days.map(d => d.rhPct))), 0),
    },
  ]

  return specs.map(spec => ({
    title: spec.title,
    years,
    rows: MONTH_SHORT.map((monthLabel, idx) => {
      const month = idx + 1
      return {
        monthLabel,
        values: years.map(year => {
          const days = daily.filter(d => d.year === year && d.month === month)
          if (!days.length) return null
          return spec.pick(days)
        }),
      }
    }),
  }))
}

function buildAnnualSummary(daily: DailyBundle[]): MeteoAnnualSummaryRow[] {
  const years = [...new Set(daily.map(d => d.year))].sort((a, b) => a - b)
  return years.map(year => {
    const days = daily.filter(d => d.year === year)
    const rain = sum(days.map(d => d.rainfallMm))
    const et0 = sum(days.map(d => d.et0Mm))
    return {
      year,
      rainfallMm: round(rain, 1),
      et0Mm: round(et0, 2),
      waterDeficitMm: round(Math.max(0, et0 - rain), 1),
    }
  })
}

function buildRiskRows(
  daily: DailyBundle[],
  aggregation: ClimateExportAggregation,
): MeteoRiskRow[] {
  // Always report risk counts by calendar month when aggregation is month/year;
  // otherwise by the same period keys as the normals table.
  if (aggregation === 'month' || aggregation === 'year') {
    return MONTH_SHORT.map((label, idx) => {
      const month = idx + 1
      const days = daily.filter(d => d.month === month)
      if (!days.length) {
        return {
          periodLabel: label,
          heatDays35: 0,
          heatDays40: 0,
          coolNights15: 0,
          coldNights10: 0,
          highGustDays50: 0,
          extremeGustDays60: 0,
          rhHighHours: 0,
          rhLowHours: 0,
          irrigationDemandM3Ha: null,
        }
      }
      const rain = sum(days.map(d => d.rainfallMm))
      const et0 = sum(days.map(d => d.et0Mm))
      const yearCount = new Set(days.map(d => d.year)).size || 1
      return {
        periodLabel: label,
        heatDays35: Math.round(sum(days.map(d => d.heat35)) / yearCount),
        heatDays40: Math.round(sum(days.map(d => d.heat40)) / yearCount),
        coolNights15: Math.round(sum(days.map(d => d.cool15)) / yearCount),
        coldNights10: Math.round(sum(days.map(d => d.cold10)) / yearCount),
        highGustDays50: Math.round(sum(days.map(d => d.gust50)) / yearCount),
        extremeGustDays60: Math.round(sum(days.map(d => d.gust60)) / yearCount),
        rhHighHours: Math.round(sum(days.map(d => d.rhHighHours)) / yearCount),
        rhLowHours: Math.round(sum(days.map(d => d.rhLowHours)) / yearCount),
        irrigationDemandM3Ha: waterDeficitM3Ha(et0 / yearCount, rain / yearCount),
      }
    }).filter(r => r.irrigationDemandM3Ha != null || r.heatDays35 > 0 || r.coolNights15 > 0)
  }

  const buckets = new Map<string, DailyBundle[]>()
  const order: string[] = []
  daily.forEach(d => {
    const key = periodKeyForAggregation(d.date, aggregation === 'hour' ? 'day' : aggregation)
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(d)
  })
  return order.map(key => {
    const days = buckets.get(key) ?? []
    const rain = sum(days.map(d => d.rainfallMm))
    const et0 = sum(days.map(d => d.et0Mm))
    return {
      periodLabel: periodLabelForKey(key, aggregation === 'hour' ? 'day' : aggregation),
      heatDays35: sum(days.map(d => d.heat35)),
      heatDays40: sum(days.map(d => d.heat40)),
      coolNights15: sum(days.map(d => d.cool15)),
      coldNights10: sum(days.map(d => d.cold10)),
      highGustDays50: sum(days.map(d => d.gust50)),
      extremeGustDays60: sum(days.map(d => d.gust60)),
      rhHighHours: sum(days.map(d => d.rhHighHours)),
      rhLowHours: sum(days.map(d => d.rhLowHours)),
      irrigationDemandM3Ha: waterDeficitM3Ha(et0, rain),
    }
  })
}

function buildCumulativeDeficit(normals: MeteoClimateRow[]): Array<{ periodLabel: string; cumulativeMm: number }> {
  let run = 0
  return normals.map(r => {
    const et0 = r.et0Mm ?? 0
    const rain = r.rainfallMm ?? 0
    run += Math.max(0, et0 - rain)
    return { periodLabel: r.periodLabel, cumulativeMm: round(run, 1) ?? run }
  })
}

/** Running cumulative water deficit (mm) by calendar month for each year. */
function buildCumulativeByYear(daily: DailyBundle[]): MeteoYearMatrix | null {
  const years = [...new Set(daily.map(d => d.year))].sort((a, b) => a - b)
  if (!years.length) return null
  return {
    title: 'Cumulative Water Deficit by Year (mm)',
    years,
    rows: MONTH_SHORT.map((monthLabel, idx) => {
      const month = idx + 1
      return {
        monthLabel,
        values: years.map(year => {
          let run = 0
          for (let m = 1; m <= month; m++) {
            const days = daily.filter(d => d.year === year && d.month === m)
            if (!days.length) continue
            const rain = sum(days.map(d => d.rainfallMm))
            const et0 = sum(days.map(d => d.et0Mm))
            run += Math.max(0, et0 - rain)
          }
          const hasAny = daily.some(d => d.year === year && d.month <= month)
          return hasAny ? round(run, 1) : null
        }),
      }
    }),
  }
}

/** Running cumulative rainfall (mm) by calendar month for each year — year-to-year comparison. */
function buildCumulativeRainfallByYear(daily: DailyBundle[]): MeteoYearMatrix | null {
  const years = [...new Set(daily.map(d => d.year))].sort((a, b) => a - b)
  if (!years.length) return null
  return {
    title: 'Cumulative Rainfall by Year (mm)',
    years,
    rows: MONTH_SHORT.map((monthLabel, idx) => {
      const month = idx + 1
      return {
        monthLabel,
        values: years.map(year => {
          let run = 0
          for (let m = 1; m <= month; m++) {
            const days = daily.filter(d => d.year === year && d.month === m)
            if (!days.length) continue
            run += sum(days.map(d => d.rainfallMm))
          }
          const hasAny = daily.some(d => d.year === year && d.month <= month)
          return hasAny ? round(run, 1) : null
        }),
      }
    }),
  }
}

function formatDms(lat: number, lng: number): string {
  const fmt = (v: number, pos: string, neg: string) => {
    const hemi = v >= 0 ? pos : neg
    const abs = Math.abs(v)
    const deg = Math.floor(abs)
    const minFloat = (abs - deg) * 60
    const min = Math.floor(minFloat)
    const sec = Math.round((minFloat - min) * 60)
    return `${deg}°${String(min).padStart(2, '0')}'${String(sec).padStart(2, '0')}"${hemi}`
  }
  return `${fmt(lat, 'N', 'S')}, ${fmt(lng, 'E', 'W')}`
}

export type BuildMeteoDataReportInput = {
  aoiName: string
  aoiLocation: string
  lat: number
  lng: number
  analysisStart: string
  analysisEnd: string
  hourlyRecords: OpenMeteoHourlyPoint[]
  timeAggregation: ClimateExportAggregation
}

export function buildMeteoDataReportModel(input: BuildMeteoDataReportInput): MeteoDataReportModel {
  const aggregation = input.timeAggregation
  const daily = buildMeteoDailyBundles(input.hourlyRecords, input.lat)
  const normals =
    aggregation === 'hour'
      ? buildHourlyNormals(input.hourlyRecords, daily)
      : buildNormalsFromDaily(daily, aggregation)

  const locationHint =
    input.aoiLocation && input.aoiLocation !== input.aoiName
      ? `${formatDms(input.lat, input.lng)} (${input.aoiLocation})`
      : formatDms(input.lat, input.lng)

  return {
    title: `Meteo Data Report — ${input.aoiName}`,
    locationLine: locationHint,
    sourceLine: `Weather data by Open-Meteo.com (https://open-meteo.com/), ERA5 archive dataset, period ${input.analysisStart}–${input.analysisEnd}, aggregation ${climateAggregationLabel(aggregation)}.`,
    aggregation,
    aggregationLabel: climateAggregationLabel(aggregation),
    normalsTitle: normalsTitle(aggregation),
    normals,
    monthlyNormals: buildNormalsFromDaily(daily, 'month'),
    dailySeries: daily.map(dailyBundleToRow),
    hourlySeries: buildHourlyNormals(input.hourlyRecords, daily),
    diurnalProfile: buildDiurnalProfile(input.hourlyRecords),
    yearMatrices: buildYearMatrices(daily),
    annualSummary: buildAnnualSummary(daily),
    riskRows: buildRiskRows(daily, aggregation),
    cumulativeDeficit: buildCumulativeDeficit(
      aggregation === 'month' ? normals : buildNormalsFromDaily(daily, 'month'),
    ),
    cumulativeByYear: buildCumulativeByYear(daily),
    cumulativeRainfallByYear: buildCumulativeRainfallByYear(daily),
  }
}
