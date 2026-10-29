import type { DocxNativeChartSpec } from '../../temporal-analysis/timeSeriesReport/timeSeriesDocxNativeCharts'
import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'
import {
  buildWeatherClimateDocxAnalytics,
  type ClimateVariableStatRow,
} from './weatherClimateDocxAnalytics'
import {
  buildWeatherIntelligenceExecutive,
  type WeatherIntelligenceExecutive,
} from './weatherIntelligenceExecutive'
import {
  formatWeatherReportIssueDate,
  formatWeatherReportPeriodLabel,
  formatWeatherCoordinatesLabel,
  formatWeatherRiskBandShort,
} from './weatherIntelligenceDocxLayout'

export type DocxImageAsset = {
  rId: string
  fileName: string
  base64: string
}

export type WeatherIntelligenceDocxModel = {
  title: string
  subtitle: string
  generatedBy: string
  generatedStamp: string
  aoiName: string
  aoiLocation: string
  periodLabel: string
  aggregationLabel: string
  dataSource: string
  executive: WeatherIntelligenceExecutive
  extremeEventRows: string[][]
  forecastRows: string[][]
  trendSummaryRows: string[][]
  statisticalAnalysis: {
    methodologyNote: string
    trendResolution: 'daily' | 'monthly'
    variableStats: ClimateVariableStatRow[]
    periodTrendHeaders: string[]
    periodTrendRows: string[][]
  }
  nativeCharts: DocxNativeChartSpec[]
  keyFindings: string[]
  executiveKpiCards: Array<{ label: string; value: string; subValue?: string }>
  formattedPeriodLabel: string
  issueDateLabel: string
  coordinatesLabel: string
  siteLocationLine: string
  docxExecutiveOpening: string
  dailyRecordCount: number
  seriesYear: string
  climateClassification: string
  currentSnapshotMetrics: Array<{ label: string; value: string }>
}

function buildWeatherKeyFindings(
  payload: WeatherClimateReportPayload,
  executive: WeatherIntelligenceExecutive,
): string[] {
  const heat = payload.climateRisks.find(r => r.riskType === 'Heat Stress')
  const drought = payload.climateRisks.find(r => r.riskType === 'Drought Risk')
  const flood = payload.climateRisks.find(r => r.riskType === 'Flood Risk')
  return [
    `Weather Risk Score: ${executive.weatherRiskScore}/100 — ${executive.weatherRiskBand} · Crop Stress Index: ${executive.cropStressIndex}/100`,
    `Heat Stress: ${heat?.level ?? '—'} · Drought Risk: ${drought?.level ?? '—'} · Flood Risk: ${flood?.level ?? '—'}`,
    executive.forecastSummary,
  ]
}

function buildExecutiveKpiCards(executive: WeatherIntelligenceExecutive): Array<{ label: string; value: string; subValue?: string }> {
  const cards = executive.kpis
    .filter(k => !/weather risk score|crop stress index/i.test(k.label))
    .map(k => ({
      label: k.label
        .replace('Average ', 'Avg ')
        .replace('Relative Humidity', 'Rel. Humidity')
        .replace('Evapotranspiration (ET₀)', 'Evapotransp. (ET₀)')
        .replace('Growing Degree Days (GDD)', 'Growing Deg. Days')
        .replace('Average Wind Speed', 'Avg Wind Speed'),
      value: k.value,
    }))
  cards.push(
    {
      label: 'Weather Risk Score',
      value: `${executive.weatherRiskScore} /100`,
      subValue: formatWeatherRiskBandShort(executive.weatherRiskBand),
    },
    {
      label: 'Crop Stress Index',
      value: `${executive.cropStressIndex} /100`,
      subValue: formatWeatherRiskBandShort(executive.cropStressBand),
    },
  )
  return cards
}

function buildCurrentSnapshotMetrics(
  executive: WeatherIntelligenceExecutive,
): Array<{ label: string; value: string }> {
  const pick = (prefix: string) =>
    executive.currentConditions.find(([k]) => k.toLowerCase().startsWith(prefix.toLowerCase()))?.[1] ?? '—'
  return [
    { label: 'Temperature (avg)', value: pick('Temperature') },
    { label: 'Rainfall (day)', value: pick('Rainfall') },
    { label: 'Humidity', value: pick('Humidity') },
    { label: 'Wind', value: pick('Wind speed') },
    { label: 'Solar radiation', value: pick('Sunlight (shortwave)') },
    { label: 'ET₀ (day)', value: pick('ET₀') },
  ]
}

export function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

export async function buildWeatherIntelligenceDocxModel(
  payload: WeatherClimateReportPayload,
): Promise<{ model: WeatherIntelligenceDocxModel; images: DocxImageAsset[] }> {
  const executive = buildWeatherIntelligenceExecutive(payload)
  const analytics = buildWeatherClimateDocxAnalytics(payload)
  const generatedStamp = new Date().toISOString()

  const formattedPeriodLabel = formatWeatherReportPeriodLabel(payload.analysisStart, payload.analysisEnd)
  const coordinatesLabel = formatWeatherCoordinatesLabel(payload.lat, payload.lng)
  const siteLocationLine = `${payload.aoiLocation}  ·  ${coordinatesLabel}`
  const dailyRecordCount = payload.dailyRecords.filter(
    d => d.date >= payload.analysisStart.slice(0, 10) && d.date <= payload.analysisEnd.slice(0, 10),
  ).length

  const model: WeatherIntelligenceDocxModel = {
    title: 'WEATHER INTELLIGENCE REPORT',
    subtitle: 'Decision-Ready Climate & Agricultural Assessment',
    generatedBy: 'Elite Agro Projects',
    generatedStamp,
    aoiName: payload.aoiName,
    aoiLocation: payload.aoiLocation,
    periodLabel: `${payload.analysisStart} → ${payload.analysisEnd}`,
    aggregationLabel: climateAggregationLabel(payload.timeAggregation),
    dataSource: payload.dataSource,
    executive,
    extremeEventRows: payload.extremeEvents.slice(0, 8).map(e => [
      e.type,
      e.startDate,
      e.endDate,
      String(e.durationDays),
      e.description,
    ]),
    forecastRows: payload.forecastRows
      .filter((_, i) => i % 5 === 0 || i === payload.forecastRows.length - 1)
      .slice(0, 12)
      .map(r => [
        String(r.year),
        r.predictedTempC != null ? r.predictedTempC.toFixed(1) : '—',
        r.tempChangeC != null ? `${r.tempChangeC >= 0 ? '+' : ''}${r.tempChangeC}` : '—',
        r.predictedRainfallMm != null ? r.predictedRainfallMm.toFixed(0) : '—',
        r.rainfallChangePct != null ? `${r.rainfallChangePct >= 0 ? '+' : ''}${r.rainfallChangePct}%` : '—',
        r.confidence,
      ]),
    trendSummaryRows: [
      ['Temperature trend', payload.temperatureTrend.narrative || 'See in-app Time History charts.'],
      ['Rainfall trend', payload.rainfallTrend.narrative || 'See in-app Time History charts.'],
      ['Climate classification', payload.climateClassification],
      ['Historical coverage', `${payload.historicalCoverageYears} years`],
    ],
    statisticalAnalysis: {
      methodologyNote: analytics.methodologyNote,
      trendResolution: analytics.trendResolution,
      variableStats: analytics.variableStats,
      periodTrendHeaders: analytics.periodTrendHeaders,
      periodTrendRows: analytics.periodTrendRows,
    },
    nativeCharts: analytics.nativeCharts,
    keyFindings: buildWeatherKeyFindings(payload, executive),
    executiveKpiCards: buildExecutiveKpiCards(executive),
    formattedPeriodLabel,
    issueDateLabel: formatWeatherReportIssueDate(generatedStamp),
    coordinatesLabel,
    siteLocationLine,
    docxExecutiveOpening: `This Weather Intelligence Report summarizes ${dailyRecordCount} daily records from ${formattedPeriodLabel} for ${payload.aoiName}.`,
    dailyRecordCount,
    seriesYear: payload.analysisEnd.slice(0, 4),
    climateClassification: payload.climateClassification,
    currentSnapshotMetrics: buildCurrentSnapshotMetrics(executive),
  }

  return { model, images: [] }
}
