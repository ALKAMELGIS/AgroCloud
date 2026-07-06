import { useEffect, useMemo, useState } from 'react'
import {
  fetchLayerClassAreas,
  layerSupportsClassArea,
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

function stableGeometryKey(geometry: GeoJSON.Geometry | GeoJSON.Feature): string {
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
  const supported = layerId ? layerSupportsClassArea(layerId) : false
  const geomKey = useMemo(() => (geometry ? stableGeometryKey(geometry) : ''), [geometry])
  const [state, setState] = useState<UseLayerClassAreasState>({
    result: null,
    loading: false,
    error: null,
    supported,
  })

  const dateKey = String(sceneDate || '').trim().slice(0, 10)
  const active = enabled && supported && !!geomKey && !!dateKey && !!layerId

  useEffect(() => {
    if (!active || !geometry || !layerId) {
      setState({ result: null, loading: false, error: null, supported })
      return
    }

    let cancelled = false
    const controller = new AbortController()
    // Keep the previous per-class rows visible while refreshing (no blank legend flash).
    setState(prev => ({ ...prev, loading: true, error: null, supported: true }))

    fetchLayerClassAreas({
      geometry,
      layerId,
      sceneDate: dateKey,
      maxCloudCoverage,
      signal: controller.signal,
    })
      .then(result => {
        if (cancelled) return
        setState({ result, loading: false, error: null, supported: true })
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return
        const message = err instanceof Error ? err.message : 'Failed to compute class areas'
        setState(prev => ({ ...prev, loading: false, error: message, supported: true }))
      })

    return () => {
      cancelled = true
      controller.abort()
    }
    // geomKey + dateKey + layerId capture all inputs that change the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, geomKey, dateKey, layerId, maxCloudCoverage])

  return state
}
