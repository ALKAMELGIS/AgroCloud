import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import {
  formatImageryTimePeriodLabel,
  imageryTimePeriodKey,
  type ImageryTimeAggregation,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type {
  AnnualClimateRow,
  ClimateExportAggregation,
  ClimateExtremeEvent,
  ClimateForecastRow,
  ClimateRiskLevel,
  ClimateRiskRow,
  MonthlyClimateRow,
  WeatherClimateReportPayload,
  WeatherDailyRecord,
} from './weatherClimateReportTypes'

export type ClimatePeriodExportRow = {
  period: string
  periodLabel: string
  tempMaxC: number | null
  tempMinC: number | null
  tempAvgC: number | null
  rainfallMm: number | null
  humidityPct: number | null
  windSpeedKmh: number | null
  solarRadiationWm2: number | null
  et0Mm: number | null
  pressureHpa: number | null
  windDirectionDeg?: number | null
  weatherCode?: number | null
}

const AGGREGATION_LABELS: Record<ClimateExportAggregation, string> = {
  hour: 'Hourly',
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
}

export function climateAggregationLabel(aggregation: ClimateExportAggregation): string {
  return AGGREGATION_LABELS[aggregation] ?? aggregation
}

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

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

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function linearRegression(points: Array<{ x: number; y: number }>): {
  slope: number
  intercept: number
  r2: number
} | null {
  if (points.length < 2) return null
  const n = points.length
  const sumX = sum(points.map(p => p.x))
  const sumY = sum(points.map(p => p.y))
  const sumXY = sum(points.map(p => p.x * p.y))
  const sumXX = sum(points.map(p => p.x * p.x))
  const sumYY = sum(points.map(p => p.y * p.y))
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return null
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const ssTot = sumYY - (sumY * sumY) / n
  const ssRes = points.reduce((acc, p) => {
    const pred = intercept + slope * p.x
    return acc + (p.y - pred) ** 2
  }, 0)
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0
  return { slope, intercept, r2 }
}

function riskFromScore(score: number): ClimateRiskLevel {
  if (score >= 0.75) return 'Extreme'
  if (score >= 0.55) return 'High'
  if (score >= 0.35) return 'Moderate'
  return 'Low'
}

export function aggregateDailyFromHourly(points: OpenMeteoHourlyPoint[]): WeatherDailyRecord[] {
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
      const rain = finite(rows.map(r => r.precipitationMm))
      const humid = finite(rows.map(r => r.humidityPct))
      const wind = finite(rows.map(r => r.windSpeedKmh))
      const solar = finite(rows.map(r => r.shortwaveRadiationWm2))
      const et0 = finite(rows.map(r => r.et0Mm))
      const press = finite(rows.map(r => r.pressureHpa))
      const tempMax = temps.length ? Math.max(...temps) : null
      const tempMin = temps.length ? Math.min(...temps) : null
      return {
        date,
        tempMaxC: tempMax,
        tempMinC: tempMin,
        tempAvgC: mean(temps),
        rainfallMm: rain.length ? sum(rain) : null,
        humidityPct: mean(humid),
        windSpeedKmh: mean(wind),
        solarRadiationWm2: solar.length ? mean(solar) : null,
        et0Mm: et0.length ? sum(et0) : null,
        pressureHpa: mean(press),
      }
    })
}

function mergeDailyBucket(rows: WeatherDailyRecord[]): Omit<WeatherDailyRecord, 'date'> {
  const maxTemps = finite(rows.map(r => r.tempMaxC))
  const minTemps = finite(rows.map(r => r.tempMinC))
  const avgTemps = finite(rows.map(r => r.tempAvgC))
  const rains = finite(rows.map(r => r.rainfallMm))
  const humid = finite(rows.map(r => r.humidityPct))
  const wind = finite(rows.map(r => r.windSpeedKmh))
  const solar = finite(rows.map(r => r.solarRadiationWm2))
  const et0 = finite(rows.map(r => r.et0Mm))
  const press = finite(rows.map(r => r.pressureHpa))
  return {
    tempMaxC: maxTemps.length ? Math.max(...maxTemps) : null,
    tempMinC: minTemps.length ? Math.min(...minTemps) : null,
    tempAvgC: mean(avgTemps),
    rainfallMm: rains.length ? sum(rains) : null,
    humidityPct: mean(humid),
    windSpeedKmh: mean(wind),
    solarRadiationWm2: mean(solar),
    et0Mm: et0.length ? sum(et0) : null,
    pressureHpa: mean(press),
  }
}

/** Re-bucket daily climate rows into week / month / year periods for Excel export. */
export function aggregateDailyRecordsByPeriod(
  daily: WeatherDailyRecord[],
  aggregation: Exclude<ClimateExportAggregation, 'hour' | 'day'>,
): ClimatePeriodExportRow[] {
  const buckets = new Map<string, WeatherDailyRecord[]>()
  const order: string[] = []
  daily.forEach(row => {
    const key = imageryTimePeriodKey(row.date, aggregation as ImageryTimeAggregation)
    if (!key) return
    if (!buckets.has(key)) {
      buckets.set(key, [])
      order.push(key)
    }
    buckets.get(key)!.push(row)
  })
  return order.map(key => {
    const merged = mergeDailyBucket(buckets.get(key) ?? [])
    return {
      period: key,
      periodLabel: formatImageryTimePeriodLabel(key, aggregation as ImageryTimeAggregation),
      ...merged,
    }
  })
}

/** Rows for the Historical Dataset sheet, matching the chart Aggregate selection. */
export function buildClimatePeriodExportRows(
  hourly: OpenMeteoHourlyPoint[],
  daily: WeatherDailyRecord[],
  aggregation: ClimateExportAggregation,
): ClimatePeriodExportRow[] {
  if (aggregation === 'hour') {
    return hourly.map(h => {
      const key = h.time.length >= 16 ? h.time.slice(0, 16) : h.time
      const label =
        key.length >= 16 ? `${key.slice(5, 10)} ${key.slice(11, 16)}` : key
      return {
        period: key,
        periodLabel: label,
        tempMaxC: h.temperatureC,
        tempMinC: h.temperatureC,
        tempAvgC: h.temperatureC,
        rainfallMm: h.precipitationMm,
        humidityPct: h.humidityPct,
        windSpeedKmh: h.windSpeedKmh,
        solarRadiationWm2: h.shortwaveRadiationWm2,
        et0Mm: h.et0Mm,
        pressureHpa: h.pressureHpa,
        windDirectionDeg: h.windDirectionDeg,
        weatherCode: h.weatherCode,
      }
    })
  }
  if (aggregation === 'day') {
    return daily.map(d => ({
      period: d.date,
      periodLabel: d.date,
      tempMaxC: d.tempMaxC,
      tempMinC: d.tempMinC,
      tempAvgC: d.tempAvgC,
      rainfallMm: d.rainfallMm,
      humidityPct: d.humidityPct,
      windSpeedKmh: d.windSpeedKmh,
      solarRadiationWm2: d.solarRadiationWm2,
      et0Mm: d.et0Mm,
      pressureHpa: d.pressureHpa,
    }))
  }
  return aggregateDailyRecordsByPeriod(daily, aggregation)
}

function classifyClimate(daily: WeatherDailyRecord[]): string {
  const temps = finite(daily.map(d => d.tempAvgC))
  const rains = finite(daily.map(d => d.rainfallMm))
  const annualRain = rains.length ? (sum(rains) / daily.length) * 365 : null
  const avgTemp = mean(temps)
  if (avgTemp == null) return 'Undetermined'
  if (avgTemp >= 24 && annualRain != null && annualRain >= 1500) return 'Tropical / Humid'
  if (avgTemp >= 18 && annualRain != null && annualRain >= 600) return 'Subtropical / Semi-humid'
  if (annualRain != null && annualRain < 250) return 'Arid / Desert'
  if (annualRain != null && annualRain < 500) return 'Semi-arid / Steppe'
  if (avgTemp < 10) return 'Cold / Continental'
  return 'Temperate'
}

function buildAnnualSeries(daily: WeatherDailyRecord[]): AnnualClimateRow[] {
  const byYear = new Map<number, WeatherDailyRecord[]>()
  daily.forEach(d => {
    const y = Number(d.date.slice(0, 4))
    if (!Number.isFinite(y)) return
    const arr = byYear.get(y) ?? []
    arr.push(d)
    byYear.set(y, arr)
  })
  const rows: AnnualClimateRow[] = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, rowsY]) => {
      const temps = finite(rowsY.map(r => r.tempAvgC))
      const rains = finite(rowsY.map(r => r.rainfallMm))
      return {
        year,
        avgTempC: mean(temps),
        totalRainfallMm: rains.length ? sum(rains) : null,
        tempAnomalyC: null,
        rainfallAnomalyPct: null,
      }
    })
  const baseTemp = mean(finite(rows.map(r => r.avgTempC)))
  const baseRain = mean(finite(rows.map(r => r.totalRainfallMm)))
  return rows.map(r => ({
    ...r,
    tempAnomalyC:
      r.avgTempC != null && baseTemp != null ? Number((r.avgTempC - baseTemp).toFixed(2)) : null,
    rainfallAnomalyPct:
      r.totalRainfallMm != null && baseRain != null && baseRain > 0
        ? Number((((r.totalRainfallMm - baseRain) / baseRain) * 100).toFixed(1))
        : null,
  }))
}

function detectExtremeEvents(daily: WeatherDailyRecord[]): ClimateExtremeEvent[] {
  const events: ClimateExtremeEvent[] = []
  if (!daily.length) return events

  const maxTemps = finite(daily.map(d => d.tempMaxC))
  const rains = finite(daily.map(d => d.rainfallMm))
  const p90Temp = percentile([...maxTemps].sort((a, b) => a - b), 0.9)
  const p95Rain = percentile([...rains].sort((a, b) => a - b), 0.95)
  const heatThreshold = Math.max(p90Temp + 3, 35)

  let heatStart: string | null = null
  let heatLen = 0
  let dryStart: string | null = null
  let dryLen = 0
  let droughtStart: string | null = null
  let droughtLen = 0

  daily.forEach(d => {
    const hot = d.tempMaxC != null && d.tempMaxC >= heatThreshold
    if (hot) {
      if (!heatStart) heatStart = d.date
      heatLen += 1
    } else if (heatStart && heatLen >= 3) {
      events.push({
        type: 'Heat wave',
        startDate: heatStart,
        endDate: daily[daily.indexOf(d) - 1]?.date ?? heatStart,
        durationDays: heatLen,
        description: `Sustained high temperatures above ${heatThreshold.toFixed(1)} °C`,
      })
      heatStart = null
      heatLen = 0
    } else {
      heatStart = null
      heatLen = 0
    }

    const extremeRain = d.rainfallMm != null && d.rainfallMm >= Math.max(p95Rain, 40)
    if (extremeRain) {
      events.push({
        type: 'Extreme rainfall',
        startDate: d.date,
        endDate: d.date,
        durationDays: 1,
        description: `Daily rainfall ${d.rainfallMm?.toFixed(1)} mm`,
      })
    }

    const dry = (d.rainfallMm ?? 0) < 1
    if (dry) {
      if (!dryStart) dryStart = d.date
      dryLen += 1
      if (!droughtStart) droughtStart = d.date
      droughtLen += 1
    } else {
      if (dryStart && dryLen >= 14) {
        events.push({
          type: 'Long dry period',
          startDate: dryStart,
          endDate: daily[daily.indexOf(d) - 1]?.date ?? dryStart,
          durationDays: dryLen,
          description: 'Consecutive days with rainfall below 1 mm',
        })
      }
      dryStart = null
      dryLen = 0
      if (droughtStart && droughtLen >= 7 && (d.tempMaxC ?? 0) >= 30) {
        events.push({
          type: 'Drought',
          startDate: droughtStart,
          endDate: daily[daily.indexOf(d) - 1]?.date ?? droughtStart,
          durationDays: droughtLen,
          description: 'Warm dry spell with negligible rainfall',
        })
      }
      droughtStart = null
      droughtLen = 0
    }
  })

  if (heatStart && heatLen >= 3) {
    events.push({
      type: 'Heat wave',
      startDate: heatStart,
      endDate: daily[daily.length - 1].date,
      durationDays: heatLen,
      description: `Sustained high temperatures above ${heatThreshold.toFixed(1)} °C`,
    })
  }
  if (dryStart && dryLen >= 14) {
    events.push({
      type: 'Long dry period',
      startDate: dryStart,
      endDate: daily[daily.length - 1].date,
      durationDays: dryLen,
      description: 'Consecutive days with rainfall below 1 mm',
    })
  }

  return events.slice(0, 40)
}

function monthlyCalendar(daily: WeatherDailyRecord[]): MonthlyClimateRow[] {
  const byMonth = new Map<number, WeatherDailyRecord[]>()
  daily.forEach(d => {
    const m = Number(d.date.slice(5, 7))
    if (!Number.isFinite(m)) return
    const arr = byMonth.get(m) ?? []
    arr.push(d)
    byMonth.set(m, arr)
  })

  const allRain = finite(daily.map(d => d.rainfallMm))
  const wetThreshold = percentile([...allRain].sort((a, b) => a - b), 0.65)

  return MONTH_LABELS.map((monthLabel, idx) => {
    const month = idx + 1
    const rows = byMonth.get(month) ?? []
    const temps = finite(rows.map(r => r.tempAvgC))
    const rains = finite(rows.map(r => r.rainfallMm))
    const humidVals = finite(rows.map(r => r.humidityPct))
    const avgRain = mean(rains)
    const avgTemp = mean(temps)
    const avgHumid = mean(humidVals)
    let seasonLabel = 'Transitional'
    if (avgRain != null && avgRain >= wetThreshold) seasonLabel = 'Rainy season'
    else if (avgRain != null && avgRain < wetThreshold * 0.35) seasonLabel = 'Dry season'
    else if (avgTemp != null && avgTemp >= 20) seasonLabel = 'Growing season'

    let score = 0
    if (avgTemp != null && avgTemp >= 35) score += 0.4
    if (avgTemp != null && avgTemp >= 30) score += 0.2
    if (avgRain != null && avgRain < 1) score += 0.25
    if (avgRain != null && avgRain > wetThreshold * 2) score += 0.2

    return {
      month,
      monthLabel,
      avgTempC: avgTemp != null ? Number(avgTemp.toFixed(2)) : null,
      rainfallMm: rains.length ? Number(sum(rains).toFixed(1)) : null,
      humidityPct: avgHumid != null ? Number(avgHumid.toFixed(1)) : null,
      climateRisk: riskFromScore(score),
      seasonLabel,
    }
  })
}

function buildForecast(
  annual: AnnualClimateRow[],
  baseTemp: number | null,
  baseRain: number | null,
): ClimateForecastRow[] {
  const tempPts = annual
    .filter(a => a.avgTempC != null)
    .map(a => ({ x: a.year, y: a.avgTempC as number }))
  const rainPts = annual
    .filter(a => a.totalRainfallMm != null)
    .map(a => ({ x: a.year, y: a.totalRainfallMm as number }))

  const tempReg = linearRegression(tempPts)
  const rainReg = linearRegression(rainPts)
  const startYear = new Date().getFullYear()
  const endYear = 2050
  const rows: ClimateForecastRow[] = []

  for (let year = startYear; year <= endYear; year += 1) {
    const predictedTemp =
      tempReg != null ? tempReg.intercept + tempReg.slope * year : baseTemp
    const predictedRain =
      rainReg != null ? rainReg.intercept + rainReg.slope * year : baseRain
    const tempChange =
      baseTemp != null && predictedTemp != null ? predictedTemp - baseTemp : null
    const rainChange =
      baseRain != null && predictedRain != null && baseRain > 0
        ? ((predictedRain - baseRain) / baseRain) * 100
        : null
    const confidence =
      (tempReg?.r2 ?? 0) >= 0.5 || (rainReg?.r2 ?? 0) >= 0.5
        ? 'High'
        : annual.length >= 5
          ? 'Moderate'
          : 'Low'

    rows.push({
      year,
      predictedTempC: predictedTemp != null ? Number(predictedTemp.toFixed(2)) : null,
      tempChangeC: tempChange != null ? Number(tempChange.toFixed(2)) : null,
      predictedRainfallMm: predictedRain != null ? Number(Math.max(0, predictedRain).toFixed(1)) : null,
      rainfallChangePct: rainChange != null ? Number(rainChange.toFixed(1)) : null,
      confidence,
    })
  }
  return rows
}

function buildClimateRisks(
  daily: WeatherDailyRecord[],
  tempTrend: WeatherClimateReportPayload['temperatureTrend'],
  rainTrend: WeatherClimateReportPayload['rainfallTrend'],
  events: ClimateExtremeEvent[],
): ClimateRiskRow[] {
  const heatEvents = events.filter(e => e.type === 'Heat wave').length
  const floodEvents = events.filter(e => e.type === 'Extreme rainfall').length
  const droughtEvents = events.filter(e => e.type === 'Drought' || e.type === 'Long dry period').length

  let heatScore = heatEvents > 2 ? 0.7 : heatEvents > 0 ? 0.45 : 0.2
  if ((tempTrend.slopePerDecadeC ?? 0) > 0.2) heatScore += 0.2

  let droughtScore = droughtEvents > 2 ? 0.65 : droughtEvents > 0 ? 0.4 : 0.15
  if ((rainTrend.annualChangePct ?? 0) < -5) droughtScore += 0.25

  let floodScore = floodEvents > 2 ? 0.6 : floodEvents > 0 ? 0.35 : 0.15
  if ((rainTrend.annualChangePct ?? 0) > 8) floodScore += 0.2

  const et0Vals = finite(daily.map(d => d.et0Mm))
  if (mean(et0Vals) != null && (tempTrend.slopePerDecadeC ?? 0) > 0.15) droughtScore += 0.1

  return [
    {
      riskType: 'Heat Stress',
      level: riskFromScore(Math.min(1, heatScore)),
      description:
        (tempTrend.slopePerDecadeC ?? 0) > 0
          ? `Increasing temperature trend (~${tempTrend.slopePerDecadeC?.toFixed(2)} °C/decade)`
          : 'Stable to moderate thermal stress in historical record',
    },
    {
      riskType: 'Drought Risk',
      level: riskFromScore(Math.min(1, droughtScore)),
      description:
        (rainTrend.annualChangePct ?? 0) < 0
          ? `Reduced rainfall pattern (${rainTrend.annualChangePct?.toFixed(1)}% vs baseline)`
          : 'Rainfall variability within historical norms',
    },
    {
      riskType: 'Flood Risk',
      level: riskFromScore(Math.min(1, floodScore)),
      description:
        floodEvents > 0
          ? `${floodEvents} extreme rainfall event(s) detected`
          : 'Limited extreme rainfall events in selected period',
    },
  ]
}

export type BuildWeatherClimatePayloadInput = {
  aoiName: string
  aoiLocation: string
  lat: number
  lng: number
  timezone: string
  elevationM?: number | null
  analysisStart: string
  analysisEnd: string
  loadedStart: string
  loadedEnd: string
  hourlyRecords: OpenMeteoHourlyPoint[]
  /** Defaults to day when omitted (backward compatible). */
  timeAggregation?: ClimateExportAggregation
}

export function buildWeatherClimateReportPayload(
  input: BuildWeatherClimatePayloadInput,
): WeatherClimateReportPayload {
  const timeAggregation: ClimateExportAggregation = input.timeAggregation ?? 'day'
  const daily = aggregateDailyFromHourly(input.hourlyRecords)
  const annual = buildAnnualSeries(daily)
  const baseTemp = mean(finite(annual.map(a => a.avgTempC)))
  const baseRain = mean(finite(annual.map(a => a.totalRainfallMm)))

  const tempPts = annual
    .filter(a => a.avgTempC != null)
    .map(a => ({ x: a.year, y: a.avgTempC as number }))
  const rainPts = annual
    .filter(a => a.totalRainfallMm != null)
    .map(a => ({ x: a.year, y: a.totalRainfallMm as number }))
  const tempReg = linearRegression(tempPts)
  const rainReg = linearRegression(rainPts)

  const tempSlopeDecade = tempReg ? tempReg.slope * 10 : null
  const rainSlopeDecade = rainReg ? rainReg.slope * 10 : null
  const rainChangePct =
    baseRain != null && rainSlopeDecade != null && baseRain > 0
      ? (rainSlopeDecade / baseRain) * 100
      : null

  const temperatureTrend = {
    slopePerDecadeC: tempSlopeDecade != null ? Number(tempSlopeDecade.toFixed(3)) : null,
    annualChangePct: null,
    regressionR2: tempReg ? Number(tempReg.r2.toFixed(3)) : null,
    narrative:
      tempSlopeDecade != null
        ? `Temperature ${tempSlopeDecade >= 0 ? 'increase' : 'decrease'} of ${Math.abs(tempSlopeDecade).toFixed(2)} °C per decade (linear regression).`
        : 'Insufficient annual coverage for robust temperature trend.',
  }

  const rainfallTrend = {
    slopeMmPerDecade: rainSlopeDecade != null ? Number(rainSlopeDecade.toFixed(1)) : null,
    annualChangePct: rainChangePct != null ? Number(rainChangePct.toFixed(1)) : null,
    regressionR2: rainReg ? Number(rainReg.r2.toFixed(3)) : null,
    narrative:
      rainChangePct != null
        ? `Annual rainfall change of ${rainChangePct >= 0 ? '+' : ''}${rainChangePct.toFixed(1)}% compared with historical average (trend-based).`
        : 'Insufficient annual coverage for robust rainfall trend.',
  }

  const extremeEvents = detectExtremeEvents(daily)
  const monthly = monthlyCalendar(daily)
  const forecastRows = buildForecast(annual, baseTemp, baseRain)
  const climateRisks = buildClimateRisks(daily, temperatureTrend, rainfallTrend, extremeEvents)

  const maxTemp = finite(daily.map(d => d.tempMaxC))
  const minTemp = finite(daily.map(d => d.tempMinC))
  const avgTemp = finite(daily.map(d => d.tempAvgC))
  const rains = finite(daily.map(d => d.rainfallMm))

  const wetMonths = monthly.filter(m => m.seasonLabel === 'Rainy season').map(m => m.monthLabel)
  const dryMonths = monthly.filter(m => m.seasonLabel === 'Dry season').map(m => m.monthLabel)

  const coverageYears =
    input.analysisStart && input.analysisEnd
      ? Math.max(
          1,
          (new Date(input.analysisEnd).getTime() - new Date(input.analysisStart).getTime()) /
            (365.25 * 86_400_000),
        )
      : 0

  const forecast2050 = forecastRows.find(r => r.year === 2050)
  const heatRisk = climateRisks.find(r => r.riskType === 'Heat Stress')
  const droughtRisk = climateRisks.find(r => r.riskType === 'Drought Risk')

  let impactScore = 0
  if ((forecast2050?.tempChangeC ?? 0) >= 2) impactScore += 0.35
  else if ((forecast2050?.tempChangeC ?? 0) >= 1) impactScore += 0.2
  if ((forecast2050?.rainfallChangePct ?? 0) <= -15) impactScore += 0.3
  if (droughtRisk?.level === 'High' || droughtRisk?.level === 'Extreme') impactScore += 0.25
  if (heatRisk?.level === 'High' || heatRisk?.level === 'Extreme') impactScore += 0.2

  const overallImpact: 'Low' | 'Medium' | 'High' =
    impactScore >= 0.55 ? 'High' : impactScore >= 0.3 ? 'Medium' : 'Low'

  const mainFindings = [
    `Mean temperature ${mean(avgTemp)?.toFixed(1) ?? '—'} °C across ${daily.length} days.`,
    `Total rainfall ${rains.length ? sum(rains).toFixed(0) : '—'} mm in analysis window.`,
    wetMonths.length ? `Wet season months: ${wetMonths.join(', ')}.` : 'Wet season not strongly defined.',
    dryMonths.length ? `Dry season months: ${dryMonths.join(', ')}.` : 'Dry season not strongly defined.',
    temperatureTrend.narrative,
    rainfallTrend.narrative,
  ]

  return {
    aoiName: input.aoiName,
    aoiLocation: input.aoiLocation,
    lat: input.lat,
    lng: input.lng,
    timezone: input.timezone,
    elevationM: input.elevationM ?? null,
    analysisStart: input.analysisStart,
    analysisEnd: input.analysisEnd,
    loadedStart: input.loadedStart,
    loadedEnd: input.loadedEnd,
    extractionDate: new Date().toISOString(),
    dataSource: 'Open-Meteo ERA5 Historical Archive API',
    climateClassification: classifyClimate(daily),
    historicalCoverageYears: Number(coverageYears.toFixed(1)),
    executiveSummary: {
      mainFindings,
      environmentalRiskSummary: climateRisks.map(r => `${r.riskType}: ${r.level}`).join(' · '),
      forecastHorizon: '2026 – 2050 Climate Projection (trend-based)',
    },
    timeAggregation,
    hourlyRecords: input.hourlyRecords,
    dailyRecords: daily,
    temperatureStats: {
      meanC: mean(avgTemp) != null ? Number(mean(avgTemp)!.toFixed(2)) : null,
      maxC: maxTemp.length ? Math.max(...maxTemp) : null,
      minC: minTemp.length ? Math.min(...minTemp) : null,
      seasonalVariationC:
        maxTemp.length && minTemp.length
          ? Number((Math.max(...maxTemp) - Math.min(...minTemp)).toFixed(2))
          : null,
      annualTrendCPerDecade: temperatureTrend.slopePerDecadeC,
    },
    rainfallStats: {
      annualPrecipMm: rains.length ? Number(sum(rains).toFixed(1)) : null,
      wetSeason: wetMonths.join(', ') || '—',
      drySeason: dryMonths.join(', ') || '—',
      variabilityPct:
        rains.length > 1
          ? Number(
              (
                (Math.sqrt(
                  rains.reduce((s, v) => s + (v - mean(rains)!) ** 2, 0) / rains.length,
                ) /
                  (mean(rains) || 1)) *
                100
              ).toFixed(1),
            )
          : null,
      annualTrendPct: rainfallTrend.annualChangePct,
    },
    extremeEvents,
    temperatureTrend,
    rainfallTrend,
    annualSeries: annual,
    climateRisks,
    monthlyCalendar: monthly,
    forecastRows,
    impactAssessment: {
      overallImpact,
      temperatureIncreaseC: forecast2050?.tempChangeC ?? null,
      rainfallChangePct: forecast2050?.rainfallChangePct ?? null,
      droughtProbabilityPct:
        droughtRisk?.level === 'Extreme'
          ? 75
          : droughtRisk?.level === 'High'
            ? 55
            : droughtRisk?.level === 'Moderate'
              ? 35
              : 15,
      waterStressLevel: droughtRisk?.level ?? 'Low',
      agriculturalImpact:
        overallImpact === 'High'
          ? 'Elevated heat and water stress may reduce yields without adaptive irrigation.'
          : overallImpact === 'Medium'
            ? 'Seasonal variability warrants crop planning and water budgeting.'
            : 'Historical climate supports stable agricultural operations with routine monitoring.',
      bullets: [
        `Projected temperature change to 2050: ${forecast2050?.tempChangeC != null ? `${forecast2050.tempChangeC >= 0 ? '+' : ''}${forecast2050.tempChangeC} °C` : '—'}`,
        `Projected rainfall change to 2050: ${forecast2050?.rainfallChangePct != null ? `${forecast2050.rainfallChangePct >= 0 ? '+' : ''}${forecast2050.rainfallChangePct}%` : '—'}`,
        `Drought probability (modelled): ${droughtRisk?.level ?? 'Low'} risk tier`,
        `Water stress classification: ${droughtRisk?.level ?? 'Low'}`,
      ],
    },
  }
}
