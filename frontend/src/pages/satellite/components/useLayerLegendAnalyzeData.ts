import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayerLiveLegendSpec } from '../../../lib/layerLiveLegendCatalog'
import {
  fetchMultiLayerAoiFieldDailyRow,
  resolveFieldAreaHa,
  resolveMultiLayerAoiIndexStats,
} from '../../../lib/siMultiLayerAoiTrendAnalysis'
import { isClassAreaAbortError, stableGeometryKey, useLayerClassAreas } from './useLayerClassAreas'
import {
  computeLayerLegendAnalyzeStats,
  type LayerLegendAnalyzeStats,
  type LayerLegendIndexStatsFallback,
} from './layerLegendAnalyzeStats'

/** Histogram class-area stats are too slow above this AOI size — use zonal stats only. */
const LARGE_AOI_CLASS_AREA_HA = 1200
/** Shorter lookback for legend panel (faster than default 90-day multi-layer trend). */
const LEGEND_ANALYZE_LOOKBACK_DAYS = 21

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined
  layerId: string | undefined
  sceneDate: string | undefined
  spec: LayerLiveLegendSpec
  enabled?: boolean
}

export type UseLayerLegendAnalyzeDataState = {
  analyzeStats: LayerLegendAnalyzeStats
  areaResult: ReturnType<typeof useLayerClassAreas>['result']
  areaLoading: boolean
  areaError: string | null
  areaSupported: boolean
  hasData: boolean
  loading: boolean
}

function geometryForFetch(
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
): GeoJSON.Geometry | null {
  if (!geometry) return null
  if ((geometry as GeoJSON.Feature).type === 'Feature') {
    return (geometry as GeoJSON.Feature).geometry ?? null
  }
  return geometry as GeoJSON.Geometry
}

function classAreaHasSamples(
  result: ReturnType<typeof useLayerClassAreas>['result'],
): boolean {
  return !!result?.rows?.some(row => (row.count ?? 0) > 0)
}

/**
 * Analyze / Statistics for the active layer — histogram class areas when available,
 * otherwise zonal min/max/mean from the Statistical API for the same layer id.
 */
export function useLayerLegendAnalyzeData({
  geometry,
  layerId,
  sceneDate,
  spec,
  enabled = true,
}: Params): UseLayerLegendAnalyzeDataState {
  const geomKey = useMemo(
    () => (geometry ? stableGeometryKey(geometry) : ''),
    [geometry],
  )
  const geom = useMemo(() => geometryForFetch(geometry), [geomKey, geometry])
  const areaHa = useMemo(() => (geom ? resolveFieldAreaHa(geom) : 0), [geom])
  const skipClassAreas = areaHa > LARGE_AOI_CLASS_AREA_HA
  const classAreasEnabled = enabled && !skipClassAreas

  const {
    result: areaResult,
    loading: areaLoading,
    error: areaError,
    supported: areaSupported,
  } = useLayerClassAreas({
    geometry,
    layerId,
    sceneDate,
    enabled: classAreasEnabled,
  })

  const [indexStats, setIndexStats] = useState<LayerLegendIndexStatsFallback | null>(null)
  const [fallbackLoading, setFallbackLoading] = useState(false)
  const fallbackGenRef = useRef(0)

  const dateKey = String(sceneDate || '').trim().slice(0, 10)
  const layerKey = String(layerId || '').trim().toUpperCase()
  const hasClassData = classAreaHasSamples(areaResult)

  const shouldFetchFallback =
    enabled &&
    !!geomKey &&
    !!geom &&
    !!dateKey &&
    !!layerKey &&
    !hasClassData

  useEffect(() => {
    if (!shouldFetchFallback) {
      fallbackGenRef.current += 1
      setIndexStats(null)
      setFallbackLoading(false)
      return
    }

    const requestId = ++fallbackGenRef.current
    const controller = new AbortController()
    setFallbackLoading(true)
    setIndexStats(null)

    fetchMultiLayerAoiFieldDailyRow(
      {
        fieldKey: `legend-aoi-${geomKey.slice(0, 48)}`,
        objectId: 'legend-aoi',
        farmName: 'AOI',
        farmCode: 'AOI',
        structureType: 'AOI',
        country: '',
        city: '',
        centroid: [0, 0],
        geometry: geom,
      },
      dateKey,
      [layerKey],
      { signal: controller.signal, lookbackDays: LEGEND_ANALYZE_LOOKBACK_DAYS },
    )
      .then(row => {
        if (requestId !== fallbackGenRef.current) return
        if (controller.signal.aborted) return
        const stats = resolveMultiLayerAoiIndexStats(layerKey, row)
        if (stats.mean == null || !Number.isFinite(stats.mean)) {
          setIndexStats(null)
          return
        }
        setIndexStats({
          min: stats.min,
          max: stats.max,
          average: stats.mean,
        })
      })
      .catch((err: unknown) => {
        if (requestId !== fallbackGenRef.current) return
        if (controller.signal.aborted || isClassAreaAbortError(err)) return
        setIndexStats(null)
      })
      .finally(() => {
        if (requestId !== fallbackGenRef.current) return
        setFallbackLoading(false)
      })

    return () => {
      if (fallbackGenRef.current === requestId) {
        fallbackGenRef.current += 1
      }
      controller.abort()
    }
  }, [shouldFetchFallback, geomKey, geom, dateKey, layerKey])

  const analyzeStats = useMemo(
    () =>
      computeLayerLegendAnalyzeStats({
        layerId,
        spec,
        areaResult: hasClassData ? areaResult : null,
        indexStats,
      }),
    [layerId, spec, areaResult, hasClassData, indexStats],
  )

  const hasData =
    hasClassData ||
    (indexStats?.average != null && Number.isFinite(indexStats.average))

  const loading =
    !hasData && (fallbackLoading || (classAreasEnabled && areaLoading))

  return {
    analyzeStats,
    areaResult,
    areaLoading,
    areaError,
    areaSupported: areaSupported || skipClassAreas,
    hasData,
    loading,
  }
}
