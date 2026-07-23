import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buildRasterImageOverlay,
  georeferenceRasterOnServer,
  isPlainRasterImageFile,
  RasterNeedsGeoreferenceError,
  type RasterGcp,
  type RasterGeoreferencePayload,
  type RasterImageOverlay,
  type ServerRasterLayerConfig,
} from '../../../../lib/raster/siRasterTileService'
import {
  bboxOfGeometry,
  nextGcpId,
  parseNum,
  placementBoundsInViewport,
  pointsFootprint,
  quadFootprint,
  rectFootprint,
  type GeoBounds,
  type GeorefGcpDraft,
  type GeorefMode,
  type GeorefPending,
  type LonLatDraft,
} from '../../../../lib/raster/rasterGeorefPlacement'
import {
  fetchImageClassificationConfig,
  generateCheckPoints,
  runAccuracy,
  runAssignClasses,
  runClassification,
  runSegmentation,
  runTraining,
  type AccuracyReport,
  type ClassifyResult,
  type IcwClassifier,
  type ImageClassificationConfig,
  type SegmentationAlgorithm,
  type SegmentationResult,
  type TrainResult,
} from '../../lib/imageClassification/imageClassificationClient'

export type IcwMethod = 'supervised' | 'unsupervised'
export type IcwType = 'pixel' | 'object'

/** A land-cover class in the classification schema. */
export type SchemaClass = {
  id: string
  name: string
  value: number
  color: string
}

/** A training sample polygon tagged with its class. */
export type TrainingSample = {
  id: string
  classId: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

// Georeferencing placement types + pure helpers now live in the shared module
// `lib/raster/rasterGeorefPlacement` (reused by the Raster & Georeferencing tool).
// Re-export the types so existing panel imports from this hook keep working.
export type { GeorefPending, GeorefMode, LonLatDraft, GeorefGcpDraft } from '../../../../lib/raster/rasterGeorefPlacement'
export type { RasterImageOverlay } from '../../../../lib/raster/siRasterTileService'

/** Default palette for auto-assigned class colors. */
export const ICW_CLASS_COLORS = [
  '#2b6cb0',
  '#38a169',
  '#d69e2e',
  '#e53e3e',
  '#805ad5',
  '#dd6b20',
  '#319795',
  '#ed64a6',
  '#4a5568',
  '#00b5d8',
] as const

let classSeq = 0
let sampleSeq = 0
function nextClassId() {
  classSeq += 1
  return `icw-class-${Date.now().toString(36)}-${classSeq}`
}
function nextSampleId() {
  sampleSeq += 1
  return `icw-sample-${Date.now().toString(36)}-${sampleSeq}`
}

/** The six wizard steps rendered as dots in the stepper. */
export const ICW_STEPS = [
  'Configure',
  'Segmentation',
  'Training samples',
  'Train',
  'Classify',
  'Accuracy',
] as const

export type IcwStepIndex = number

export type UseImageClassificationWizardOptions = {
  /** Upload + poll a raster, returning a Mapbox-ready tile config (reuses /api/raster). */
  ingest: (files: File[], onStatus?: (message: string) => void) => Promise<ServerRasterLayerConfig>
  /**
   * Called once a raster is ready so the host can add it to the map + fit bounds.
   * For plain images an `imageOverlay` is supplied so the host renders a Mapbox image
   * source (undistorted RGB) instead of the multiband tile layer.
   */
  onRasterReady?: (config: ServerRasterLayerConfig, imageOverlay?: RasterImageOverlay | null) => void
  /** Called with a segmentation result (or null to clear) so the host can overlay boundaries. */
  onSegmentationPreview?: (result: SegmentationResult | null) => void
  /** Called with a classification result (or null to clear) so the host can overlay the map. */
  onClassificationPreview?: (result: ClassifyResult | null) => void
  /** Called with accuracy check-points (or null to clear) so the host can overlay the map. */
  onCheckPointsPreview?: (fc: GeoJSON.FeatureCollection | null) => void
  /** Returns the polygon currently drawn on the map (AOI sketch), or null. */
  getDrawnPolygon?: () => GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  /** Returns the current map viewport bounds (WGS84) so non-georeferenced images auto-place. */
  getMapBounds?: () => { west: number; south: number; east: number; north: number } | null
  /** Returns the last point clicked on the map (WGS84), for GCP capture. */
  getLastMapClick?: () => { lon: number; lat: number } | null
  /** Called with the georeferencing footprint preview (or null to clear) for the map overlay. */
  onGeorefFootprintPreview?: (fc: GeoJSON.FeatureCollection | null) => void
  /** Called after a sample is captured so the host can clear the drawn AOI for the next one. */
  onAfterSampleAdded?: () => void
  /** Called whenever samples/classes change so the host can render the colored samples overlay. */
  onSamplesChange?: (samples: TrainingSample[], classes: SchemaClass[]) => void
}

export type UseImageClassificationWizardReturn = {
  method: IcwMethod
  setMethod: (value: IcwMethod) => void
  type: IcwType
  setType: (value: IcwType) => void
  schemaName: string
  setSchemaName: (value: string) => void
  projectName: string
  setProjectName: (value: string) => void
  step: IcwStepIndex
  goNext: () => void
  goPrev: () => void
  goToStep: (index: IcwStepIndex) => void
  raster: ServerRasterLayerConfig | null
  busy: boolean
  error: string | null
  statusMessage: string | null
  serviceConfig: ImageClassificationConfig | null
  /** null while probing, true/false once resolved. */
  serviceOnline: boolean | null
  uploadRaster: (files: File[]) => Promise<void>
  /** Use a raster already loaded on the map (no re-upload) as the classification input. */
  selectExistingRaster: (config: ServerRasterLayerConfig) => void
  clearRaster: () => void
  // ── Georeferencing (non-georeferenced PNG/JPEG) ──
  georefPending: GeorefPending | null
  georefBusy: boolean
  georefMode: GeorefMode
  setGeorefMode: (mode: GeorefMode) => void
  /** Where a ready raster's georeferencing came from (dimap/worldfile/embedded/manual), or null. */
  georefSourceDetected: string | null
  georefBbox: { west: string; south: string; east: string; north: string }
  setGeorefBboxField: (key: 'west' | 'south' | 'east' | 'north', value: string) => void
  georefCorners: { nw: LonLatDraft; ne: LonLatDraft; se: LonLatDraft; sw: LonLatDraft }
  setGeorefCornerField: (corner: 'nw' | 'ne' | 'se' | 'sw', axis: 'lon' | 'lat', value: string) => void
  georefGcps: GeorefGcpDraft[]
  addGeorefGcp: () => void
  updateGeorefGcp: (id: string, field: keyof Omit<GeorefGcpDraft, 'id'>, value: string) => void
  removeGeorefGcp: (id: string) => void
  captureGcpMapPoint: (id: string) => void
  /** Bake the image using the current mode + inputs. Returns error text or null. */
  applyGeoreference: () => Promise<string | null>
  /** Bake the image at the currently-drawn rectangle's bounds. Returns error text or null. */
  applyGeoreferenceFromDrawn: () => Promise<string | null>
  /** Bake the image across the current map view (aspect-preserving). Returns error text or null. */
  placeAtCurrentView: () => Promise<string | null>
  cancelGeoreference: () => void
  // ── Segmentation (Step 2, object-based) ──
  segAlgorithm: SegmentationAlgorithm
  setSegAlgorithm: (value: SegmentationAlgorithm) => void
  spectralDetail: number
  setSpectralDetail: (value: number) => void
  spatialDetail: number
  setSpatialDetail: (value: number) => void
  minSegmentSize: number
  setMinSegmentSize: (value: number) => void
  segmentation: SegmentationResult | null
  segmentationBusy: boolean
  segmentationError: string | null
  segmentationStatus: string | null
  runSegmentationNow: () => Promise<void>
  clearSegmentation: () => void
  // ── Training samples (Step 3, supervised) ──
  classes: SchemaClass[]
  activeClassId: string | null
  setActiveClassId: (id: string | null) => void
  addClass: (name?: string) => void
  removeClass: (id: string) => void
  renameClass: (id: string, name: string) => void
  samples: TrainingSample[]
  /** Add the currently-drawn polygon as a sample for the active class. Returns an error string or null. */
  addActiveClassSample: () => string | null
  removeSample: (id: string) => void
  clearSamples: () => void
  sampleError: string | null
  // ── Train (Step 4) ──
  classifier: IcwClassifier
  setClassifier: (value: IcwClassifier) => void
  nEstimators: number
  setNEstimators: (value: number) => void
  nClusters: number
  setNClusters: (value: number) => void
  trainResult: TrainResult | null
  trainBusy: boolean
  trainError: string | null
  trainStatus: string | null
  runTrainingNow: () => Promise<void>
  clearTraining: () => void
  // ── Classify (Step 5) ──
  classifyResult: ClassifyResult | null
  classifyBusy: boolean
  classifyError: string | null
  classifyStatus: string | null
  runClassificationNow: () => Promise<void>
  clearClassification: () => void
  // ── Assign / merge clusters (Step 6, unsupervised) ──
  clusterAssignments: Record<number, { name: string; color: string }>
  setAssignmentName: (value: number, name: string) => void
  setAssignmentColor: (value: number, color: string) => void
  assignBusy: boolean
  assignError: string | null
  applyClassAssignments: () => Promise<void>
  // ── Accuracy (Step 7) ──
  accMethod: 'stratified' | 'equalized'
  setAccMethod: (value: 'stratified' | 'equalized') => void
  accCount: number
  setAccCount: (value: number) => void
  checkPointsBusy: boolean
  checkPointsCount: number
  generateCheckPointsNow: () => Promise<void>
  referenceCount: number
  referenceName: string | null
  loadReferenceFromFile: (file: File) => Promise<void>
  clearReference: () => void
  accuracyReport: AccuracyReport | null
  accuracyBusy: boolean
  accuracyError: string | null
  runAccuracyNow: () => Promise<void>
  clearAccuracy: () => void
}

const REFERENCE_CLASS_FIELDS = [
  'class_value',
  'classValue',
  'classvalue',
  'value',
  'class',
  'CLASS',
  'gridcode',
  'GRIDCODE',
  'DN',
  'label',
  'Classname',
  'className',
  'class_name',
]

/** Average a ring of [lng,lat] positions into a single point. */
function ringCentroid(ring: GeoJSON.Position[]): [number, number] | null {
  if (!ring.length) return null
  let sx = 0
  let sy = 0
  for (const p of ring) {
    sx += p[0]
    sy += p[1]
  }
  return [sx / ring.length, sy / ring.length]
}

/** Reduce any geometry to a representative [lng,lat] point for pixel sampling. */
function representativePoint(geom: GeoJSON.Geometry): [number, number] | null {
  switch (geom.type) {
    case 'Point':
      return [geom.coordinates[0], geom.coordinates[1]]
    case 'MultiPoint':
    case 'LineString':
      return ringCentroid(geom.coordinates as GeoJSON.Position[])
    case 'Polygon':
      return ringCentroid(geom.coordinates[0] || [])
    case 'MultiPolygon':
      return ringCentroid(geom.coordinates[0]?.[0] || [])
    default:
      return null
  }
}

/** Resolve a reference feature's class value against the schema (numeric direct, or name→value). */
function resolveReferenceClass(
  props: Record<string, unknown>,
  classes: SchemaClass[],
): number | null {
  for (const key of REFERENCE_CLASS_FIELDS) {
    if (!(key in props)) continue
    const raw = props[key]
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw)
    if (typeof raw === 'string') {
      const asNum = Number(raw)
      if (raw.trim() !== '' && Number.isFinite(asNum)) return Math.round(asNum)
      const match = classes.find(c => c.name.toLowerCase() === raw.trim().toLowerCase())
      if (match) return match.value
    }
  }
  return null
}

/**
 * Wizard UI state for the Image Classification tool (Step 1: Configure).
 *
 * Follows the app's plain-hook convention (no Zustand). Raster upload is delegated
 * to the host via `ingest` / `onRasterReady` so the existing /api/raster + custom-layer
 * plumbing stays the single source of truth for tiling.
 */
export function useImageClassificationWizard(
  opts: UseImageClassificationWizardOptions,
): UseImageClassificationWizardReturn {
  const optsRef = useRef(opts)
  optsRef.current = opts

  const [method, setMethod] = useState<IcwMethod>('supervised')
  const [type, setType] = useState<IcwType>('pixel')
  const [schemaName, setSchemaName] = useState('')
  const [projectName, setProjectName] = useState('classification-project')
  const [step, setStep] = useState<IcwStepIndex>(0)
  const [raster, setRaster] = useState<ServerRasterLayerConfig | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [serviceConfig, setServiceConfig] = useState<ImageClassificationConfig | null>(null)
  const [serviceOnline, setServiceOnline] = useState<boolean | null>(null)
  const [georefPending, setGeorefPending] = useState<GeorefPending | null>(null)
  const [georefBusy, setGeorefBusy] = useState(false)
  const [georefMode, setGeorefMode] = useState<GeorefMode>('bbox')
  const [georefSourceDetected, setGeorefSourceDetected] = useState<string | null>(null)
  const emptyLonLat: LonLatDraft = { lon: '', lat: '' }
  const [georefBbox, setGeorefBbox] = useState({ west: '', south: '', east: '', north: '' })
  const [georefCorners, setGeorefCorners] = useState<{
    nw: LonLatDraft
    ne: LonLatDraft
    se: LonLatDraft
    sw: LonLatDraft
  }>({ nw: { ...emptyLonLat }, ne: { ...emptyLonLat }, se: { ...emptyLonLat }, sw: { ...emptyLonLat } })
  const [georefGcps, setGeorefGcps] = useState<GeorefGcpDraft[]>([])

  const [segAlgorithm, setSegAlgorithm] = useState<SegmentationAlgorithm>('slic')
  const [spectralDetail, setSpectralDetail] = useState(15)
  const [spatialDetail, setSpatialDetail] = useState(15)
  const [minSegmentSize, setMinSegmentSize] = useState(20)
  const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null)
  const [segmentationBusy, setSegmentationBusy] = useState(false)
  const [segmentationError, setSegmentationError] = useState<string | null>(null)
  const [segmentationStatus, setSegmentationStatus] = useState<string | null>(null)

  // Refs keep the segmentation runner stable (no re-create on every slider tick).
  const rasterRef = useRef(raster)
  rasterRef.current = raster
  // The original plain-image File (PNG/JPEG/...) from the last upload, kept so it can be
  // rendered pixel-perfect via a Mapbox image source rather than the server tile pipeline.
  const lastImageFileRef = useRef<File | null>(null)
  const segAlgoRef = useRef(segAlgorithm)
  segAlgoRef.current = segAlgorithm
  const spectralRef = useRef(spectralDetail)
  spectralRef.current = spectralDetail
  const spatialRef = useRef(spatialDetail)
  spatialRef.current = spatialDetail
  const minSizeRef = useRef(minSegmentSize)
  minSizeRef.current = minSegmentSize

  const [classes, setClasses] = useState<SchemaClass[]>([])
  const [activeClassId, setActiveClassId] = useState<string | null>(null)
  const [samples, setSamples] = useState<TrainingSample[]>([])
  const [sampleError, setSampleError] = useState<string | null>(null)

  // Refs so the sample/class callbacks stay stable while reading latest state.
  const samplesRef = useRef(samples)
  samplesRef.current = samples
  const classesRef = useRef(classes)
  classesRef.current = classes
  const activeClassIdRef = useRef(activeClassId)
  activeClassIdRef.current = activeClassId
  const georefPendingRef = useRef(georefPending)
  georefPendingRef.current = georefPending
  const georefModeRef = useRef(georefMode)
  georefModeRef.current = georefMode
  const georefBboxRef = useRef(georefBbox)
  georefBboxRef.current = georefBbox
  const georefCornersRef = useRef(georefCorners)
  georefCornersRef.current = georefCorners
  const georefGcpsRef = useRef(georefGcps)
  georefGcpsRef.current = georefGcps

  // Notify the host whenever the sample set or class colors change (for the map overlay).
  const notifySamples = useCallback((nextSamples: TrainingSample[], nextClasses: SchemaClass[]) => {
    optsRef.current.onSamplesChange?.(nextSamples, nextClasses)
  }, [])

  const addClass = useCallback((name?: string) => {
    setClasses(prev => {
      const idx = prev.length
      const id = nextClassId()
      const next = [
        ...prev,
        {
          id,
          name: (name && name.trim()) || `Class ${idx + 1}`,
          value: idx + 1,
          color: ICW_CLASS_COLORS[idx % ICW_CLASS_COLORS.length],
        },
      ]
      setActiveClassId(current => current ?? id)
      notifySamples(samplesRef.current, next)
      return next
    })
  }, [notifySamples])

  const removeClass = useCallback((id: string) => {
    setClasses(prev => {
      const next = prev.filter(c => c.id !== id)
      notifySamples(
        samplesRef.current.filter(s => s.classId !== id),
        next,
      )
      return next
    })
    setSamples(prev => prev.filter(s => s.classId !== id))
    setActiveClassId(current => (current === id ? null : current))
  }, [notifySamples])

  const renameClass = useCallback((id: string, name: string) => {
    setClasses(prev => {
      const next = prev.map(c => (c.id === id ? { ...c, name } : c))
      notifySamples(samplesRef.current, next)
      return next
    })
  }, [notifySamples])

  const addActiveClassSample = useCallback((): string | null => {
    const classId = activeClassIdRef.current
    if (!classId) {
      setSampleError('Add and select a class first.')
      return 'Add and select a class first.'
    }
    const geometry = optsRef.current.getDrawnPolygon?.() ?? null
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      setSampleError('Draw a polygon on the map (AOI tools), then add it.')
      return 'Draw a polygon on the map (AOI tools), then add it.'
    }
    setSampleError(null)
    const sample: TrainingSample = { id: nextSampleId(), classId, geometry }
    setSamples(prev => {
      const next = [...prev, sample]
      notifySamples(next, classesRef.current)
      return next
    })
    optsRef.current.onAfterSampleAdded?.()
    return null
  }, [notifySamples])

  const removeSample = useCallback((id: string) => {
    setSamples(prev => {
      const next = prev.filter(s => s.id !== id)
      notifySamples(next, classesRef.current)
      return next
    })
  }, [notifySamples])

  const clearSamples = useCallback(() => {
    setSamples([])
    setSampleError(null)
    notifySamples([], classesRef.current)
  }, [notifySamples])

  // ── Train / Classify state (Steps 4-5) ──
  const [classifier, setClassifier] = useState<IcwClassifier>('random_forest')
  const [nEstimators, setNEstimators] = useState(200)
  const [nClusters, setNClusters] = useState(8)
  const [trainResult, setTrainResult] = useState<TrainResult | null>(null)
  const [trainBusy, setTrainBusy] = useState(false)
  const [trainError, setTrainError] = useState<string | null>(null)
  const [trainStatus, setTrainStatus] = useState<string | null>(null)
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null)
  const [classifyBusy, setClassifyBusy] = useState(false)
  const [classifyError, setClassifyError] = useState<string | null>(null)
  const [classifyStatus, setClassifyStatus] = useState<string | null>(null)

  const classifierRef = useRef(classifier)
  classifierRef.current = classifier
  const nEstimatorsRef = useRef(nEstimators)
  nEstimatorsRef.current = nEstimators
  const nClustersRef = useRef(nClusters)
  nClustersRef.current = nClusters
  const trainResultRef = useRef(trainResult)
  trainResultRef.current = trainResult

  /** Class-schema payload (snake_case) for the ML service. */
  const classPayload = useCallback(
    () =>
      classesRef.current.map(c => ({
        class_name: c.name,
        class_value: c.value,
        color: c.color,
      })),
    [],
  )

  const clearClassification = useCallback(() => {
    setClassifyResult(null)
    setClassifyError(null)
    setClassifyStatus(null)
    optsRef.current.onClassificationPreview?.(null)
  }, [])

  const clearTraining = useCallback(() => {
    setTrainResult(null)
    setTrainError(null)
    setTrainStatus(null)
    clearClassification()
  }, [clearClassification])

  const runTrainingNow = useCallback(async () => {
    const current = rasterRef.current
    if (!current) {
      setTrainError('Load a raster first.')
      return
    }
    const activeClassifier = classifierRef.current
    const samplePayload =
      activeClassifier === 'kmeans'
        ? []
        : samplesRef.current
            .map(s => {
              const cls = classesRef.current.find(c => c.id === s.classId)
              if (!cls) return null
              return { class_name: cls.name, class_value: cls.value, geometry: s.geometry }
            })
            .filter((x): x is { class_name: string; class_value: number; geometry: typeof samplesRef.current[number]['geometry'] } => x !== null)
    if (activeClassifier !== 'kmeans' && samplePayload.length === 0) {
      setTrainError('Add training samples (Step 3) before training a supervised model.')
      return
    }
    setTrainBusy(true)
    setTrainError(null)
    setTrainStatus('Starting training…')
    clearClassification()
    try {
      const result = await runTraining(
        {
          rasterId: current.rasterId,
          classifier: activeClassifier,
          nEstimators: nEstimatorsRef.current,
          nClusters: nClustersRef.current,
          samples: samplePayload,
          classes: classPayload(),
        },
        { onStatus: (message, progress) => setTrainStatus(`${message} (${Math.round(progress * 100)}%)`) },
      )
      setTrainResult(result)
      const acc = typeof result.train_accuracy === 'number' ? ` · fit ${(result.train_accuracy * 100).toFixed(1)}%` : ''
      setTrainStatus(`Model ready${acc}`)
    } catch (err) {
      setTrainError(err instanceof Error ? err.message : 'Training failed')
      setTrainStatus(null)
    } finally {
      setTrainBusy(false)
    }
  }, [classPayload, clearClassification])

  const runClassificationNow = useCallback(async () => {
    const current = rasterRef.current
    const model = trainResultRef.current
    if (!current) {
      setClassifyError('Load a raster first.')
      return
    }
    if (!model) {
      setClassifyError('Train a model first (Step 4).')
      return
    }
    setClassifyBusy(true)
    setClassifyError(null)
    setClassifyStatus('Starting classification…')
    try {
      const result = await runClassification(
        {
          rasterId: current.rasterId,
          modelId: model.model_id,
          classes: classPayload(),
        },
        { onStatus: (message, progress) => setClassifyStatus(`${message} (${Math.round(progress * 100)}%)`) },
      )
      setClassifyResult(result)
      setClassifyStatus(`Classified — ${result.class_distribution.length} classes`)
      optsRef.current.onClassificationPreview?.(result)
    } catch (err) {
      setClassifyError(err instanceof Error ? err.message : 'Classification failed')
      setClassifyStatus(null)
    } finally {
      setClassifyBusy(false)
    }
  }, [classPayload])

  // Keep the classifier consistent with the method (KMeans is the only unsupervised option).
  useEffect(() => {
    if (method === 'unsupervised' && classifier !== 'kmeans') setClassifier('kmeans')
    else if (method === 'supervised' && classifier === 'kmeans') setClassifier('random_forest')
  }, [method, classifier])

  // ── Assign / merge clusters state (Step 6, unsupervised) ──
  const [clusterAssignments, setClusterAssignments] = useState<
    Record<number, { name: string; color: string }>
  >({})
  const [assignBusy, setAssignBusy] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const clusterAssignmentsRef = useRef(clusterAssignments)
  clusterAssignmentsRef.current = clusterAssignments
  const methodRef = useRef(method)
  methodRef.current = method
  const classifyResultRef = useRef(classifyResult)
  classifyResultRef.current = classifyResult

  // Seed the assignment draft from the classified cluster distribution (unsupervised only).
  useEffect(() => {
    if (methodRef.current !== 'unsupervised' || !classifyResult) return
    setClusterAssignments(prev => {
      const next = { ...prev }
      let changed = false
      for (const item of classifyResult.class_distribution) {
        if (!next[item.value]) {
          next[item.value] = { name: item.name, color: item.color }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [classifyResult])

  // Reset the assignment draft whenever the classification is cleared / re-run.
  useEffect(() => {
    if (!classifyResult) {
      setClusterAssignments({})
      setAssignError(null)
    }
  }, [classifyResult])

  const setAssignmentName = useCallback((value: number, name: string) => {
    setClusterAssignments(prev => ({
      ...prev,
      [value]: { name, color: prev[value]?.color ?? '#38a169' },
    }))
  }, [])

  const setAssignmentColor = useCallback((value: number, color: string) => {
    setClusterAssignments(prev => ({
      ...prev,
      [value]: { name: prev[value]?.name ?? '', color },
    }))
  }, [])

  const applyClassAssignments = useCallback(async () => {
    const current = rasterRef.current
    const model = trainResultRef.current
    const result = classifyResultRef.current
    if (!current || !model || !result) {
      setAssignError('Classify the raster first (Step 5).')
      return
    }
    const draft = clusterAssignmentsRef.current
    // Group clusters by (case-insensitive) target name → merged target value + color.
    const targetByName = new Map<string, { value: number; name: string; color: string }>()
    let nextValue = 1
    const assignments = result.class_distribution.map(item => {
      const entry = draft[item.value]
      const name = (entry?.name || item.name || `Class ${item.value}`).trim()
      const color = entry?.color || item.color
      const key = name.toLowerCase()
      let target = targetByName.get(key)
      if (!target) {
        target = { value: nextValue++, name, color }
        targetByName.set(key, target)
      }
      return { from: item.value, to: target.value, name: target.name, color: target.color }
    })

    setAssignBusy(true)
    setAssignError(null)
    try {
      const merged = await runAssignClasses({
        rasterId: current.rasterId,
        modelId: model.model_id,
        assignments,
      })
      setClassifyResult(merged)
      optsRef.current.onClassificationPreview?.(merged)
      // Publish the merged classes to the schema so downstream (accuracy) uses their names.
      const schemaClasses: SchemaClass[] = Array.from(targetByName.values()).map(t => ({
        id: nextClassId(),
        name: t.name,
        value: t.value,
        color: t.color,
      }))
      setClasses(schemaClasses)
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Class assignment failed')
    } finally {
      setAssignBusy(false)
    }
  }, [])

  // ── Accuracy assessment state (Step 7) ──
  const [accMethod, setAccMethod] = useState<'stratified' | 'equalized'>('stratified')
  const [accCount, setAccCount] = useState(150)
  const [checkPointsBusy, setCheckPointsBusy] = useState(false)
  const [checkPointsCount, setCheckPointsCount] = useState(0)
  const [referencePoints, setReferencePoints] = useState<GeoJSON.Feature[]>([])
  const [referenceName, setReferenceName] = useState<string | null>(null)
  const [accuracyReport, setAccuracyReport] = useState<AccuracyReport | null>(null)
  const [accuracyBusy, setAccuracyBusy] = useState(false)
  const [accuracyError, setAccuracyError] = useState<string | null>(null)

  const accMethodRef = useRef(accMethod)
  accMethodRef.current = accMethod
  const accCountRef = useRef(accCount)
  accCountRef.current = accCount
  const referencePointsRef = useRef(referencePoints)
  referencePointsRef.current = referencePoints

  const clearAccuracy = useCallback(() => {
    setAccuracyReport(null)
    setAccuracyError(null)
    setCheckPointsCount(0)
    optsRef.current.onCheckPointsPreview?.(null)
  }, [])

  const clearReference = useCallback(() => {
    setReferencePoints([])
    setReferenceName(null)
    setAccuracyReport(null)
    setAccuracyError(null)
  }, [])

  const generateCheckPointsNow = useCallback(async () => {
    const current = rasterRef.current
    const model = trainResultRef.current
    if (!current || !model) {
      setAccuracyError('Classify the raster first (Steps 4-5).')
      return
    }
    setCheckPointsBusy(true)
    setAccuracyError(null)
    try {
      const fc = await generateCheckPoints({
        rasterId: current.rasterId,
        modelId: model.model_id,
        method: accMethodRef.current,
        count: accCountRef.current,
        classes: classPayload(),
      })
      setCheckPointsCount(fc.count)
      optsRef.current.onCheckPointsPreview?.(fc)
    } catch (err) {
      setAccuracyError(err instanceof Error ? err.message : 'Check-point generation failed')
    } finally {
      setCheckPointsBusy(false)
    }
  }, [classPayload])

  const loadReferenceFromFile = useCallback(async (file: File) => {
    setAccuracyError(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as GeoJSON.GeoJSON
      const rawFeatures: GeoJSON.Feature[] =
        parsed.type === 'FeatureCollection'
          ? parsed.features
          : parsed.type === 'Feature'
            ? [parsed]
            : []
      if (!rawFeatures.length) throw new Error('No features found in the GeoJSON file.')
      const classes = classesRef.current
      const points: GeoJSON.Feature[] = []
      for (const feature of rawFeatures) {
        if (!feature.geometry) continue
        const value = resolveReferenceClass(
          (feature.properties as Record<string, unknown>) || {},
          classes,
        )
        if (value == null) continue
        const point = representativePoint(feature.geometry)
        if (!point) continue
        points.push({
          type: 'Feature',
          properties: { class_value: value },
          geometry: { type: 'Point', coordinates: point },
        })
      }
      if (!points.length) {
        throw new Error(
          'No usable class labels found. Reference features need a numeric class field (e.g. class_value) or a name matching your schema.',
        )
      }
      setReferencePoints(points)
      setReferenceName(`${file.name} · ${points.length} pts`)
      setAccuracyReport(null)
    } catch (err) {
      setReferencePoints([])
      setReferenceName(null)
      setAccuracyError(
        err instanceof Error ? err.message : 'Could not read the reference file (expected GeoJSON).',
      )
    }
  }, [])

  const runAccuracyNow = useCallback(async () => {
    const current = rasterRef.current
    const model = trainResultRef.current
    if (!current || !model) {
      setAccuracyError('Classify the raster first (Steps 4-5).')
      return
    }
    if (referencePointsRef.current.length === 0) {
      setAccuracyError('Load reference (ground-truth) points first.')
      return
    }
    setAccuracyBusy(true)
    setAccuracyError(null)
    try {
      const report = await runAccuracy({
        rasterId: current.rasterId,
        modelId: model.model_id,
        referencePoints: referencePointsRef.current,
        classes: classPayload(),
      })
      setAccuracyReport(report)
    } catch (err) {
      setAccuracyError(err instanceof Error ? err.message : 'Accuracy assessment failed')
    } finally {
      setAccuracyBusy(false)
    }
  }, [classPayload])

  // Invalidate a trained model + overlay when the raster is replaced (band mismatch guard).
  const prevRasterIdRef = useRef<string | null>(null)
  useEffect(() => {
    const id = raster?.rasterId ?? null
    if (prevRasterIdRef.current !== null && prevRasterIdRef.current !== id) {
      clearTraining()
      clearReference()
      clearAccuracy()
    }
    prevRasterIdRef.current = id
  }, [raster, clearTraining, clearReference, clearAccuracy])

  // Drop a stale accuracy report / check-points when the model is cleared.
  useEffect(() => {
    if (!trainResult) {
      setAccuracyReport(null)
      setCheckPointsCount(0)
      optsRef.current.onCheckPointsPreview?.(null)
    }
  }, [trainResult])

  // Probe the ML service once so the panel can show an online/offline chip.
  useEffect(() => {
    const controller = new AbortController()
    fetchImageClassificationConfig(controller.signal)
      .then(config => {
        setServiceConfig(config)
        setServiceOnline(true)
      })
      .catch(() => {
        if (!controller.signal.aborted) setServiceOnline(false)
      })
    return () => controller.abort()
  }, [])

  const uploadRaster = useCallback(async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    setError(null)
    setGeorefPending(null)
    setGeorefSourceDetected(null)
    optsRef.current.onGeorefFootprintPreview?.(null)
    setStatusMessage('Uploading raster…')
    // Remember the primary plain image so it can be rendered via a Mapbox image source.
    const primary =
      files.find(f => /\.(tif|tiff|jp2|j2k)$/i.test(f.name)) ||
      files.find(f => isPlainRasterImageFile(f)) ||
      files[0]
    lastImageFileRef.current = isPlainRasterImageFile(primary) ? primary : null
    try {
      const config = await optsRef.current.ingest(files, message => setStatusMessage(message))
      setRaster(config)
      setGeorefSourceDetected(config.georefSource ?? null)
      setStatusMessage(`Raster ready: ${config.name}`)
      const overlay = await buildRasterImageOverlay(lastImageFileRef.current, config)
      optsRef.current.onRasterReady?.(config, overlay)
    } catch (err) {
      if (err instanceof RasterNeedsGeoreferenceError) {
        // No embedded/sidecar georeferencing → open the Georeferencing panel. Pre-fill the
        // bounding box with an aspect-preserving guess at the current view so the user has a
        // sensible starting point (they confirm/override before anything is placed).
        setGeorefPending({
          rasterId: err.rasterId,
          name: err.rasterName,
          widthPx: err.widthPx,
          heightPx: err.heightPx,
        })
        const viewport = optsRef.current.getMapBounds?.() ?? null
        if (viewport) {
          const guess = placementBoundsInViewport(viewport, err.widthPx, err.heightPx)
          setGeorefBbox({
            west: guess.west.toFixed(6),
            south: guess.south.toFixed(6),
            east: guess.east.toFixed(6),
            north: guess.north.toFixed(6),
          })
        }
        setGeorefMode('bbox')
        setStatusMessage(
          'This image has no georeferencing. Set its true location below (bounding box, corners, or GCPs), then apply.',
        )
        setError(null)
      } else {
        setError(err instanceof Error ? err.message : 'Raster upload failed')
        setStatusMessage(null)
      }
    } finally {
      setBusy(false)
    }
  }, [])

  // Select an existing map raster (already ingested via /api/raster) as the input.
  // No re-upload or map re-render — the layer is already on the map; we only bind its
  // server rasterId + metadata so segmentation/train/classify run against it.
  const selectExistingRaster = useCallback((config: ServerRasterLayerConfig) => {
    lastImageFileRef.current = null
    setError(null)
    // A layer already on the map is, by definition, georeferenced — bind it and go
    // straight to classification (no bounding-box / GCP prompt).
    setGeorefPending(null)
    optsRef.current.onGeorefFootprintPreview?.(null)
    const b = config.bboxWgs84
    const isGeoreferenced =
      !!b &&
      [b.west, b.south, b.east, b.north].every(v => Number.isFinite(v)) &&
      b.east !== b.west &&
      b.north !== b.south
    setGeorefSourceDetected(config.georefSource ?? (isGeoreferenced ? 'existing-layer' : null))
    setRaster(config)
    setStatusMessage(
      isGeoreferenced
        ? `Using georeferenced map raster: ${config.name} — ready to classify.`
        : `Using map raster: ${config.name}`,
    )
  }, [])

  // Build a georeference payload from the current mode + inputs, or an error string.
  const buildGeorefPayload = useCallback((): RasterGeoreferencePayload | string => {
    const mode = georefModeRef.current
    if (mode === 'bbox') {
      const b = georefBboxRef.current
      const west = parseNum(b.west)
      const south = parseNum(b.south)
      const east = parseNum(b.east)
      const north = parseNum(b.north)
      if ([west, south, east, north].some(v => v === null)) return 'Enter west, south, east and north.'
      if ((east as number) <= (west as number) || (north as number) <= (south as number)) {
        return 'Bounding box needs west < east and south < north.'
      }
      return { mode: 'bbox', bounds: { west: west!, south: south!, east: east!, north: north! } }
    }
    if (mode === 'corners') {
      const c = georefCornersRef.current
      const read = (k: 'nw' | 'ne' | 'se' | 'sw'): [number, number] | null => {
        const lon = parseNum(c[k].lon)
        const lat = parseNum(c[k].lat)
        return lon === null || lat === null ? null : [lon, lat]
      }
      const nw = read('nw')
      const ne = read('ne')
      const se = read('se')
      const sw = read('sw')
      if (!nw || !ne || !se || !sw) return 'Enter lon/lat for all four corners (NW, NE, SE, SW).'
      return { mode: 'corners', corners: { nw, ne, se, sw } }
    }
    // gcps
    const gcps: RasterGcp[] = []
    for (const g of georefGcpsRef.current) {
      const col = parseNum(g.col)
      const row = parseNum(g.row)
      const lon = parseNum(g.lon)
      const lat = parseNum(g.lat)
      if ([col, row, lon, lat].every(v => v !== null)) {
        gcps.push({ col: col!, row: row!, lon: lon!, lat: lat! })
      }
    }
    if (gcps.length < 3) return 'Add at least 3 complete ground control points (col, row, lon, lat).'
    return { mode: 'gcps', gcps }
  }, [])

  // Shared apply: bake the image with `placement` then swap in the georeferenced tiles.
  const applyPlacement = useCallback(
    async (rasterId: string, placement: RasterGeoreferencePayload): Promise<string | null> => {
      setGeorefBusy(true)
      setError(null)
      setStatusMessage('Placing image on the map…')
      try {
        const config = await georeferenceRasterOnServer(rasterId, placement)
        setRaster(config)
        setGeorefPending(null)
        setGeorefSourceDetected(config.georefSource ?? `manual:${placement.mode}`)
        setStatusMessage(`Raster ready: ${config.name}`)
        optsRef.current.onGeorefFootprintPreview?.(null)
        const overlay = await buildRasterImageOverlay(lastImageFileRef.current, config)
        optsRef.current.onRasterReady?.(config, overlay)
        optsRef.current.onAfterSampleAdded?.()
        return null
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Georeferencing failed'
        setError(msg)
        setStatusMessage(null)
        return msg
      } finally {
        setGeorefBusy(false)
      }
    },
    [],
  )

  const applyGeoreference = useCallback(async (): Promise<string | null> => {
    const pending = georefPendingRef.current
    if (!pending) return 'No image is waiting for placement.'
    const payload = buildGeorefPayload()
    if (typeof payload === 'string') {
      setError(payload)
      return payload
    }
    return applyPlacement(pending.rasterId, payload)
  }, [applyPlacement, buildGeorefPayload])

  const applyGeoreferenceFromDrawn = useCallback(async (): Promise<string | null> => {
    const pending = georefPendingRef.current
    if (!pending) return 'No image is waiting for placement.'
    const geometry = optsRef.current.getDrawnPolygon?.() ?? null
    const bounds = bboxOfGeometry(geometry)
    if (!bounds) {
      const msg = 'Draw a rectangle on the map to place the image first.'
      setError(msg)
      return msg
    }
    return applyPlacement(pending.rasterId, { mode: 'bbox', bounds })
  }, [applyPlacement])

  const placeAtCurrentView = useCallback(async (): Promise<string | null> => {
    const pending = georefPendingRef.current
    if (!pending) return 'No image is waiting for placement.'
    const viewport = optsRef.current.getMapBounds?.() ?? null
    if (!viewport) {
      const msg = 'Map view is unavailable; enter a bounding box instead.'
      setError(msg)
      return msg
    }
    const bounds = placementBoundsInViewport(viewport, pending.widthPx, pending.heightPx)
    return applyPlacement(pending.rasterId, { mode: 'bbox', bounds })
  }, [applyPlacement])

  const cancelGeoreference = useCallback(() => {
    setGeorefPending(null)
    setStatusMessage(null)
    setError(null)
    optsRef.current.onGeorefFootprintPreview?.(null)
    optsRef.current.onAfterSampleAdded?.()
  }, [])

  // ── GCP editing ──
  const addGeorefGcp = useCallback(() => {
    setGeorefGcps(prev => [...prev, { id: nextGcpId(), col: '', row: '', lon: '', lat: '' }])
  }, [])
  const updateGeorefGcp = useCallback((id: string, field: keyof Omit<GeorefGcpDraft, 'id'>, value: string) => {
    setGeorefGcps(prev => prev.map(g => (g.id === id ? { ...g, [field]: value } : g)))
  }, [])
  const removeGeorefGcp = useCallback((id: string) => {
    setGeorefGcps(prev => prev.filter(g => g.id !== id))
  }, [])
  const captureGcpMapPoint = useCallback((id: string) => {
    const pt = optsRef.current.getLastMapClick?.() ?? null
    if (!pt) {
      setError('Click a point on the map first, then use it for this GCP.')
      return
    }
    setGeorefGcps(prev =>
      prev.map(g => (g.id === id ? { ...g, lon: pt.lon.toFixed(6), lat: pt.lat.toFixed(6) } : g)),
    )
  }, [])

  // Field setters for bbox/corners (kept small for the panel).
  const setGeorefBboxField = useCallback((key: 'west' | 'south' | 'east' | 'north', value: string) => {
    setGeorefBbox(prev => ({ ...prev, [key]: value }))
  }, [])
  const setGeorefCornerField = useCallback(
    (corner: 'nw' | 'ne' | 'se' | 'sw', axis: 'lon' | 'lat', value: string) => {
      setGeorefCorners(prev => ({ ...prev, [corner]: { ...prev[corner], [axis]: value } }))
    },
    [],
  )

  // Live footprint preview on the map as the user edits the placement inputs.
  useEffect(() => {
    const emit = optsRef.current.onGeorefFootprintPreview
    if (!emit) return
    if (!georefPending) {
      emit(null)
      return
    }
    if (georefMode === 'bbox') {
      const west = parseNum(georefBbox.west)
      const south = parseNum(georefBbox.south)
      const east = parseNum(georefBbox.east)
      const north = parseNum(georefBbox.north)
      if (
        west !== null && south !== null && east !== null && north !== null &&
        east > west && north > south
      ) {
        emit(rectFootprint({ west, south, east, north }))
      } else {
        emit(null)
      }
    } else if (georefMode === 'corners') {
      const read = (k: 'nw' | 'ne' | 'se' | 'sw'): [number, number] | null => {
        const lon = parseNum(georefCorners[k].lon)
        const lat = parseNum(georefCorners[k].lat)
        return lon === null || lat === null ? null : [lon, lat]
      }
      const nw = read('nw')
      const ne = read('ne')
      const se = read('se')
      const sw = read('sw')
      emit(nw && ne && se && sw ? quadFootprint(nw, ne, se, sw) : null)
    } else if (georefMode === 'gcps') {
      const pts: Array<[number, number]> = []
      for (const g of georefGcps) {
        const lon = parseNum(g.lon)
        const lat = parseNum(g.lat)
        if (lon !== null && lat !== null) pts.push([lon, lat])
      }
      emit(pts.length ? pointsFootprint(pts) : null)
    } else {
      // 'draw' / 'view' — no numeric preview (the drawn/viewport rectangle stands in).
      emit(null)
    }
  }, [georefPending, georefMode, georefBbox, georefCorners, georefGcps])

  const clearSegmentation = useCallback(() => {
    setSegmentation(null)
    setSegmentationError(null)
    setSegmentationStatus(null)
    optsRef.current.onSegmentationPreview?.(null)
  }, [])

  const clearRaster = useCallback(() => {
    setRaster(null)
    setStatusMessage(null)
    setError(null)
    setGeorefPending(null)
    clearSegmentation()
  }, [clearSegmentation])

  const runSegmentationNow = useCallback(async () => {
    const current = rasterRef.current
    if (!current) {
      setSegmentationError('Load a raster first.')
      return
    }
    setSegmentationBusy(true)
    setSegmentationError(null)
    setSegmentationStatus('Starting segmentation…')
    try {
      const result = await runSegmentation(
        {
          rasterId: current.rasterId,
          algorithm: segAlgoRef.current,
          spectralDetail: spectralRef.current,
          spatialDetail: spatialRef.current,
          minSegmentSize: minSizeRef.current,
        },
        { onStatus: message => setSegmentationStatus(message) },
      )
      setSegmentation(result)
      setSegmentationStatus(
        `${result.segment_count} segments (${result.preview_size.width}×${result.preview_size.height} preview).`,
      )
      optsRef.current.onSegmentationPreview?.(result)
    } catch (err) {
      setSegmentationError(err instanceof Error ? err.message : 'Segmentation failed')
      setSegmentationStatus(null)
    } finally {
      setSegmentationBusy(false)
    }
  }, [])

  const goNext = useCallback(
    () => setStep(current => Math.min(current + 1, ICW_STEPS.length - 1)),
    [],
  )
  const goPrev = useCallback(() => setStep(current => Math.max(current - 1, 0)), [])
  const goToStep = useCallback(
    (index: IcwStepIndex) => setStep(() => Math.max(0, Math.min(index, ICW_STEPS.length - 1))),
    [],
  )

  return {
    method,
    setMethod,
    type,
    setType,
    schemaName,
    setSchemaName,
    projectName,
    setProjectName,
    step,
    goNext,
    goPrev,
    goToStep,
    raster,
    busy,
    error,
    statusMessage,
    serviceConfig,
    serviceOnline,
    uploadRaster,
    selectExistingRaster,
    clearRaster,
    georefPending,
    georefBusy,
    georefMode,
    setGeorefMode,
    georefSourceDetected,
    georefBbox,
    setGeorefBboxField,
    georefCorners,
    setGeorefCornerField,
    georefGcps,
    addGeorefGcp,
    updateGeorefGcp,
    removeGeorefGcp,
    captureGcpMapPoint,
    applyGeoreference,
    applyGeoreferenceFromDrawn,
    placeAtCurrentView,
    cancelGeoreference,
    segAlgorithm,
    setSegAlgorithm,
    spectralDetail,
    setSpectralDetail,
    spatialDetail,
    setSpatialDetail,
    minSegmentSize,
    setMinSegmentSize,
    segmentation,
    segmentationBusy,
    segmentationError,
    segmentationStatus,
    runSegmentationNow,
    clearSegmentation,
    classes,
    activeClassId,
    setActiveClassId,
    addClass,
    removeClass,
    renameClass,
    samples,
    addActiveClassSample,
    removeSample,
    clearSamples,
    sampleError,
    classifier,
    setClassifier,
    nEstimators,
    setNEstimators,
    nClusters,
    setNClusters,
    trainResult,
    trainBusy,
    trainError,
    trainStatus,
    runTrainingNow,
    clearTraining,
    classifyResult,
    classifyBusy,
    classifyError,
    classifyStatus,
    runClassificationNow,
    clearClassification,
    clusterAssignments,
    setAssignmentName,
    setAssignmentColor,
    assignBusy,
    assignError,
    applyClassAssignments,
    accMethod,
    setAccMethod,
    accCount,
    setAccCount,
    checkPointsBusy,
    checkPointsCount,
    generateCheckPointsNow,
    referenceCount: referencePoints.length,
    referenceName,
    loadReferenceFromFile,
    clearReference,
    accuracyReport,
    accuracyBusy,
    accuracyError,
    runAccuracyNow,
    clearAccuracy,
  }
}
