import type { CropAlertFieldInput } from '../../../../lib/siCropAlertEngine'
import {
  fetchSentinelFieldIndexTimeSeriesForRange,
  hasValidIndexDaily,
  mergeDailyIndexSeries,
  type SentinelHubDailyIndexMeans,
} from '../../../../lib/sentinelHubStatisticsApi'
import {
  DEFAULT_IMAGERY_TS_CLOUD_FILTER,
  fetchImageryTimeSeriesProgressive,
} from '../../../../lib/fetchImageryTimeSeriesProgressive'
import {
  buildPlotTimeSeriesAnalyticsModel,
} from './buildPlotTimeSeriesAnalyticsModel'
import type {
  PlotTimeSeriesAnalyticsModel,
  PlotTimeSeriesAnalyticsOptions,
  PlotTimeSeriesFetchInput,
} from './plotTimeSeriesAnalyticsTypes'
import { DEFAULT_PLOT_TS_ANALYTICS_OPTIONS } from './plotTimeSeriesAnalyticsTypes'

const FETCH_CONCURRENCY = 4

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

function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (err instanceof DOMException && err.name === 'AbortError') return true
  return err instanceof Error && /abort/i.test(err.message)
}

/** Zonal daily means for one plot — cloud-strict first, then relaxed, then chunked progressive. */
export async function fetchPlotFieldDailyWithRetry(
  field: CropAlertFieldInput,
  layerIdOrIds: string | string[],
  fromDate: string,
  toDate: string,
  signal?: AbortSignal,
): Promise<SentinelHubDailyIndexMeans[]> {
  if (!field.geometry) return []
  const layerIds = (Array.isArray(layerIdOrIds) ? layerIdOrIds : [layerIdOrIds])
    .map(id => id.trim().toUpperCase())
    .filter(Boolean)
  const ids = layerIds.length ? layerIds : ['NDVI']

  const fetchRange = (maxCloudCoverage: number, relaxedCloudMask: boolean) =>
    fetchSentinelFieldIndexTimeSeriesForRange({
      geometry: field.geometry!,
      fromIso: fromDate,
      toIso: toDate,
      layerIds: ids,
      maxCloudCoverage,
      relaxedCloudMask,
      signal,
    })

  try {
    let rows = await fetchRange(DEFAULT_IMAGERY_TS_CLOUD_FILTER, false)
    if (!hasValidIndexDaily(rows) && !signal?.aborted) {
      const relaxed = await fetchRange(95, true)
      rows = mergeDailyIndexSeries(rows, relaxed)
    }
    if (hasValidIndexDaily(rows) || signal?.aborted) return rows

    // Small / cloudy polygons often need chunked progressive fetch (same path as Single Layer Trend).
    return await fetchImageryTimeSeriesProgressive(field, {
      fromIso: fromDate,
      toIso: toDate,
      layerIds: ids,
      maxCloudCoverage: 95,
      signal,
    })
  } catch (err) {
    if (isAbort(err, signal)) throw err
    try {
      return await fetchImageryTimeSeriesProgressive(field, {
        fromIso: fromDate,
        toIso: toDate,
        layerIds: ids,
        maxCloudCoverage: 95,
        signal,
      })
    } catch (fallbackErr) {
      if (isAbort(fallbackErr, signal)) throw fallbackErr
      console.warn('[plot-ts] field fetch failed', field.fieldKey, fallbackErr)
      return []
    }
  }
}

export async function fetchPlotTimeSeriesDailyByField(
  plots: CropAlertFieldInput[],
  layerId: string | string[],
  fromDate: string,
  toDate: string,
  options?: {
    signal?: AbortSignal
    onProgress?: (done: number, total: number) => void
  },
): Promise<Map<string, SentinelHubDailyIndexMeans[]>> {
  const map = new Map<string, SentinelHubDailyIndexMeans[]>()
  let done = 0
  const total = plots.length
  await mapPool(
    plots,
    FETCH_CONCURRENCY,
    async field => {
      const rows = await fetchPlotFieldDailyWithRetry(
        field,
        layerId,
        fromDate,
        toDate,
        options?.signal,
      )
      map.set(field.fieldKey, rows)
      done += 1
      options?.onProgress?.(done, total)
    },
    options?.signal,
  )
  return map
}

export async function buildPlotTimeSeriesAnalyticsFromPlots(
  input: PlotTimeSeriesFetchInput,
  options: Partial<PlotTimeSeriesAnalyticsOptions> = {},
): Promise<PlotTimeSeriesAnalyticsModel> {
  const opts = { ...DEFAULT_PLOT_TS_ANALYTICS_OPTIONS, ...options }
  const layerId = input.layerId.trim() || 'NDVI'
  const dailyByFieldKey = await fetchPlotTimeSeriesDailyByField(
    input.plots,
    layerId,
    input.fromDate,
    input.toDate,
    { signal: input.signal, onProgress: input.onProgress },
  )
  return buildPlotTimeSeriesAnalyticsModel({
    plots: input.plots,
    layerId,
    dailyByFieldKey,
    fromDate: input.fromDate,
    toDate: input.toDate,
    timeAggregation: input.timeAggregation,
    farmName: input.farmName,
    aoiName: input.aoiName,
    sortField: opts.sortField,
  })
}
