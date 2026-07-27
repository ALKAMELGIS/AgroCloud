import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildPlotLayerTimeSeriesResult,
  fetchPlotLayerTimeSeriesResult,
  type PlotLayerTimeSeriesResult,
} from '../../../lib/siPlotLayerTimeSeries'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import type { ImageryTimeAggregation } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

export type UsePlotLayerTimeSeriesStreamOptions = {
  fields: CropAlertFieldInput[]
  layerId: string
  fromDate: string
  toDate: string
  timeAggregation: ImageryTimeAggregation
}

function summarizeCoverage(next: PlotLayerTimeSeriesResult, layer: string, fromDate: string, toDate: string) {
  const withData = next.series.filter(s => s.observationCount > 0)
  if (!withData.length) {
    return {
      error: `No clear ${layer} scenes for ${fromDate} → ${toDate}. Try a wider range or lower cloud filter.`,
      warning: null as string | null,
    }
  }
  if (withData.length < next.series.length) {
    const missing = next.series.length - withData.length
    const names = next.series
      .filter(s => s.observationCount === 0)
      .slice(0, 4)
      .map(s => s.plotName || s.plotId)
      .join(', ')
    return {
      error: null as string | null,
      warning:
        `${withData.length}/${next.series.length} plots plotted` +
        (missing ? ` · skipped ${names}${missing > 4 ? ` +${missing - 4}` : ''} (no clear scenes)` : ''),
    }
  }
  return { error: null as string | null, warning: null as string | null }
}

export function usePlotLayerTimeSeriesStream({
  fields,
  layerId,
  fromDate,
  toDate,
  timeAggregation,
}: UsePlotLayerTimeSeriesStreamOptions) {
  const [result, setResult] = useState<PlotLayerTimeSeriesResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)
  const [analysisDurationMs, setAnalysisDurationMs] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runGenRef = useRef(0)
  const resultRef = useRef(result)
  resultRef.current = result

  const cacheRef = useRef<{
    plots: CropAlertFieldInput[]
    layerId: string
    fromDate: string
    toDate: string
    dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>
  } | null>(null)

  const layer = layerId.trim().toUpperCase()

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const applyBuiltResult = useCallback(
    (next: PlotLayerTimeSeriesResult) => {
      setResult(next)
      setHasRun(true)
      const status = summarizeCoverage(next, next.layerId || layer, next.fromDate, next.toDate)
      setError(status.error)
      setWarning(status.warning)
    },
    [layer],
  )

  /** Re-bucket cached daily rows when Day/Week/Month/Year changes — no Sentinel refetch. */
  const rebucketAggregation = useCallback(
    (aggregation: ImageryTimeAggregation) => {
      const cache = cacheRef.current
      if (!cache?.dailyByFieldKey.size || !cache.plots.length) return false
      const next = buildPlotLayerTimeSeriesResult({
        plots: cache.plots,
        layerId: cache.layerId,
        fromDate: cache.fromDate,
        toDate: cache.toDate,
        timeAggregation: aggregation,
        dailyByFieldKey: cache.dailyByFieldKey,
      })
      applyBuiltResult(next)
      return true
    },
    [applyBuiltResult],
  )

  const run = useCallback(async () => {
    if (!fields.length || !layer || !fromDate || !toDate || fromDate > toDate) {
      setResult(null)
      setError('Select AOI plots, one layer, and a valid date range.')
      setWarning(null)
      setHasRun(true)
      return
    }
    if (!fields.some(f => f.geometry)) {
      setResult(null)
      setError('Selected plots have no geometry.')
      setWarning(null)
      setHasRun(true)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const gen = ++runGenRef.current
    const had = !!resultRef.current
    setLoading(!had)
    setRefreshing(had)
    setError(null)
    setWarning(null)
    setProgress({ done: 0, total: fields.length })

    const t0 = performance.now()
    try {
      const next = await fetchPlotLayerTimeSeriesResult({
        plots: fields,
        layerId: layer,
        fromDate,
        toDate,
        timeAggregation,
        signal: ac.signal,
        onProgress: (done, total) => {
          if (gen === runGenRef.current) setProgress({ done, total })
        },
      })
      if (gen !== runGenRef.current || ac.signal.aborted) return
      cacheRef.current = {
        plots: fields,
        layerId: layer,
        fromDate,
        toDate,
        dailyByFieldKey: next.dailyByFieldKey ?? new Map(),
      }
      applyBuiltResult(next)
      setAnalysisDurationMs(Math.round(performance.now() - t0))
    } catch (e) {
      if (ac.signal.aborted || gen !== runGenRef.current) return
      setError(e instanceof Error ? e.message : 'Plot time series failed')
      setWarning(null)
      setResult(null)
      setHasRun(true)
    } finally {
      if (gen === runGenRef.current) {
        setLoading(false)
        setRefreshing(false)
        setProgress(null)
      }
    }
  }, [fields, layer, fromDate, toDate, timeAggregation, abort, applyBuiltResult])

  // Instant Day/Week/Month/Year switch from cached daily means (aligned shared calendar).
  useEffect(() => {
    const cache = cacheRef.current
    if (!cache || !hasRun) return
    if (
      cache.layerId !== layer ||
      cache.fromDate !== fromDate ||
      cache.toDate !== toDate ||
      cache.plots.length !== fields.length
    ) {
      return
    }
    if (result?.timeAggregation === timeAggregation) return
    rebucketAggregation(timeAggregation)
  }, [timeAggregation, hasRun, layer, fromDate, toDate, fields.length, result?.timeAggregation, rebucketAggregation])

  const invalidateResults = useCallback(() => {
    setHasRun(false)
    setResult(null)
    setError(null)
    setWarning(null)
    setProgress(null)
    cacheRef.current = null
  }, [])

  useEffect(() => () => abort(), [abort])

  const hasChartData = !!result?.series.some(s => s.observationCount > 0)

  return {
    result,
    loading,
    refreshing,
    error,
    warning,
    hasRun,
    analysisDurationMs,
    progress,
    hasChartData,
    run,
    abort,
    invalidateResults,
    rebucketAggregation,
  }
}
