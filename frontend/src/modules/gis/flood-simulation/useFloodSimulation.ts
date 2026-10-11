import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  setMapboxFillExtrusionLayersVisible,
  setMapboxSymbolLayersVisible,
} from '@/modules/gis/map/siMapStyleLayerToggle'
import { bboxFromGeometry, estimateCellCountForGeometry, floodGridWarning } from './floodGridLimits'
import { runFloodSimulationEngine } from './floodSimulationEngine'
import { isFloodWebGpuAvailable } from './floodWebGpuBackend'
import type {
  FloodFineTune,
  FloodMapInspectHit,
  FloodSimulationPhase,
  FloodSimulationProgress,
  FloodSimulationResult,
  FloodVisualizationMode,
  SimulationConfig,
} from './floodTypes'
import { DEFAULT_FLOOD_FINE_TUNE, DEFAULT_SIMULATION_CONFIG } from './floodTypes'
import { sampleFloodAtLngLat } from './floodMapSample'
import { downloadFloodDepthPng, exportFloodConfigJson, exportFloodExtentGeoJson } from './floodExports'
import { floodMapCompositeDataUrl } from './floodMapComposite'
import { floodImageCoordinates } from './floodRasterPreview'
import type { Map as MapboxMap } from 'mapbox-gl'

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined
  enabled: boolean
  mapRef: React.RefObject<{ getMap?: () => MapboxMap } | MapboxMap | null>
  terrainExaggeration: number
  setTerrainExaggeration: (v: number) => void
  defaultTerrainExaggeration: number
  onRequestDrawArea?: () => void
}

export type UseFloodSimulationReturn = {
  phase: FloodSimulationPhase
  config: SimulationConfig
  setConfig: React.Dispatch<React.SetStateAction<SimulationConfig>>
  fineTune: FloodFineTune
  setFineTune: React.Dispatch<React.SetStateAction<FloodFineTune>>
  gridWarning: string | null
  cellEstimate: { width: number; height: number; cellCount: number }
  progress: FloodSimulationProgress | null
  result: FloodSimulationResult | null
  previewUrl: string | null
  frameIndex: number
  setFrameIndex: (i: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  playbackSpeed: number
  setPlaybackSpeed: (s: number) => void
  vizMode: FloodVisualizationMode
  setVizMode: (m: FloodVisualizationMode) => void
  mapHit: FloodMapInspectHit | null
  setMapHit: (h: FloodMapInspectHit | null) => void
  buildingsOn: boolean
  labelsOn: boolean
  terrainBoost: boolean
  toggleBuildings: () => void
  toggleLabels: () => void
  toggleTerrainBoost: () => void
  gpuAvailable: boolean
  requestDrawArea: () => void
  run: () => void
  pause: () => void
  stop: () => void
  reset: () => void
  sampleAt: (lng: number, lat: number) => void
  exportPng: () => void
  exportGeoJson: () => void
  exportConfig: () => void
  imageCoordinates: [[number, number], [number, number], [number, number], [number, number]] | null
  livePreview: boolean
  resultsVisible: boolean
  setResultsVisible: (v: boolean) => void
}

function hasDrawableAoi(geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined): boolean {
  if (!geometry) return false
  const g =
    (geometry as GeoJSON.Feature).type === 'Feature'
      ? (geometry as GeoJSON.Feature).geometry
      : (geometry as GeoJSON.Geometry)
  if (!g) return false
  if (g.type === 'Polygon') return g.coordinates[0]?.length >= 4
  if (g.type === 'MultiPolygon') return (g.coordinates[0]?.[0]?.length ?? 0) >= 4
  return false
}

export function useFloodSimulation(params: Params): UseFloodSimulationReturn {
  const { geometry, enabled, mapRef, setTerrainExaggeration, defaultTerrainExaggeration, onRequestDrawArea } =
    params
  const [phase, setPhase] = useState<FloodSimulationPhase>('EMPTY')
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_SIMULATION_CONFIG)
  const [fineTune, setFineTune] = useState<FloodFineTune>(DEFAULT_FLOOD_FINE_TUNE)
  const [progress, setProgress] = useState<FloodSimulationProgress | null>(null)
  const [result, setResult] = useState<FloodSimulationResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [simFootprintBbox, setSimFootprintBbox] = useState<FloodSimulationResult['bbox'] | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [vizMode, setVizMode] = useState<FloodVisualizationMode>('depthTime')
  const [mapHit, setMapHit] = useState<FloodMapInspectHit | null>(null)
  const [buildingsOn, setBuildingsOn] = useState(true)
  const [labelsOn, setLabelsOn] = useState(true)
  const [terrainBoost, setTerrainBoost] = useState(false)
  const [livePreview, setLivePreview] = useState(false)
  const [resultsVisible, setResultsVisible] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const previewRaf = useRef(0)

  const getMap = useCallback((): MapboxMap | null => {
    const raw = mapRef.current
    if (!raw) return null
    if ('getMap' in raw && typeof raw.getMap === 'function') return raw.getMap() ?? null
    return raw as MapboxMap
  }, [mapRef])

  useEffect(() => {
    if (!enabled) {
      setPhase('EMPTY')
      setPlaying(false)
      abortRef.current?.abort()
      setSimFootprintBbox(null)
      setPreviewUrl(null)
      return
    }
    setPhase('SETUP')
  }, [enabled])

  const effectiveGeometry = geometry

  const cellEstimate = useMemo(() => {
    if (!effectiveGeometry) return { width: 0, height: 0, cellCount: 0 }
    return estimateCellCountForGeometry(effectiveGeometry, config.gridM)
  }, [effectiveGeometry, config.gridM])

  const gridWarning = useMemo(() => {
    if (!hasDrawableAoi(effectiveGeometry)) {
      return 'Draw an area on the map (Edit tool or Draw area), then run the simulation.'
    }
    return floodGridWarning(effectiveGeometry!, config.gridM)
  }, [effectiveGeometry, config.gridM])

  const requestDrawArea = useCallback(() => {
    onRequestDrawArea?.()
  }, [onRequestDrawArea])

  const toggleBuildings = useCallback(() => {
    const map = getMap()
    if (!map) return
    setBuildingsOn(v => {
      const next = !v
      setMapboxFillExtrusionLayersVisible(map, next)
      return next
    })
  }, [getMap])

  const toggleLabels = useCallback(() => {
    const map = getMap()
    if (!map) return
    setLabelsOn(v => {
      const next = !v
      setMapboxSymbolLayersVisible(map, next)
      return next
    })
  }, [getMap])

  const toggleTerrainBoost = useCallback(() => {
    setTerrainBoost(v => {
      const next = !v
      setTerrainExaggeration(next ? 1.5 : defaultTerrainExaggeration)
      return next
    })
  }, [defaultTerrainExaggeration, setTerrainExaggeration])

  const run = useCallback(() => {
    const geometryForRun = effectiveGeometry
    const runWarning = geometryForRun ? floodGridWarning(geometryForRun, config.gridM) : gridWarning
    if (!geometryForRun || !hasDrawableAoi(geometryForRun) || runWarning) {
      setProgress({
        pct: 0,
        label: runWarning ?? 'Draw an area on the map first.',
        phase: 'done',
      })
      return
    }
    const footprint = bboxFromGeometry(geometryForRun)
    if (!footprint) {
      setProgress({ pct: 0, label: 'Invalid simulation area geometry.', phase: 'done' })
      return
    }
    const cellCount = estimateCellCountForGeometry(geometryForRun, config.gridM).cellCount
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setSimFootprintBbox(footprint)
    setResultsVisible(true)
    setPhase('RUNNING')
    setProgress({ pct: 0, label: 'Starting…', phase: 'terrain' })
    setResult(null)
    setPreviewUrl(null)
    setLivePreview(true)
    setFrameIndex(0)
    void runFloodSimulationEngine({
      geometry: geometryForRun,
      config,
      signal: ac.signal,
      preferWebGpu: cellCount <= 100_000,
      callbacks: {
        onProgress: setProgress,
        onPreviewTexture: (depth, _vx, _vy, w, h) => {
          if (previewRaf.current) cancelAnimationFrame(previewRaf.current)
          previewRaf.current = requestAnimationFrame(() => {
            const tmp: FloodSimulationResult = {
              width: w,
              height: h,
              cellSizeM: config.gridM,
              bbox: footprint,
              elevation: new Float32Array(0),
              mask: new Uint8Array(w * h).fill(1),
              frames: [{ depth, vx: _vx, vy: _vy, floodedAreaHa: 0, maxDepthM: 0, volumeM3: 0, timeSec: 0 }],
              maxDepthGrid: depth,
              arrivalTimeSec: new Float32Array(depth.length),
              rainHyetographMmH: [],
              config,
              backend: 'worker',
            }
            setPreviewUrl(floodMapCompositeDataUrl(tmp, 0, vizMode, fineTune))
          })
        },
      },
    })
      .then(res => {
        setResult(res)
        setSimFootprintBbox(res.bbox)
        setPhase('COMPLETE')
        setLivePreview(false)
        setPlaying(true)
        setPreviewUrl(floodMapCompositeDataUrl(res, 0, vizMode, fineTune))
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setPhase('SETUP')
          return
        }
        setPhase('ERROR')
        setProgress({ pct: 0, label: err instanceof Error ? err.message : String(err), phase: 'done' })
      })
  }, [config, effectiveGeometry, fineTune.waterOpacity, gridWarning, vizMode])

  const pause = useCallback(() => {
    if (phase === 'RUNNING') {
      abortRef.current?.abort()
      setPhase('PAUSED')
    }
    setPlaying(false)
  }, [phase])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setPhase('SETUP')
    setPlaying(false)
    setResult(null)
    setPreviewUrl(null)
    setSimFootprintBbox(null)
  }, [])

  const reset = useCallback(() => {
    stop()
    setConfig(DEFAULT_SIMULATION_CONFIG)
    setFineTune(DEFAULT_FLOOD_FINE_TUNE)
  }, [stop])

  useEffect(() => {
    if (!result) return
    setPreviewUrl(floodMapCompositeDataUrl(result, frameIndex, vizMode, fineTune))
  }, [result, frameIndex, vizMode, fineTune])

  useEffect(() => {
    if (!playing || !result || phase !== 'COMPLETE') return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = now - last
      if (dt > 400 / playbackSpeed) {
        last = now
        setFrameIndex(i => (i + 1 >= result.frames.length ? 0 : i + 1))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, playbackSpeed, result, phase])

  const sampleAt = useCallback(
    (lng: number, lat: number) => {
      if (!result) return
      const hit = sampleFloodAtLngLat(result, frameIndex, vizMode, lng, lat)
      setMapHit(hit)
    },
    [frameIndex, result, vizMode],
  )

  const exportPng = useCallback(() => {
    if (!result) return
    const frame = result.frames[frameIndex]
    if (!frame) return
    const field = depthFieldForMode(result, frameIndex, vizMode)
    void downloadFloodDepthPng(field, result.width, result.height)
  }, [frameIndex, result, vizMode])

  const exportGeoJson = useCallback(() => {
    if (!result) return
    const fc = exportFloodExtentGeoJson(result, frameIndex)
    const blob = new Blob([JSON.stringify(fc)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'flood-extent.geojson'
    a.click()
    URL.revokeObjectURL(url)
  }, [frameIndex, result])

  const exportConfig = useCallback(() => {
    const blob = exportFloodConfigJson(config, result)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'flood-simulation-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [config, result])

  const imageCoordinates = useMemo(() => {
    const b = result?.bbox ?? simFootprintBbox
    if (!b) return null
    return floodImageCoordinates(b)
  }, [result, simFootprintBbox])

  return {
    phase,
    config,
    setConfig,
    fineTune,
    setFineTune,
    gridWarning,
    cellEstimate,
    progress,
    result,
    previewUrl,
    frameIndex,
    setFrameIndex,
    playing,
    setPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    vizMode,
    setVizMode,
    mapHit,
    setMapHit,
    buildingsOn,
    labelsOn,
    terrainBoost,
    toggleBuildings,
    toggleLabels,
    toggleTerrainBoost,
    gpuAvailable: isFloodWebGpuAvailable(),
    requestDrawArea,
    run,
    pause,
    stop,
    reset,
    sampleAt,
    exportPng,
    exportGeoJson,
    exportConfig,
    imageCoordinates,
    livePreview,
    resultsVisible,
    setResultsVisible,
  }
}
