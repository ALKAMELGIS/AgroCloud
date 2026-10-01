import { useEffect, useMemo } from 'react'
import { resolveFieldAreaHa } from '../temporal-analysis/siMultiLayerAoiTrendAnalysis'
import {
  layerSupportsLegendWmsZonal,
  prefetchLegendAnalyzeWmsZonalStats,
} from './legendAnalyzeWmsZonal'
import { stableGeometryKey } from '../classification/useLayerClassAreas'

function geometryForFetch(
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
): GeoJSON.Geometry | null {
  if (!geometry) return null
  if ((geometry as GeoJSON.Feature).type === 'Feature') {
    return (geometry as GeoJSON.Feature).geometry ?? null
  }
  return geometry as GeoJSON.Geometry
}

/**
 * Warm Layer Live Analyze WMS zonal stats before the float legend opens.
 */
export function usePrefetchLayerLegendAnalyze(
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined,
  layerId: string | undefined,
  sceneDate: string | undefined,
  enabled = true,
): void {
  const geomKey = useMemo(
    () => (geometry ? stableGeometryKey(geometry) : ''),
    [geometry],
  )
  const geom = useMemo(() => geometryForFetch(geometry), [geomKey, geometry])
  const dateKey = useMemo(() => {
    const raw = String(sceneDate || '').trim().slice(0, 10)
    if (raw) return raw
    return new Date().toISOString().slice(0, 10)
  }, [sceneDate])
  const layerKey = String(layerId || '').trim().toUpperCase()

  useEffect(() => {
    if (!enabled || !geom || !dateKey || !layerKey) return
    if (!layerSupportsLegendWmsZonal(layerKey)) return
    const areaHa = resolveFieldAreaHa(geom)
    prefetchLegendAnalyzeWmsZonalStats(geom, dateKey, layerKey, { areaHa })
  }, [enabled, geom, geomKey, dateKey, layerKey])
}
