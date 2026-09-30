import type { WeatherClimateReportPayload, WeatherDailyRecord } from './weatherClimateReportTypes'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'

export type WeatherRiskBand = 'Excellent' | 'Good' | 'Moderate Risk' | 'High Risk' | 'Critical'

export type WeatherExecutiveKpi = {
  label: string
  value: string
  icon: string
}

export type AgriculturalIndicatorRow = {
  indicator: string
  value: string
  interpretation: string
}

export type WeatherIntelligenceExecutive = {
  kpis: WeatherExecutiveKpi[]
  agriculturalIndicators: AgriculturalIndicatorRow[]
  weatherRiskScore: number
  weatherRiskBand: WeatherRiskBand
  weatherRiskLabel: string
  cropStressIndex: number
  cropStressBand: WeatherRiskBand
  currentConditions: Array<[string, string]>
  riskAlerts: string[]
  aiRecommendations: string[]
  keyInsights: string[]
  forecastSummary: string
  executiveNarrative: string
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

function fmt(n: number | null | undefined, digits = 1, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}${suffix}`
}

export function weatherRiskBandFromScore(score: number): WeatherRiskBand {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Moderate Risk'
  if (score >= 20) return 'High Risk'
  return 'Critical'
}

export function weatherRiskBandEmoji(band: WeatherRiskBand): string {
  switch (band) {
    case 'Excellent':
      return '🟢'
    case 'Good':
      return '🟡'
    case 'Moderate Risk':
      return '🟠'
    case 'High Risk':
      return '🔴'
    case 'Critical':
      return '⚫'
  }
}

function computeGdd(daily: WeatherDailyRecord[], baseC = 10): number {
  return daily.reduce((acc, d) => {
    const tmax = d.tempMaxC ?? d.tempAvgC
    const tmin = d.tempMinC ?? d.tempAvgC
    if (tmax == null || tmin == null) return acc
    return acc + Math.max(0, (tmax + tmin) / 2 - baseC)
  }, 0)
}

function computeHeatIndexC(tempC: number, rhPct: number): number {
  const tF = tempC * 1.8 + 32
  const hiF =
    -42.379 +
    2.04901523 * tF +
    10.14333127 * rhPct -
    0.22475541 * tF * rhPct -
    0.00683783 * tF * tF -
    0.05481717 * rhPct * rhPct +
    0.00122874 * tF * tF * rhPct +
    0.00085282 * tF * rhPct * rhPct -
    0.00000199 * tF * tF * rhPct * rhPct
  return (hiF - 32) / 1.8
}

function computeVpdKpa(tempC: number, rhPct: number): number {
  const es = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
  const ea = es * (rhPct / 100)
  return Math.max(0, es - ea)
}

function consecutiveStreaks(daily: WeatherDailyRecord[]): { cdd: number; cwd: number } {
  let maxCdd = 0
  let maxCwd = 0
  let cdd = 0
  let cwd = 0
  daily.forEach(d => {
    const rain = d.rainfallMm ?? 0
    if (rain < 1) {
      cdd += 1
      cwd = 0
      maxCdd = Math.max(maxCdd, cdd)
    } else {
      cwd += 1
      cdd = 0
      maxCwd = Math.max(maxCwd, cwd)
    }
  })
  return { cdd: maxCdd, cwd: maxCwd }
}

function simplifiedSpi(daily: WeatherDailyRecord[]): number | null {
  const rains = finite(daily.map(d => d.rainfallMm))
  if (rains.length < 30) return null
  const mu = mean(rains)!
  const sigma = Math.sqrt(sum(rains.map(v => (v - mu) ** 2)) / rains.length)
  if (sigma === 0) return 0
  const recent = rains.slice(-30)
  const recentSum = sum(recent)
  const expected = mu * recent.length
  return (recentSum - expected) / (sigma * Math.sqrt(recent.length))
}

function riskLevelScore(level: string): number {
  switch (level) {
    case 'Extreme':
      return 0.15
    case 'High':
      return 0.35
    case 'Moderate':
      return 0.6
    default:
      return 0.85
  }
}

export function buildWeatherIntelligenceExecutive(
  payload: WeatherClimateReportPayload,
): WeatherIntelligenceExecutive {
  const daily = payload.dailyRecords
  const avgTemps = finite(daily.map(d => d.tempAvgC))
  const maxTemps = finite(daily.map(d => d.tempMaxC))
  const minTemps = finite(daily.map(d => d.tempMinC))
  const rains = finite(daily.map(d => d.rainfallMm))
  const humid = finite(daily.map(d => d.humidityPct))
  const winds = finite(daily.map(d => d.windSpeedKmh))
  const solar = finite(daily.map(d => d.solarRadiationWm2))
  const et0 = finite(daily.map(d => d.et0Mm))

  const avgTemp = mean(avgTemps)
  const avgHumid = mean(humid)
  const avgWind = mean(winds)
  const avgSolar = mean(solar)
  const totalRain = rains.length ? sum(rains) : null
  const totalEt0 = et0.length ? sum(et0) : null
  const gdd = computeGdd(daily)
  const heatStressDays = maxTemps.filter(t => t >= 35).length
  const frostRiskDays = minTemps.filter(t => t <= 2).length
  const { cdd, cwd } = consecutiveStreaks(daily)
  const spi = simplifiedSpi(daily)
  const avgHeatIndex =
    avgTemp != null && avgHumid != null ? computeHeatIndexC(avgTemp, avgHumid) : null
  const avgVpd =
    avgTemp != null && avgHumid != null ? computeVpdKpa(avgTemp, avgHumid) : null
  const soilMoistureProxy =
    totalRain != null && totalEt0 != null && totalEt0 > 0
      ? Math.max(0, Math.min(100, (totalRain / totalEt0) * 50))
      : null
  const droughtIndex =
    spi != null
      ? spi >= 0.5
        ? 'Wet'
        : spi >= -0.5
          ? 'Normal'
          : spi >= -1.5
            ? 'Moderate drought'
            : 'Severe drought'
      : 'Insufficient data'

  const riskScores = payload.climateRisks.map(r => riskLevelScore(r.level))
  const avgRiskFactor = riskScores.length ? mean(riskScores)! : 0.7
  const eventPenalty = Math.min(0.35, payload.extremeEvents.length * 0.04)
  const impactPenalty =
    payload.impactAssessment.overallImpact === 'High'
      ? 0.25
      : payload.impactAssessment.overallImpact === 'Medium'
        ? 0.12
        : 0
  const weatherRiskScore = Math.round(
    Math.max(0, Math.min(100, avgRiskFactor * 100 - eventPenalty * 100 - impactPenalty * 100)),
  )
  const weatherRiskBand = weatherRiskBandFromScore(weatherRiskScore)

  const cropStressRaw =
    (heatStressDays / Math.max(1, daily.length)) * 40 +
    (frostRiskDays / Math.max(1, daily.length)) * 20 +
    (spi != null && spi < -0.5 ? 25 : 0) +
    (avgVpd != null && avgVpd > 2 ? 15 : 0)
  const cropStressIndex = Math.round(Math.max(0, Math.min(100, cropStressRaw)))
  const cropStressBand = weatherRiskBandFromScore(100 - cropStressIndex)

  const kpis: WeatherExecutiveKpi[] = [
    { icon: '🌡️', label: 'Average Temperature', value: fmt(avgTemp, 1, ' °C') },
    { icon: '🌧️', label: 'Total Rainfall', value: fmt(totalRain, 0, ' mm') },
    { icon: '💧', label: 'Average Relative Humidity', value: fmt(avgHumid, 0, ' %') },
    { icon: '🌬️', label: 'Average Wind Speed', value: fmt(avgWind, 1, ' km/h') },
    { icon: '☀️', label: 'Solar Radiation', value: fmt(avgSolar, 0, ' W/m²') },
    { icon: '🌫️', label: 'Evapotranspiration (ET₀)', value: fmt(totalEt0, 0, ' mm') },
    { icon: '🌡️', label: 'Heat Index', value: fmt(avgHeatIndex, 1, ' °C') },
    { icon: '❄️', label: 'Growing Degree Days (GDD)', value: fmt(gdd, 0) },
    {
      icon: '⚠️',
      label: 'Weather Risk Score',
      value: `${weatherRiskScore}/100 (${weatherRiskBand})`,
    },
    {
      icon: '🌱',
      label: 'Crop Stress Index',
      value: `${cropStressIndex}/100 (${cropStressBand})`,
    },
  ]

  const agriculturalIndicators: AgriculturalIndicatorRow[] = [
    {
      indicator: 'Growing Degree Days (GDD)',
      value: fmt(gdd, 0),
      interpretation: gdd >= 1500 ? 'Favorable cumulative heat for most crops' : 'Limited thermal accumulation',
    },
    {
      indicator: 'Reference Evapotranspiration (FAO-56 ET₀)',
      value: fmt(totalEt0, 0, ' mm'),
      interpretation: 'Cumulative atmospheric water demand over analysis window',
    },
    {
      indicator: 'Vapor Pressure Deficit (VPD)',
      value: fmt(avgVpd, 2, ' kPa'),
      interpretation:
        avgVpd != null && avgVpd > 2 ? 'Elevated transpiration stress' : 'Moderate canopy moisture demand',
    },
    {
      indicator: 'Soil Moisture Index (proxy)',
      value: soilMoistureProxy != null ? `${soilMoistureProxy.toFixed(0)}/100` : '—',
      interpretation: 'Rainfall-to-ET₀ balance indicator (simplified)',
    },
    {
      indicator: 'Drought Index (SPI proxy)',
      value: spi != null ? `${spi.toFixed(2)} (${droughtIndex})` : droughtIndex,
      interpretation: '30-day standardized precipitation index approximation',
    },
    {
      indicator: 'Frost Risk Index',
      value: `${frostRiskDays} day(s) ≤ 2 °C`,
      interpretation: frostRiskDays > 0 ? 'Monitor frost-sensitive crops' : 'Low frost exposure',
    },
    {
      indicator: 'Heat Stress Days',
      value: `${heatStressDays} day(s) ≥ 35 °C`,
      interpretation: heatStressDays > 5 ? 'Irrigation and shade protocols advised' : 'Manageable heat load',
    },
    {
      indicator: 'Consecutive Dry Days (CDD)',
      value: String(cdd),
      interpretation: cdd >= 14 ? 'Extended dry spell — water budgeting critical' : 'Within typical variability',
    },
    {
      indicator: 'Consecutive Wet Days (CWD)',
      value: String(cwd),
      interpretation: cwd >= 7 ? 'Prolonged wet period — disease scouting recommended' : 'Normal wet spell profile',
    },
  ]

  const lastDay = daily[daily.length - 1]
  const currentConditions: Array<[string, string]> = [
    ['Location', `${payload.aoiName} · ${payload.aoiLocation}`],
    ['Coordinates', `${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}`],
    ['Climate zone', payload.climateClassification],
    ['Latest record', lastDay?.date ?? payload.analysisEnd],
    ['Temperature (avg)', fmt(lastDay?.tempAvgC, 1, ' °C')],
    ['Rainfall (day)', fmt(lastDay?.rainfallMm, 1, ' mm')],
    ['Humidity', fmt(lastDay?.humidityPct, 0, ' %')],
    ['Wind', fmt(lastDay?.windSpeedKmh, 1, ' km/h')],
    ['Solar radiation', fmt(lastDay?.solarRadiationWm2, 0, ' W/m²')],
    ['ET₀ (day)', fmt(lastDay?.et0Mm, 1, ' mm')],
  ]

  const riskAlerts = [
    ...payload.climateRisks.map(r => `${r.riskType}: ${r.level} — ${r.description}`),
    ...payload.extremeEvents.slice(0, 5).map(
      e => `${e.type} (${e.startDate}${e.endDate !== e.startDate ? ` – ${e.endDate}` : ''}): ${e.description}`,
    ),
  ]

  const forecast2050 = payload.forecastRows.find(r => r.year === 2050)
  const aiRecommendations = [
    payload.impactAssessment.agriculturalImpact,
    ...payload.impactAssessment.bullets,
    avgVpd != null && avgVpd > 2
      ? 'Schedule irrigation during peak VPD windows to reduce crop water stress.'
      : 'Maintain routine soil moisture monitoring aligned with crop phenology.',
    heatStressDays > 3
      ? 'Deploy heat-mitigation measures (mulch, misting, adjusted planting dates).'
      : 'Continue standard field operations with seasonal vigilance.',
    spi != null && spi < -0.5
      ? 'Activate drought contingency plans and prioritize water-efficient cultivars.'
      : 'Rainfall balance supports standard agronomic planning.',
  ]

  const keyInsights = [
    ...payload.executiveSummary.mainFindings.slice(0, 4),
    payload.temperatureTrend.narrative,
    payload.rainfallTrend.narrative,
    `Aggregation: ${climateAggregationLabel(payload.timeAggregation)} · ${payload.historicalCoverageYears.toFixed(1)} yr coverage`,
  ]

  const forecastSummary = forecast2050
    ? `Trend projection to 2050: temperature ${forecast2050.tempChangeC != null ? `${forecast2050.tempChangeC >= 0 ? '+' : ''}${forecast2050.tempChangeC} °C` : '—'}, rainfall ${forecast2050.rainfallChangePct != null ? `${forecast2050.rainfallChangePct >= 0 ? '+' : ''}${forecast2050.rainfallChangePct}%` : '—'} (${forecast2050.confidence} confidence).`
    : 'Insufficient multi-year record for robust 2050 climate projection.'

  const executiveNarrative = [
    `This Weather Intelligence Report summarizes ${daily.length} daily records from ${payload.analysisStart} to ${payload.analysisEnd} for ${payload.aoiName}.`,
    `Climate classification: ${payload.climateClassification}. Overall agricultural impact: ${payload.impactAssessment.overallImpact}.`,
    `${weatherRiskBandEmoji(weatherRiskBand)} Weather Risk Score ${weatherRiskScore}/100 (${weatherRiskBand}). Crop Stress Index ${cropStressIndex}/100.`,
    payload.executiveSummary.environmentalRiskSummary,
    forecastSummary,
  ].join(' ')

  return {
    kpis,
    agriculturalIndicators,
    weatherRiskScore,
    weatherRiskBand,
    weatherRiskLabel: `${weatherRiskBandEmoji(weatherRiskBand)} ${weatherRiskScore}/100 — ${weatherRiskBand}`,
    cropStressIndex,
    cropStressBand,
    currentConditions,
    riskAlerts,
    aiRecommendations,
    keyInsights,
    forecastSummary,
    executiveNarrative,
  }
}
