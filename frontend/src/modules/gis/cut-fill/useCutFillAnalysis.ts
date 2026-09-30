import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildDemGrid, geometryBBox, type DemGrid } from '../spatial-analysis/hydro-watershed/terrainTiles'
import { buildAoiMask } from '../spatial-analysis/hydro-watershed/hydroEngine'
import { suggestUtmEpsgFromLngLat } from './cutFillCrs'
import {
  buildDesignGridConstant,
  buildDesignGridFromXyz,
  designConstantOnTerrain,
  parseXyzCsvText,
} from './cutFillDesignSurface'
import { sampleGeoTiffFileToDemGrid } from './cutFillGeoTiff'
import {
  buildClassificationPreviewLayer,
  buildDifferencePreviewLayer,
  buildElevationPreviewLayer,
} from './cutFillRasterPreview'
import { contoursForElevationGrid } from './cutFillTerrainContours'
import { runCutFillInWorker } from './runCutFillInWorker'
import type { CutFillMapHit } from './cutFillMapSample'
import type {
  CutFillAnalysisResult,
  CutFillDesignSourceKind,
  CutFillExistingSourceKind,
  CutFillProgress,
  CutFillTableRow,
  CutFillWizardStep,
} from './cutFillTypes'
import { runCutFillExport, type CutFillExportKind } from './cutFillExports'
import { resolveCutFillDemBuildOptions } from './cutFillDemBudget'
import { trimDemGridWithMask } from './cutFillDemCrop'

export type CutFillLayerVisibility = {
  existing: boolean
  design: boolean
  difference: boolean
  classification: boolean
  existingContours: boolean
  designContours: boolean
  /** Excavation / material removal. */
  cut: boolean
  /** Fill / material addition. */
  fill: boolean
  /** Cells inside the vertical tolerance. */
  noChange: boolean
}

const DEFAULT_LAYERS: CutFillLayerVisibility = {
  existing: false,
  design: false,
  difference: true,
  classification: true,
  existingContours: false,
  designContours: false,
  cut: true,
  fill: true,
  noChange: true,
}

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined
  enabled: boolean
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

function aoiCentroid(
  geometry: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): [number, number] | null {
  if (!geometry) return null
  if ((geometry as GeoJSON.FeatureCollection).type === 'FeatureCollection') {
    const fc = geometry as GeoJSON.FeatureCollection
    const first = fc.features?.find(f => f.geometry)
    if (!first) return null
    return aoiCentroid(first)
  }
  const bbox = geometryBBox(geometry as GeoJSON.Geometry | GeoJSON.Feature)
  if (!bbox) return null
  return [(bbox.west + bbox.east) / 2, (bbox.north + bbox.south) / 2]
}

export function useCutFillAnalysis({ geometry, enabled }: Params) {
  const geomKey = useMemo(() => (geometry ? stableGeometryKey(geometry) : ''), [geometry])
  const hasAoi = !!geomKey && !!geometry

  const [step, setStep] = useState<CutFillWizardStep>('surfaces')
  const [existingKind, setExistingKind] = useState<CutFillExistingSourceKind>('terrarium')
  const [designKind, setDesignKind] = useState<CutFillDesignSourceKind>('constant')
  const [existingConstantM, setExistingConstantM] = useState(100)
  const [designConstantM, setDesignConstantM] = useState(100)
  const [existingGeoTiff, setExistingGeoTiff] = useState<File | null>(null)
  const [designGeoTiff, setDesignGeoTiff] = useState<File | null>(null)
  const [designXyzText, setDesignXyzText] = useState('')
  const [verticalToleranceM, setVerticalToleranceM] = useState(0.15)
  const [contourIntervalM, setContourIntervalM] = useState(5)
  const [crsOverride, setCrsOverride] = useState<number | null>(null)
  const [verticalDatumLabel, setVerticalDatumLabel] = useState('Ellipsoidal (Terrarium / WGS84)')
  const [progress, setProgress] = useState<CutFillProgress>({
    phase: 'idle',
    message: '',
    rowsDone: 0,
    rowsTotal: 0,
    percent: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CutFillAnalysisResult | null>(null)
  const [layers, setLayers] = useState<CutFillLayerVisibility>(() => ({ ...DEFAULT_LAYERS }))
  const [layerOpacity, setLayerOpacity] = useState(0.88)
  const [mapHit, setMapHit] = useState<CutFillMapHit | null>(null)
  const [highlightRowId, setHighlightRowId] = useState<number | null>(null)
  const [tableFilter, setTableFilter] = useState('')

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
    setResult(null)
    setMapHit(null)
    setCrsOverride(null)
  }, [geomKey])

  useEffect(() => () => abortRef.current?.abort(), [])

  const autoCrs = useMemo(() => {
    const c = aoiCentroid(geometry ?? null)
    if (!c) return null
    return suggestUtmEpsgFromLngLat(c[0], c[1])
  }, [geometry])

  const effectiveCrsEpsg = crsOverride ?? autoCrs?.epsg ?? null

  const crsLabel = useMemo(() => {
    if (!hasAoi) return 'Draw an AOI on the map to auto-select UTM.'
    if (crsOverride) return `EPSG:${crsOverride} (manual override)`
    if (autoCrs) return autoCrs.label
    return 'EPSG:4326'
  }, [hasAoi, autoCrs, crsOverride])

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
      const demOpts = resolveCutFillDemBuildOptions(geometry)
      const dem = await buildDemGrid({
        bbox,
        signal: controller.signal,
        ...demOpts,
        tileConcurrency: 12,
      })
      if (controller.signal.aborted) return null
      if (!dem) {
        setDemError('Could not load terrain for this AOI.')
        return null
      }
      let mask = buildAoiMask(dem, geometry)
      const trimmed = trimDemGridWithMask(dem, mask)
      const finalDem = trimmed?.dem ?? dem
      const finalMask = trimmed?.mask ?? mask
      demRef.current = finalDem
      maskRef.current = finalMask
      demKeyRef.current = geomKey
      return finalDem
    } catch (err) {
      if (controller.signal.aborted) return null
      setDemError(err instanceof Error ? err.message : 'Terrain download failed.')
      return null
    } finally {
      setDemLoading(false)
    }
  }, [geometry, geomKey])

  useEffect(() => {
    if (!enabled || !hasAoi || !geometry) return
    void ensureDem()
  }, [enabled, hasAoi, geomKey, ensureDem, geometry])

  useEffect(() => {
    if (!enabled || !result) return
    setLayers(prev => ({ ...prev, cut: true, fill: true, noChange: true, classification: true }))
    setStep('results')
    if (designKind !== 'constant') return
    const used = result.designElev.find(z => Number.isFinite(z))
    if (used == null) return
    const leveled = designConstantOnTerrain(result.existingElev, used)
    if (Math.abs(used - leveled) < 0.5) return
    void run()
  }, [enabled])

  const buildExistingElev = useCallback(
    async (dem: DemGrid, signal: AbortSignal): Promise<Float32Array> => {
      if (existingKind === 'constant') return buildDesignGridConstant(dem, existingConstantM)
      if (existingKind === 'geotiff') {
        if (!existingGeoTiff) throw new Error('Upload an existing-surface GeoTIFF.')
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        setVerticalDatumLabel('From uploaded GeoTIFF (embedded CRS when present)')
        return sampleGeoTiffFileToDemGrid(existingGeoTiff, dem)
      }
      return new Float32Array(dem.elev)
    },
    [existingKind, existingConstantM, existingGeoTiff],
  )

  const buildDesignElev = useCallback(
    async (dem: DemGrid, signal: AbortSignal): Promise<Float32Array> => {
      if (designKind === 'constant') return buildDesignGridConstant(dem, designConstantM)
      if (designKind === 'geotiff') {
        if (!designGeoTiff) throw new Error('Upload a design-surface GeoTIFF.')
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return sampleGeoTiffFileToDemGrid(designGeoTiff, dem)
      }
      const pts = parseXyzCsvText(designXyzText)
      if (!pts.length) throw new Error('Provide XYZ/CSV design points (lng, lat, z).')
      return buildDesignGridFromXyz(dem, pts)
    },
    [designKind, designConstantM, designGeoTiff, designXyzText],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setProgress(p => ({ ...p, phase: 'idle', message: 'Cancelled', percent: 0 }))
  }, [])

  const run = useCallback(async () => {
    setError(null)
    const demCached = demRef.current && demKeyRef.current === geomKey
    setProgress({
      phase: 'dem',
      message: demCached ? 'Using cached terrain…' : 'Loading terrain…',
      rowsDone: 0,
      rowsTotal: 0,
      percent: demCached ? 12 : 5,
    })
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      if (!geometry) return
      const demOpts = resolveCutFillDemBuildOptions(geometry)
      let dem = demRef.current && demKeyRef.current === geomKey ? demRef.current : null
      if (!dem) {
        const bbox = geometryBBox(geometry)
        if (!bbox) return
        dem = await buildDemGrid({
          bbox,
          signal: controller.signal,
          ...demOpts,
          tileConcurrency: 12,
          onTileProgress: (loaded, total) => {
            const pct = 5 + Math.round((loaded / Math.max(1, total)) * 18)
            setProgress({
              phase: 'dem',
              message: `Loading terrain (${loaded}/${total} tiles)…`,
              rowsDone: loaded,
              rowsTotal: total,
              percent: pct,
            })
          },
        })
        if (!dem || controller.signal.aborted) return
        let mask = buildAoiMask(dem, geometry)
        const trimmed = trimDemGridWithMask(dem, mask)
        dem = trimmed?.dem ?? dem
        maskRef.current = trimmed?.mask ?? mask
        demRef.current = dem
        demKeyRef.current = geomKey
      }
      if (!dem || controller.signal.aborted) return
      setProgress(p => ({ ...p, phase: 'design', message: 'Building surfaces…', percent: 28 }))
      const existingElev = await buildExistingElev(dem, controller.signal)
      let designElev = await buildDesignElev(dem, controller.signal)
      if (designKind === 'constant') {
        const leveled = designConstantOnTerrain(existingElev, designConstantM)
        if (Math.abs(leveled - designConstantM) > 0.05) {
          setDesignConstantM(Number(leveled.toFixed(2)))
          designElev = buildDesignGridConstant(dem, leveled)
        }
      }
      if (controller.signal.aborted) return
      setProgress({ phase: 'compute', message: 'Computing cut/fill…', rowsDone: 0, rowsTotal: dem.height, percent: 35 })
      const computeOut = await runCutFillInWorker(
        {
          dem,
          existingElev,
          designElev,
          aoiMask: maskRef.current,
          verticalToleranceM,
          maxTableRows: 4_000,
        },
        (rowsDone, rowsTotal) => {
          const pct = 35 + Math.round((rowsDone / Math.max(1, rowsTotal)) * 48)
          setProgress({
            phase: 'compute',
            message: 'Computing cut/fill…',
            rowsDone,
            rowsTotal,
            percent: pct,
          })
        },
        controller.signal,
      )
      if (controller.signal.aborted) return
      setProgress(p => ({ ...p, phase: 'layers', message: 'Building map layers…', percent: 88 }))
      const mask = maskRef.current
      const parameters = {
        verticalToleranceM,
        contourIntervalM,
        crsLabel,
        verticalDatumLabel,
      }
      const diffLayer = buildDifferencePreviewLayer(dem, computeOut.difference, mask)
      const classLayer = buildClassificationPreviewLayer(dem, computeOut.classification, mask)

      const analysis: CutFillAnalysisResult = {
        dem,
        existingElev,
        designElev,
        difference: computeOut.difference,
        classification: computeOut.classification,
        summary: computeOut.summary,
        rows: computeOut.rows,
        parameters,
        diffLayer,
        classLayer,
      }
      setResult(analysis)
      setLayers({ ...DEFAULT_LAYERS })
      setMapHit(null)
      setStep('results')
      setProgress({ phase: 'done', message: 'Complete', rowsDone: dem.height, rowsTotal: dem.height, percent: 100 })
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Analysis failed.'
      setError(msg)
      setProgress(p => ({ ...p, phase: 'error', message: msg }))
    }
  }, [
    geometry,
    geomKey,
    buildExistingElev,
    buildDesignElev,
    designKind,
    designConstantM,
    verticalToleranceM,
    contourIntervalM,
    crsLabel,
    verticalDatumLabel,
  ])

  const filteredRows = useMemo(() => {
    if (!result) return [] as CutFillTableRow[]
    const q = tableFilter.trim().toLowerCase()
    if (!q) return result.rows
    return result.rows.filter(
      r =>
        r.type.toLowerCase().includes(q) ||
        String(r.id).includes(q) ||
        r.difference.toFixed(2).includes(q),
    )
  }, [result, tableFilter])

  const highlightFeature = useMemo((): GeoJSON.Feature | null => {
    if (!result || highlightRowId == null) return null
    const row = result.rows.find(r => r.id === highlightRowId)
    if (!row) return null
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lng, row.lat] },
      properties: { id: row.id, type: row.type },
    }
  }, [result, highlightRowId])

  const exportFormat = useCallback(
    async (kind: CutFillExportKind) => {
      if (!result) return
      await runCutFillExport(kind, result, maskRef.current)
    },
    [result],
  )

  const buildDeferredLayers = useCallback(
    (analysis: CutFillAnalysisResult, keys: Partial<Record<keyof CutFillLayerVisibility, boolean>>) => {
      const mask = maskRef.current
      const patch: Partial<CutFillAnalysisResult> = {}
      if (keys.existing && !analysis.existingPreview) {
        patch.existingPreview = buildElevationPreviewLayer(analysis.dem, analysis.existingElev, mask, 0.82)
      }
      if (keys.design && !analysis.designPreview) {
        patch.designPreview = buildElevationPreviewLayer(analysis.dem, analysis.designElev, mask, 0.72)
      }
      if (keys.existingContours && !analysis.existingContours && analysis.parameters.contourIntervalM > 0) {
        patch.existingContours = contoursForElevationGrid(
          analysis.dem,
          analysis.existingElev,
          mask,
          analysis.parameters.contourIntervalM,
        )
      }
      if (keys.designContours && !analysis.designContours && analysis.parameters.contourIntervalM > 0) {
        patch.designContours = contoursForElevationGrid(
          analysis.dem,
          analysis.designElev,
          mask,
          analysis.parameters.contourIntervalM,
        )
      }
      if (Object.keys(patch).length === 0) return analysis
      return { ...analysis, ...patch }
    },
    [],
  )

  const setClassOverlay = useCallback((on: boolean) => {
    setLayers(prev => ({ ...prev, cut: on, fill: on, noChange: on, classification: on }))
  }, [])

  const toggleLayer = useCallback(
    (key: keyof CutFillLayerVisibility) => {
      setLayers(prev => {
        const nextOn = !prev[key]
        const next = { ...prev, [key]: nextOn }
        if (nextOn && result) {
          setResult(r => (r ? buildDeferredLayers(r, { [key]: true }) : r))
        }
        if (!nextOn) {
          setMapHit(hit => {
            if (!hit) return hit
            if (key === 'cut' && hit.type === 'CUT') return null
            if (key === 'fill' && hit.type === 'FILL') return null
            if (key === 'noChange' && hit.type === 'NO_CHANGE') return null
            return hit
          })
        }
        return next
      })
    },
    [result, buildDeferredLayers],
  )

  return {
    enabled,
    hasAoi,
    aoiGeometry: geometry ?? null,
    step,
    setStep,
    existingKind,
    setExistingKind,
    designKind,
    setDesignKind,
    existingConstantM,
    setExistingConstantM,
    designConstantM,
    setDesignConstantM,
    existingGeoTiff,
    setExistingGeoTiff,
    designGeoTiff,
    setDesignGeoTiff,
    designXyzText,
    setDesignXyzText,
    verticalToleranceM,
    setVerticalToleranceM,
    contourIntervalM,
    setContourIntervalM,
    crsOverride,
    setCrsOverride,
    autoCrsEpsg: autoCrs?.epsg ?? null,
    effectiveCrsEpsg,
    verticalDatumLabel,
    setVerticalDatumLabel,
    crsLabel,
    demLoading,
    demError,
    progress,
    error,
    result,
    layers,
    layerOpacity,
    setLayerOpacity,
    toggleLayer,
    setClassOverlay,
    run,
    cancel,
    filteredRows,
    tableFilter,
    setTableFilter,
    highlightRowId,
    setHighlightRowId,
    highlightFeature,
    mapHit,
    setMapHit,
    exportFormat,
    aoiMask: maskRef.current,
  }
}

export type UseCutFillAnalysisReturn = ReturnType<typeof useCutFillAnalysis>
