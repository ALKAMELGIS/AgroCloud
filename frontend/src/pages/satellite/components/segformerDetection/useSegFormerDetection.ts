import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  detectWithSegFormer,
  SegFormerDetectionServiceError,
  type SegFormerDetectResult,
  type SegFormerFeatureProps,
} from '../../../../lib/segformerDetection/segformerClient'
import {
  getSegFormerClass,
  getSegFormerClassesForCategory,
  getSegFormerDefaultMinConfidence,
  isSegFormerClassMapped,
  SEGFORMER_CATEGORIES,
  SEGFORMER_UNSUPPORTED_TOOLTIP,
  type SegFormerCategoryId,
  type SegFormerClassDef,
} from '../../../../lib/segformerDetection/segformerCatalog'
import {
  normalizeSegFormerRgbMapping,
  resolveSegFormerRgbComposite,
  SEGFORMER_DEFAULT_BAND_CONFIG,
  type SegFormerBandConfig,
  type SegFormerBandId,
  type SegFormerBandMode,
  type SegFormerRgbMapping,
} from '../../../../lib/segformerDetection/segformerBandPresets'
import {
  getSegFormerClassesForModelType,
  getSegFormerFieldPipelineInferenceParams,
  getSegFormerModelTypeDefaultConfidence,
  isSegFormerFieldPipeline,
  normalizeSegFormerConfidence,
  normalizeSegFormerOverlap,
  normalizeSegFormerTileSize,
  resolveSegFormerModelTypeClassId,
  SEGFORMER_DEFAULT_MODEL_TYPE_ID,
  SEGFORMER_DEFAULT_OVERLAP,
  SEGFORMER_DEFAULT_TILE_SIZE,
  type SegFormerModelTypeId,
  type SegFormerTileSize,
} from '../../../../lib/segformerDetection/segformerModelPresets'
import {
  geoAiModelTypeIdForTarget,
  geoAiTargetIdForModelType,
  resolveGeoAiTargetRoute,
  type GeoAiTargetId,
  type GeoAiTargetRoute,
} from '../../../../lib/segformerDetection/geoAiModelRouter'
import {
  downloadSegFormerGeoJson,
  downloadSegFormerMaskGeoPackage,
  downloadSegFormerMaskPng,
  downloadSegFormerShapefile,
} from '../../../../lib/segformerDetection/segformerOutputExport'
import { softNormalizeRgbDataUrl } from '../../../../lib/segformerDetection/segformerPreprocess'
import {
  fetchSegFormerEsriBasemap,
  fetchSegFormerUploadedRasterPreview,
  SEGFORMER_FIELD_S2_CAPTURE_MAX_EDGE,
  type SegFormerCaptureImageSource,
} from '../../../../lib/segformerDetection/segformerS2Capture'
import {
  refineWithSam2,
  Sam2RefinementServiceError,
} from '../../../../lib/segformerDetection/sam2RefineClient'
import {
  classifyWithTemporalTransformer,
} from '../../../../lib/segformerDetection/temporalClassifyClient'
import {
  ingestRasterFilesViaServer,
  layerConfigFromReadyRecord,
  listReadyRasters,
  RasterNeedsGeoreferenceError,
  type ServerRasterLayerConfig,
} from '../../../../lib/raster/siRasterTileService'

/** Staged pipeline phases shown in the SegFormer workspace panel. */
export type SegFormerPhase =
  | 'idle'
  | 'resolveInput'
  | 'preprocess'
  | 'cloudMask'
  | 'normalize'
  | 'tile'
  | 'infer'
  | 'vectorize'
  | 'refine'
  | 'cropType'
  | 'publishReady'
  | 'error'
  | 'unsupported'
  /** @deprecated Prefer resolveInput */
  | 'capturing'
  /** @deprecated Prefer infer */
  | 'detecting'
  /** @deprecated Prefer publishReady */
  | 'done'

export type SegFormerInputMode = 'rs-session' | 'uploaded-raster' | 'esri-basemap'

export type SegFormerCapturedView = {
  image: string
  bbox: [number, number, number, number]
  imageSource?: SegFormerCaptureImageSource
  captureNote?: string | null
  sceneDate?: string | null
  provider?: string | null
}

export type SegFormerAoiGeometry =
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon
  | GeoJSON.FeatureCollection

export type UseSegFormerDetectionOptions = {
  captureView: (opts: {
    bbox: [number, number, number, number]
    aoi: SegFormerAoiGeometry
    /** Optional capture max edge (field pipeline uses 2048). */
    maxEdge?: number
  }) => Promise<SegFormerCapturedView | null>
  resolveAoi: () => SegFormerAoiGeometry | null
  defaultProvider?: string | null
  onUploadedRasterReady?: (config: ServerRasterLayerConfig) => void
  existingMapRasters?: ServerRasterLayerConfig[]
  /**
   * Optional multi-date S2 stack for temporal crop typing (field pipeline).
   * When omitted, temporal stage still runs with primary scene date only.
   */
  captureMultiDateStack?: (opts: {
    bbox: [number, number, number, number]
    aoi: SegFormerAoiGeometry
    primarySceneDate: string
  }) => Promise<{ dates: string[]; primary?: SegFormerCapturedView | null } | null>
}

export type SegFormerResultRow = SegFormerFeatureProps & {
  featureIndex: number
}

export const SEGFORMER_PIPELINE_STEPS: readonly SegFormerPhase[] = [
  'idle',
  'resolveInput',
  'preprocess',
  'cloudMask',
  'normalize',
  'tile',
  'infer',
  'vectorize',
  'refine',
  'cropType',
  'publishReady',
] as const

export const SEGFORMER_PIPELINE_LABELS: Record<SegFormerPhase, string> = {
  idle: 'Ready',
  resolveInput: 'Resolving input imagery…',
  preprocess: 'Preprocessing raster…',
  cloudMask: 'Applying cloud mask…',
  normalize: 'Normalizing RGB…',
  tile: 'Tiling image…',
  infer: 'Running SegFormer-B5 inference…',
  vectorize: 'Vectorizing mask…',
  refine: 'SAM2 boundary refine…',
  cropType: 'Temporal crop typing…',
  publishReady: 'Detections ready',
  error: 'Detection failed',
  unsupported: 'Class needs fine-tuned weights',
  capturing: 'Capturing imagery for AOI…',
  detecting: 'Running pretrained SegFormer (ADE20K)…',
  done: 'Detections ready',
}

export const SEGFORMER_FIELD_PIPELINE_STEPS: readonly SegFormerPhase[] = [
  'infer',
  'refine',
  'cropType',
  'publishReady',
] as const

export function hasSegFormerDrawableResult(result: {
  geojson?: GeoJSON.FeatureCollection | null
  maskPng?: string | null
} | null): boolean {
  if (!result) return false
  if (result.geojson?.features?.length) return true
  return Boolean(result.maskPng?.trim())
}

export function isSegFormerBusyPhase(phase: SegFormerPhase): boolean {
  return (
    phase === 'resolveInput' ||
    phase === 'preprocess' ||
    phase === 'cloudMask' ||
    phase === 'normalize' ||
    phase === 'tile' ||
    phase === 'infer' ||
    phase === 'vectorize' ||
    phase === 'refine' ||
    phase === 'cropType' ||
    phase === 'capturing' ||
    phase === 'detecting'
  )
}

/** Normalize legacy phase names onto the staged pipeline. */
export function normalizeSegFormerPhase(phase: SegFormerPhase): SegFormerPhase {
  if (phase === 'capturing') return 'resolveInput'
  if (phase === 'detecting') return 'infer'
  if (phase === 'done') return 'publishReady'
  return phase
}

/**
 * Optional SAM2 after SegFormer vectorize (non-field targets).
 * Field pipeline owns its own refine (+ temporal) block and returns false here.
 */
export function shouldRunOptionalSam2Refine(opts: {
  fieldPipeline: boolean
  boundaryRefine: boolean
  supportsSam2Refine: boolean
}): boolean {
  if (opts.fieldPipeline) return false
  return opts.boundaryRefine && opts.supportsSam2Refine
}

/** Resolve GeoAI chip target from the active model-type preset. */
export function resolveGeoAiTargetFromModelType(
  modelTypeId: SegFormerModelTypeId,
): GeoAiTargetId {
  return (
    geoAiTargetIdForModelType(modelTypeId) ??
    (isSegFormerFieldPipeline(modelTypeId) ? 'field-boundary' : 'crops')
  )
}

function walkCoords(c: unknown, out: number[][]) {
  if (!c) return
  if (typeof (c as number[])[0] === 'number' && typeof (c as number[])[1] === 'number') {
    out.push(c as number[])
    return
  }
  if (Array.isArray(c)) c.forEach(x => walkCoords(x, out))
}

export function bboxOfSegFormerAoi(aoi: SegFormerAoiGeometry): [number, number, number, number] | null {
  const coords: number[][] = []
  if (aoi.type === 'FeatureCollection') {
    for (const f of aoi.features) {
      const g = f?.geometry
      if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue
      walkCoords(g.coordinates, coords)
    }
  } else if (aoi.type === 'Polygon' || aoi.type === 'MultiPolygon') {
    walkCoords(aoi.coordinates, coords)
  }
  if (!coords.length) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [x, y] of coords) {
    if (x < w) w = x
    if (y < s) s = y
    if (x > e) e = x
    if (y > n) n = y
  }
  if (![w, s, e, n].every(Number.isFinite) || e <= w || n <= s) return null
  return [w, s, e, n]
}

export function padSegFormerAoiBbox(
  bbox: [number, number, number, number],
  padFrac = 0.03,
): [number, number, number, number] {
  const [w, s, e, n] = bbox
  const dx = Math.max(1e-6, e - w) * padFrac
  const dy = Math.max(1e-6, n - s) * padFrac
  return [w - dx, s - dy, e + dx, n + dy]
}

function toAoiFeatureCollection(aoi: SegFormerAoiGeometry): GeoJSON.FeatureCollection {
  if (aoi.type === 'FeatureCollection') return aoi
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { aoi_id: 'aoi-1' }, geometry: aoi }],
  }
}

/**
 * SAM2 responses currently stamp Agricultural Field; re-apply the Detect class
 * so optional refine for trees/buildings/cars keeps correct labels.
 */
export function stampSegFormerClassOntoRefined(
  refined: GeoJSON.FeatureCollection,
  classId: number,
  className: string,
  meta?: { date?: string | null; provider?: string | null },
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: refined.features.map(f => {
      const raw = (f.properties || {}) as Record<string, unknown>
      return {
        ...f,
        properties: {
          ...raw,
          classId,
          class_id: classId,
          Class_Name: className,
          className,
          class_name: className,
          ...(meta?.date?.trim()
            ? { Date: meta.date.trim(), date: meta.date.trim() }
            : {}),
          ...(meta?.provider?.trim()
            ? { Provider: meta.provider.trim(), provider: meta.provider.trim() }
            : {}),
        },
      }
    }),
  }
}

function readFeatureRow(f: GeoJSON.Feature, index: number): SegFormerResultRow {
  const p = (f.properties || {}) as Record<string, unknown>
  return {
    featureIndex: index,
    objectId: String(p.Feature_ID || p.objectId || p.object_id || f.id || `sf-${index + 1}`),
    className: String(p.Class_Name || p.className || p.class_name || ''),
    classId: Number(p.classId ?? p.class_id) || 0,
    confidence: Number(p.Confidence ?? p.confidence) || 0,
    areaM2: Number(p.Area_m2 ?? p.areaM2 ?? p.area_m2) || 0,
    areaHa: Number(p.Area_Hectare ?? p.areaHa ?? p.area_ha) || 0,
    perimeterM: Number(p.Perimeter ?? p.perimeterM ?? p.perimeter_m) || 0,
    date: String(p.Date || p.date || ''),
    provider: String(p.Provider || p.provider || ''),
    source: String(p.source || 'segformer-ade20k'),
    cropType: String(p.Crop_Type || p.cropType || p.crop_type || '') || undefined,
    cropConfidence: Number(p.Crop_Confidence ?? p.cropConfidence ?? p.crop_confidence) || undefined,
  }
}

function mergeRasterConfigs(
  server: ServerRasterLayerConfig[],
  extras: ServerRasterLayerConfig[] | undefined,
): ServerRasterLayerConfig[] {
  const byId = new Map<string, ServerRasterLayerConfig>()
  for (const r of server) byId.set(r.rasterId, r)
  for (const r of extras || []) {
    if (!byId.has(r.rasterId)) byId.set(r.rasterId, r)
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/**
 * GeoAI Analysis Toolbox / SegFormer ADE20K workspace:
 * Input → processing → router target → staged Detect (+ optional SAM2) → outputs.
 *
 * Cars routes to the vehicles catalogue via `vehicle-detection` while Detect still
 * calls SegFormer `/detect` until a YOLO service exists.
 */
export function useSegFormerDetection({
  captureView,
  resolveAoi,
  defaultProvider = null,
  onUploadedRasterReady,
  existingMapRasters,
  captureMultiDateStack,
}: UseSegFormerDetectionOptions) {
  const initialClassId =
    resolveSegFormerModelTypeClassId(SEGFORMER_DEFAULT_MODEL_TYPE_ID) ??
    getSegFormerClassesForModelType(SEGFORMER_DEFAULT_MODEL_TYPE_ID)[0]?.id ??
    1
  const fieldDefaults = getSegFormerFieldPipelineInferenceParams()
  const [modelTypeId, setModelTypeIdState] = useState<SegFormerModelTypeId>(SEGFORMER_DEFAULT_MODEL_TYPE_ID)
  const [categoryId, setCategoryId] = useState<SegFormerCategoryId>(
    () => getSegFormerClass(initialClassId)?.categoryId ?? 'agriculture',
  )
  const [classId, setClassId] = useState<number>(initialClassId)
  const [minConfidence, setMinConfidence] = useState(() =>
    getSegFormerModelTypeDefaultConfidence(SEGFORMER_DEFAULT_MODEL_TYPE_ID),
  )
  const [tileSize, setTileSizeState] = useState<SegFormerTileSize>(
    isSegFormerFieldPipeline(SEGFORMER_DEFAULT_MODEL_TYPE_ID)
      ? fieldDefaults.tileSize
      : SEGFORMER_DEFAULT_TILE_SIZE,
  )
  const [overlap, setOverlapState] = useState(
    isSegFormerFieldPipeline(SEGFORMER_DEFAULT_MODEL_TYPE_ID)
      ? fieldDefaults.overlap
      : SEGFORMER_DEFAULT_OVERLAP,
  )
  const [bandConfig, setBandConfigState] = useState<SegFormerBandConfig>({
    ...SEGFORMER_DEFAULT_BAND_CONFIG,
    customRgb: { ...SEGFORMER_DEFAULT_BAND_CONFIG.customRgb },
    multispectralBands: [...SEGFORMER_DEFAULT_BAND_CONFIG.multispectralBands],
  })
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [fillOpacity, setFillOpacity] = useState(0.45)
  const [phase, setPhase] = useState<SegFormerPhase>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [routeMissing, setRouteMissing] = useState(false)
  const [result, setResult] = useState<SegFormerDetectResult | null>(null)
  const [resultBbox, setResultBbox] = useState<[number, number, number, number] | null>(null)
  const [imageSource, setImageSource] = useState<SegFormerCaptureImageSource | null>(null)
  const [captureNote, setCaptureNote] = useState<string | null>(null)
  const [resultDate, setResultDate] = useState<string | null>(null)
  const [resultProvider, setResultProvider] = useState<string | null>(null)

  const [inputMode, setInputMode] = useState<SegFormerInputMode>('rs-session')
  const [uploadedRasters, setUploadedRasters] = useState<ServerRasterLayerConfig[]>([])
  const [selectedRasterId, setSelectedRasterId] = useState<string | null>(null)
  const [rasterListBusy, setRasterListBusy] = useState(false)
  const [rasterUploadBusy, setRasterUploadBusy] = useState(false)
  const [rasterError, setRasterError] = useState<string | null>(null)
  /** Optional SAM2 boundary refine for non-field GeoAI targets (field pipeline always refines). */
  const [boundaryRefine, setBoundaryRefineState] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const resolveAoiRef = useRef(resolveAoi)
  resolveAoiRef.current = resolveAoi
  const captureViewRef = useRef(captureView)
  captureViewRef.current = captureView
  const defaultProviderRef = useRef(defaultProvider)
  defaultProviderRef.current = defaultProvider
  const onUploadedRasterReadyRef = useRef(onUploadedRasterReady)
  onUploadedRasterReadyRef.current = onUploadedRasterReady
  const inputModeRef = useRef(inputMode)
  inputModeRef.current = inputMode
  const selectedRasterIdRef = useRef(selectedRasterId)
  selectedRasterIdRef.current = selectedRasterId
  const uploadedRastersRef = useRef(uploadedRasters)
  uploadedRastersRef.current = uploadedRasters
  const captureMultiDateStackRef = useRef(captureMultiDateStack)
  captureMultiDateStackRef.current = captureMultiDateStack
  const modelTypeIdRef = useRef(modelTypeId)
  modelTypeIdRef.current = modelTypeId
  const minConfidenceRef = useRef(minConfidence)
  minConfidenceRef.current = minConfidence
  const tileSizeRef = useRef(tileSize)
  tileSizeRef.current = tileSize
  const overlapRef = useRef(overlap)
  overlapRef.current = overlap
  const boundaryRefineRef = useRef(boundaryRefine)
  boundaryRefineRef.current = boundaryRefine

  const fieldPipeline = isSegFormerFieldPipeline(modelTypeId)
  const geoAiTargetId = useMemo(
    () => resolveGeoAiTargetFromModelType(modelTypeId),
    [modelTypeId],
  )
  const geoAiRoute: GeoAiTargetRoute = useMemo(
    () => resolveGeoAiTargetRoute(geoAiTargetId),
    [geoAiTargetId],
  )
  /** Effective refine flag: field pipeline always on; otherwise user toggle. */
  const boundaryRefineEffective = fieldPipeline || boundaryRefine

  const categoryClasses = useMemo(
    () => getSegFormerClassesForModelType(modelTypeId),
    [modelTypeId],
  )

  const selectedClass: SegFormerClassDef | undefined = useMemo(
    () => getSegFormerClass(classId) ?? categoryClasses[0],
    [classId, categoryClasses],
  )

  const classMapped = Boolean(selectedClass && isSegFormerClassMapped(selectedClass))

  const rgbMapping = useMemo(() => resolveSegFormerRgbComposite(bandConfig), [bandConfig])
  const rgbLabel = `${rgbMapping.r} / ${rgbMapping.g} / ${rgbMapping.b}`

  const availableRasters = useMemo(
    () => mergeRasterConfigs(uploadedRasters, existingMapRasters),
    [uploadedRasters, existingMapRasters],
  )

  const selectedRaster = useMemo(
    () => availableRasters.find(r => r.rasterId === selectedRasterId) ?? null,
    [availableRasters, selectedRasterId],
  )

  const refreshRasters = useCallback(async () => {
    setRasterListBusy(true)
    setRasterError(null)
    try {
      const records = await listReadyRasters()
      const configs = records.map(r => layerConfigFromReadyRecord(r))
      setUploadedRasters(configs)
      setSelectedRasterId(prev => {
        if (prev && configs.some(c => c.rasterId === prev)) return prev
        if (prev && (existingMapRasters || []).some(c => c.rasterId === prev)) return prev
        return prev
      })
    } catch (err) {
      const msg = (err as Error)?.message || 'Could not list uploaded rasters.'
      setRasterError(msg)
    } finally {
      setRasterListBusy(false)
    }
  }, [existingMapRasters])

  useEffect(() => {
    if (inputMode !== 'uploaded-raster') return
    void refreshRasters()
  }, [inputMode, refreshRasters])

  const selectInputMode = useCallback((mode: SegFormerInputMode) => {
    setInputMode(mode)
    setError(null)
    if (phase === 'error' || phase === 'unsupported') setPhase('idle')
  }, [phase])

  const selectUploadedRaster = useCallback((rasterId: string | null) => {
    setSelectedRasterId(rasterId)
    if (rasterId) setInputMode('uploaded-raster')
    setError(null)
    if (phase === 'error' || phase === 'unsupported') setPhase('idle')
  }, [phase])

  const addRasterFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    setRasterUploadBusy(true)
    setRasterError(null)
    setError(null)
    try {
      const config = await ingestRasterFilesViaServer(files)
      setUploadedRasters(prev => {
        const without = prev.filter(r => r.rasterId !== config.rasterId)
        return [config, ...without]
      })
      setSelectedRasterId(config.rasterId)
      setInputMode('uploaded-raster')
      onUploadedRasterReadyRef.current?.(config)
    } catch (err) {
      const msg =
        err instanceof RasterNeedsGeoreferenceError
          ? 'This image has no georeferencing. Place it with Raster & Georeferencing, then select it here.'
          : (err as Error)?.message || 'Raster upload failed.'
      setRasterError(msg)
      setError(msg)
    } finally {
      setRasterUploadBusy(false)
    }
  }, [])

  const selectModelType = useCallback((id: SegFormerModelTypeId) => {
    setModelTypeIdState(id)
    const nextClassId = resolveSegFormerModelTypeClassId(id)
    const classes = getSegFormerClassesForModelType(id)
    const preferred = nextClassId ?? classes.find(c => isSegFormerClassMapped(c))?.id ?? classes[0]?.id
    if (preferred != null) {
      setClassId(preferred)
      const cat = getSegFormerClass(preferred)?.categoryId
      if (cat) setCategoryId(cat)
    }
    setMinConfidence(getSegFormerModelTypeDefaultConfidence(id))
    if (isSegFormerFieldPipeline(id)) {
      const fp = getSegFormerFieldPipelineInferenceParams()
      setTileSizeState(fp.tileSize)
      setOverlapState(fp.overlap)
    }
    setError(null)
    if (phase === 'error' || phase === 'unsupported') setPhase('idle')
  }, [phase])

  /** GeoAI Analysis Toolbox target chip → model type / category (Cars → vehicles). */
  const selectGeoAiTarget = useCallback(
    (targetId: GeoAiTargetId) => {
      selectModelType(geoAiModelTypeIdForTarget(targetId))
    },
    [selectModelType],
  )

  const setBoundaryRefine = useCallback((value: boolean) => {
    if (isSegFormerFieldPipeline(modelTypeIdRef.current)) return
    setBoundaryRefineState(Boolean(value))
  }, [])

  const selectCategory = useCallback((id: SegFormerCategoryId) => {
    setCategoryId(id)
    const classes = getSegFormerClassesForCategory(id)
    const preferred = classes.find(c => isSegFormerClassMapped(c)) ?? classes[0]
    if (preferred) setClassId(preferred.id)
    setMinConfidence(getSegFormerDefaultMinConfidence(id))
    setError(null)
    if (phase === 'error' || phase === 'unsupported') setPhase('idle')
  }, [phase])

  const selectClass = useCallback((id: number) => {
    setClassId(id)
    setError(null)
    if (phase === 'error' || phase === 'unsupported') setPhase('idle')
  }, [phase])

  const setBandMode = useCallback((mode: SegFormerBandMode) => {
    setBandConfigState(prev => ({ ...prev, mode }))
  }, [])

  const setCustomRgb = useCallback((rgb: SegFormerRgbMapping) => {
    setBandConfigState(prev => ({
      ...prev,
      mode: 'custom',
      customRgb: normalizeSegFormerRgbMapping(rgb),
    }))
  }, [])

  const setCustomRgbChannel = useCallback((channel: keyof SegFormerRgbMapping, band: SegFormerBandId) => {
    setBandConfigState(prev => ({
      ...prev,
      mode: 'custom',
      customRgb: normalizeSegFormerRgbMapping({ ...prev.customRgb, [channel]: band }),
    }))
  }, [])

  const setTileSize = useCallback((value: SegFormerTileSize | number) => {
    setTileSizeState(normalizeSegFormerTileSize(Number(value)))
  }, [])

  const setOverlap = useCallback((value: number) => {
    setOverlapState(normalizeSegFormerOverlap(value))
  }, [])

  const setMinConfidenceClamped = useCallback((value: number) => {
    setMinConfidence(normalizeSegFormerConfidence(value, minConfidence))
  }, [minConfidence])

  const detect = useCallback(async (overrideClassId?: number) => {
    const targetClassId = overrideClassId ?? classId
    const def = getSegFormerClass(targetClassId)
    if (!def) {
      setError('Unknown detection class.')
      setPhase('error')
      return
    }
    if (!isSegFormerClassMapped(def)) {
      setError(SEGFORMER_UNSUPPORTED_TOOLTIP)
      setPhase('unsupported')
      return
    }

    const aoi = resolveAoiRef.current()
    if (!aoi) {
      setError('Draw or select an AOI polygon before running Detect.')
      setPhase('error')
      return
    }
    const rawBbox = bboxOfSegFormerAoi(aoi)
    if (!rawBbox) {
      setError('AOI has no valid polygon bounds.')
      setPhase('error')
      return
    }
    const bbox = padSegFormerAoiBbox(rawBbox)
    const aoiFc = toAoiFeatureCollection(aoi)
    const runFieldPipeline = isSegFormerFieldPipeline(modelTypeIdRef.current)

    const mode = inputModeRef.current
    if (mode === 'uploaded-raster' && !selectedRasterIdRef.current) {
      setError('Select an uploaded raster (or + Add Raster) before Detect.')
      setPhase('error')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    setOffline(false)
    setRouteMissing(false)
    setImageSource(null)
    setCaptureNote(null)
    setResultDate(null)
    setResultProvider(null)
    setPhase('resolveInput')
    setClassId(targetClassId)
    if (def.categoryId !== categoryId) setCategoryId(def.categoryId)

    try {
      let view: SegFormerCapturedView | null = null
      let temporalDates: string[] = []

      if (mode === 'uploaded-raster') {
        const rid = selectedRasterIdRef.current!
        const raster =
          uploadedRastersRef.current.find(r => r.rasterId === rid) ||
          (existingMapRasters || []).find(r => r.rasterId === rid) ||
          null
        const shot = await fetchSegFormerUploadedRasterPreview({
          rasterId: rid,
          bbox4326: bbox,
          rasterBbox: raster?.bboxWgs84 ?? null,
          rasterName: raster?.name,
          wmsUrl: raster?.wmsUrl,
          maxEdge: runFieldPipeline ? SEGFORMER_FIELD_S2_CAPTURE_MAX_EDGE : undefined,
          signal: controller.signal,
        })
        if (!shot) {
          throw new Error(
            'Could not capture the uploaded raster over the AOI. Check that the AOI overlaps the raster extent.',
          )
        }
        view = {
          image: shot.image,
          bbox: shot.bbox,
          imageSource: 'uploaded',
          captureNote: shot.rasterName
            ? `Uploaded raster · ${shot.rasterName}`
            : `Uploaded raster · ${shot.rasterId}`,
          provider: 'Uploaded raster',
        }
      } else if (mode === 'esri-basemap') {
        const shot = await fetchSegFormerEsriBasemap({
          bbox4326: bbox,
          maxEdge: runFieldPipeline ? SEGFORMER_FIELD_S2_CAPTURE_MAX_EDGE : undefined,
          signal: controller.signal,
        })
        if (!shot) {
          throw new Error(
            'Could not capture Esri World Imagery over the AOI. Check network access and try again.',
          )
        }
        view = {
          image: shot.image,
          bbox: shot.bbox,
          imageSource: 'esri-basemap',
          captureNote: 'Esri World Imagery (Satellite) · AOI mosaic',
          provider: 'Esri Basemap Satellite',
        }
      } else {
        view = await captureViewRef.current({
          bbox,
          aoi: aoiFc,
          maxEdge: runFieldPipeline ? SEGFORMER_FIELD_S2_CAPTURE_MAX_EDGE : undefined,
        })
      }

      if (!view) throw new Error('Could not capture a high-resolution image of the AOI.')
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      setImageSource(view.imageSource ?? null)
      setCaptureNote(view.captureNote?.trim() || null)
      const sceneDate = view.sceneDate?.trim() || null
      const provider =
        view.provider?.trim() ||
        (view.imageSource === 'basemap'
          ? 'Mapbox basemap'
          : view.imageSource === 'esri-basemap'
            ? 'Esri Basemap Satellite'
            : view.imageSource === 'uploaded'
              ? 'Uploaded raster'
              : defaultProviderRef.current?.trim() || null)
      setResultDate(sceneDate)
      setResultProvider(provider)

      if (runFieldPipeline && sceneDate && captureMultiDateStackRef.current) {
        try {
          const stack = await captureMultiDateStackRef.current({
            bbox,
            aoi: aoiFc,
            primarySceneDate: sceneDate,
          })
          if (stack?.dates?.length) temporalDates = stack.dates
          if (stack?.primary?.image) {
            view = { ...view, ...stack.primary, image: stack.primary.image }
          }
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') throw err
          /* temporal stack optional — continue with primary frame */
        }
      }
      if (runFieldPipeline && !temporalDates.length && sceneDate) {
        temporalDates = [sceneDate]
      }

      setPhase('preprocess')
      await sleep(30)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      setPhase('cloudMask')
      await sleep(30)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      setPhase('normalize')
      const normalizedImage = await softNormalizeRgbDataUrl(view.image)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      setPhase('tile')
      await sleep(30)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      setPhase('infer')
      let out = await detectWithSegFormer({
        imageDataUrl: normalizedImage,
        bbox: view.bbox,
        classId: targetClassId,
        minConfidence: minConfidenceRef.current,
        tileSize: tileSizeRef.current,
        overlap: overlapRef.current,
        aoi: aoiFc,
        date: sceneDate,
        provider,
        signal: controller.signal,
      })

      setPhase('vectorize')
      await sleep(20)
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')

      const activeTargetId = resolveGeoAiTargetFromModelType(modelTypeIdRef.current)
      const activeRoute = resolveGeoAiTargetRoute(activeTargetId)
      const runOptionalSam2 = shouldRunOptionalSam2Refine({
        fieldPipeline: runFieldPipeline,
        boundaryRefine: boundaryRefineRef.current,
        supportsSam2Refine: activeRoute.supportsSam2Refine,
      })

      if (runFieldPipeline || runOptionalSam2) {
        setPhase('refine')
        try {
          const refined = await refineWithSam2({
            imageDataUrl: normalizedImage,
            bbox: view.bbox,
            instances: out.instances?.map(inst => ({
              featureId: inst.featureId,
              bboxXyxy: inst.bboxXyxy,
              centroidXy: inst.centroidXy,
              score: inst.score,
            })),
            coarseGeojson: out.geojson,
            aoi: aoiFc,
            minConfidence: minConfidenceRef.current,
            date: sceneDate,
            provider,
            signal: controller.signal,
          })
          if (refined.geojson.features.length) {
            const stamped = runFieldPipeline
              ? refined.geojson
              : stampSegFormerClassOntoRefined(refined.geojson, targetClassId, def.name, {
                  date: sceneDate,
                  provider,
                })
            out = {
              ...out,
              geojson: stamped,
              count: refined.count,
              score: refined.score,
              maskPng: refined.maskPng ?? out.maskPng,
              width: refined.width || out.width,
              height: refined.height || out.height,
            }
          }
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') throw err
          // Soft-fail: keep B5 polygons when SAM2 is offline.
          if (err instanceof Sam2RefinementServiceError && err.offline) {
            setCaptureNote(prev =>
              [prev, 'SAM2 refine offline — using B5 polygons.'].filter(Boolean).join(' '),
            )
          } else {
            throw err
          }
        }
      }

      if (runFieldPipeline) {
        setPhase('cropType')
        try {
          const typed = await classifyWithTemporalTransformer({
            geojson: out.geojson,
            dates: temporalDates,
            bbox: view.bbox,
            aoi: aoiFc,
            provider,
            signal: controller.signal,
          })
          out = {
            ...out,
            geojson: typed.geojson,
            count: typed.count || out.count,
          }
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') throw err
          // Soft-fail temporal — polygons still publish without crop labels.
          setCaptureNote(prev =>
            [prev, 'Temporal crop typing skipped.'].filter(Boolean).join(' '),
          )
        }
      }

      setError(null)
      setResult(out)
      setResultBbox(view.bbox)
      if (hasSegFormerDrawableResult(out)) {
        setOverlayVisible(true)
      }
      setPhase('publishReady')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const offlineErr = err instanceof SegFormerDetectionServiceError && err.offline
      const unsupportedErr = err instanceof SegFormerDetectionServiceError && err.unsupported
      const routeMissingErr = err instanceof SegFormerDetectionServiceError && err.routeMissing
      const sam2Offline = err instanceof Sam2RefinementServiceError && err.offline
      setOffline(offlineErr || sam2Offline)
      setRouteMissing(routeMissingErr)
      setError((err as Error)?.message || 'SegFormer detection failed.')
      setPhase(unsupportedErr ? 'unsupported' : 'error')
    } finally {
      setBusy(false)
    }
  }, [classId, categoryId, existingMapRasters])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setResult(null)
    setResultBbox(null)
    setError(null)
    setOffline(false)
    setRouteMissing(false)
    setImageSource(null)
    setCaptureNote(null)
    setResultDate(null)
    setResultProvider(null)
    setPhase('idle')
  }, [])

  const rows = useMemo<SegFormerResultRow[]>(() => {
    if (!result?.geojson?.features?.length) return []
    return result.geojson.features.map((f, i) => readFeatureRow(f, i))
  }, [result])

  const totalAreaHa = useMemo(
    () => rows.reduce((sum, r) => sum + (Number.isFinite(r.areaHa) ? r.areaHa : 0), 0),
    [rows],
  )

  const exportMeta = useMemo(
    () => ({
      classId: result?.classId,
      className: result?.className,
      date: resultDate,
      provider: resultProvider,
    }),
    [result?.classId, result?.className, resultDate, resultProvider],
  )

  const exportGeojson = useCallback(() => {
    if (!result?.geojson?.features?.length) return
    downloadSegFormerGeoJson(result.geojson, result.className, exportMeta)
  }, [result, exportMeta])

  const exportShapefile = useCallback(async () => {
    if (!result?.geojson?.features?.length) return
    await downloadSegFormerShapefile(result.geojson, result.className, exportMeta)
  }, [result, exportMeta])

  const exportMaskPng = useCallback(() => {
    if (!result?.maskPng) return
    downloadSegFormerMaskPng(result.maskPng, result.className)
  }, [result])

  const exportMaskGeoref = useCallback(async () => {
    if (!result?.maskPng) return
    await downloadSegFormerMaskGeoPackage(result.maskPng, resultBbox, result.className)
  }, [result, resultBbox])

  const showOnMap = useCallback(() => {
    setOverlayVisible(true)
  }, [])

  const rasterRecords = useMemo(
    () =>
      availableRasters.map(c => ({
        id: c.rasterId,
        name: c.name,
        status: 'ready' as const,
        crs: c.crs,
        bboxWgs84: c.bboxWgs84,
        footprint: c.footprint?.features?.[0] ?? null,
        widthPx: c.widthPx,
        heightPx: c.heightPx,
        bands: c.bands,
        resolutionMeters: c.resolutionMeters,
        pixelSizeMeters: c.pixelSizeMeters,
        byteSize: c.byteSize,
        isCog: c.isCog,
        acquisitionDate: c.acquisitionDate,
        sensor: c.sensor,
        georefSource: c.georefSource,
        tiles: c.tiles,
      })),
    [availableRasters],
  )

  return {
    categories: SEGFORMER_CATEGORIES,
    categoryId,
    setCategoryId: selectCategory,
    categoryClasses,
    classId,
    setClassId: selectClass,
    selectedClass,
    classMapped,
    unsupportedTooltip: SEGFORMER_UNSUPPORTED_TOOLTIP,
    modelTypeId,
    setModelTypeId: selectModelType,
    /** GeoAI router chip id (crops | trees | buildings | cars | …). */
    geoAiTargetId,
    geoAiRoute,
    setGeoAiTargetId: selectGeoAiTarget,
    fieldPipeline,
    /** Optional SAM2 boundary refine (locked on for field pipeline). */
    boundaryRefine: boundaryRefineEffective,
    setBoundaryRefine,
    supportsSam2Refine: geoAiRoute.supportsSam2Refine,
    detectUsesSegFormerFallback: geoAiRoute.detectUsesSegFormerFallback,
    detectEngine: geoAiRoute.detectEngine,
    bandConfig,
    bandMode: bandConfig.mode,
    setBandMode,
    customRgb: bandConfig.customRgb,
    setCustomRgb,
    setCustomRgbChannel,
    rgbMapping,
    rgbLabel,
    minConfidence,
    setMinConfidence: setMinConfidenceClamped,
    tileSize,
    setTileSize,
    overlap,
    setOverlap,
    overlayVisible,
    setOverlayVisible,
    fillOpacity,
    setFillOpacity,
    phase,
    busy: busy || rasterUploadBusy,
    error,
    offline,
    routeMissing,
    result,
    resultBbox,
    rows,
    objectCount: rows.length,
    totalAreaHa,
    geojson: result?.geojson ?? null,
    maskPng: result?.maskPng ?? null,
    hasDrawableResult: hasSegFormerDrawableResult(result),
    imageSource,
    captureNote,
    resultDate,
    resultProvider,
    inputMode,
    setInputMode: selectInputMode,
    availableRasters,
    /** Panel-facing list (`GET /api/raster` ready records + map rasters). */
    rasters: rasterRecords,
    selectedRasterId,
    selectedRaster,
    setSelectedRasterId: selectUploadedRaster,
    rasterListBusy,
    rasterUploadBusy,
    rasterBusy: rasterListBusy || rasterUploadBusy,
    rasterError,
    refreshRasters,
    addRasterFiles,
    detect,
    reset,
    showOnMap,
    exportGeojson,
    exportShapefile,
    exportMaskPng,
    exportMaskGeoref,
  }
}

export type UseSegFormerDetection = ReturnType<typeof useSegFormerDetection>
