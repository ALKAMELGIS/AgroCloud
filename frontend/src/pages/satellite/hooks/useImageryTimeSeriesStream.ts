import { useCallback, useEffect, useRef, useState } from 'react'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import {
  fetchImageryTimeSeriesProgressive,
  prefetchImageryTimeSeriesRecent,
  type ImageryTimeSeriesProgress,
} from '../../../lib/fetchImageryTimeSeriesProgressive'
import {
  buildImageryTsCacheKey,
  geometryHashForImageryCache,
  getImageryTsMemoryCache,
  isImageryTsCacheFresh,
} from '../../../lib/imageryTimeSeriesCache'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
import {
  aggregateImageryTimeSeries,
  aggregateImageryTimeSeriesMulti,
  pruneImageryTimeSeriesToObservations,
  pruneSingleLayerImagerySeries,
  type ImageryTimeSeriesLayerSeries,
} from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

export type ImageryTimeSeriesChartState = {
  labels: string[]
  layerSeries: ImageryTimeSeriesLayerSeries[]
}

function dailyToChartState(
  daily: SentinelHubDailyIndexMeans[],
  fieldKey: string,
  layerIds: string[],
): ImageryTimeSeriesChartState {
  if (!daily.length || !layerIds.length) {
    return { labels: [], layerSeries: [] }
  }
  const map = new Map([[fieldKey, daily]])
  if (layerIds.length === 1) {
    const raw = aggregateImageryTimeSeries(map, [fieldKey], layerIds[0]!)
    const single = pruneSingleLayerImagerySeries(raw.labels, raw.values)
    return { labels: single.labels, layerSeries: [{ layerId: layerIds[0]!, values: single.values }] }
  }
  const raw = aggregateImageryTimeSeriesMulti(map, [fieldKey], layerIds)
  const multi = pruneImageryTimeSeriesToObservations(raw.labels, raw.series)
  return { labels: multi.labels, layerSeries: multi.series }
}

const IDLE_PROGRESS: ImageryTimeSeriesProgress = {
  phase: 'idle',
  message: '',
  chunksDone: 0,
  chunksTotal: 0,
  observations: 0,
  percent: 0,
  fromCache: false,
  refreshing: false,
}

export type UseImageryTimeSeriesStreamOptions = {
  field: CropAlertFieldInput | null
  fromDate: string
  toDate: string
  layerIds: string[]
  referenceDate: string
  prefetchLookbackDays?: number
}

export function useImageryTimeSeriesStream({
  field,
  fromDate,
  toDate,
  layerIds,
  referenceDate,
  prefetchLookbackDays = 90,
}: UseImageryTimeSeriesStreamOptions) {
  const [labels, setLabels] = useState<string[]>([])
  const [layerSeries, setLayerSeries] = useState<ImageryTimeSeriesLayerSeries[]>([])
  const [dailyRows, setDailyRows] = useState<SentinelHubDailyIndexMeans[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [progress, setProgress] = useState<ImageryTimeSeriesProgress>(IDLE_PROGRESS)
  const [error, setError] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)
  const [analysisDurationMs, setAnalysisDurationMs] = useState<number | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const lastKnownRef = useRef<Map<string, ImageryTimeSeriesChartState & { layerIds: string[] }>>(new Map())
  const runGenerationRef = useRef(0)

  const buildCacheKey = useCallback(() => {
    if (!field?.geometry) return ''
    return buildImageryTsCacheKey({
      fieldKey: field.fieldKey,
      geometryHash: geometryHashForImageryCache(field.geometry),
      fromIso: fromDate,
      toIso: toDate,
      cloudFilter: 65,
    })
  }, [field, fromDate, toDate])

  const applyChartState = useCallback((chart: ImageryTimeSeriesChartState, cacheKey: string, ids: string[]) => {
    setLabels(chart.labels)
    setLayerSeries(chart.layerSeries)
    if (chart.labels.length) {
      lastKnownRef.current.set(cacheKey, { ...chart, layerIds: [...ids] })
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const run = useCallback(async () => {
    setHasRun(true)
    setError(null)

    if (!field) {
      setError('Select a field from Agro Structures.')
      return
    }
    if (!fromDate || !toDate || fromDate >= toDate) {
      setError('Invalid date range.')
      return
    }

    const ids = layerIds.length ? layerIds : ['NDVI']
    const cacheKey = buildCacheKey()
    const generation = ++runGenerationRef.current

    abort()
    const ac = new AbortController()
    abortRef.current = ac

    const memCached = cacheKey ? getImageryTsMemoryCache(cacheKey) : null
    if (memCached?.daily?.length) {
      setDailyRows(memCached.daily)
      const chart = dailyToChartState(memCached.daily, field.fieldKey, ids)
      applyChartState(chart, cacheKey, ids)
      const fresh = isImageryTsCacheFresh(memCached)
      setLoading(!fresh)
      setRefreshing(!fresh)
      setProgress({
        phase: fresh ? 'complete' : 'cache',
        message: fresh ? 'Loaded from cache' : 'Showing cached observations…',
        chunksDone: 0,
        chunksTotal: 0,
        observations: chart.labels.length,
        percent: fresh ? 100 : 0,
        fromCache: true,
        refreshing: !fresh,
      })
      if (fresh) {
        setAnalysisDurationMs(0)
        return
      }
    } else {
      const lastKnown = lastKnownRef.current.get(cacheKey)
      if (lastKnown && lastKnown.layerIds.join(',') === ids.join(',')) {
        applyChartState(lastKnown, cacheKey, ids)
      }
      setLoading(true)
      setRefreshing(false)
    }

    const startedAt = performance.now()
    try {
      await fetchImageryTimeSeriesProgressive(field, {
        fromIso: fromDate,
        toIso: toDate,
        signal: ac.signal,
        onProgress: ({ daily, progress: prog }) => {
          if (generation !== runGenerationRef.current || ac.signal.aborted) return
          setDailyRows(daily)
          const chart = dailyToChartState(daily, field.fieldKey, ids)
          applyChartState(chart, cacheKey, ids)
          setProgress(prog)
          setLoading(prog.phase === 'fetching' || prog.phase === 'cache')
          setRefreshing(prog.refreshing)
          if (!chart.labels.length && prog.phase === 'complete') {
            setError('No observations in this date range — try widening dates or check Sentinel coverage.')
          } else if (chart.labels.length) {
            setError(null)
          }
        },
      })
    } catch (err) {
      if (!ac.signal.aborted && generation === runGenerationRef.current) {
        setError(err instanceof Error ? err.message : 'Analysis failed')
      }
    } finally {
      if (generation === runGenerationRef.current) {
        setAnalysisDurationMs(Math.max(0, Math.round(performance.now() - startedAt)))
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [field, fromDate, toDate, layerIds, buildCacheKey, applyChartState, abort])

  const invalidateResults = useCallback(() => {
    abort()
    setHasRun(false)
    setLabels([])
    setLayerSeries([])
    setDailyRows([])
    setError(null)
    setProgress(IDLE_PROGRESS)
    setAnalysisDurationMs(null)
    setLoading(false)
    setRefreshing(false)
  }, [abort])

  useEffect(() => {
    if (!field?.geometry) return
    prefetchImageryTimeSeriesRecent(field, referenceDate, prefetchLookbackDays)
  }, [field?.fieldKey, field?.geometry, referenceDate, prefetchLookbackDays])

  useEffect(() => () => abort(), [abort])

  return {
    labels,
    layerSeries,
    dailyRows,
    loading,
    refreshing,
    progress,
    error,
    hasRun,
    analysisDurationMs,
    run,
    abort,
    invalidateResults,
  }
}
