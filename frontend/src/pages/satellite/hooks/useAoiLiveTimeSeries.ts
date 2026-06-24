import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchSentinelFieldIndexTimeSeriesForRange,
  hasValidIndexDaily,
  type SentinelHubDailyIndexMeans,
} from '../../../lib/sentinelHubStatisticsApi'
import {
  buildWeeklyCompositesFromDaily,
  type AoiStatsSampleMode,
  type AoiWeeklyComposite,
} from '../utils/aoiLiveTimeSeries'
import type { WeeklyCompositeLite } from '../utils/staticAoiMultiChartData'

export type AoiLiveTimeSeriesState = {
  daily: SentinelHubDailyIndexMeans[]
  weekly: AoiWeeklyComposite[]
  loading: boolean
  source: 'live' | 'sample' | 'idle'
  error: string | null
  sampleMode: AoiStatsSampleMode
}

export type UseAoiLiveTimeSeriesOptions = {
  geometry: GeoJSON.Geometry | null
  fromIso: string
  toIso: string
  primaryLayerId: string
  weeklyWindows: WeeklyCompositeLite[]
  sampleMode: AoiStatsSampleMode
  enabled: boolean
  onSampleFallback?: (weekly: AoiWeeklyComposite[]) => void
}

export function useAoiLiveTimeSeries(options: UseAoiLiveTimeSeriesOptions) {
  const {
    geometry,
    fromIso,
    toIso,
    primaryLayerId,
    weeklyWindows,
    sampleMode,
    enabled,
    onSampleFallback,
  } = options

  const [daily, setDaily] = useState<SentinelHubDailyIndexMeans[]>([])
  const [weekly, setWeekly] = useState<AoiWeeklyComposite[]>([])
  const [loading, setLoading] = useState(false)
  const [source, setSource] = useState<'live' | 'sample' | 'idle'>('idle')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const onSampleFallbackRef = useRef(onSampleFallback)
  onSampleFallbackRef.current = onSampleFallback

  const refresh = useCallback(async () => {
    abortRef.current?.abort()
    if (!enabled || !geometry || !weeklyWindows.length) {
      setDaily([])
      setWeekly([])
      setSource('idle')
      setError(null)
      setLoading(false)
      return
    }

    const start = fromIso.trim().slice(0, 10)
    const end = toIso.trim().slice(0, 10)
    if (!start || !end || end < start) {
      setError('Choose a valid start and end date.')
      setSource('idle')
      return
    }

    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)

    try {
      let rows = await fetchSentinelFieldIndexTimeSeriesForRange({
        geometry,
        fromIso: start,
        toIso: end,
        signal: ac.signal,
      })
      if (!hasValidIndexDaily(rows)) {
        rows = await fetchSentinelFieldIndexTimeSeriesForRange({
          geometry,
          fromIso: start,
          toIso: end,
          maxCloudCoverage: 95,
          relaxedCloudMask: true,
          signal: ac.signal,
        })
      }

      if (ac.signal.aborted) return

      if (!hasValidIndexDaily(rows)) {
        setDaily([])
        setWeekly([])
        setSource('sample')
        setError('No clear Sentinel scenes in range — showing sample trajectory.')
        onSampleFallbackRef.current?.([])
        return
      }

      const composites = buildWeeklyCompositesFromDaily(rows, weeklyWindows, primaryLayerId)
      setDaily(rows)
      setWeekly(composites)
      setSource('live')
      setError(null)
    } catch (err) {
      if (ac.signal.aborted) return
      setDaily([])
      setWeekly([])
      setSource('sample')
      setError(err instanceof Error ? err.message : 'Failed to load Sentinel statistics.')
      onSampleFallbackRef.current?.([])
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }, [enabled, geometry, fromIso, toIso, primaryLayerId, weeklyWindows])

  useEffect(() => {
    void refresh()
    return () => abortRef.current?.abort()
  }, [refresh])

  return {
    daily,
    weekly,
    loading,
    source,
    error,
    sampleMode,
    refresh,
  } satisfies AoiLiveTimeSeriesState & { refresh: () => Promise<void> }
}
