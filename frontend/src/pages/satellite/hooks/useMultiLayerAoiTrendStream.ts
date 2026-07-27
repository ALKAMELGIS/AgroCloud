import { useCallback, useEffect, useRef, useState } from 'react'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import type { ImageryTimeAggregation } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'
import {
  buildMultiAoiTimelineResult,
  fetchMultiAoiTimelineResult,
  type MultiAoiTimelineResult,
} from '../../../lib/siMultiAoiTimeline'

export type UseMultiLayerAoiTrendStreamOptions = {
  fields: CropAlertFieldInput[]
  layerIds: string[]
  /** Inclusive range start (timeline). */
  fromDate: string
  /** Inclusive range end / acquisition date. */
  toDate: string
  timeAggregation: ImageryTimeAggregation
  /** @deprecated kept for call-site compatibility — same as toDate */
  sceneDate?: string
}

export function useMultiLayerAoiTrendStream({
  fields,
  layerIds,
  fromDate,
  toDate,
  timeAggregation,
  sceneDate,
}: UseMultiLayerAoiTrendStreamOptions) {
  const endDate = (toDate || sceneDate || '').trim().slice(0, 10)
  const startDate = (fromDate || '').trim().slice(0, 10)

  const [timeline, setTimeline] = useState<MultiAoiTimelineResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)
  const [analysisDurationMs, setAnalysisDurationMs] = useState<number | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runGenRef = useRef(0)
  const timelineRef = useRef(timeline)
  timelineRef.current = timeline

  const cacheRef = useRef<{
    plots: CropAlertFieldInput[]
    layerIds: string[]
    fromDate: string
    toDate: string
    dailyByFieldKey: Map<string, SentinelHubDailyIndexMeans[]>
  } | null>(null)

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const applyTimeline = useCallback((next: MultiAoiTimelineResult) => {
    setTimeline(next)
    setHasRun(true)
    const withData = next.series.filter(s => s.values.some(v => v != null))
    if (!withData.length) {
      setError(`No clear scenes for ${next.fromDate} → ${next.toDate}. Try a wider range.`)
    } else if (withData.length < next.series.length) {
      const missing = next.series.length - withData.length
      setError(`${missing} series had no valid observations in range.`)
    } else {
      setError(null)
    }
  }, [])

  const rebucketAggregation = useCallback(
    (aggregation: ImageryTimeAggregation) => {
      const cache = cacheRef.current
      if (!cache?.dailyByFieldKey.size || !cache.plots.length) return false
      const next = buildMultiAoiTimelineResult({
        plots: cache.plots,
        layerIds: cache.layerIds,
        fromDate: cache.fromDate,
        toDate: cache.toDate,
        timeAggregation: aggregation,
        dailyByFieldKey: cache.dailyByFieldKey,
      })
      applyTimeline(next)
      return true
    },
    [applyTimeline],
  )

  const run = useCallback(async () => {
    if (!fields.length || !layerIds.length || !startDate || !endDate || startDate > endDate) {
      setTimeline(null)
      setError('Select plot AOIs, index layers, and a valid Start → Acquisition date range.')
      setHasRun(true)
      return
    }
    if (!fields.some(f => f.geometry)) {
      setTimeline(null)
      setError('Selected AOIs have no geometry.')
      setHasRun(true)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const gen = ++runGenRef.current
    const had = !!timelineRef.current
    setLoading(!had)
    setRefreshing(had)
    setError(null)
    setProgress({ done: 0, total: fields.length })

    const t0 = performance.now()
    try {
      const next = await fetchMultiAoiTimelineResult({
        plots: fields,
        layerIds,
        fromDate: startDate,
        toDate: endDate,
        timeAggregation,
        signal: ac.signal,
        onProgress: (done, total) => {
          if (gen === runGenRef.current) setProgress({ done, total })
        },
      })
      if (gen !== runGenRef.current || ac.signal.aborted) return
      cacheRef.current = {
        plots: fields,
        layerIds: [...layerIds],
        fromDate: startDate,
        toDate: endDate,
        dailyByFieldKey: next.dailyByFieldKey ?? new Map(),
      }
      applyTimeline(next)
      setAnalysisDurationMs(Math.round(performance.now() - t0))
    } catch (e) {
      if (ac.signal.aborted || gen !== runGenRef.current) return
      setError(e instanceof Error ? e.message : 'Multi-AOI timeline failed')
      setTimeline(null)
      setHasRun(true)
    } finally {
      if (gen === runGenRef.current) {
        setLoading(false)
        setRefreshing(false)
        setProgress(null)
      }
    }
  }, [fields, layerIds, startDate, endDate, timeAggregation, abort, applyTimeline])

  useEffect(() => {
    const cache = cacheRef.current
    if (!cache || !hasRun) return
    if (
      cache.fromDate !== startDate ||
      cache.toDate !== endDate ||
      cache.plots.length !== fields.length ||
      cache.layerIds.join('|') !== layerIds.map(id => id.trim().toUpperCase()).join('|')
    ) {
      return
    }
    if (timeline?.timeAggregation === timeAggregation) return
    rebucketAggregation(timeAggregation)
  }, [
    timeAggregation,
    hasRun,
    startDate,
    endDate,
    fields.length,
    layerIds,
    timeline?.timeAggregation,
    rebucketAggregation,
  ])

  const invalidateResults = useCallback(() => {
    setHasRun(false)
    setTimeline(null)
    setError(null)
    setProgress(null)
    cacheRef.current = null
  }, [])

  useEffect(() => () => abort(), [abort])

  const hasChartData = !!timeline?.series.some(s => s.values.some(v => v != null))

  return {
    /** @deprecated single-scene results removed — use timeline */
    results: [] as const,
    timeline,
    loading,
    refreshing,
    error,
    hasRun,
    analysisDurationMs,
    progress,
    hasChartData,
    run,
    abort,
    invalidateResults,
    rebucketAggregation,
    sceneDate: endDate,
  }
}
