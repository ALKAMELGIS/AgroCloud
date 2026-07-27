import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { ImageryTimeAggregation } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { IndexHealthTier } from '../../../../lib/imageryIndexInterpretationEngine'

export type PlotTimeSeriesSortField =
  | 'priority'
  | 'value-asc'
  | 'value-desc'
  | 'change-desc'
  | 'change-asc'
  | 'plot-id'
  | 'area'

export type PlotTimeSeriesAnalyticsOptions = {
  includeCharts: boolean
  includePivotTables: boolean
  includeStatistics: boolean
  includeAlerts: boolean
  includeMetadata: boolean
  includeConditionalFormatting: boolean
  /** Cap per-plot line charts (farm/top-10 charts still render when includeCharts). */
  maxPerPlotCharts: number
  sortField: PlotTimeSeriesSortField
}

export const DEFAULT_PLOT_TS_ANALYTICS_OPTIONS: PlotTimeSeriesAnalyticsOptions = {
  includeCharts: true,
  includePivotTables: true,
  includeStatistics: true,
  includeAlerts: true,
  includeMetadata: true,
  includeConditionalFormatting: true,
  maxPerPlotCharts: 12,
  sortField: 'priority',
}

export type PlotObservation = {
  date: string
  value: number | null
  source?: string
  qualityFlag?: string | null
}

export type PlotTrend = 'Increasing' | 'Decreasing' | 'Stable' | 'Unknown'

export type PlotAlertType =
  | 'Rapid Decrease'
  | 'Rapid Increase'
  | 'Stable'
  | 'Missing Observations'
  | 'Significant Change'
  | 'Persistent Low'
  | 'Data Quality Issue'

export type PlotAlertSeverity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info'

export type PlotAnalyticsRow = {
  plotId: string
  fieldKey: string
  plotName: string
  farmName: string
  cropType: string
  areaHa: number
  observationCount: number
  mean: number | null
  median: number | null
  min: number | null
  max: number | null
  stdDev: number | null
  latestValue: number | null
  previousValue: number | null
  difference: number | null
  trend: PlotTrend
  status: string
  statusTier: IndexHealthTier | 'unknown'
  statusColor: string
  priorityScore: number
  recommendedAction: string
  observations: PlotObservation[]
}

export type PlotAnalyticsAlert = {
  plotId: string
  alertType: PlotAlertType
  severity: PlotAlertSeverity
  currentValue: number | null
  previousValue: number | null
  difference: number | null
  trend: PlotTrend
  recommendation: string
}

export type PlotTimeSeriesAnalyticsMeta = {
  farmName: string
  aoiName: string
  layerId: string
  layerLabel: string
  fromDate: string
  toDate: string
  generatedAt: string
  timeAggregation: ImageryTimeAggregation
  coordinateSystem: string
  dataSource: string
  platformVersion: string
  exportVersion: string
  plotCount: number
}

export type PlotTimeSeriesAnalyticsModel = {
  meta: PlotTimeSeriesAnalyticsMeta
  rows: PlotAnalyticsRow[]
  alerts: PlotAnalyticsAlert[]
  kpis: {
    averageValue: number | null
    lowestValue: number | null
    highestValue: number | null
    healthyCount: number
    moderateCount: number
    stressCount: number
    criticalCount: number
  }
  monthlyAverages: Array<{ month: string; average: number | null; count: number }>
  statusCounts: Array<{ status: string; count: number }>
  cropSummary: Array<{ cropType: string; average: number | null; plotCount: number }>
  /** Shared date axis for charts (sorted unique observation dates with any value). */
  chartDates: string[]
  farmAverageSeries: Array<number | null>
}

export type PlotTimeSeriesFetchInput = {
  plots: CropAlertFieldInput[]
  layerId: string
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
  farmName?: string
  aoiName?: string
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}
