import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  bboxForTileRange,
  buildTreeImageryMosaic,
  geometryBBox,
  mosaicLooksBlank,
  pickZoomForGsd,
  tileRangeForBBox,
  TREE_IMAGERY_PROVIDERS,
  type TileRange,
  type TreeImageryProviderId,
} from '../../../lib/treeDetection/webMercatorTiles'
import {
  assembleTreeResult,
  crownsFromBoxes,
  DEFAULT_TREE_TUNING,
  type CrownDetectionPass,
  type TreeAnalysisMode,
  type TreeDetectionResult,
  type TreeDetectionTuning,
} from '../../../lib/treeDetection/treeDetectionEngine'
import { detectTreeBoxesLocal } from '../../../lib/treeDetection/localCrownDetector'
import {
  predictTreeDetection,
  TreeDetectionServiceError,
} from '../../../lib/treeDetection/yoloTreeDetectionClient'

export type TreeDetectionPhase = 'idle' | 'fetching' | 'analyzing' | 'done' | 'error'

export type UseTreeDetectionState = {
  phase: TreeDetectionPhase
  result: TreeDetectionResult | null
  error: string | null
  busy: boolean
  /** True when YOLO was unreachable and canopy detect (API or on-device) ran instead. */
  usedLocalFallback: boolean
  /** Engine reported by the last successful run (if any). */
  lastEngine?: string | null
}

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined
  provider: TreeImageryProviderId
  enabled: boolean
  sensitivity?: number
  /** Optional post-process mode (species attributes). Defaults to detect-only. */
  mode?: TreeAnalysisMode
  tuning?: Partial<TreeDetectionTuning>
}

function stableGeometryKey(
  geometry: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection,
): string {
  try {
    return JSON.stringify(geometry, (_k, v) => (typeof v === 'number' ? Number(v.toFixed(6)) : v))
  } catch {
    return ''
  }
}

/** Engine helpers expect a single Geometry/Feature (not FeatureCollection). */
function normalizeTreeGeom(
  geometry: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection,
): GeoJSON.Geometry | GeoJSON.Feature {
  if (geometry.type === 'FeatureCollection') {
    const polys: GeoJSON.Position[][][] = []
    for (const f of geometry.features ?? []) {
      const g = f.geometry
      if (!g) continue
      if (g.type === 'Polygon') polys.push(g.coordinates)
      else if (g.type === 'MultiPolygon') polys.push(...g.coordinates)
    }
    if (!polys.length) {
      return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [] } }
    }
    return {
      type: 'Feature',
      properties: {},
      geometry:
        polys.length === 1
          ? { type: 'Polygon', coordinates: polys[0]! }
          : { type: 'MultiPolygon', coordinates: polys },
    }
  }
  return geometry
}

/**
 * Tree Detection: tile AOI imagery → professional Tree Detection Model → points.
 * Runs only when the user presses Run/Re-run (never auto on AOI change).
 */
export function useTreeDetection({
  geometry,
  provider,
  enabled,
  sensitivity,
  mode,
  tuning,
}: Params): UseTreeDetectionState & { rerun: () => void } {
  const analysisMode: TreeAnalysisMode = mode ?? 'detect'
  const [state, setState] = useState<UseTreeDetectionState>({
    phase: 'idle',
    result: null,
    error: null,
    busy: false,
    usedLocalFallback: false,
    lastEngine: null,
  })
  const [manualEpoch, setManualEpoch] = useState(0)

  const geomKey = useMemo(() => (geometry ? stableGeometryKey(geometry) : ''), [geometry])
  const effectiveSensitivity = sensitivity ?? tuning?.sensitivity ?? DEFAULT_TREE_TUNING.sensitivity
  const effectiveTuning: TreeDetectionTuning = useMemo(
    () => ({ ...DEFAULT_TREE_TUNING, ...tuning, sensitivity: effectiveSensitivity }),
    [effectiveSensitivity, tuning],
  )

  const active = enabled && !!geomKey && !!geometry

  const paramsRef = useRef({
    geometry,
    provider,
    effectiveTuning,
    effectiveSensitivity,
    analysisMode,
  })
  paramsRef.current = {
    geometry,
    provider,
    effectiveTuning,
    effectiveSensitivity,
    analysisMode,
  }
  const runControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    runControllerRef.current?.abort()
    runControllerRef.current = null
    setState({
      phase: 'idle',
      result: null,
      error: null,
      busy: false,
      usedLocalFallback: false,
      lastEngine: null,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, geomKey])

  useEffect(() => {
    if (manualEpoch === 0) return
    const {
      geometry,
      provider,
      effectiveTuning,
      effectiveSensitivity,
      analysisMode,
    } = paramsRef.current
    if (!geometry) return

    const bbox = geometryBBox(geometry)
    if (!bbox) {
      setState({
        phase: 'error',
        result: null,
        error: 'Select or draw a polygon AOI to detect trees.',
        busy: false,
        usedLocalFallback: false,
        lastEngine: null,
      })
      return
    }

    let cancelled = false
    const controller = new AbortController()
    runControllerRef.current = controller
    void (async () => {
      setState(prev => ({ ...prev, phase: 'fetching', busy: true, error: null }))
      const isDone = () => cancelled || controller.signal.aborted
      try {
        const detectProvider = TREE_IMAGERY_PROVIDERS[provider]?.corsSafe ? provider : 'esri'
        const providerDef = TREE_IMAGERY_PROVIDERS[detectProvider]
        const centerLat = (bbox.north + bbox.south) / 2
        const scoreThreshold = Math.max(0.15, Math.min(0.5, 0.35 - effectiveSensitivity * 0.2))

        let forceLocal = false
        const isBuiltinEngine = (engine: string | null | undefined) =>
          engine === 'spectral-builtin' || engine === 'local-crown'

        const detectBoxes = async (mosaic: { canvas: HTMLCanvasElement; imageData: ImageData; metersPerPixel: number }) => {
          if (!forceLocal) {
            try {
              return await predictTreeDetection(mosaic.canvas, {
                score: scoreThreshold,
                engine: 'yolo',
                metersPerPixel: mosaic.metersPerPixel,
                signal: controller.signal,
              })
            } catch (err) {
              if ((err as Error)?.name === 'AbortError') throw err
              forceLocal = true
            }
          }
          return {
            boxes: detectTreeBoxesLocal(mosaic.imageData, {
              score: scoreThreshold,
              metersPerPixel: mosaic.metersPerPixel,
            }),
            engine: 'local-crown',
          }
        }

        const TARGET_GSD = 0.3
        const MAX_TILES = 1280
        const CHUNK = 6
        const OVERLAP = 1
        const chunkTileCap = (CHUNK + 2 * OVERLAP) * (CHUNK + 2 * OVERLAP) + 4

        const planChunks = (zoom: number): TileRange[] => {
          const range = tileRangeForBBox(bbox, zoom)
          const chunks: TileRange[] = []
          for (let by = range.ty0; by <= range.ty1; by += CHUNK) {
            for (let bx = range.tx0; bx <= range.tx1; bx += CHUNK) {
              chunks.push({
                tx0: Math.max(range.tx0, bx - OVERLAP),
                ty0: Math.max(range.ty0, by - OVERLAP),
                tx1: Math.min(range.tx1, bx + CHUNK - 1 + OVERLAP),
                ty1: Math.min(range.ty1, by + CHUNK - 1 + OVERLAP),
              })
            }
          }
          return chunks
        }

        let zoom = pickZoomForGsd(centerLat, TARGET_GSD, 20, 16)
        for (; zoom > 15; zoom -= 1) {
          const r = tileRangeForBBox(bbox, zoom)
          if ((r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1) <= MAX_TILES) break
        }

        let lastEngineName: string | null = 'yolo'
        let usedFallback = false
        let passes: CrownDetectionPass[] = []
        let sawBlank = false
        for (let attempt = 0; attempt < 4; attempt += 1) {
          if (isDone()) return
          passes = []
          sawBlank = false
          let sawContent = false
          const chunks = planChunks(zoom)
          for (const chunk of chunks) {
            if (isDone()) return
            const subBbox = bboxForTileRange(chunk, zoom)
            const mosaic = await buildTreeImageryMosaic({
              bbox: subBbox,
              provider: providerDef,
              zoom,
              maxTiles: chunkTileCap,
              signal: controller.signal,
            })
            if (isDone()) return
            if (!mosaic) continue
            if (mosaicLooksBlank(mosaic)) {
              sawBlank = true
              continue
            }
            sawContent = true
            setState(prev => ({ ...prev, phase: 'analyzing', busy: true }))
            const predicted = await detectBoxes(mosaic)
            if (isDone()) return
            lastEngineName = predicted.engine
            if (isBuiltinEngine(predicted.engine)) usedFallback = true
            passes.push(
              crownsFromBoxes({
                boxes: predicted.boxes,
                mosaic,
                geometry: normalizeTreeGeom(geometry),
                provider: detectProvider,
                tuning: effectiveTuning,
                mode: analysisMode,
              }),
            )
            await new Promise(r => window.setTimeout(r, 0))
          }
          if (sawContent || zoom <= 15) break
          zoom -= 1
        }

        if (isDone()) return
        if (passes.length === 0) {
          setState({
            phase: 'error',
            result: null,
            error: sawBlank
              ? 'No high-resolution imagery is available here for tree analysis. Pan to an area with visible satellite detail.'
              : 'Could not load CORS-safe imagery for this AOI. Try a smaller area or the Esri provider.',
            busy: false,
            usedLocalFallback: false,
            lastEngine: null,
          })
          return
        }

        const result = assembleTreeResult({
          passes,
          geometry: normalizeTreeGeom(geometry),
          provider: detectProvider,
          tuning: effectiveTuning,
          mode: analysisMode,
        })
        if (isDone()) return
        setState({
          phase: 'done',
          result,
          error: null,
          busy: false,
          usedLocalFallback: usedFallback,
          lastEngine: lastEngineName,
        })
      } catch (err) {
        if ((err as Error)?.name === 'AbortError' || cancelled) return
        const offline = err instanceof TreeDetectionServiceError && err.offline
        setState({
          phase: 'error',
          result: null,
          error: offline
            ? 'Could not load imagery or run tree detection for this AOI. Try a smaller area or another provider.'
            : err instanceof Error
              ? err.message
              : String(err),
          busy: false,
          usedLocalFallback: false,
          lastEngine: null,
        })
      } finally {
        if (runControllerRef.current === controller) runControllerRef.current = null
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [manualEpoch])

  const rerun = useCallback(() => {
    setManualEpoch(n => n + 1)
  }, [])

  return { ...state, rerun }
}
