import { useEffect, useMemo, useRef, useState } from 'react'
import type { LayerLiveLegendSpec } from '../../../lib/layerLiveLegendCatalog'
import {
  fetchLegendAnalyzeWmsZonalStats,
  layerSupportsLegendWmsZonal,
} from '../../../lib/legendAnalyzeWmsZonal'
import {
  fetchMultiLayerAoiFieldDailyRow,
  resolveFieldAreaHa,
  resolveMultiLayerAoiIndexStats,
} from '../../../lib/siMultiLayerAoiTrendAnalysis'
import { layerSupportsClassArea } from '../../../lib/siLayerClassAreaEngine'
import { isClassAreaAbortError, stableGeometryKey, useLayerClassAreas } from './useLayerClassAreas'
import {
  computeLayerLegendAnalyzeStats,
  LAYER_LEGEND_LARGE_AOI_HA,
  resolveLegendAnalyzeFetchGeometry,
  type LayerLegendAnalyzeStats,
  type LayerLegendIndexStatsFallback,
} from './layerLegendAnalyzeStats'

/** Shorter lookback for legend panel Statistical API fallback. */
const LEGEND_ANALYZE_LOOKBACK_DAYS = 21
const LEGEND_ANALYZE_LARGE_AOI_LOOKBACK_DAYS = 45
/** Coarser histogram on bbox for large AOIs (agro composites). */
const LEGEND_LARGE_AOI_CLASS_AREA_RESOLUTION_M = 20

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
 * Analyze / Statistics for the active layer:
 * 1) WMS zonal on the active scene (tiled for large AOI)
 * 2) Histogram class areas (full AOI or bbox for agro composites)
 * 3) Statistical API time-series fallback
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
  const skipFullClassAreas = areaHa > LAYER_LEGEND_LARGE_AOI_HA
  const fetchGeom = useMemo(
    () => resolveLegendAnalyzeFetchGeometry(geom, areaHa),
    [geom, areaHa],
  )

  const dateKey = useMemo(() => {
    const raw = String(sceneDate || '').trim().slice(0, 10)
    if (raw) return raw
    return new Date().toISOString().slice(0, 10)
  }, [sceneDate])
  const layerKey = String(layerId || '').trim().toUpperCase()

  const classAreasOnBbox =
    enabled &&
    skipFullClassAreas &&
    !!fetchGeom &&
    !!layerKey &&
    layerSupportsClassArea(layerKey)

  const classAreasEnabled = enabled && !skipFullClassAreas
  const classAreaGeometry = classAreasOnBbox && fetchGeom ? fetchGeom : geometry

  const {
    result: areaResult,
    loading: areaLoading,
    error: areaError,
    supported: areaSupported,
  } = useLayerClassAreas({
    geometry: classAreaGeometry,
    layerId,
    sceneDate,
    enabled: classAreasEnabled || classAreasOnBbox,
    resolutionMeters: classAreasOnBbox ? LEGEND_LARGE_AOI_CLASS_AREA_RESOLUTION_M : undefined,
  })

  const [wmsZonal, setWmsZonal] = useState<LayerLegendIndexStatsFallback | null>(null)
  const [wmsLoading, setWmsLoading] = useState(false)
  const wmsGenRef = useRef(0)

  const [apiFallback, setApiFallback] = useState<LayerLegendIndexStatsFallback | null>(null)
  const [apiLoading, setApiLoading] = useState(false)
  const apiGenRef = useRef(0)

  const hasClassData = classAreaHasSamples(areaResult)
  const wmsEnabled =
    enabled && !!geom && !!dateKey && !!layerKey && layerSupportsLegendWmsZonal(layerKey)

  useEffect(() => {
    if (!wmsEnabled || !geom) {
      wmsGenRef.current += 1
      setWmsZonal(null)
      setWmsLoading(false)
      return
    }

    const requestId = ++wmsGenRef.current
    const controller = new AbortController()
    setWmsLoading(true)
    setWmsZonal(null)

    fetchLegendAnalyzeWmsZonalStats(geom, dateKey, layerKey, {
      signal: controller.signal,
      areaHa,
    })
      .then(stats => {
        if (requestId !== wmsGenRef.current) return
        if (controller.signal.aborted) return
        if (stats?.average != null && Number.isFinite(stats.average)) {
          setWmsZonal(stats)
        } else {
          setWmsZonal(null)
        }
      })
      .catch((err: unknown) => {
        if (requestId !== wmsGenRef.current) return
        if (controller.signal.aborted || isClassAreaAbortError(err)) return
        setWmsZonal(null)
      })
      .finally(() => {
        if (requestId !== wmsGenRef.current) return
        setWmsLoading(false)
      })

    return () => {
      if (wmsGenRef.current === requestId) wmsGenRef.current += 1
      controller.abort()
    }
  }, [wmsEnabled, geom, geomKey, dateKey, layerKey, areaHa])

  const mergedIndexStats = wmsZonal ?? apiFallback
  const needsApiFallback =
    enabled &&
    !!geomKey &&
    !!fetchGeom &&
    !!dateKey &&
    !!layerKey &&
    !hasClassData &&
    !(wmsZonal?.average != null && Number.isFinite(wmsZonal.average))

  useEffect(() => {
    if (!needsApiFallback) {
      apiGenRef.current += 1
      setApiFallback(null)
      setApiLoading(false)
      return
    }

    const requestId = ++apiGenRef.current
    const controller = new AbortController()
    setApiLoading(true)
    setApiFallback(null)

    const lookbackDays = skipFullClassAreas
      ? LEGEND_ANALYZE_LARGE_AOI_LOOKBACK_DAYS
      : LEGEND_ANALYZE_LOOKBACK_DAYS

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
        geometry: fetchGeom,
      },
      dateKey,
      [layerKey],
      { signal: controller.signal, lookbackDays },
    )
      .then(row => {
        if (requestId !== apiGenRef.current) return
        if (controller.signal.aborted) return
        const stats = resolveMultiLayerAoiIndexStats(layerKey, row)
        if (stats.mean == null || !Number.isFinite(stats.mean)) {
          setApiFallback(null)
          return
        }
        setApiFallback({
          min: stats.min,
          max: stats.max,
          average: stats.mean,
        })
      })
      .catch((err: unknown) => {
        if (requestId !== apiGenRef.current) return
        if (controller.signal.aborted || isClassAreaAbortError(err)) return
        setApiFallback(null)
      })
      .finally(() => {
        if (requestId !== apiGenRef.current) return
        setApiLoading(false)
      })

    return () => {
      if (apiGenRef.current === requestId) apiGenRef.current += 1
      controller.abort()
    }
  }, [needsApiFallback, geomKey, fetchGeom, dateKey, layerKey, skipFullClassAreas])

  const analyzeStats = useMemo(
    () =>
      computeLayerLegendAnalyzeStats({
        layerId,
        spec,
        areaResult: hasClassData ? areaResult : null,
        indexStats: mergedIndexStats,
      }),
    [layerId, spec, areaResult, hasClassData, mergedIndexStats],
  )

  const hasData =
    hasClassData ||
    (wmsZonal?.average != null && Number.isFinite(wmsZonal.average)) ||
    (apiFallback?.average != null && Number.isFinite(apiFallback.average)) ||
    (analyzeStats.average != null && Number.isFinite(analyzeStats.average))

  const loading =
    !hasData &&
    (wmsLoading ||
      apiLoading ||
      ((classAreasEnabled || classAreasOnBbox) && areaLoading))

  return {
    analyzeStats,
    areaResult,
    areaLoading,
    areaError,
    areaSupported: areaSupported || skipFullClassAreas || classAreasOnBbox,
    hasData,
    loading,
  }
}
