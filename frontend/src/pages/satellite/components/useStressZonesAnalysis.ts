import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchStressZonesTimeSeries,
  runStressZonesAnalysis,
  type StressZoneSceneResult,
  type StressZoneTimeSeriesPoint,
} from '../../../lib/siStressZonesLive'

export type UseStressZonesAnalysisOptions = {
  geometry: GeoJSON.Geometry | null
  sceneDate: string
  enabled?: boolean
  lookbackDays?: number
}

export type UseStressZonesAnalysis = {
  result: StressZoneSceneResult | null
  timeSeries: StressZoneTimeSeriesPoint[]
  loading: boolean
  error: string | null
  showOnMap: boolean
  setShowOnMap: (v: boolean) => void
  compareEnabled: boolean
  setCompareEnabled: (v: boolean) => void
  refresh: () => Promise<void>
}

export function useStressZonesAnalysis(options: UseStressZonesAnalysisOptions): UseStressZonesAnalysis {
  const { geometry, sceneDate, enabled = true, lookbackDays = 90 } = options
  const [result, setResult] = useState<StressZoneSceneResult | null>(null)
  const [timeSeries, setTimeSeries] = useState<StressZoneTimeSeriesPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showOnMap, setShowOnMap] = useState(false)
  const [compareEnabled, setCompareEnabled] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!geometry || !enabled) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)
    setError(null)
    try {
      const [analysis, series] = await Promise.all([
        runStressZonesAnalysis({ geometry, sceneDate, signal: ac.signal }),
        compareEnabled
          ? fetchStressZonesTimeSeries({ geometry, sceneDate, lookbackDays, signal: ac.signal })
          : Promise.resolve([] as StressZoneTimeSeriesPoint[]),
      ])
      if (ac.signal.aborted) return
      setResult(analysis)
      setTimeSeries(series)
      if (!analysis) setError('No Sentinel-2 statistics available for this AOI and date.')
    } catch (e) {
      if (ac.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Stress zone analysis failed')
      setResult(null)
      setTimeSeries([])
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }, [geometry, sceneDate, enabled, compareEnabled, lookbackDays])

  useEffect(() => {
    if (!enabled || !geometry) {
      setResult(null)
      setTimeSeries([])
      return
    }
    void refresh()
    return () => abortRef.current?.abort()
  }, [enabled, geometry, sceneDate, compareEnabled, refresh])

  return {
    result,
    timeSeries,
    loading,
    error,
    showOnMap,
    setShowOnMap,
    compareEnabled,
    setCompareEnabled,
    refresh,
  }
}
