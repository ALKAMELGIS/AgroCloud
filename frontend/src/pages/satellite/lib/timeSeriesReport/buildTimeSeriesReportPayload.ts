import { buildImageryIndexInterpretation } from '../../../../lib/imageryIndexInterpretationEngine'
import {
  aggregateImagerySeriesByPeriod,
  buildImageryCorrelationScatterAnalysis,
  computeLinearRegression,
  type ImageryTimeSeriesLayerSeries,
} from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from '../../../../lib/sentinelHubStatisticsApi'
import type {
  TimeSeriesLayerStatistics,
  TimeSeriesReportPayload,
  TimeSeriesTrendLabel,
} from './timeSeriesReportTypes'
import { buildTimeSeriesExecutiveSummary } from './timeSeriesReportExecutive'
import { IMAGERY_TIME_AGGREGATION_OPTIONS } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

function finiteValues(values: number[]): number[] {
  return values.filter(v => v != null && Number.isFinite(v))
}

function stdDev(values: number[]): number | null {
  const finite = finiteValues(values)
  if (finite.length < 2) return null
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length
  const variance = finite.reduce((sum, v) => sum + (v - mean) ** 2, 0) / finite.length
  return Math.sqrt(variance)
}

export function classifySeriesTrend(values: number[]): TimeSeriesTrendLabel {
  const finite = finiteValues(values)
  if (finite.length < 3) return 'Stable'
  const points = finite.map((y, x) => ({ x, y }))
  const regression = computeLinearRegression(points)
  if (!regression) return 'Stable'
  const span = finite.length
  const delta = regression.slope * span
  const range = Math.max(...finite) - Math.min(...finite)
  const threshold = Math.max(range * 0.05, 0.01)
  if (delta > threshold) return 'Increasing'
  if (delta < -threshold) return 'Decreasing'
  return 'Stable'
}

export function computeLayerStatistics(
  layerId: string,
  values: number[],
): TimeSeriesLayerStatistics {
  const finite = finiteValues(values)
  if (!finite.length) {
    return {
      layerId,
      mean: null,
      min: null,
      max: null,
      stdDev: null,
      trend: 'Stable',
      observationCount: 0,
    }
  }
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length
  return {
    layerId,
    mean,
    min: Math.min(...finite),
    max: Math.max(...finite),
    stdDev: stdDev(finite),
    trend: classifySeriesTrend(finite),
    observationCount: finite.length,
  }
}

function resolveInterpretSceneDate(
  labels: string[],
  referenceDate: string,
  selectedChartDate: string | null,
): string {
  const picked = selectedChartDate?.trim().slice(0, 10)
  if (picked && labels.includes(picked)) return picked
  const mapDay = referenceDate.trim().slice(0, 10)
  if (mapDay && labels.includes(mapDay)) return mapDay
  return labels[labels.length - 1] ?? ''
}

function buildInterpretationNarrative(interpretations: ReturnType<typeof buildImageryIndexInterpretation>[]): string {
  const lines = interpretations
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .flatMap(item => [item.summaryLine, item.coverageLine, item.actionsLine].filter(Boolean))
  return lines.join('\n\n')
}

export type BuildTimeSeriesReportPayloadInput = {
  title: string
  projectName?: string
  field: CropAlertFieldInput | null
  fieldName: string
  fieldKey: string
  layerIds: string[]
  fromDate: string
  toDate: string
  aggregation: import('../../../dashboards/agroCloudPlatform/acpImageryTimeSeries').ImageryTimeAggregation
  labels: string[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
  dailyRows: SentinelHubDailyIndexMeans[]
  referenceDate: string
  selectedChartDate: string | null
  chartType: import('../../../dashboards/agroCloudPlatform/acpImageryTimeSeries').ImageryChartType
  chartPng: string | null
  mapPng: string | null
  includeInterpretation: boolean
}

export function buildTimeSeriesReportPayload(
  input: BuildTimeSeriesReportPayloadInput,
): TimeSeriesReportPayload {
  const {
    labels: displayLabels,
    layerSeries: displaySeries,
  } = aggregateImagerySeriesByPeriod(input.labels, input.layerSeries, input.aggregation)

  const layerStats = displaySeries.map(series =>
    computeLayerStatistics(series.layerId, series.values),
  )

  const scatterAnalysis =
    displaySeries.length >= 2
      ? buildImageryCorrelationScatterAnalysis(
          displayLabels,
          displaySeries[0]!.layerId,
          displaySeries[0]!.values,
          displaySeries[1]!.layerId,
          displaySeries[1]!.values,
        )
      : null

  const sceneDate = resolveInterpretSceneDate(
    input.labels,
    input.referenceDate,
    input.selectedChartDate,
  )

  const interpretations = input.includeInterpretation
    ? input.layerIds
        .map(layerId => {
          const series = input.layerSeries.find(
            s => s.layerId.toUpperCase() === layerId.toUpperCase(),
          )
          const values = series?.values ?? []
          return buildImageryIndexInterpretation({
            layerId,
            sceneDate,
            geometry: input.field?.geometry ?? null,
            dailyRows: input.dailyRows,
            chartLabels: input.labels,
            chartValues: values,
          })
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : []

  const chartPng = input.chartPng
  const charts = {
    activeType: input.chartType,
    linePng: input.chartType === 'line' || input.chartType === 'area' ? chartPng : null,
    barPng: input.chartType === 'bar' ? chartPng : null,
    scatterPng: input.chartType === 'scatter' ? chartPng : null,
    mapPng: input.mapPng,
  }

  const aggLabel =
    IMAGERY_TIME_AGGREGATION_OPTIONS.find(o => o.id === input.aggregation)?.label ??
    input.aggregation

  const base: Omit<TimeSeriesReportPayload, 'executiveSummary'> = {
    title: input.title.trim() || 'Imagery Time Series Analysis Report',
    projectName: input.projectName?.trim() || 'AgroCloud GeoAI',
    fieldName: input.fieldName,
    fieldKey: input.fieldKey,
    location: {
      latitude: input.field?.centroid?.[1] ?? null,
      longitude: input.field?.centroid?.[0] ?? null,
      farmName: input.field?.farmName ?? '',
      farmCode: input.field?.farmCode ?? '',
      geometry: input.field?.geometry ?? null,
    },
    layerIds: [...input.layerIds],
    period: {
      start: input.fromDate,
      end: input.toDate,
      aggregation: input.aggregation,
    },
    labels: displayLabels,
    layerSeries: displaySeries.map(s => ({ layerId: s.layerId, values: [...s.values] })),
    layerStats,
    scatterAnalysis,
    interpretations,
    interpretationNarrative: buildInterpretationNarrative(interpretations),
    charts,
    generatedAt: new Date().toISOString().slice(0, 10),
    dailyRows: input.dailyRows,
  }

  return {
    ...base,
    executiveSummary: buildTimeSeriesExecutiveSummary({ ...base } as TimeSeriesReportPayload, aggLabel),
  }
}
