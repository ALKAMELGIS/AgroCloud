import type { WeatherClimateReportPayload } from './weatherClimateReportTypes'
import { climateAggregationLabel } from './weatherClimateAnalysisEngine'
import {
  buildWeatherIntelligenceExecutive,
  type WeatherIntelligenceExecutive,
} from './weatherIntelligenceExecutive'

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

  const model: WeatherIntelligenceDocxModel = {
    title: 'WEATHER INTELLIGENCE REPORT',
    subtitle: 'Decision-Ready Climate & Agricultural Assessment',
    generatedBy: 'AgroCloud Platform',
    generatedStamp: new Date().toISOString(),
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
  }

  return { model, images: [] }
}
