import { useEffect, useMemo, useRef, useState } from 'react'
import {
  fetchLayerClassAreas,
  layerSupportsClassArea,
  normalizeClassAreaLayerId,
  type LayerClassAreaResult,
} from '../../../lib/siLayerClassAreaEngine'

export type UseLayerClassAreasState = {
  result: LayerClassAreaResult | null
  loading: boolean
  error: string | null
  /** Whether this layer can report per-class area at all. */
  supported: boolean
}

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined
  layerId: string | undefined
  sceneDate: string | undefined
  enabled?: boolean
  maxCloudCoverage?: number
}

export function stableGeometryKey(geometry: GeoJSON.Geometry | GeoJSON.Feature): string {
  try {
    const geom =
      (geometry as GeoJSON.Feature).type === 'Feature'
        ? (geometry as GeoJSON.Feature).geometry
        : (geometry as GeoJSON.Geometry)
    if (!geom) return ''
    return JSON.stringify(geom, (_k, v) => (typeof v === 'number' ? Number(v.toFixed(5)) : v))
  } catch {
    return ''
  }
}

/** True when a fetch was cancelled by AbortController (do not show as UI error). */
export function isClassAreaAbortError(err: unknown): boolean {
  if (err == null) return false
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true
  }
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true
    const msg = err.message.toLowerCase()
    if (msg.includes('aborted') || msg.includes('abort')) return true
  }
  return false
}

/**
 * Per-class Total Area for the active index layer inside an AOI, refreshed in
 * real time whenever the AOI geometry, layer, or scene date changes.
 */
export function useLayerClassAreas({
  geometry,
  layerId,
  sceneDate,
  enabled = true,
  maxCloudCoverage,
}: Params): UseLayerClassAreasState {
  const resolvedLayerId = useMemo(
    () => normalizeClassAreaLayerId(layerId) ?? layerId,
    [layerId],
  )
  const supported = resolvedLayerId ? layerSupportsClassArea(resolvedLayerId) : false
  const geomKey = useMemo(() => (geometry ? stableGeometryKey(geometry) : ''), [geometry])
  const [state, setState] = useState<UseLayerClassAreasState>({
    result: null,
    loading: false,
    error: null,
    supported,
  })
  const requestGenRef = useRef(0)

  const dateKey = String(sceneDate || '').trim().slice(0, 10)
  const active = enabled && supported && !!geomKey && !!dateKey && !!resolvedLayerId

  useEffect(() => {
    if (!active || !geometry || !resolvedLayerId) {
      requestGenRef.current += 1
      setState({ result: null, loading: false, error: null, supported })
      return
    }

    const requestId = ++requestGenRef.current
    const controller = new AbortController()
    setState({ result: null, loading: true, error: null, supported: true })

    fetchLayerClassAreas({
      geometry,
      layerId: resolvedLayerId,
      sceneDate: dateKey,
      maxCloudCoverage,
      signal: controller.signal,
    })
      .then(result => {
        if (requestId !== requestGenRef.current) return
        if (controller.signal.aborted) return
        setState({ result, loading: false, error: null, supported: true })
      })
      .catch((err: unknown) => {
        if (requestId !== requestGenRef.current) return
        if (controller.signal.aborted || isClassAreaAbortError(err)) {
          // Aborted refresh — keep prior areas, drop the busy state.
          setState(prev => ({ ...prev, loading: false }))
          return
        }
        const message = err instanceof Error ? err.message : 'Failed to compute class areas'
        setState(prev => ({ ...prev, loading: false, error: message, supported: true }))
      })

    return () => {
      // Invalidate this request so a late resolve/reject cannot wipe the next fetch.
      if (requestGenRef.current === requestId) {
        requestGenRef.current += 1
      }
      controller.abort()
    }
    // geomKey + dateKey + resolvedLayerId capture all inputs that change the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, geomKey, dateKey, resolvedLayerId, maxCloudCoverage])

  return state
}
