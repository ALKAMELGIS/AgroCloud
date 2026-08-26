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
import { evaluateImageryLayerDailyValue } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import {
  buildPlotTimeSeriesAnalyticsModel,
} from './buildPlotTimeSeriesAnalyticsModel'
import type {
  PlotTimeSeriesAnalyticsModel,
  PlotTimeSeriesAnalyticsOptions,
  PlotTimeSeriesFetchInput,
} from './plotTimeSeriesAnalyticsTypes'
import { DEFAULT_PLOT_TS_ANALYTICS_OPTIONS } from './plotTimeSeriesAnalyticsTypes'
import {
  dailyRowsInRange,
  dailyRowsSatisfyExportWindow,
} from './plotTimeSeriesDailyRows'

const FETCH_CONCURRENCY = 4
/** Parallel Sentinel Statistical API fetches during batch prefetch. */
export const BATCH_DAILY_FETCH_CONCURRENCY = 12

export async function mapPool<T, R>(
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

export function dailyRowsSatisfyLayerIds(
  rows: SentinelHubDailyIndexMeans[],
  layerIds: string[],
): boolean {
  if (!hasValidIndexDaily(rows)) return false
  const ids = layerIds.map(id => id.trim().toUpperCase()).filter(Boolean)
  if (!ids.length) return hasValidIndexDaily(rows)
  return ids.every(layerId => rows.some(row => evaluateImageryLayerDailyValue(layerId, row) != null))
}

export type BatchDailyFetchResult = {
  dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>
  /** Per-field fetch errors (non-abort). */
  fetchErrors: Map<string, string>
}

/**
 * Reuse panel-fetched daily rows when layers match; parallel-fetch the rest.
 */
export async function resolveBatchDailyByFieldKey(
  plots: CropAlertFieldInput[],
  layerIds: string[],
  fromDate: string,
  toDate: string,
  options?: {
    reuseDaily?: Map<string, SentinelHubDailyIndexMeans[]>
    signal?: AbortSignal
    onProgress?: (done: number, total: number) => void
    concurrency?: number
    fetchDaily?: typeof fetchPlotFieldDailyWithRetry
  },
): Promise<BatchDailyFetchResult> {
  const fetchDaily = options?.fetchDaily ?? fetchPlotFieldDailyWithRetry
  const ids = layerIds.map(id => id.trim().toUpperCase()).filter(Boolean)
  const dailyByFieldKey = new Map<string, SentinelHubDailyIndexMeans[]>()
  const fetchErrors = new Map<string, string>()
  const toFetch: CropAlertFieldInput[] = []
  let cachedCount = 0

  for (const plot of plots) {
    const cached = options?.reuseDaily?.get(plot.fieldKey)
    if (cached && dailyRowsSatisfyExportWindow(cached, fromDate, toDate, ids)) {
      dailyByFieldKey.set(plot.fieldKey, dailyRowsInRange(cached, fromDate, toDate))
      cachedCount += 1
    } else {
      toFetch.push(plot)
    }
  }

  if (cachedCount > 0) {
    options?.onProgress?.(cachedCount, plots.length)
  }

  if (toFetch.length > 0) {
    const fetched = await fetchPlotTimeSeriesDailyByField(
      toFetch,
      ids.length ? ids : ['NDVI'],
      fromDate,
      toDate,
      {
        signal: options?.signal,
        concurrency: options?.concurrency ?? BATCH_DAILY_FETCH_CONCURRENCY,
        fetchDaily,
        onProgress: (done, total) => {
          options?.onProgress?.(cachedCount + done, plots.length)
        },
      },
    )

    for (const [fieldKey, rows] of fetched.dailyByFieldKey) {
      dailyByFieldKey.set(fieldKey, rows)
    }
    for (const [fieldKey, message] of fetched.fetchErrors) {
      fetchErrors.set(fieldKey, message)
    }
  } else if (cachedCount > 0) {
    options?.onProgress?.(plots.length, plots.length)
  }

  return { dailyByFieldKey, fetchErrors }
}

export type PlotDailyFetchResult = {
  dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>
  fetchErrors: Map<string, string>
}

export async function fetchPlotTimeSeriesDailyByField(
  plots: CropAlertFieldInput[],
  layerId: string | string[],
  fromDate: string,
  toDate: string,
  options?: {
    signal?: AbortSignal
    onProgress?: (done: number, total: number) => void
    concurrency?: number
    fetchDaily?: typeof fetchPlotFieldDailyWithRetry
  },
): Promise<PlotDailyFetchResult> {
  const fetchDaily = options?.fetchDaily ?? fetchPlotFieldDailyWithRetry
  const dailyByFieldKey = new Map<string, SentinelHubDailyIndexMeans[]>()
  const fetchErrors = new Map<string, string>()
  let done = 0
  const total = plots.length
  await mapPool(
    plots,
    options?.concurrency ?? FETCH_CONCURRENCY,
    async field => {
      try {
        const rows = await fetchDaily(field, layerId, fromDate, toDate, options?.signal)
        dailyByFieldKey.set(field.fieldKey, dailyRowsInRange(rows, fromDate, toDate))
      } catch (err) {
        if (isAbort(err, options?.signal)) throw err
        fetchErrors.set(field.fieldKey, err instanceof Error ? err.message : String(err))
        dailyByFieldKey.set(field.fieldKey, [])
      } finally {
        done += 1
        options?.onProgress?.(done, total)
      }
    },
    options?.signal,
  )
  return { dailyByFieldKey, fetchErrors }
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
    dailyByFieldKey: dailyByFieldKey.dailyByFieldKey,
    fromDate: input.fromDate,
    toDate: input.toDate,
    timeAggregation: input.timeAggregation,
    farmName: input.farmName,
    aoiName: input.aoiName,
    sortField: opts.sortField,
  })
}
