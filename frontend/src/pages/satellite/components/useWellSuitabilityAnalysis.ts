import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildDemGrid, geometryBBox, type DemGrid } from '../../../lib/hydroWatershed/terrainTiles'
import { buildAoiMask, type HydroComputeContext } from '../../../lib/hydroWatershed/hydroEngine'
import {
  computeWellSuitabilityMcda,
  DEFAULT_MCDA_WEIGHTS,
  normalizeMcdaWeights,
  type McdaCriterionWeights,
  type WellSuitabilityPhase,
  type WellSuitabilityResult,
} from '../../../lib/hydroWatershed/wellSuitabilityMcdaEngine'
import { buildAoiGeoTiff, downloadBlob } from '../../../lib/hydroWatershed/geoTiffExport'
import {
  exportWellSuitabilityKmz,
  exportWellSuitabilityPdf,
  exportWellSuitabilityShapefile,
  exportWellSuitabilityWorkbook,
} from './wellSuitabilityExports'

export type WellSuitabilityState = {
  status: 'idle' | 'running' | 'done' | 'error'
  result: WellSuitabilityResult | null
  error: string | null
  heatVisible: boolean
  streamsVisible: boolean
  pointsVisible: boolean
  opacity: number
  progress: { phase: WellSuitabilityPhase | 'dem'; pct: number; label: string } | null
}

const PHASE_LABELS: Record<WellSuitabilityPhase | 'dem', string> = {
  dem: 'Loading terrain (DEM)…',
  terrain: 'Terrain indices (slope, TWI, curvature)…',
  hydrology: 'Hydrology (flow, drainage, streams)…',
  geology: 'Geology proxies (lithology, fractures)…',
  landSurface: 'Land surface (NDWI/NDMI proxies)…',
  climate: 'Climate & recharge potential…',
  satellite: 'Satellite indices (SAR/S2 proxies)…',
  mcda: 'MCDA weighted overlay…',
  ranking: 'Ranking well locations…',
  vectors: 'Stream network overlay…',
  done: 'Complete',
}

const INITIAL: WellSuitabilityState = {
  status: 'idle',
  result: null,
  error: null,
  heatVisible: true,
  streamsVisible: true,
  pointsVisible: true,
  opacity: 0.78,
  progress: null,
}

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined
  enabled: boolean
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

export function useWellSuitabilityAnalysis({ geometry, enabled, topN: topNProp }: Params) {
  const geomKey = useMemo(() => (geometry ? stableGeometryKey(geometry) : ''), [geometry])
  const hasAoi = !!geomKey && !!geometry

  const [state, setState] = useState<WellSuitabilityState>(() => ({ ...INITIAL }))
  const [weights, setWeights] = useState<McdaCriterionWeights>(() => ({ ...DEFAULT_MCDA_WEIGHTS }))
  const [topN, setTopN] = useState(() => Math.max(5, Math.min(20, topNProp ?? 10)))

  const [demLoading, setDemLoading] = useState(false)
  const [demError, setDemError] = useState<string | null>(null)

  const demRef = useRef<DemGrid | null>(null)
  const maskRef = useRef<Uint8Array | null>(null)
  const demKeyRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)
  const runGenRef = useRef(0)

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

  const setCriterionWeight = useCallback((key: keyof McdaCriterionWeights, value: number) => {
    setWeights(prev => normalizeMcdaWeights({ ...prev, [key]: Math.max(0, value) }))
  }, [])

  const run = useCallback(async () => {
    const gen = runGenRef.current + 1
    runGenRef.current = gen
    setState(prev => ({
      ...prev,
      status: 'running',
      error: null,
      progress: { phase: 'dem', pct: 0.02, label: PHASE_LABELS.dem },
    }))
    const dem = await ensureDem()
    if (runGenRef.current !== gen) return
    if (!dem) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: 'Terrain unavailable for this AOI.',
        progress: null,
      }))
      return
    }
    try {
      const ctx: HydroComputeContext = { dem, aoiMask: maskRef.current, sensitivity: 0.5 }
      const result = await computeWellSuitabilityMcda(ctx, {
        topN,
        weights,
        onProgress: (phase, pct) => {
          if (runGenRef.current !== gen) return
          setState(prev => ({
            ...prev,
            progress: { phase, pct, label: PHASE_LABELS[phase] },
          }))
        },
      })
      if (runGenRef.current !== gen) return
      setState(prev => ({
        ...prev,
        status: 'done',
        result,
        error: null,
        heatVisible: true,
        streamsVisible: true,
        pointsVisible: true,
        opacity: prev.opacity || result.raster.opacity || 0.78,
        progress: { phase: 'done', pct: 1, label: PHASE_LABELS.done },
      }))
    } catch (err) {
      if (runGenRef.current !== gen) return
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err instanceof Error ? err.message : 'MCDA analysis failed.',
        progress: null,
      }))
    }
  }, [ensureDem, topN, weights])

  const toggleHeat = useCallback(() => {
    setState(prev => ({ ...prev, heatVisible: !prev.heatVisible }))
  }, [])

  const toggleStreams = useCallback(() => {
    setState(prev => ({ ...prev, streamsVisible: !prev.streamsVisible }))
  }, [])

  const togglePoints = useCallback(() => {
    setState(prev => ({ ...prev, pointsVisible: !prev.pointsVisible }))
  }, [])

  const setOpacity = useCallback((value: number) => {
    const v = Math.max(0, Math.min(1, value))
    setState(prev => ({ ...prev, opacity: v }))
  }, [])

  const clear = useCallback(() => {
    runGenRef.current += 1
    setState({ ...INITIAL })
  }, [])

  const exportHeatGeoTiff = useCallback(() => {
    const band = state.result?.raster.band
    if (!band) return false
    const { blob, filename } = buildAoiGeoTiff(band, maskRef.current)
    downloadBlob(blob, filename.replace(/\.tif$/i, '-mcda-potential.tif'))
    return true
  }, [state.result])

  const exportPointsGeoJson = useCallback(() => {
    const fc = state.result?.pointsGeoJson
    if (!fc) return false
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' })
    downloadBlob(blob, 'well-suitability-sites.geojson')
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
    const rows = points.map(p => cols.map(c => esc(p.attributes[c])).join(','))
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    downloadBlob(blob, 'well-suitability-sites.csv')
    return true
  }, [state.result])

  const exportXlsx = useCallback(() => {
    if (!state.result) return false
    return exportWellSuitabilityWorkbook(state.result)
  }, [state.result])

  const exportPdf = useCallback(() => {
    if (!state.result) return false
    return exportWellSuitabilityPdf(state.result)
  }, [state.result])

  const exportShapefile = useCallback(async () => {
    const fc = state.result?.pointsGeoJson
    if (!fc) return false
    await exportWellSuitabilityShapefile(fc)
    return true
  }, [state.result])

  const exportKmz = useCallback(async () => {
    const fc = state.result?.pointsGeoJson
    if (!fc) return false
    await exportWellSuitabilityKmz(fc)
    return true
  }, [state.result])

  useEffect(() => {
    if (!enabled) {
      abortRef.current?.abort()
      runGenRef.current += 1
    }
  }, [enabled])

  return {
    ...state,
    weights,
    topN,
    demLoading,
    demError,
    hasAoi,
    setCriterionWeight,
    setTopN,
    run,
    toggleHeat,
    toggleStreams,
    togglePoints,
    setOpacity,
    clear,
    exportHeatGeoTiff,
    exportPointsGeoJson,
    exportPointsCsv,
    exportXlsx,
    exportPdf,
    exportShapefile,
    exportKmz,
  }
}

export type UseWellSuitabilityAnalysis = ReturnType<typeof useWellSuitabilityAnalysis>
