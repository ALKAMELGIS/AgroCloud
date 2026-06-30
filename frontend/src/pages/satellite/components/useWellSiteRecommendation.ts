import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildDemGrid, geometryBBox, type DemGrid } from '../../../lib/hydroWatershed/terrainTiles'
import {
  buildAoiMask,
  computeWellSiteSuitability,
  type HydroComputeContext,
  type WellSiteResult,
} from '../../../lib/hydroWatershed/hydroEngine'
import { buildAoiGeoTiff, downloadBlob } from '../../../lib/hydroWatershed/geoTiffExport'
import { exportWellSiteWorkbook } from './wellSiteWorkbook'

export type WellSiteState = {
  status: 'idle' | 'running' | 'done' | 'error'
  result: WellSiteResult | null
  error: string | null
  /** Suitability heatmap shown on the map. */
  heatVisible: boolean
  /** Recommended drilling points shown on the map. */
  pointsVisible: boolean
  /** User-controlled heatmap opacity (0..1) on top of base symbology. */
  opacity: number
}

const INITIAL: WellSiteState = {
  status: 'idle',
  result: null,
  error: null,
  heatVisible: true,
  pointsVisible: true,
  opacity: 0.78,
}

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined
  enabled: boolean
  /** Number of recommended sites (5–10). */
  topN?: number
}

function stableGeometryKey(geometry: GeoJSON.Geometry | GeoJSON.Feature): string {
  try {
    const geom =
      (geometry as GeoJSON.Feature).type === 'Feature'
        ? (geometry as GeoJSON.Feature).geometry
        : (geometry as GeoJSON.Geometry)
    if (!geom) return ''
    return JSON.stringify(geom, (_k, v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v))
  } catch {
    return ''
  }
}

/**
 * Well Site Recommendation (Hydro-AI). Lazily fetches a DEM for the AOI, derives a
 * multi-criteria suitability heatmap + the top-N recommended drilling points, and
 * exposes show/hide, opacity and export (GeoTIFF heatmap, GeoJSON/CSV points).
 */
export function useWellSiteRecommendation({ geometry, enabled, topN }: Params) {
  const geomKey = useMemo(() => (geometry ? stableGeometryKey(geometry) : ''), [geometry])
  const hasAoi = !!geomKey && !!geometry

  const [state, setState] = useState<WellSiteState>(() => ({ ...INITIAL }))
  const [demLoading, setDemLoading] = useState(false)
  const [demError, setDemError] = useState<string | null>(null)

  const demRef = useRef<DemGrid | null>(null)
  const maskRef = useRef<Uint8Array | null>(null)
  const demKeyRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    demRef.current = null
    maskRef.current = null
    demKeyRef.current = ''
    setDemError(null)
  }, [geomKey])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const ensureDem = useCallback(async (): Promise<DemGrid | null> => {
    if (demRef.current && demKeyRef.current === geomKey) return demRef.current
    if (!geometry) return null
    const bbox = geometryBBox(geometry)
    if (!bbox) return null
    setDemLoading(true)
    setDemError(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const dem = await buildDemGrid({ bbox, signal: controller.signal })
      if (controller.signal.aborted) return null
      if (!dem) {
        setDemError('Could not load terrain data for this area. Try a different AOI.')
        return null
      }
      demRef.current = dem
      maskRef.current = buildAoiMask(dem, geometry)
      demKeyRef.current = geomKey
      return dem
    } catch (err) {
      if (controller.signal.aborted) return null
      setDemError(err instanceof Error ? err.message : 'Terrain download failed.')
      return null
    } finally {
      setDemLoading(false)
    }
  }, [geometry, geomKey])

  const run = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'running', error: null }))
    const dem = await ensureDem()
    if (!dem) {
      setState(prev => ({ ...prev, status: 'error', error: 'Terrain unavailable for this AOI.' }))
      return
    }
    try {
      await new Promise(r => window.setTimeout(r, 16))
      const ctx: HydroComputeContext = { dem, aoiMask: maskRef.current, sensitivity: 0.5 }
      const result = computeWellSiteSuitability(ctx, { topN })
      setState(prev => ({
        ...prev,
        status: 'done',
        result,
        error: null,
        heatVisible: true,
        pointsVisible: true,
        opacity: prev.opacity || result.raster.opacity || 0.78,
      }))
    } catch (err) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'Computation failed.',
      }))
    }
  }, [ensureDem, topN])

  const toggleHeat = useCallback(() => {
    setState(prev => ({ ...prev, heatVisible: !prev.heatVisible }))
  }, [])

  const togglePoints = useCallback(() => {
    setState(prev => ({ ...prev, pointsVisible: !prev.pointsVisible }))
  }, [])

  const setOpacity = useCallback((value: number) => {
    const v = Math.max(0, Math.min(1, value))
    setState(prev => ({ ...prev, opacity: v }))
  }, [])

  const clear = useCallback(() => {
    setState({ ...INITIAL })
  }, [])

  const exportHeatGeoTiff = useCallback(() => {
    const band = state.result?.raster.band
    if (!band) return false
    const { blob, filename } = buildAoiGeoTiff(band, maskRef.current)
    downloadBlob(blob, filename)
    return true
  }, [state.result])

  const exportPointsGeoJson = useCallback(() => {
    const fc = state.result?.pointsGeoJson
    if (!fc) return false
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
    downloadBlob(blob, 'well-site-recommendations.geojson')
    return true
  }, [state.result])

  const exportPointsCsv = useCallback(() => {
    const points = state.result?.points
    if (!points?.length) return false
    const cols = Object.keys(points[0]!.attributes)
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = cols.join(',')
    const rows = points.map(p => cols.map(c => esc((p.attributes as Record<string, unknown>)[c])).join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    downloadBlob(blob, 'well-site-recommendations.csv')
    return true
  }, [state.result])

  const exportXlsx = useCallback(() => {
    if (!state.result) return false
    return exportWellSiteWorkbook(state.result)
  }, [state.result])

  useEffect(() => {
    if (!enabled) abortRef.current?.abort()
  }, [enabled])

  return {
    ...state,
    demLoading,
    demError,
    hasAoi,
    run,
    toggleHeat,
    togglePoints,
    setOpacity,
    clear,
    exportHeatGeoTiff,
    exportPointsGeoJson,
    exportPointsCsv,
    exportXlsx,
  }
}

export type UseWellSiteRecommendation = ReturnType<typeof useWellSiteRecommendation>
