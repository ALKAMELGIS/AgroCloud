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
  type TreeImageryMosaic,
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
import {
  predictTreeBoxes,
  TreeDetectionServiceError,
  type YoloTreeBox,
} from '../../../lib/treeDetection/yoloTreeDetectionClient'
import { detectTreeBoxesLocal } from '../../../lib/treeDetection/localCrownDetector'

export type TreeDetectionPhase = 'idle' | 'fetching' | 'analyzing' | 'done' | 'error'

export type UseTreeDetectionState = {
  phase: TreeDetectionPhase
  result: TreeDetectionResult | null
  error: string | null
  /** True while a fetch+detect cycle is running. */
  busy: boolean
  /**
   * True when results came from the on-device fallback detector because the
   * hosted model service was offline/unconfigured. Lets the UI hint that
   * starting backend/services/tree-detection will improve accuracy.
   */
  usedLocalFallback: boolean
}

type Params = {
  geometry: GeoJSON.Geometry | GeoJSON.Feature | null | undefined
  provider: TreeImageryProviderId
  enabled: boolean
  sensitivity?: number
  /** Analysis workflow. Defaults to fast detection-only. */
  mode?: TreeAnalysisMode
  tuning?: Partial<TreeDetectionTuning>
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
 * Tree Detections orchestration: fetch CORS-safe imagery for the AOI, run the
 * crown-detection engine, and expose results. The run is RUN-only — it executes
 * solely when the user presses Run/Re-run (via `rerun()`), never automatically
 * when the AOI, provider, sensitivity or mode changes.
 */
export function useTreeDetection({ geometry, provider, enabled, sensitivity, mode, tuning }: Params): UseTreeDetectionState & {
  rerun: () => void
} {
  const analysisMode: TreeAnalysisMode = mode ?? 'detect'
  const [state, setState] = useState<UseTreeDetectionState>({
    phase: 'idle',
    result: null,
    error: null,
    busy: false,
    usedLocalFallback: false,
  })
  const [manualEpoch, setManualEpoch] = useState(0)

  const geomKey = useMemo(() => (geometry ? stableGeometryKey(geometry) : ''), [geometry])
  const effectiveSensitivity = sensitivity ?? tuning?.sensitivity ?? DEFAULT_TREE_TUNING.sensitivity
  const effectiveTuning: TreeDetectionTuning = useMemo(
    () => ({ ...DEFAULT_TREE_TUNING, ...tuning, sensitivity: effectiveSensitivity }),
    [effectiveSensitivity, tuning],
  )

  const active = enabled && !!geomKey && !!geometry

  // Latest inputs, read at run time. The detection run is driven ONLY by the
  // user pressing Run/Re-run (manualEpoch) — it is never auto-triggered by AOI,
  // provider, sensitivity or mode changes.
  const paramsRef = useRef({ geometry, provider, effectiveTuning, effectiveSensitivity, analysisMode })
  paramsRef.current = { geometry, provider, effectiveTuning, effectiveSensitivity, analysisMode }
  const runControllerRef = useRef<AbortController | null>(null)

  // Reset to idle when the tool closes or the AOI changes (stale results no
  // longer match a new AOI). Also aborts any in-flight run.
  useEffect(() => {
    runControllerRef.current?.abort()
    runControllerRef.current = null
    setState({ phase: 'idle', result: null, error: null, busy: false, usedLocalFallback: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, geomKey])

  // Execute a detection pass ONLY when the user presses Run/Re-run. manualEpoch
  // starts at 0 (no auto-run on mount) and increments on each button press.
  useEffect(() => {
    if (manualEpoch === 0) return
    const { geometry, provider, effectiveTuning, effectiveSensitivity, analysisMode } = paramsRef.current
    if (!geometry) return

    const bbox = geometryBBox(geometry)
    if (!bbox) {
      setState({
        phase: 'error',
        result: null,
        error: 'Draw a polygon AOI to detect trees.',
        busy: false,
        usedLocalFallback: false,
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
        // Imagery must be CORS-safe so the AOI mosaic can be encoded and sent to
        // the YOLO model; fall back to Esri when the chosen display provider
        // (e.g. Google) can't be read from a canvas.
        const detectProvider = TREE_IMAGERY_PROVIDERS[provider]?.corsSafe ? provider : 'esri'
        const providerDef = TREE_IMAGERY_PROVIDERS[detectProvider]
        const centerLat = (bbox.north + bbox.south) / 2
        // Confidence threshold from sensitivity. The DeepForest tree-crown model
        // emits LOW scores — even over dense canopy the strongest crowns score
        // ~0.6 and most valid detections sit at 0.1–0.4 — so the usable range is
        // ~0.05 (aggressive) to ~0.35 (conservative), NOT 0.05–0.6. A higher cap
        // silently discards almost every real detection, which reads as "no
        // results". Default sensitivity 0.5 → ~0.20.
        const scoreThreshold = Math.max(0.05, Math.min(0.5, 0.35 - effectiveSensitivity * 0.3))

        // Detect crowns for ONE mosaic. Prefer the hosted model; if it is
        // offline/unconfigured, transparently fall back to the on-device
        // detector so the tool ALWAYS returns results. Once we learn the
        // service is offline we keep using the local detector for the rest of
        // the chunks (no repeated failing round-trips).
        let serviceOffline = false
        const detectBoxes = async (m: TreeImageryMosaic): Promise<YoloTreeBox[]> => {
          if (serviceOffline) {
            return detectTreeBoxesLocal(m.imageData, {
              score: scoreThreshold,
              metersPerPixel: m.metersPerPixel,
              typicalCrownRadiusM: effectiveTuning.typicalCrownRadiusM,
              minTreeSpacingM: effectiveTuning.minTreeSpacingM,
              minCrownDiameterM: effectiveTuning.minCrownDiameterM,
              maxCrownDiameterM: effectiveTuning.maxCrownDiameterM,
            })
          }
          try {
            return await predictTreeBoxes(m.canvas, { score: scoreThreshold, signal: controller.signal })
          } catch (err) {
            if ((err as Error)?.name === 'AbortError') throw err
            if (err instanceof TreeDetectionServiceError && err.offline) {
              serviceOffline = true
              return detectTreeBoxesLocal(m.imageData, {
                score: scoreThreshold,
                metersPerPixel: m.metersPerPixel,
                typicalCrownRadiusM: effectiveTuning.typicalCrownRadiusM,
                minTreeSpacingM: effectiveTuning.minTreeSpacingM,
                minCrownDiameterM: effectiveTuning.minCrownDiameterM,
                maxCrownDiameterM: effectiveTuning.maxCrownDiameterM,
              })
            }
            throw err
          }
        }

        // ── Fixed-resolution, tile-based AOI scan ───────────────────────────
        // Every sub-tile is fetched at the SAME zoom (same m/px) regardless of
        // how big the AOI is, so crown sizes — and therefore detection
        // behaviour — are identical across the whole area. Large AOIs are split
        // into overlapping chunks, each detected independently, then merged with
        // cross-tile de-duplication so no tree is counted twice. This keeps both
        // accuracy and performance stable as the AOI grows.
        const TARGET_GSD = 0.3 // m/px → ~zoom 19; ~2× more pixels/crown → better recall + shape discrimination
        const MAX_TILES = 1280 // perf guard for very large basins
        const CHUNK = 6 // tiles per chunk side (≈1536px canvas)
        const OVERLAP = 1 // tile overlap so border crowns appear in both chunks
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

        // Finest zoom (≥ minZoom) whose full tile count stays bounded.
        let zoom = pickZoomForGsd(centerLat, TARGET_GSD, 20, 16)
        for (; zoom > 15; zoom -= 1) {
          const r = tileRangeForBBox(bbox, zoom)
          if ((r.tx1 - r.tx0 + 1) * (r.ty1 - r.ty0 + 1) <= MAX_TILES) break
        }

        let passes: CrownDetectionPass[] = []
        let sawBlank = false
        // If a whole zoom comes back blank (imagery not served here), step one
        // zoom coarser and retry so we always analyse real textured pixels.
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
            // Detect crowns on this chunk (hosted model, else on-device
            // fallback); georeference the boxes.
            const boxes = await detectBoxes(mosaic)
            if (isDone()) return
            passes.push(
              crownsFromBoxes({
                boxes,
                mosaic,
                geometry,
                provider: detectProvider,
                tuning: effectiveTuning,
                mode: analysisMode,
              }),
            )
            // Yield so the UI stays responsive and cancellation can interrupt.
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
          })
          return
        }

        const result = assembleTreeResult({
          passes,
          geometry,
          provider: detectProvider,
          tuning: effectiveTuning,
          mode: analysisMode,
        })
        if (isDone()) return
        setState({ phase: 'done', result, error: null, busy: false, usedLocalFallback: serviceOffline })
      } catch (err) {
        if (isDone()) return
        if ((err as Error)?.name === 'AbortError') return
        const message =
          err instanceof TreeDetectionServiceError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Tree detection failed.'
        setState({ phase: 'error', result: null, error: message, busy: false, usedLocalFallback: false })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualEpoch])

  const rerun = useCallback(() => setManualEpoch(e => e + 1), [])

  return { ...state, rerun }
}
