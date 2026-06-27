import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildDemGrid, geometryBBox, type DemGrid } from '../../../lib/hydroWatershed/terrainTiles'
import {
  buildAoiMask,
  HYDRO_COMPUTE,
  type HydroComputeContext,
  type HydroStepId,
  type HydroStepResult,
} from '../../../lib/hydroWatershed/hydroEngine'
import { buildAoiGeoTiff, downloadBlob } from '../../../lib/hydroWatershed/geoTiffExport'

export type HydroStepState = {
  status: 'idle' | 'running' | 'done' | 'error'
  result: HydroStepResult | null
  error: string | null
  /** Whether the produced layer is shown on the map. */
  visible: boolean
  /** User-controlled layer opacity (0..1) applied on top of the base symbology. */
  opacity: number
}

const EMPTY_STEP: HydroStepState = { status: 'idle', result: null, error: null, visible: false, opacity: 1 }

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined
  enabled: boolean
  sensitivity?: number
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
 * Hydro Watershed Workflow orchestration. Lazily fetches a DEM for the AOI on the
 * first analysis run, caches it (+ the AOI raster mask) for the whole session, and
 * runs each terrain-hydrology step on demand so results stream onto the map as
 * independent layers.
 */
export function useHydroWatershed({ geometry, enabled, sensitivity }: Params) {
  const geomKey = useMemo(() => (geometry ? stableGeometryKey(geometry) : ''), [geometry])
  const hasAoi = !!geomKey && !!geometry

  const [steps, setSteps] = useState<Record<HydroStepId, HydroStepState>>(() => ({
    dem: { ...EMPTY_STEP },
    hillshade: { ...EMPTY_STEP },
    slope: { ...EMPTY_STEP },
    'flow-accum': { ...EMPTY_STEP },
    streams: { ...EMPTY_STEP },
    watershed: { ...EMPTY_STEP },
    mesh: { ...EMPTY_STEP },
  }))
  const [demLoading, setDemLoading] = useState(false)
  const [demError, setDemError] = useState<string | null>(null)

  const demRef = useRef<DemGrid | null>(null)
  const maskRef = useRef<Uint8Array | null>(null)
  const demKeyRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)

  // Invalidate the cached DEM/mask when the AOI changes so the *next* run computes
  // against the new geometry. Existing result layers are intentionally kept on the
  // map — analysis layers are persistent and only removed by explicit user action
  // (toggle/delete in the Layers panel), never by editing the AOI.
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

  const runStep = useCallback(
    async (id: HydroStepId) => {
      setSteps(prev => ({ ...prev, [id]: { ...prev[id], status: 'running', error: null } }))
      const dem = await ensureDem()
      if (!dem) {
        setSteps(prev => ({
          ...prev,
          [id]: { ...prev[id], status: 'error', error: 'Terrain unavailable for this AOI.' },
        }))
        return
      }
      try {
        // Yield a frame so the spinner paints before heavy synchronous CPU work.
        await new Promise(r => window.setTimeout(r, 16))
        const ctx: HydroComputeContext = {
          dem,
          aoiMask: maskRef.current,
          sensitivity: sensitivity ?? 0.5,
        }
        const result = HYDRO_COMPUTE[id](ctx)
        setSteps(prev => ({
          ...prev,
          [id]: { status: 'done', result, error: null, visible: true, opacity: prev[id]?.opacity ?? 1 },
        }))
      } catch (err) {
        setSteps(prev => ({
          ...prev,
          [id]: {
            ...prev[id],
            status: 'error',
            error: err instanceof Error ? err.message : 'Computation failed.',
          },
        }))
      }
    },
    [ensureDem, sensitivity],
  )

  const toggleVisible = useCallback((id: HydroStepId) => {
    setSteps(prev => ({ ...prev, [id]: { ...prev[id], visible: !prev[id].visible } }))
  }, [])

  // Live, no-reload opacity control for a result layer (clamped to 0..1).
  const setOpacity = useCallback((id: HydroStepId, value: number) => {
    const v = Math.max(0, Math.min(1, value))
    setSteps(prev => ({ ...prev, [id]: { ...prev[id], opacity: v } }))
  }, [])

  // Remove a single result layer without touching the others.
  const removeStep = useCallback((id: HydroStepId) => {
    setSteps(prev => ({ ...prev, [id]: { ...EMPTY_STEP } }))
  }, [])

  /**
   * Export a finished raster layer as a georeferenced, AOI-clipped GeoTIFF
   * (EPSG:3857, native Float32 values, lossless LZW) and trigger a download.
   */
  const exportRaster = useCallback((id: HydroStepId) => {
    const result = steps[id]?.result
    if (!result || result.kind !== 'raster' || !result.band) return false
    const { blob, filename } = buildAoiGeoTiff(result.band, maskRef.current)
    downloadBlob(blob, filename)
    return true
  }, [steps])

  const clearAll = useCallback(() => {
    setSteps(prev => {
      const next = { ...prev }
      for (const k of Object.keys(next) as HydroStepId[]) next[k] = { ...EMPTY_STEP }
      return next
    })
  }, [])

  // Closing the tool (or switching mode) must NOT remove analysis layers — they
  // stay on the map until the user removes them. We only abort an in-flight DEM
  // fetch so a background download doesn't keep running while the tool is hidden.
  useEffect(() => {
    if (!enabled) abortRef.current?.abort()
  }, [enabled])

  return {
    steps,
    demLoading,
    demError,
    hasAoi,
    runStep,
    toggleVisible,
    setOpacity,
    removeStep,
    exportRaster,
    clearAll,
  }
}
