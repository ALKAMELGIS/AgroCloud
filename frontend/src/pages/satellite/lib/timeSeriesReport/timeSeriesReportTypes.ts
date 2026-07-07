import type { ImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import type { ImageryCorrelationScatterAnalysis } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { ImageryChartType, ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import type { TimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'

export type TimeSeriesTrendLabel = 'Increasing' | 'Decreasing' | 'Stable'

export type TimeSeriesLayerStatistics = {
  layerId: string
  mean: number | null
  min: number | null
  max: number | null
  stdDev: number | null
  trend: TimeSeriesTrendLabel
  observationCount: number
}

export type TimeSeriesReportLocation = {
  latitude: number | null
  longitude: number | null
  farmName: string
  farmCode: string
  geometry: GeoJSON.Geometry | null
}

export type TimeSeriesReportPeriod = {
  start: string
  end: string
  aggregation: ImageryTimeAggregation
}

export type TimeSeriesReportCharts = {
  activeType: ImageryChartType
  linePng: string | null
  barPng: string | null
  scatterPng: string | null
  mapPng: string | null
}

export type TimeSeriesReportPayload = {
  title: string
  projectName: string
  fieldName: string
  fieldKey: string
  location: TimeSeriesReportLocation
  layerIds: string[]
  period: TimeSeriesReportPeriod
  labels: string[]
  layerSeries: Array<{ layerId: string; values: number[] }>
  layerStats: TimeSeriesLayerStatistics[]
  scatterAnalysis: ImageryCorrelationScatterAnalysis | null
  interpretations: ImageryIndexInterpretation[]
  interpretationNarrative: string
  executiveSummary: TimeSeriesExecutiveSummary
  charts: TimeSeriesReportCharts
  generatedAt: string
  dailyRows: SentinelHubDailyIndexMeans[]
}

export type TimeSeriesReportConfig = {
  title: string
  fromDate: string
  toDate: string
  layerIds: string[]
  aggregation: ImageryTimeAggregation
  includeMapSnapshot: boolean
  includeInterpretation: boolean
  includeCharts: {
    line: boolean
    bar: boolean
    scatter: boolean
  }
}

export type TimeSeriesExportKind = 'pdf' | 'excel' | 'csv' | 'png' | 'geojson'
