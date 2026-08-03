import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildDemCollectionIndexOverlay,
  isDemCollectionIndexId,
  type DemCollectionIndexId,
  type DemIndexOverlayResult,
} from '../../../lib/collectionDemOverlay'

type Params = {
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  indexId: string | null | undefined
  enabled: boolean
}

export function useCollectionDemOverlay({ geometry, indexId, enabled }: Params) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<DemIndexOverlayResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const demIndexId: DemCollectionIndexId | null = isDemCollectionIndexId(indexId)
    ? (String(indexId).trim().toUpperCase() as DemCollectionIndexId)
    : null

  const run = useCallback(async () => {
    if (!demIndexId) {
      setOverlay(null)
      setStatus('idle')
      setError(null)
      return
    }
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      setError('Draw an AOI polygon first')
      setStatus('error')
      setOverlay(null)
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setStatus('loading')
    setError(null)
    try {
      const result = await buildDemCollectionIndexOverlay({
        aoi: geometry,
        indexId: demIndexId,
        signal: ac.signal,
      })
      if (ac.signal.aborted) return
      if (!result) {
        setOverlay(null)
        setStatus('idle')
        return
      }
      setOverlay(result)
      setStatus('done')
    } catch (err) {
      if (ac.signal.aborted) return
      setOverlay(null)
      setStatus('error')
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [demIndexId, geometry])

  useEffect(() => {
    if (!enabled || !demIndexId) {
      abortRef.current?.abort()
      setOverlay(null)
      setStatus('idle')
      setError(null)
      return
    }
    void run()
    return () => {
      abortRef.current?.abort()
    }
  }, [enabled, demIndexId, geometry, run])

  return {
    status,
    error,
    overlay,
    run,
    active: !!demIndexId && enabled,
    indexId: demIndexId,
  }
}
