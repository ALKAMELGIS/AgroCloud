/**
 * Enterprise Weather Intelligence analytics — transforms hourly ERA5 observations
 * into executive-ready tables, comparisons, change detection, and indicators.
 */
import type { OpenMeteoHourlyPoint } from '../../../../lib/openMeteoWeather'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { aggregateDailyFromHourly } from './weatherClimateAnalysisEngine'
import { buildWeatherIntelligenceExecutive } from './weatherIntelligenceExecutive'

export type IndicatorClass = 'Excellent' | 'Good' | 'Moderate' | 'High Risk' | 'Critical'
export type ChangeSeverity = 'Low' | 'Moderate' | 'High' | 'Severe' | 'Critical'
export type ComparisonClass =
  | 'Significant Increase'
  | 'Moderate Increase'
  | 'Stable'
  | 'Moderate Decrease'
  | 'Significant Decrease'

export type HourlyRawRow = {
  date: string
  time: string
  temperatureC: number | null
  humidityPct: number | null
  rainfallMm: number | null
  windSpeedKmh: number | null
  windDirectionDeg: number | null
  pressureHpa: number | null
  solarRadiationWm2: number | null
  cloudCoverPct: number | null
  et0Mm: number | null
  uvIndex: number | null
  dewPointC: number | null
  visibilityKm: number | null
}

export type DailySummaryRow = {
  date: string
  tempMinC: number | null
  tempMaxC: number | null
  tempAvgC: number | null
  totalRainfallMm: number | null
  avgHumidityPct: number | null
  avgWindSpeedKmh: number | null
  avgPressureHpa: number | null
  avgSolarRadiationWm2: number | null
  avgCloudCoverPct: number | null
  dailyEt0Mm: number | null
  weatherClassification: string
  weatherRiskLevel: IndicatorClass
  statusMap: string
}

export type MonthlySummaryRow = {
  monthKey: string
  monthLabel: string
  avgTempC: number | null
  maxTempC: number | null
  minTempC: number | null
  totalRainfallMm: number | null
  avgHumidityPct: number | null
  avgWindSpeedKmh: number | null
  avgSolarRadiationWm2: number | null
  monthlyEt0Mm: number | null
  monthlyChangePct: number | null
  seasonalComparison: string
  historicalAvgComparison: string
  climateAnomaly: string
  statusMap: string
}

export type StatMetricRow = {
  parameter: string
  count: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  range: number | null
  stdDev: number | null
  variance: number | null
  p10: number | null
  p50: number | null
  p90: number | null
  trend: string
}

export type ComparisonRow = {
  comparison: string
  metric: string
  currentValue: number | null
  previousValue: number | null
  difference: number | null
  pctChange: number | null
  trendDirection: 'Up' | 'Down' | 'Flat'
  performanceScore: number | null
  classification: ComparisonClass
  aiExplanation: string
}

export type ChangeEventRow = {
  parameter: string
  eventType: string
  startDate: string
  endDate: string
  previousValue: number | null
  currentValue: number | null
  difference: number | null
  pctChange: number | null
  severity: ChangeSeverity
  statusMap: string
}

export type WeatherIndicatorRow = {
  indicator: string
  value: string
  numericScore: number
  classification: IndicatorClass
  statusMap: string
  interpretation: string
}

export type ExecutiveKpiCard = {
  label: string
  currentValue: string
  previousValue: string
  difference: string
  pctChange: string
  trendArrow: '↑' | '↓' | '→'
  colorStatus: IndicatorClass
  statusMap: string
}

export type ClimateTimelinePoint = {
  period: string
  avgTempC: number | null
  totalRainMm: number | null
}

export type EnterpriseWeatherModel = {
  title: string
  locationLine: string
  sourceLine: string
  hourlyRaw: HourlyRawRow[]
  dailySummary: DailySummaryRow[]
  monthlySummary: MonthlySummaryRow[]
  statistics: StatMetricRow[]
  correlations: Array<{ a: string; b: string; r: number | null }>
  comparisons: ComparisonRow[]
  changeEvents: ChangeEventRow[]
  indicators: WeatherIndicatorRow[]
  executiveKpis: ExecutiveKpiCard[]
  climateTimeline: ClimateTimelinePoint[]
  executiveSummary: {
    overallConditions: string
    keyFindings: string[]
    comparisonResults: string[]
    changeDetection: string[]
    agriculturalImpact: string[]
    riskAssessment: string
    aiRecommendations: string[]
  }
  windRose: Array<{ direction: string; frequencyPct: number }>
  heatmapMatrix: { months: string[]; days: number[]; values: Array<number | null> }
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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

function stdDev(nums: number[]): number | null {
  if (nums.length < 2) return null
  const m = mean(nums)!
  return Math.sqrt(sum(nums.map(v => (v - m) ** 2)) / (nums.length - 1))
}

function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null
  const ma = mean(a)!
  const mb = mean(b)!
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - ma) * (b[i] - mb)
    da += (a[i] - ma) ** 2
    db += (b[i] - mb) ** 2
  }
  const den = Math.sqrt(da * db)
  return den > 0 ? num / den : null
}

export function buildStatusMap(score: number, width = 12): string {
  const s = Math.max(0, Math.min(100, score))
  const filled = Math.round((s / 100) * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
}

export function classifyScore(score: number): IndicatorClass {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Moderate'
  if (score >= 20) return 'High Risk'
  return 'Critical'
}

function mapRiskBand(band: string): IndicatorClass {
  if (band === 'Moderate Risk') return 'Moderate'
  if (band === 'Excellent' || band === 'Good' || band === 'Moderate' || band === 'High Risk' || band === 'Critical') {
    return band
  }
  return 'Moderate'
}

function classifyComparison(pct: number | null): ComparisonClass {
  if (pct == null || !Number.isFinite(pct)) return 'Stable'
  if (pct >= 15) return 'Significant Increase'
  if (pct >= 5) return 'Moderate Increase'
  if (pct <= -15) return 'Significant Decrease'
  if (pct <= -5) return 'Moderate Decrease'
  return 'Stable'
}

function cloudFromWeatherCode(code: number | null): number | null {
  if (code == null) return null
  if (code <= 1) return 10
  if (code === 2) return 40
  if (code === 3) return 85
  if (code <= 48) return 60
  if (code <= 67) return 90
  return 70
}

function dewPointC(tempC: number, rhPct: number): number {
  const a = 17.27
  const b = 237.7
  const alpha = (a * tempC) / (b + tempC) + Math.log(rhPct / 100)
  return (b * alpha) / (a - alpha)
}

function visibilityKmFromCode(code: number | null, rainMm: number | null): number | null {
  if (rainMm != null && rainMm > 5) return 2
  if (rainMm != null && rainMm > 1) return 5
  if (code == null) return 10
  if (code >= 45 && code <= 48) return 3
  if (code >= 51) return 6
  return 15
}

function uvFromSolar(wm2: number | null): number | null {
  if (wm2 == null) return null
  return Math.max(0, Math.min(11, wm2 / 100))
}

function dailyRiskScore(tempMax: number | null, rain: number | null, wind: number | null): number {
  let risk = 0
  if (tempMax != null && tempMax >= 40) risk += 40
  else if (tempMax != null && tempMax >= 35) risk += 25
  if (rain != null && rain >= 50) risk += 30
  else if (rain != null && rain >= 25) risk += 15
  if (wind != null && wind >= 60) risk += 25
  return Math.max(0, 100 - risk)
}

function classifyDailyWeather(tempAvg: number | null, rain: number | null, wind: number | null): string {
  if (rain != null && rain >= 25) return 'Heavy Rain'
  if (rain != null && rain >= 5) return 'Rainy'
  if (tempAvg != null && tempAvg >= 35) return 'Hot'
  if (wind != null && wind >= 50) return 'Windy'
  if (tempAvg != null && tempAvg <= 10) return 'Cool'
  return 'Fair'
}

function severityFromDelta(pct: number | null): ChangeSeverity {
  const a = Math.abs(pct ?? 0)
  if (a >= 80) return 'Critical'
  if (a >= 50) return 'Severe'
  if (a >= 25) return 'High'
  if (a >= 10) return 'Moderate'
  return 'Low'
}

function buildHourlyRaw(hourly: OpenMeteoHourlyPoint[]): HourlyRawRow[] {
  return hourly.map(h => {
    const date = h.time.slice(0, 10)
    const time = h.time.length >= 16 ? h.time.slice(11, 16) : h.time
    const temp = h.temperatureC
    const rh = h.humidityPct
    return {
      date,
      time,
      temperatureC: temp,
      humidityPct: rh,
      rainfallMm: h.precipitationMm,
      windSpeedKmh: h.windSpeedKmh,
      windDirectionDeg: h.windDirectionDeg,
      pressureHpa: h.pressureHpa,
      solarRadiationWm2: h.shortwaveRadiationWm2,
      cloudCoverPct: cloudFromWeatherCode(h.weatherCode),
      et0Mm: h.et0Mm,
      uvIndex: uvFromSolar(h.shortwaveRadiationWm2),
      dewPointC: temp != null && rh != null ? round(dewPointC(temp, rh), 1) : null,
      visibilityKm: visibilityKmFromCode(h.weatherCode, h.precipitationMm),
    }
  })
}

function round(n: number, d = 1): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

function buildDailySummary(hourly: OpenMeteoHourlyPoint[]): DailySummaryRow[] {
  const daily = aggregateDailyFromHourly(hourly)
  return daily.map(d => {
    const dayHours = hourly.filter(h => h.time.startsWith(d.date))
    const clouds = finite(dayHours.map(h => cloudFromWeatherCode(h.weatherCode)))
    const riskScore = dailyRiskScore(d.tempMaxC, d.rainfallMm, d.windSpeedKmh)
    const riskLevel = classifyScore(riskScore)
    return {
      date: d.date,
      tempMinC: d.tempMinC,
      tempMaxC: d.tempMaxC,
      tempAvgC: d.tempAvgC,
      totalRainfallMm: d.rainfallMm,
      avgHumidityPct: d.humidityPct,
      avgWindSpeedKmh: d.windSpeedKmh,
      avgPressureHpa: d.pressureHpa,
      avgSolarRadiationWm2: d.solarRadiationWm2,
      avgCloudCoverPct: mean(clouds) != null ? round(mean(clouds)!, 0) : null,
      dailyEt0Mm: d.et0Mm,
      weatherClassification: classifyDailyWeather(d.tempAvgC, d.rainfallMm, d.windSpeedKmh),
      weatherRiskLevel: riskLevel,
      statusMap: buildStatusMap(riskScore),
    }
  })
}

function buildMonthlySummary(daily: DailySummaryRow[]): MonthlySummaryRow[] {
  const byMonth = new Map<string, DailySummaryRow[]>()
  daily.forEach(d => {
    const key = d.date.slice(0, 7)
    const arr = byMonth.get(key) ?? []
    arr.push(d)
    byMonth.set(key, arr)
  })
  const keys = [...byMonth.keys()].sort()
  const histTemp = mean(finite(daily.map(d => d.tempAvgC)))
  const histRain = mean(finite(daily.map(d => d.totalRainfallMm)))

  return keys.map((key, idx) => {
    const rows = byMonth.get(key) ?? []
    const temps = finite(rows.map(r => r.tempAvgC))
    const maxT = finite(rows.map(r => r.tempMaxC))
    const minT = finite(rows.map(r => r.tempMinC))
    const rains = finite(rows.map(r => r.totalRainfallMm))
    const prevKey = keys[idx - 1]
    const prevRows = prevKey ? byMonth.get(prevKey) ?? [] : []
    const prevRain = sum(finite(prevRows.map(r => r.totalRainfallMm)))
    const curRain = sum(rains)
    const changePct = prevRain > 0 ? ((curRain - prevRain) / prevRain) * 100 : null
    const avgT = mean(temps)
    const monthNum = Number(key.slice(5, 7))
    const season =
      monthNum >= 6 && monthNum <= 9 ? 'Summer' : monthNum >= 12 || monthNum <= 2 ? 'Winter' : 'Transitional'
    const anomaly =
      avgT != null && histTemp != null
        ? `${avgT - histTemp >= 0 ? '+' : ''}${round(avgT - histTemp, 1)} °C vs long-term`
        : '—'
    const score = dailyRiskScore(
      maxT.length ? Math.max(...maxT) : null,
      curRain,
      mean(finite(rows.map(r => r.avgWindSpeedKmh))),
    )
    return {
      monthKey: key,
      monthLabel: MONTH_LABELS[monthNum - 1] ?? key,
      avgTempC: avgT != null ? round(avgT, 2) : null,
      maxTempC: maxT.length ? round(Math.max(...maxT), 1) : null,
      minTempC: minT.length ? round(Math.min(...minT), 1) : null,
      totalRainfallMm: rains.length ? round(sum(rains), 1) : null,
      avgHumidityPct: mean(finite(rows.map(r => r.avgHumidityPct))) != null
        ? round(mean(finite(rows.map(r => r.avgHumidityPct)))!, 1)
        : null,
      avgWindSpeedKmh: mean(finite(rows.map(r => r.avgWindSpeedKmh))) != null
        ? round(mean(finite(rows.map(r => r.avgWindSpeedKmh)))!, 1)
        : null,
      avgSolarRadiationWm2: mean(finite(rows.map(r => r.avgSolarRadiationWm2))) != null
        ? round(mean(finite(rows.map(r => r.avgSolarRadiationWm2)))!, 0)
        : null,
      monthlyEt0Mm: sum(finite(rows.map(r => r.dailyEt0Mm))) || null,
      monthlyChangePct: changePct != null ? round(changePct, 1) : null,
      seasonalComparison: `${season} profile`,
      historicalAvgComparison:
        histRain != null && curRain != null
          ? `Rain ${curRain >= histRain * rows.length ? 'above' : 'below'} daily norm`
          : '—',
      climateAnomaly: anomaly,
      statusMap: buildStatusMap(score),
    }
  })
}

function buildStatistics(hourly: HourlyRawRow[]): StatMetricRow[] {
  const params: Array<{ name: string; values: number[] }> = [
    { name: 'Temperature (°C)', values: finite(hourly.map(h => h.temperatureC)) },
    { name: 'Relative Humidity (%)', values: finite(hourly.map(h => h.humidityPct)) },
    { name: 'Rainfall (mm)', values: finite(hourly.map(h => h.rainfallMm)) },
    { name: 'Wind Speed (km/h)', values: finite(hourly.map(h => h.windSpeedKmh)) },
    { name: 'Pressure (hPa)', values: finite(hourly.map(h => h.pressureHpa)) },
    { name: 'Solar Radiation (W/m²)', values: finite(hourly.map(h => h.solarRadiationWm2)) },
    { name: 'ET₀ (mm)', values: finite(hourly.map(h => h.et0Mm)) },
  ]
  return params.map(p => {
    const sorted = [...p.values].sort((a, b) => a - b)
    const m = mean(p.values)
    const med = sorted.length ? percentile(sorted, 0.5) : null
    const mn = sorted.length ? sorted[0] : null
    const mx = sorted.length ? sorted[sorted.length - 1] : null
    const slope =
      p.values.length >= 10
        ? p.values[p.values.length - 1]! - p.values[0]!
        : null
    return {
      parameter: p.name,
      count: p.values.length,
      mean: m != null ? round(m, 2) : null,
      median: med != null ? round(med, 2) : null,
      min: mn != null ? round(mn, 2) : null,
      max: mx != null ? round(mx, 2) : null,
      range: mn != null && mx != null ? round(mx - mn, 2) : null,
      stdDev: stdDev(p.values) != null ? round(stdDev(p.values)!, 2) : null,
      variance: stdDev(p.values) != null ? round(stdDev(p.values)! ** 2, 2) : null,
      p10: sorted.length ? round(percentile(sorted, 0.1), 2) : null,
      p50: med != null ? round(med, 2) : null,
      p90: sorted.length ? round(percentile(sorted, 0.9), 2) : null,
      trend:
        slope == null
          ? 'Insufficient data'
          : slope > 0.5
            ? 'Increasing'
            : slope < -0.5
              ? 'Decreasing'
              : 'Stable',
    }
  })
}

function comparePair(
  label: string,
  metric: string,
  current: number | null,
  previous: number | null,
): ComparisonRow {
  const diff = current != null && previous != null ? current - previous : null
  const pct = diff != null && previous != null && previous !== 0 ? (diff / previous) * 100 : null
  const cls = classifyComparison(pct)
  const dir: ComparisonRow['trendDirection'] =
    pct == null || Math.abs(pct) < 2 ? 'Flat' : pct > 0 ? 'Up' : 'Down'
  return {
    comparison: label,
    metric,
    currentValue: current,
    previousValue: previous,
    difference: diff != null ? round(diff, 2) : null,
    pctChange: pct != null ? round(pct, 1) : null,
    trendDirection: dir,
    performanceScore: pct != null ? round(50 + pct, 1) : null,
    classification: cls,
    aiExplanation: `${metric} ${cls.toLowerCase()} (${pct != null ? `${pct >= 0 ? '+' : ''}${round(pct, 1)}%` : 'n/a'}).`,
  }
}

function seasonLabel(monthNum: number): string {
  if (monthNum >= 12 || monthNum <= 2) return 'Winter'
  if (monthNum >= 3 && monthNum <= 5) return 'Spring'
  if (monthNum >= 6 && monthNum <= 8) return 'Summer'
  return 'Autumn'
}

function buildComparisons(daily: DailySummaryRow[], monthly: MonthlySummaryRow[]): ComparisonRow[] {
  const rows: ComparisonRow[] = []
  const last = daily[daily.length - 1]
  const prev = daily[daily.length - 2]
  if (last && prev) {
    rows.push(comparePair('Current Day vs Previous Day', 'Temperature', last.tempAvgC, prev.tempAvgC))
    rows.push(comparePair('Current Day vs Previous Day', 'Rainfall', last.totalRainfallMm, prev.totalRainfallMm))
  }
  const last7 = daily.slice(-7)
  const prev7 = daily.slice(-14, -7)
  if (last7.length && prev7.length) {
    rows.push(
      comparePair(
        'Current Week vs Previous Week',
        'Avg Temperature',
        mean(finite(last7.map(d => d.tempAvgC))),
        mean(finite(prev7.map(d => d.tempAvgC))),
      ),
    )
    rows.push(
      comparePair(
        'Current Week vs Previous Week',
        'Total Rainfall',
        sum(finite(last7.map(d => d.totalRainfallMm ?? 0))),
        sum(finite(prev7.map(d => d.totalRainfallMm ?? 0))),
      ),
    )
  }
  const lastM = monthly[monthly.length - 1]
  const prevM = monthly[monthly.length - 2]
  if (lastM && prevM) {
    rows.push(comparePair('Current Month vs Previous Month', 'Avg Temperature', lastM.avgTempC, prevM.avgTempC))
    rows.push(comparePair('Current Month vs Previous Month', 'Total Rainfall', lastM.totalRainfallMm, prevM.totalRainfallMm))
  }

  const byYear = new Map<number, DailySummaryRow[]>()
  daily.forEach(d => {
    const y = Number(d.date.slice(0, 4))
    if (!Number.isFinite(y)) return
    const arr = byYear.get(y) ?? []
    arr.push(d)
    byYear.set(y, arr)
  })
  const years = [...byYear.keys()].sort((a, b) => a - b)
  if (years.length >= 2) {
    const cy = years[years.length - 1]!
    const py = years[years.length - 2]!
    const curY = byYear.get(cy) ?? []
    const prevY = byYear.get(py) ?? []
    rows.push(
      comparePair(
        'Current Year vs Previous Year',
        'Avg Temperature',
        mean(finite(curY.map(d => d.tempAvgC))),
        mean(finite(prevY.map(d => d.tempAvgC))),
      ),
    )
    rows.push(
      comparePair(
        'Current Year vs Previous Year',
        'Total Rainfall',
        sum(finite(curY.map(d => d.totalRainfallMm ?? 0))),
        sum(finite(prevY.map(d => d.totalRainfallMm ?? 0))),
      ),
    )
  }

  if (lastM) {
    const monthPart = lastM.monthKey.slice(5, 7)
    const year = Number(lastM.monthKey.slice(0, 4))
    const smlyKey = `${year - 1}-${monthPart}`
    const smly = monthly.find(m => m.monthKey === smlyKey)
    if (smly) {
      rows.push(
        comparePair('Current Month vs Same Month Last Year', 'Avg Temperature', lastM.avgTempC, smly.avgTempC),
      )
      rows.push(
        comparePair('Current Month vs Same Month Last Year', 'Total Rainfall', lastM.totalRainfallMm, smly.totalRainfallMm),
      )
    }
    const season = seasonLabel(Number(monthPart))
    const seasonMonths = monthly.filter(m => seasonLabel(Number(m.monthKey.slice(5, 7))) === season)
    const prevSeasonMonths = seasonMonths.slice(0, Math.max(0, seasonMonths.length - 1))
    const curSeason = seasonMonths[seasonMonths.length - 1]
    const prevSeason = prevSeasonMonths[prevSeasonMonths.length - 1]
    if (curSeason && prevSeason) {
      rows.push(
        comparePair('Current Season vs Previous Season', 'Avg Temperature', curSeason.avgTempC, prevSeason.avgTempC),
      )
      rows.push(
        comparePair('Current Season vs Previous Season', 'Total Rainfall', curSeason.totalRainfallMm, prevSeason.totalRainfallMm),
      )
    }
  }

  const histTemp = mean(finite(daily.map(d => d.tempAvgC)))
  const histRain = mean(finite(daily.map(d => d.totalRainfallMm)))
  if (lastM && histTemp != null) {
    rows.push(comparePair('Current Period vs Long-Term Average', 'Temperature', lastM.avgTempC, histTemp))
    rows.push(comparePair('Current Period vs Long-Term Average', 'Rainfall', lastM.totalRainfallMm, histRain))
  }
  return rows
}

function buildIndicatorRows(
  executive: ReturnType<typeof buildWeatherIntelligenceExecutive>,
  daily: DailySummaryRow[],
  monthly: MonthlySummaryRow[],
): WeatherIndicatorRow[] {
  const histTemp = mean(finite(daily.map(d => d.tempAvgC)))
  const histRain = mean(finite(daily.map(d => d.totalRainfallMm)))
  const lastM = monthly[monthly.length - 1]
  const tempAnomaly = lastM?.avgTempC != null && histTemp != null ? lastM.avgTempC - histTemp : null
  const rainAnomaly =
    lastM?.totalRainfallMm != null && histRain != null && histRain > 0
      ? ((lastM.totalRainfallMm - histRain * 30) / (histRain * 30)) * 100
      : null

  const base = executive.agriculturalIndicators.map(row => {
    const score =
      row.indicator.includes('Stress') || row.indicator.includes('Dry')
        ? 100 - executive.cropStressIndex
        : executive.weatherRiskScore
    return {
      indicator: row.indicator,
      value: row.value,
      numericScore: score,
      classification: classifyScore(score),
      statusMap: buildStatusMap(score),
      interpretation: row.interpretation,
    }
  })

  const extras: WeatherIndicatorRow[] = [
    {
      indicator: 'Rainfall Anomaly',
      value: rainAnomaly != null ? `${rainAnomaly >= 0 ? '+' : ''}${round(rainAnomaly, 1)}%` : '—',
      numericScore: rainAnomaly != null ? Math.max(0, 100 - Math.abs(rainAnomaly)) : 50,
      classification: classifyScore(rainAnomaly != null ? 50 - Math.abs(rainAnomaly) / 3 : 50),
      statusMap: buildStatusMap(rainAnomaly != null ? Math.max(0, 100 - Math.abs(rainAnomaly)) : 50),
      interpretation: 'Deviation of latest month rainfall from long-term daily norm.',
    },
    {
      indicator: 'Temperature Anomaly',
      value: tempAnomaly != null ? `${tempAnomaly >= 0 ? '+' : ''}${round(tempAnomaly, 1)} °C` : '—',
      numericScore: executive.weatherRiskScore,
      classification: classifyScore(tempAnomaly != null ? 100 - Math.abs(tempAnomaly) * 15 : 50),
      statusMap: buildStatusMap(tempAnomaly != null ? 100 - Math.abs(tempAnomaly) * 15 : 50),
      interpretation: 'Latest monthly temperature vs historical daily mean.',
    },
    {
      indicator: 'Weather Risk Index',
      value: `${executive.weatherRiskScore}/100`,
      numericScore: executive.weatherRiskScore,
      classification: mapRiskBand(executive.weatherRiskBand),
      statusMap: buildStatusMap(executive.weatherRiskScore),
      interpretation: executive.weatherRiskLabel,
    },
    {
      indicator: 'Crop Water Stress Index',
      value: `${executive.cropStressIndex}/100`,
      numericScore: 100 - executive.cropStressIndex,
      classification: mapRiskBand(executive.cropStressBand),
      statusMap: buildStatusMap(100 - executive.cropStressIndex),
      interpretation: 'Composite crop water and heat stress score.',
    },
  ]

  const names = new Set(base.map(b => b.indicator))
  return [...base, ...extras.filter(e => !names.has(e.indicator))]
}

function buildChangeEvents(payload: WeatherClimateReportPayload, daily: DailySummaryRow[]): ChangeEventRow[] {
  const events: ChangeEventRow[] = payload.extremeEvents.map(e => {
    const pct = e.durationDays > 0 ? e.durationDays * 10 : null
    const sev = severityFromDelta(pct)
    const score =
      sev === 'Critical' ? 10 : sev === 'Severe' ? 25 : sev === 'High' ? 40 : sev === 'Moderate' ? 60 : 80
    return {
      parameter: e.type,
      eventType: e.type,
      startDate: e.startDate,
      endDate: e.endDate,
      previousValue: null,
      currentValue: e.durationDays,
      difference: e.durationDays,
      pctChange: pct,
      severity: sev,
      statusMap: buildStatusMap(score),
    }
  })
  if (daily.length >= 2) {
    const last = daily[daily.length - 1]!
    const prev = daily[daily.length - 2]!
    if (last.tempMaxC != null && prev.tempMaxC != null && last.tempMaxC - prev.tempMaxC >= 5) {
      const pct = ((last.tempMaxC - prev.tempMaxC) / prev.tempMaxC) * 100
      events.push({
        parameter: 'Temperature',
        eventType: 'Sudden warming',
        startDate: prev.date,
        endDate: last.date,
        previousValue: prev.tempMaxC,
        currentValue: last.tempMaxC,
        difference: round(last.tempMaxC - prev.tempMaxC, 1),
        pctChange: round(pct, 1),
        severity: severityFromDelta(pct),
        statusMap: buildStatusMap(40),
      })
    }
  }
  return events.slice(0, 30)
}

function buildWindRose(hourly: OpenMeteoHourlyPoint[]): EnterpriseWeatherModel['windRose'] {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const counts = new Array(8).fill(0)
  let total = 0
  hourly.forEach(h => {
    if (h.windDirectionDeg == null) return
    const idx = Math.round(h.windDirectionDeg / 45) % 8
    counts[idx] += 1
    total += 1
  })
  return dirs.map((direction, i) => ({
    direction,
    frequencyPct: total > 0 ? round((counts[i] / total) * 100, 1) : 0,
  }))
}

function buildHeatmap(daily: DailySummaryRow[]): EnterpriseWeatherModel['heatmapMatrix'] {
  const months = MONTH_LABELS.map(m => m.slice(0, 3))
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  const values: Array<number | null> = []
  months.forEach((_, mi) => {
    days.forEach(day => {
      const match = daily.find(d => {
        const m = Number(d.date.slice(5, 7)) - 1
        const dd = Number(d.date.slice(8, 10))
        return m === mi && dd === day
      })
      values.push(match?.tempAvgC ?? null)
    })
  })
  return { months, days, values }
}

export function buildEnterpriseWeatherModel(payload: WeatherClimateReportPayload): EnterpriseWeatherModel {
  const hourlyRaw = buildHourlyRaw(payload.hourlyRecords)
  const dailySummary = buildDailySummary(payload.hourlyRecords)
  const monthlySummary = buildMonthlySummary(dailySummary)
  const statistics = buildStatistics(hourlyRaw)
  const comparisons = buildComparisons(dailySummary, monthlySummary)
  const changeEvents = buildChangeEvents(payload, dailySummary)
  const executive = buildWeatherIntelligenceExecutive(payload)

  const indicators = buildIndicatorRows(executive, dailySummary, monthlySummary)
  const climateTimeline: ClimateTimelinePoint[] = monthlySummary.map(m => ({
    period: m.monthLabel,
    avgTempC: m.avgTempC,
    totalRainMm: m.totalRainfallMm,
  }))

  const lastD = dailySummary[dailySummary.length - 1]
  const prevD = dailySummary[dailySummary.length - 2]
  const mkKpi = (
    label: string,
    cur: number | null,
    prev: number | null,
    fmt: (n: number) => string,
  ): ExecutiveKpiCard => {
    const diff = cur != null && prev != null ? cur - prev : null
    const pct = diff != null && prev != null && prev !== 0 ? (diff / prev) * 100 : null
    const score = classifyScore(executive.weatherRiskScore)
    return {
      label,
      currentValue: cur != null ? fmt(cur) : '—',
      previousValue: prev != null ? fmt(prev) : '—',
      difference: diff != null ? fmt(diff) : '—',
      pctChange: pct != null ? `${pct >= 0 ? '+' : ''}${round(pct, 1)}%` : '—',
      trendArrow: pct == null || Math.abs(pct) < 2 ? '→' : pct > 0 ? '↑' : '↓',
      colorStatus: score,
      statusMap: buildStatusMap(executive.weatherRiskScore),
    }
  }

  const executiveKpis: ExecutiveKpiCard[] = [
    mkKpi('Average Temperature', lastD?.tempAvgC ?? null, prevD?.tempAvgC ?? null, n => `${round(n, 1)} °C`),
    mkKpi('Maximum Temperature', lastD?.tempMaxC ?? null, prevD?.tempMaxC ?? null, n => `${round(n, 1)} °C`),
    mkKpi('Minimum Temperature', lastD?.tempMinC ?? null, prevD?.tempMinC ?? null, n => `${round(n, 1)} °C`),
    mkKpi('Total Rainfall', lastD?.totalRainfallMm ?? null, prevD?.totalRainfallMm ?? null, n => `${round(n, 1)} mm`),
    mkKpi('Relative Humidity', lastD?.avgHumidityPct ?? null, prevD?.avgHumidityPct ?? null, n => `${round(n, 0)} %`),
    mkKpi('Wind Speed', lastD?.avgWindSpeedKmh ?? null, prevD?.avgWindSpeedKmh ?? null, n => `${round(n, 1)} km/h`),
    mkKpi('Solar Radiation', lastD?.avgSolarRadiationWm2 ?? null, prevD?.avgSolarRadiationWm2 ?? null, n => `${round(n, 0)} W/m²`),
    mkKpi('ET₀', lastD?.dailyEt0Mm ?? null, prevD?.dailyEt0Mm ?? null, n => `${round(n, 1)} mm`),
    {
      label: 'Weather Risk Score',
      currentValue: `${executive.weatherRiskScore}/100`,
      previousValue: '—',
      difference: '—',
      pctChange: '—',
      trendArrow: '→',
      colorStatus: mapRiskBand(executive.weatherRiskBand),
      statusMap: buildStatusMap(executive.weatherRiskScore),
    },
    {
      label: 'Heat Stress Index',
      currentValue: `${executive.cropStressIndex}/100`,
      previousValue: '—',
      difference: '—',
      pctChange: '—',
      trendArrow: '→',
      colorStatus: mapRiskBand(executive.cropStressBand),
      statusMap: buildStatusMap(100 - executive.cropStressIndex),
    },
    {
      label: 'Drought Level',
      currentValue: executive.agriculturalIndicators.find(i => i.indicator.includes('Drought'))?.value ?? '—',
      previousValue: '—',
      difference: '—',
      pctChange: '—',
      trendArrow: '→',
      colorStatus: classifyScore(100 - executive.cropStressIndex),
      statusMap: buildStatusMap(100 - executive.cropStressIndex),
    },
  ]

  const tempSeries = finite(hourlyRaw.map(h => h.temperatureC))
  const rainSeries = finite(hourlyRaw.map(h => h.rainfallMm ?? 0))
  const humidSeries = finite(hourlyRaw.map(h => h.humidityPct))
  const correlations = [
    { a: 'Temperature', b: 'Humidity', r: pearson(tempSeries, humidSeries) },
    { a: 'Temperature', b: 'Rainfall', r: pearson(tempSeries, rainSeries) },
    { a: 'Humidity', b: 'Rainfall', r: pearson(humidSeries, rainSeries) },
  ].map(c => ({ ...c, r: c.r != null ? round(c.r, 3) : null }))

  return {
    title: `Weather Intelligence Report — ${payload.aoiName}`,
    locationLine: `${payload.aoiLocation} · ${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)} · ${payload.analysisStart} → ${payload.analysisEnd}`,
    sourceLine: `${payload.dataSource} · Extracted ${payload.extractionDate.slice(0, 10)} · ${payload.climateClassification}`,
    hourlyRaw,
    dailySummary,
    monthlySummary,
    statistics,
    correlations,
    comparisons,
    changeEvents,
    indicators,
    executiveKpis,
    executiveSummary: {
      overallConditions: executive.executiveNarrative,
      keyFindings: executive.keyInsights,
      comparisonResults: comparisons.map(c => c.aiExplanation),
      changeDetection: changeEvents.slice(0, 5).map(e => `${e.eventType}: ${e.severity} (${e.startDate})`),
      agriculturalImpact: payload.impactAssessment.bullets,
      riskAssessment: `${executive.weatherRiskLabel} · Overall impact: ${payload.impactAssessment.overallImpact}`,
      aiRecommendations: executive.aiRecommendations,
    },
    windRose: buildWindRose(payload.hourlyRecords),
    heatmapMatrix: buildHeatmap(dailySummary),
    climateTimeline,
  }
}
