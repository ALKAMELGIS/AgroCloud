/**
 * Multi-AOI timeline: same index-over-time chart as Single Layer Trend,
 * but AOIs come from a plot layer selection (e.g. Potato_Plots).
 */

import type { CropAlertFieldInput } from './siCropAlertEngine'
import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'
import { fetchPlotFieldDailyWithRetry } from '../pages/satellite/lib/timeSeriesReport/fetchPlotTimeSeriesAnalytics'
import {
  buildAlignedImageryPeriodLabels,
  evaluateImageryLayerDailyValue,
  formatImageryTimePeriodLabel,
  type ImageryTimeAggregation,
  type ImageryTimeSeriesLayerSeries,
} from '../pages/dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { aggregateObservations } from '../pages/satellite/lib/timeSeriesReport/buildPlotTimeSeriesAnalyticsModel'
import { resolveFieldAreaHa } from './siMultiLayerAoiTrendAnalysis'

const FETCH_CONCURRENCY = 4

export type MultiAoiTimelinePlotSeries = {
  fieldKey: string
  plotName: string
  areaHa: number
  layerId: string
  label: string
  values: Array<number | null>
}

export type MultiAoiTimelineResult = {
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
  layerIds: string[]
  labels: string[]
  displayLabels: string[]
  series: MultiAoiTimelinePlotSeries[]
  plotCount: number
  dailyByFieldKey?: Map<string, SentinelHubDailyIndexMeans[]>
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const i = next++
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}

export function buildMultiAoiTimelineResult(input: {
  plots: CropAlertFieldInput[]
  layerIds: string[]
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
  dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>
}): MultiAoiTimelineResult {
  const layerIds = input.layerIds.map(id => id.trim().toUpperCase()).filter(Boolean)
  const fromDate = input.fromDate.trim().slice(0, 10)
  const toDate = input.toDate.trim().slice(0, 10)
  const observedKeys = new Set<string>()

  type PlotLayerObs = {
    field: CropAlertFieldInput
    layerId: string
    byDate: Map<string, number>
  }
  const plotLayerObs: PlotLayerObs[] = []

  for (const field of input.plots) {
    const daily = (input.dailyByFieldKey.get(field.fieldKey) ?? [])
      .map(row => {
        const date = String(row.date || '').trim().slice(0, 10)
        return { row, date }
      })
      .filter(({ date }) => date && date >= fromDate && date <= toDate)
    for (const layerId of layerIds) {
      const observations = aggregateObservations(
        daily.map(({ row, date }) => ({
          date,
          value: evaluateImageryLayerDailyValue(layerId, row),
        })),
        input.timeAggregation,
      )
      const byDate = new Map<string, number>()
      for (const obs of observations) {
        if (obs.value == null || !Number.isFinite(obs.value)) continue
        byDate.set(obs.date, obs.value)
        observedKeys.add(obs.date)
      }
      plotLayerObs.push({ field, layerId, byDate })
    }
  }

  const labels = buildAlignedImageryPeriodLabels({
    fromDate,
    toDate,
    aggregation: input.timeAggregation,
    observedPeriodKeys: observedKeys,
  })
  const displayLabels = labels.map(l => formatImageryTimePeriodLabel(l, input.timeAggregation))

  const singlePlot = input.plots.length === 1
  const singleLayer = layerIds.length === 1

  const series: MultiAoiTimelinePlotSeries[] = plotLayerObs.map(({ field, layerId, byDate }) => {
    const plotName = field.farmName || field.fieldKey
    let label: string
    if (singlePlot) label = layerId
    else if (singleLayer) label = plotName
    else label = `${plotName} · ${layerId}`
    return {
      fieldKey: field.fieldKey,
      plotName,
      areaHa: resolveFieldAreaHa(field.geometry),
      layerId,
      label,
      values: labels.map(d => {
        const v = byDate.get(d)
        return v != null && Number.isFinite(v) ? v : null
      }),
    }
  })

  return {
    fromDate,
    toDate,
    timeAggregation: input.timeAggregation,
    layerIds,
    labels,
    displayLabels,
    series,
    plotCount: input.plots.length,
    dailyByFieldKey: input.dailyByFieldKey,
  }
}

export async function fetchMultiAoiTimelineResult(input: {
  plots: CropAlertFieldInput[]
  layerIds: string[]
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}): Promise<MultiAoiTimelineResult> {
  const layerIds = input.layerIds.map(id => id.trim().toUpperCase()).filter(Boolean)
  const dailyByFieldKey = new Map<string, SentinelHubDailyIndexMeans[]>()
  let done = 0
  const total = input.plots.length

  await mapPool(
    input.plots,
    FETCH_CONCURRENCY,
    async field => {
      if (!field.geometry) {
        dailyByFieldKey.set(field.fieldKey, [])
      } else {
        const rows = await fetchPlotFieldDailyWithRetry(
          field,
          layerIds,
          input.fromDate,
          input.toDate,
          input.signal,
        )
        dailyByFieldKey.set(field.fieldKey, rows)
      }
      done += 1
      input.onProgress?.(done, total)
    },
    input.signal,
  )

  return buildMultiAoiTimelineResult({
    plots: input.plots,
    layerIds,
    fromDate: input.fromDate,
    toDate: input.toDate,
    timeAggregation: input.timeAggregation,
    dailyByFieldKey,
  })
}

/** Adapter for quick CSV/Excel export helpers that expect ImageryTimeSeriesLayerSeries. */
export function multiAoiTimelineToLayerSeries(
  result: MultiAoiTimelineResult,
): ImageryTimeSeriesLayerSeries[] {
  return result.series.map(s => ({
    layerId: s.label,
    values: s.values,
  }))
}
