import { useCallback, useEffect, useRef, useState } from 'react'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import {
  fetchImageryTimeSeriesProgressive,
  IMAGERY_TS_WMS_CHUNK_DAYS,
  planImageryDateChunks,
  prefetchImageryTimeSeriesRecent,
  type ImageryTimeSeriesProgress,
} from '../../../lib/fetchImageryTimeSeriesProgressive'
import {
  buildImageryTsCacheKey,
  buildImageryTsChunkCacheKey,
  findImageryTsOverlappingDaily,
  geometryHashForImageryCache,
  getImageryTsMemoryCache,
  isImageryTsCacheFresh,
  isImageryTsCacheStaleButUsable,
  readImageryTsCache,
  readImageryTsChunkCache,
} from '../../../lib/imageryTimeSeriesCache'
import { mergeDailyIndexSeries, type SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
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

const CLOUD_FILTER = 65

async function hydrateDailyFromChunkCaches(
  geometryHash: string,
  fromIso: string,
  toIso: string,
): Promise<SentinelHubDailyIndexMeans[]> {
  const chunks = planImageryDateChunks(fromIso, toIso, IMAGERY_TS_WMS_CHUNK_DAYS)
  if (!chunks.length) return []

  const hits = await Promise.all(
    chunks.map(chunk =>
      readImageryTsChunkCache(
        buildImageryTsChunkCacheKey(geometryHash, chunk.fromIso, chunk.toIso, CLOUD_FILTER),
      ),
    ),
  )

  let merged: SentinelHubDailyIndexMeans[] = []
  for (const hit of hits) {
    if (hit?.length) merged = mergeDailyIndexSeries(merged, hit)
  }
  return merged.filter(row => row.date >= fromIso && row.date <= toIso)
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
  prefetchLookbackDays = 365,
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
  const runGenerationRef = useRef(0)

  const buildCacheKey = useCallback(() => {
    if (!field?.geometry) return ''
    return buildImageryTsCacheKey({
      fieldKey: field.fieldKey,
      geometryHash: geometryHashForImageryCache(field.geometry),
      fromIso: fromDate,
      toIso: toDate,
      cloudFilter: CLOUD_FILTER,
    })
  }, [field, fromDate, toDate])

  const applyChartState = useCallback((chart: ImageryTimeSeriesChartState) => {
    setLabels(chart.labels)
    setLayerSeries(chart.layerSeries)
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
    const geometryHash = geometryHashForImageryCache(field.geometry)
    const generation = ++runGenerationRef.current

    abort()
    const ac = new AbortController()
    abortRef.current = ac

    const showInstant = (daily: SentinelHubDailyIndexMeans[], fromCache: boolean) => {
      if (generation !== runGenerationRef.current || ac.signal.aborted) return false
      setDailyRows(daily)
      applyChartState(dailyToChartState(daily, field.fieldKey, ids))
      setLoading(false)
      setRefreshing(fromCache)
      setError(null)
      return daily.length > 0
    }

    const memCached = cacheKey ? getImageryTsMemoryCache(cacheKey) : null
    if (memCached?.daily?.length && isImageryTsCacheFresh(memCached)) {
      showInstant(memCached.daily, false)
      setProgress({
        phase: 'complete',
        message: 'Loaded from cache',
        chunksDone: 0,
        chunksTotal: 0,
        observations: memCached.daily.length,
        percent: 100,
        fromCache: true,
        refreshing: false,
      })
      setAnalysisDurationMs(0)
      return
    }

    let instantDaily = findImageryTsOverlappingDaily({
      fieldKey: field.fieldKey,
      geometryHash,
      fromIso: fromDate,
      toIso: toDate,
      cloudFilter: CLOUD_FILTER,
    })
    let hasInstantChart = instantDaily.length > 0 && showInstant(instantDaily, true)

    if (!hasInstantChart) {
      instantDaily = await hydrateDailyFromChunkCaches(geometryHash, fromDate, toDate)
      hasInstantChart = instantDaily.length > 0 && showInstant(instantDaily, true)
    }

    if (!hasInstantChart && cacheKey) {
      const stored = await readImageryTsCache(cacheKey)
      if (stored?.daily?.length && isImageryTsCacheStaleButUsable(stored)) {
        hasInstantChart = showInstant(stored.daily, !isImageryTsCacheFresh(stored))
        if (isImageryTsCacheFresh(stored)) {
          setProgress({
            phase: 'complete',
            message: 'Loaded from cache',
            chunksDone: 0,
            chunksTotal: 0,
            observations: stored.daily.length,
            percent: 100,
            fromCache: true,
            refreshing: false,
          })
          setAnalysisDurationMs(0)
          return
        }
      }
    }

    if (generation !== runGenerationRef.current || ac.signal.aborted) return

    if (!hasInstantChart) {
      setLabels([])
      setLayerSeries([])
      setDailyRows([])
      setLoading(true)
      setRefreshing(false)
    } else {
      setRefreshing(true)
    }

    setProgress({
      phase: 'fetching',
      message: hasInstantChart ? 'Updating imagery…' : 'Loading imagery…',
      chunksDone: 0,
      chunksTotal: 0,
      observations: instantDaily.length,
      percent: 0,
      fromCache: hasInstantChart,
      refreshing: hasInstantChart,
    })

    const startedAt = performance.now()
    try {
      const daily = await fetchImageryTimeSeriesProgressive(field, {
        fromIso: fromDate,
        toIso: toDate,
        signal: ac.signal,
        onProgress: ({ progress: prog }) => {
          if (generation !== runGenerationRef.current || ac.signal.aborted) return
          setProgress(prog)
        },
      })
      if (generation !== runGenerationRef.current || ac.signal.aborted) return
      setDailyRows(daily)
      const chart = dailyToChartState(daily, field.fieldKey, ids)
      applyChartState(chart)
      if (!chart.labels.length) {
        setError('No observations in this date range — try widening dates or check Sentinel coverage.')
      } else {
        setError(null)
      }
    } catch (err) {
      if (!ac.signal.aborted && generation === runGenerationRef.current && !hasInstantChart) {
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
    hasChartData: labels.length > 0,
    chartReady: labels.length > 0 && !loading,
    run,
    abort,
    invalidateResults,
  }
}
