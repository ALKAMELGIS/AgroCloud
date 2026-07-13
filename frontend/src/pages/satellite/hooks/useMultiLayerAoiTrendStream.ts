import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CropAlertFieldInput } from '../../../lib/siCropAlertEngine'
import {
  fetchMultiLayerAoiFieldDailyRow,
  getCachedMultiLayerAoiTrendResult,
  type MultiLayerAoiTrendResult,
} from '../../../lib/siMultiLayerAoiTrendAnalysis'

const FETCH_CONCURRENCY = 4

export type UseMultiLayerAoiTrendStreamOptions = {
  fields: CropAlertFieldInput[]
  layerIds: string[]
  sceneDate: string
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) break
      const i = next++
      results[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return results
}

export function useMultiLayerAoiTrendStream({
  fields,
  layerIds,
  sceneDate,
}: UseMultiLayerAoiTrendStreamOptions) {
  const [results, setResults] = useState<MultiLayerAoiTrendResult[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)
  const [analysisDurationMs, setAnalysisDurationMs] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const runGenRef = useRef(0)

  const layerKey = useMemo(
    () => [...layerIds].map(id => id.trim().toUpperCase()).sort().join(','),
    [layerIds],
  )
  const fieldKeys = useMemo(() => fields.map(f => f.fieldKey).join(','), [fields])
  const day = sceneDate.trim().slice(0, 10)

  const abort = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const resultsRef = useRef(results)
  resultsRef.current = results

  const run = useCallback(async () => {
    if (!fields.length || !layerIds.length || !day) {
      setResults([])
      setError('Select at least one AOI and one index.')
      setHasRun(true)
      return
    }

    const missingGeometry = fields.filter(f => !f.geometry)
    if (missingGeometry.length === fields.length) {
      setResults([])
      setError('Selected AOIs have no geometry — reload Agro Structures on the map.')
      setHasRun(true)
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const gen = ++runGenRef.current

    const hadResults = resultsRef.current.length > 0
    setLoading(!hadResults)
    setRefreshing(hadResults)
    setError(null)

    const t0 = performance.now()
    try {
      const fetched = await mapPool(
        fields,
        FETCH_CONCURRENCY,
        async field => {
          const row = await fetchMultiLayerAoiFieldDailyRow(field, day, layerIds, { signal: ac.signal })
          return getCachedMultiLayerAoiTrendResult(field, day, layerIds, row)
        },
        ac.signal,
      )
      if (gen !== runGenRef.current || ac.signal.aborted) return
      setResults(fetched)
      setHasRun(true)
      setAnalysisDurationMs(Math.round(performance.now() - t0))

      const withData = fetched.filter(r => r.indices.some(i => i.mean != null))
      if (!withData.length) {
        setError(
          `No clear Sentinel scenes near ${day} for the selected AOIs — try an earlier acquisition date or add NDVI.`,
        )
        return
      }
      if (withData.length < fetched.length) {
        const missing = fetched.length - withData.length
        setError(`${missing} AOI${missing === 1 ? '' : 's'} had no clear scene near ${day}.`)
      }
    } catch (e) {
      if (ac.signal.aborted || gen !== runGenRef.current) return
      setError(e instanceof Error ? e.message : 'Multi-AOI analysis failed')
      setResults([])
      setHasRun(true)
    } finally {
      if (gen === runGenRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [fields, layerIds, day, abort])

  const invalidateResults = useCallback(() => {
    setHasRun(false)
    setResults([])
    setError(null)
  }, [])

  useEffect(() => () => abort(), [abort])

  const hasChartData = results.some(r => r.indices.some(i => i.mean != null))

  return {
    results,
    loading,
    refreshing,
    error,
    hasRun,
    analysisDurationMs,
    hasChartData,
    run,
    abort,
    invalidateResults,
    fieldKeys,
    layerKey,
    sceneDate: day,
  }
}
