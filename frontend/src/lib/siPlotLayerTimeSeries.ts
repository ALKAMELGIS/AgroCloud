import type { CropAlertFieldInput } from './siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'
import {
  buildAlignedImageryPeriodLabels,
  evaluateImageryLayerDailyValue,
  formatImageryTimePeriodLabel,
  type ImageryTimeAggregation,
} from '../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { aggregateObservations } from '../pages/satellite/lib/timeSeriesReport/buildPlotTimeSeriesAnalyticsModel'
import { fetchPlotTimeSeriesDailyByField } from '../pages/satellite/lib/timeSeriesReport/fetchPlotTimeSeriesAnalytics'
import { resolveFieldAreaHa } from './siMultiLayerAoiTrendAnalysis'

export type PlotLayerTimeSeriesPlotSeries = {
  fieldKey: string
  plotId: string
  plotName: string
  areaHa: number
  values: Array<number | null>
  observationCount: number
}

export type PlotLayerTimeSeriesResult = {
  layerId: string
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
  labels: string[]
  displayLabels: string[]
  series: PlotLayerTimeSeriesPlotSeries[]
  /** Raw daily rows — re-bucket Day/Week/Month/Year without refetching. */
  dailyByFieldKey?: Map<string, SentinelHubDailyIndexMeans[]>
}

export function buildPlotLayerTimeSeriesResult(input: {
  plots: CropAlertFieldInput[]
  layerId: string
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
  dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>
}): PlotLayerTimeSeriesResult {
  const layerId = input.layerId.trim() || 'NDVI'
  const fromDate = input.fromDate.trim().slice(0, 10)
  const toDate = input.toDate.trim().slice(0, 10)
  const observedKeys = new Set<string>()
  const perPlot = input.plots.map(field => {
    // Clip to the panel Start→End range so stray rows cannot shift values onto wrong periods.
    const daily = (input.dailyByFieldKey.get(field.fieldKey) ?? [])
      .map(row => {
        const date = String(row.date || '').trim().slice(0, 10)
        return {
          date,
          value: date && date >= fromDate && date <= toDate ? evaluateImageryLayerDailyValue(layerId, row) : null,
        }
      })
      .filter(row => row.date && row.date >= fromDate && row.date <= toDate)
    const observations = aggregateObservations(daily, input.timeAggregation)
    for (const obs of observations) {
      if (obs.value != null && Number.isFinite(obs.value)) observedKeys.add(obs.date)
    }
    return { field, observations }
  })

  // Shared calendar so every selected plot uses the same x positions for Day/Week/Month/Year.
  const labels = buildAlignedImageryPeriodLabels({
    fromDate,
    toDate,
    aggregation: input.timeAggregation,
    observedPeriodKeys: observedKeys,
  })
  const displayLabels = labels.map(l => formatImageryTimePeriodLabel(l, input.timeAggregation))

  const series: PlotLayerTimeSeriesPlotSeries[] = perPlot.map(({ field, observations }) => {
    const byDate = new Map<string, number>()
    for (const obs of observations) {
      if (obs.value == null || !Number.isFinite(obs.value)) continue
      byDate.set(obs.date, obs.value)
    }
    const values = labels.map(l => {
      const v = byDate.get(l)
      return v != null && Number.isFinite(v) ? v : null
    })
    return {
      fieldKey: field.fieldKey,
      plotId: String(field.objectId || field.fieldKey),
      plotName: field.farmName || field.fieldKey,
      areaHa: resolveFieldAreaHa(field.geometry),
      values,
      observationCount: values.filter(v => v != null).length,
    }
  })

  return {
    layerId,
    fromDate,
    toDate,
    timeAggregation: input.timeAggregation,
    labels,
    displayLabels,
    series,
    dailyByFieldKey: input.dailyByFieldKey,
  }
}

export async function fetchPlotLayerTimeSeriesResult(input: {
  plots: CropAlertFieldInput[]
  layerId: string
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}): Promise<PlotLayerTimeSeriesResult> {
  const { dailyByFieldKey } = await fetchPlotTimeSeriesDailyByField(
    input.plots,
    input.layerId,
    input.fromDate,
    input.toDate,
    { signal: input.signal, onProgress: input.onProgress },
  )
  return buildPlotLayerTimeSeriesResult({
    plots: input.plots,
    layerId: input.layerId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    timeAggregation: input.timeAggregation,
    dailyByFieldKey,
  })
}
