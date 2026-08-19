import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  detectFieldBoundaries,
  fetchFieldBoundaryHealth,
  fetchFowFieldBoundaries,
  FieldBoundaryServiceError,
  formatFieldBoundaryUserError,
  optimizeFieldBoundaryResult,
  type FieldBoundaryHealth,
  type FieldBoundaryResult,
  type FieldImagerySource,
} from '../../../lib/agriFieldBoundary/fieldBoundaryClient'
import type { FootprintRegularizeMethod } from '../../../lib/agriFieldBoundary/fieldFootprintRegularize'
import {
  DelineateAnythingServiceError,
  fetchDelineateAnythingConfig,
  predictDelineateAnything,
} from '../../../lib/trainingAi/delineateAnythingClient'
import {
  mergeFieldDetections,
  refineFieldPolygonsToAoi,
} from '../../../lib/agriFieldBoundary/fieldResultRefine'
import {
  finishMergeOptions,
  finishMinAreaM2,
  isCadastralFieldEngine,
  isFtwFieldEngine,
  mergeFieldFragments,
} from '../../../lib/agriFieldBoundary/fieldMerge'
import {
  defaultAttributeWindow,
  enrichFieldAttributesFromSentinel2,
  FIELD_ATTRIBUTE_LAYER_IDS,
  fieldAttributesNeedRefresh,
  hasFieldAttributes,
} from '../../../lib/agriFieldBoundary/fieldAttributeEnrichment'
import { FOW_COUNTRY_OPTIONS, isFowCatalogMissing } from '../../../lib/agriFieldBoundary/fowCountryOptions'
import { FIELD_BOUNDARY_STROKE_COLOR } from '../../../lib/agriFieldBoundary/fieldBoundaryStyle'
import {
  fetchFowValidationReference,
  shouldFetchFowValidationReference,
} from '../../../lib/agriFieldBoundary/fowValidationReference'
import {
  isBuiltinFieldEngine,
  isMapRgbOnlyProductionHost,
  PRODUCTION_MAP_RGB_MIN_AREA_M2,
  productionMapRgbNotice,
} from '../../../lib/agriFieldBoundary/fieldBoundaryProductionMode'
import { summarizeFieldGeometry } from '../../../lib/agriFieldBoundary/fieldValidationMetrics'
import {
  downloadFieldBoundaryGeoPackage,
  downloadFieldBoundaryShapefile,
} from '../../../lib/agriFieldBoundary/polygonShapefileExport'
import { createGeoTiffPngPreviewUrl } from '../../../lib/raster/siRasterMapLayer'
import { useSen2srControls } from './useSen2srControls'

export type FieldBoundaryPhase =
  | 'idle'
  | 'capturing'
  | 'detecting'
  | 'done'
  | 'empty'
  | 'error'

export type FieldCapturedView = {
  image: string
  bbox: [number, number, number, number]
}

export type FieldUploadedImage = {
  name: string
  dataUrl: string
  bbox?: [number, number, number, number]
}

/** Latest allowed Sentinel-2 / FTW acquisition date (today, UTC calendar day). */
function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function maxSceneYear(): number {
  return Math.max(2017, new Date().getFullYear())
}

function defaultSceneYear(): number {
  return Math.min(maxSceneYear(), Math.max(2017, new Date().getFullYear()))
}

function yearBounds(year: number): { from: string; to: string } {
  const y = Math.min(maxSceneYear(), Math.max(2017, Math.trunc(year)))
  const today = todayIsoDate()
  const from = `${y}-01-01`
  const toYearEnd = `${y}-12-31`
  return { from, to: toYearEnd > today ? today : toYearEnd }
}

/** Default FTW window = current calendar year (Jan 1 → today) for clear-scene selection. */
function defaultSceneRange(): { from: string; to: string } {
  return yearBounds(defaultSceneYear())
}

function clampSceneDate(iso: string | null | undefined): string {
  const raw = String(iso || '').trim().slice(0, 10)
  const today = todayIsoDate()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today
  const y = Number(raw.slice(0, 4))
  if (!Number.isFinite(y)) return today
  if (y < 2017) return '2017-01-01'
  if (raw > today) return today
  return raw
}

function yearFromSceneDate(iso: string): number {
  const y = Number(String(iso).slice(0, 4))
  if (!Number.isFinite(y)) return defaultSceneYear()
  return Math.min(maxSceneYear(), Math.max(2017, Math.trunc(y)))
}

/** Keep From ≤ To and within a single FTW crop year (API selects scenes by year). */
function normalizeSceneRange(fromIso: string, toIso: string): { from: string; to: string } {
  let from = clampSceneDate(fromIso)
  let to = clampSceneDate(toIso)
  const yFrom = yearFromSceneDate(from)
  const yTo = yearFromSceneDate(to)
  if (yFrom !== yTo) {
    // Prefer the From year; snap To to Dec 31 of that year.
    const b = yearBounds(yFrom)
    from = from < b.from ? b.from : from
    to = b.to
  }
  if (to < from) {
    const swap = from
    from = to
    to = swap
  }
  return { from, to }
}

export type UseAgriFieldBoundaryOptions = {
  captureView: (opts: {
    bbox: [number, number, number, number]
    aoi: GeoJSON.Geometry | GeoJSON.FeatureCollection
  }) => Promise<FieldCapturedView | null>
  resolveAoi: () => GeoJSON.Geometry | GeoJSON.FeatureCollection | null
}

/** Sources that require a local image upload via the browser file picker. */
export const FIELD_FILE_SOURCES: ReadonlySet<FieldImagerySource> = new Set([
  'drone',
  'geotiff',
  'png',
  'jpeg',
])

export function isFieldFileSource(source: FieldImagerySource): boolean {
  return FIELD_FILE_SOURCES.has(source)
}

export function acceptForFieldSource(source: FieldImagerySource): string {
  switch (source) {
    case 'geotiff':
      return '.tif,.tiff,image/tiff'
    case 'png':
      return '.png,image/png'
    case 'jpeg':
      return '.jpg,.jpeg,.jpe,image/jpeg'
    case 'drone':
    default:
      return '.tif,.tiff,.png,.jpg,.jpeg,.webp,image/tiff,image/png,image/jpeg,image/webp'
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to read image file.'))
    reader.readAsDataURL(file)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Failed to encode image.'))
    reader.readAsDataURL(blob)
  })
}

function isLikelyGeoTiff(file: File): boolean {
  const n = file.name.toLowerCase()
  return n.endsWith('.tif') || n.endsWith('.tiff') || file.type === 'image/tiff'
}

async function geotiffWgs84Bbox(file: File): Promise<[number, number, number, number] | undefined> {
  try {
    const { fromArrayBuffer } = await import('geotiff')
    const tiff = await fromArrayBuffer(await file.arrayBuffer())
    const image = await tiff.getImage()
    const bbox = image.getBoundingBox?.() as number[] | undefined
    if (!bbox || bbox.length < 4) return undefined
    const [minX, minY, maxX, maxY] = bbox.map(Number)
    // Only trust geographic lon/lat ranges (EPSG:4326-ish). Projected CRS → fall back to AOI.
    if (
      ![minX, minY, maxX, maxY].every(Number.isFinite) ||
      maxX <= minX ||
      maxY <= minY ||
      minX < -180 ||
      maxX > 180 ||
      minY < -90 ||
      maxY > 90
    ) {
      return undefined
    }
    return [minX, minY, maxX, maxY]
  } catch {
    return undefined
  }
}

async function loadFieldImageFile(file: File): Promise<FieldUploadedImage> {
  if (!file || file.size <= 0) throw new Error('Selected file is empty.')
  if (isLikelyGeoTiff(file)) {
    const preview = await createGeoTiffPngPreviewUrl(file, 2048)
    try {
      const blob = await fetch(preview.url).then(r => r.blob())
      const dataUrl = await blobToDataUrl(blob)
      const bbox = await geotiffWgs84Bbox(file)
      return { name: file.name, dataUrl, bbox }
    } finally {
      URL.revokeObjectURL(preview.url)
    }
  }
  const dataUrl = await fileToDataUrl(file)
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Unsupported image format. Use PNG, JPEG, or GeoTIFF.')
  }
  return { name: file.name, dataUrl }
}

function walkCoords(c: unknown, out: number[][]) {
  if (!c) return
  if (typeof (c as number[])[0] === 'number' && typeof (c as number[])[1] === 'number') {
    out.push(c as number[])
    return
  }
  if (Array.isArray(c)) c.forEach(x => walkCoords(x, out))
}

export function bboxOfGeometry(
  geom: GeoJSON.Geometry | GeoJSON.FeatureCollection,
): [number, number, number, number] | null {
  const coords: number[][] = []
  if (geom.type === 'FeatureCollection') {
    for (const f of geom.features) {
      if (f?.geometry) walkCoords((f.geometry as GeoJSON.Geometry).coordinates, coords)
    }
  } else {
    walkCoords(geom.coordinates, coords)
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

function padBbox(
  bbox: [number, number, number, number],
  padFrac = 0.03,
): [number, number, number, number] {
  const [w, s, e, n] = bbox
  const dx = Math.max(1e-6, e - w) * padFrac
  const dy = Math.max(1e-6, n - s) * padFrac
  return [w - dx, s - dy, e + dx, n + dy]
}

/** Re-probe agri-field-boundary /health while the UI is stuck offline. */
const OFFLINE_HEALTH_PROBE_MS = 3000
/** Background health poll so a brief Node/AFB restart never leaves a sticky banner. */
const HEALTH_POLL_MS = 12000
const OFFLINE_ERROR_SHORT = 'Loading field model… Detect Fields is available on the AgroCloud API.'

function isOfflineFieldBoundaryError(message: string | null | undefined): boolean {
  if (!message) return false
  return (
    message === OFFLINE_ERROR_SHORT ||
    /backend_unavailable|backend is not available/i.test(message) ||
    /Service offline/i.test(message) ||
    /start agri-field-boundary|uvicorn app:app --port 8092/i.test(message)
  )
}

export type FieldModelId =
  | 'delineate-fbis'
  | 'ftw-live'
  | 'ftw-infer'
  | 'fow'
  | 'map-rgb'

export type FieldCaptureImageryId = Exclude<
  FieldImagerySource,
  'delineate-fbis' | 'ftw-live' | 'ftw-infer' | 'fow'
>

const FIELD_MODELS: Array<{ id: FieldModelId; label: string }> = [
  { id: 'ftw-live', label: 'FTW (live Sentinel-2 — cadastral grid)' },
  { id: 'ftw-infer', label: 'FTW Inference (S2 model)' },
  { id: 'fow', label: 'Fields of the World (reference parcels)' },
  { id: 'delineate-fbis', label: 'Delineate Anything (v2)' },
  { id: 'map-rgb', label: 'Map RGB detect (instance)' },
]

const FIELD_IMAGERY: Array<{ id: FieldCaptureImageryId; label: string }> = [
  { id: 'basemap', label: 'Basemap (Esri / Google map RGB)' },
  { id: 'sentinel2', label: 'Sentinel-2 (current map RGB)' },
  { id: 'landsat', label: 'Landsat (current map RGB)' },
  { id: 'planet', label: 'Planet (current map RGB)' },
  { id: 'airbus', label: 'Airbus (current map RGB)' },
  { id: 'drone', label: 'Drone' },
  { id: 'geotiff', label: 'GeoTIFF' },
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
]

function deriveFieldSource(model: FieldModelId, imagery: FieldCaptureImageryId): FieldImagerySource {
  if (model === 'map-rgb') return imagery
  return model
}

function splitFieldSource(source: FieldImagerySource): {
  model: FieldModelId
  imagery: FieldCaptureImageryId
} {
  if (source === 'delineate-fbis' || source === 'ftw-live' || source === 'ftw-infer' || source === 'fow') {
    return { model: source, imagery: 'basemap' }
  }
  return { model: 'map-rgb', imagery: source }
}

/** Map RGB sources: capture live canvas (like a drone photo) then run instance detect. */
function isMapRgbImagerySource(source: FieldImagerySource): boolean {
  return (
    source === 'basemap' ||
    source === 'sentinel2' ||
    source === 'landsat' ||
    source === 'planet' ||
    source === 'airbus'
  )
}

function modelUsesCaptureImagery(model: FieldModelId): boolean {
  return model === 'delineate-fbis' || model === 'map-rgb'
}

/** Default field outline — cyan hollow (matches SI gallery Cyan Outline). */
const FIELD_BOUNDARY_STROKE = FIELD_BOUNDARY_STROKE_COLOR

/** Distinct instance fills + a single red field border. */
const DA_FILL_PALETTE = [
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#ef4444',
  '#eab308',
  '#14b8a6',
  '#f97316',
  '#ec4899',
  '#84cc16',
  '#06b6d4',
]

function styleDelineateFbisGeojson(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (fc.features || []).map((f, i) => {
      const props = (f.properties && typeof f.properties === 'object' ? f.properties : {}) as Record<
        string,
        unknown
      >
      const fill = DA_FILL_PALETTE[i % DA_FILL_PALETTE.length]!
      return {
        ...f,
        properties: {
          ...props,
          class_name: props.class_name || 'Field',
          fill_color: fill,
          color: fill,
          stroke_color: FIELD_BOUNDARY_STROKE,
          stroke: FIELD_BOUNDARY_STROKE,
          source: 'delineate-anything',
          output_type: 'fields_fbis',
          engine: 'delineate-anything',
        },
      }
    }),
  }
}

/**
 * Mask R-CNN / instance-segmentation field boundary workflow:
 * AOI → high-res capture → detect → colorful GeoJSON fields.
 */
export function useAgriFieldBoundary({ captureView, resolveAoi }: UseAgriFieldBoundaryOptions) {
  // FTW live on Sentinel-2 gives cadastral grid polygons (FoW/FTW reference quality).
  const [model, setModelState] = useState<FieldModelId>('ftw-live')
  const [imagery, setImageryState] = useState<FieldCaptureImageryId>('basemap')
  const source = deriveFieldSource(model, imagery)
  const imageryRef = useRef(imagery)
  imageryRef.current = imagery
  const [uploadedImage, setUploadedImage] = useState<FieldUploadedImage | null>(null)
  const sen2sr = useSen2srControls({ resolveAoi })
  const resetSen2sr = sen2sr.reset
  // FTW crop-calendar rejects harvest dates in the future — never default past last completed year.
  const [sceneDateFrom, setSceneDateFromState] = useState(() => defaultSceneRange().from)
  const [sceneDateTo, setSceneDateToState] = useState(() => defaultSceneRange().to)
  // Prefer a date inside the active range (June 15 when range covers it) for API scene_date.
  const sceneDate = (() => {
    const y = yearFromSceneDate(sceneDateFrom)
    const mid = `${y}-06-15`
    if (sceneDateFrom <= mid && mid <= sceneDateTo) return mid
    return sceneDateTo
  })()
  const sceneDateFromRef = useRef(sceneDateFrom)
  const sceneDateToRef = useRef(sceneDateTo)
  sceneDateFromRef.current = sceneDateFrom
  sceneDateToRef.current = sceneDateTo
  const [adminIso, setAdminIso] = useState('AE')
  const sourceChosenRef = useRef(false)
  const [minConfidence, setMinConfidence] = useState(0.18)
  const [minAreaM2, setMinAreaM2] = useState(1)
  /** Outlines only by default — interior fills hide the crop under the field. */
  const [fillOpacity, setFillOpacity] = useState(0)
  /** Regularize drawn AOI + field footprints into oriented rectangles. */
  const [regularizeFootprints, setRegularizeFootprints] = useState(true)
  /** ArcGIS Regularize Building Footprint method. */
  const [regularizeMethod, setRegularizeMethod] =
    useState<FootprintRegularizeMethod>('right-angles')
  /** Merge over-segmented fragments that share a long border (before Regularize). */
  const [mergeFragments, setMergeFragments] = useState(true)
  const [phase, setPhase] = useState<FieldBoundaryPhase>('idle')
  const [progress, setProgress] = useState(0)
  /** Backend job stage (scene_selection / download / run / polygonize …). */
  const [stage, setStage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [result, setResult] = useState<FieldBoundaryResult | null>(null)
  /** Pre-regularize detect output — re-apply method without re-running the model. */
  const rawResultRef = useRef<FieldBoundaryResult | null>(null)
  /** FoW / FTW dataset polygons used as Validation Detection reference. */
  const [validationReference, setValidationReference] = useState<GeoJSON.FeatureCollection | null>(
    null,
  )
  const [validationReferenceLabel, setValidationReferenceLabel] = useState<string | null>(null)
  const [validationReferenceNotice, setValidationReferenceNotice] = useState<string | null>(null)
  const [validationReferenceBusy, setValidationReferenceBusy] = useState(false)
  const lastDetectContextRef = useRef<{
    bbox: [number, number, number, number]
    aoi: GeoJSON.FeatureCollection
    minAreaM2: number
    adminIso?: string
    source: string
  } | null>(null)
  const validationAbortRef = useRef<AbortController | null>(null)
  /** Sentinel-2 attribute table fill (runs after Detect, export, add layer). */
  const [attributesBusy, setAttributesBusy] = useState(false)
  const [attributesProgress, setAttributesProgress] = useState<string | null>(null)
  /** Avoid re-queueing the same Detect result for Layer-index enrichment. */
  const autoAttributesKeyRef = useRef<string | null>(null)
  const [health, setHealth] = useState<FieldBoundaryHealth | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const resolveAoiRef = useRef(resolveAoi)
  resolveAoiRef.current = resolveAoi
  const errorRef = useRef(error)
  const errorDetailRef = useRef(errorDetail)
  const phaseRef = useRef(phase)
  const resultRef = useRef(result)
  errorRef.current = error
  errorDetailRef.current = errorDetail
  phaseRef.current = phase
  resultRef.current = result

  const trackJob = useCallback(
    (floor = 0) =>
      (pct: number, jobStage: string) => {
        setProgress(Math.max(floor, Math.min(100, Math.round(pct))))
        setStage(jobStage || null)
      },
    [],
  )

  const applyHealthResult = useCallback((h: FieldBoundaryHealth) => {
    setHealth(h)
    setOffline(false)
    if (h.ftw_live === true && !sourceChosenRef.current) {
      setModelState(prev => (prev === 'delineate-fbis' || prev === 'map-rgb' ? 'ftw-live' : prev))
    }
    // Demote FTW → FoW when FTW is unavailable.
    if (h.ftw_live === false) {
      setModelState(prev => (prev === 'ftw-live' ? 'fow' : prev))
    }
    if (isMapRgbOnlyProductionHost(h) && !sourceChosenRef.current) {
      setModelState(prev =>
        prev === 'ftw-live' || prev === 'delineate-fbis' || prev === 'fow' ? 'map-rgb' : prev,
      )
      setImageryState('basemap')
      setMinAreaM2(prev => (prev <= 1 ? PRODUCTION_MAP_RGB_MIN_AREA_M2 : prev))
      setMinConfidence(prev => (prev > 0.25 ? 0.18 : prev))
      setNotice(prev => prev || productionMapRgbNotice())
    }
    if (isOfflineFieldBoundaryError(errorRef.current) || isOfflineFieldBoundaryError(errorDetailRef.current)) {
      setError(null)
      setErrorDetail(null)
      if (phaseRef.current === 'error') setPhase('idle')
    }
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    const probe = () => {
      void fetchFieldBoundaryHealth(ac.signal)
        .then(h => {
          if (ac.signal.aborted) return
          applyHealthResult(h)
        })
        .catch(err => {
          if ((err as Error)?.name === 'AbortError' || ac.signal.aborted) return
          applyHealthResult({ offline: false, status: 'ok', builtin_fallback: true, ready: true })
        })
    }
    probe()
    // Keep probing while the tool is mounted so a brief restart never leaves a sticky banner.
    const id = window.setInterval(probe, HEALTH_POLL_MS)
    return () => {
      ac.abort()
      window.clearInterval(id)
    }
  }, [applyHealthResult])

  // Sticky "Service offline" can remain after Detect even when `offline` was never set
  // (proxy 500 with ECONNREFUSED). Re-probe while either flag or message says offline.
  const needsOfflineRecovery = offline || (phase === 'error' && isOfflineFieldBoundaryError(error))

  useEffect(() => {
    if (!needsOfflineRecovery) return
    const ac = new AbortController()
    const probe = () => {
      void fetchFieldBoundaryHealth(ac.signal)
        .then(h => {
          if (ac.signal.aborted) return
          applyHealthResult(h)
        })
        .catch(err => {
          if ((err as Error)?.name === 'AbortError' || ac.signal.aborted) return
          applyHealthResult({ offline: false, status: 'ok', builtin_fallback: true, ready: true })
        })
    }
    probe()
    const id = window.setInterval(probe, OFFLINE_HEALTH_PROBE_MS)
    return () => {
      ac.abort()
      window.clearInterval(id)
    }
  }, [needsOfflineRecovery, applyHealthResult])

  const modelOptions = useMemo(() => {
    return FIELD_MODELS.map(o => {
      if (o.id === 'delineate-fbis' && health && isMapRgbOnlyProductionHost(health)) {
        return { ...o, label: `${o.label} (Map RGB fallback on this host)` }
      }
      if (o.id === 'ftw-live' && health && health.ftw_live === false) {
        return { ...o, label: `${o.label} (unavailable — using FoW)` }
      }
      if (o.id === 'ftw-infer' && health && health.ftw_infer === false) {
        return { ...o, label: `${o.label} (unavailable)` }
      }
      return o
    })
  }, [health])

  const imageryOptions = useMemo(() => FIELD_IMAGERY.slice(), [])

  /** @deprecated Prefer setModel / setImagery — kept for callers that still set a combined source. */
  const setSource = useCallback((next: FieldImagerySource) => {
    sourceChosenRef.current = true
    const parts = splitFieldSource(next)
    setModelState(prev => {
      if (prev !== parts.model && !isFieldFileSource(parts.imagery)) {
        setUploadedImage(null)
      }
      return parts.model
    })
    setImageryState(prev => {
      if (prev !== parts.imagery && !isFieldFileSource(parts.imagery)) {
        setUploadedImage(null)
      }
      return parts.imagery
    })
    setError(null)
    setErrorDetail(null)
    if (phase === 'error' || phase === 'empty') setPhase('idle')
  }, [phase])

  const setModel = useCallback((next: FieldModelId) => {
    sourceChosenRef.current = true
    setModelState(next)
    setError(null)
    setErrorDetail(null)
    if (phase === 'error' || phase === 'empty') setPhase('idle')
  }, [phase])

  const setImagery = useCallback((next: FieldCaptureImageryId) => {
    sourceChosenRef.current = true
    setImageryState(prev => {
      if (prev !== next && !isFieldFileSource(next)) {
        setUploadedImage(null)
      }
      return next
    })
    setModelState(prev => {
      if (prev === 'delineate-fbis' || prev === 'map-rgb') return prev
      // FTW/FoW don't use capture imagery — switching imagery implies map-RGB detect.
      return 'map-rgb'
    })
    setError(null)
    setErrorDetail(null)
    if (phase === 'error' || phase === 'empty') setPhase('idle')
  }, [phase])

  const applySceneRange = useCallback((fromIso: string, toIso: string) => {
    const next = normalizeSceneRange(fromIso, toIso)
    setSceneDateFromState(next.from)
    setSceneDateToState(next.to)
  }, [])

  /** Single acquisition date — From and To collapse to the same latest day. */
  const setSceneDate = useCallback(
    (iso: string) => {
      const d = clampSceneDate(iso)
      applySceneRange(d, d)
    },
    [applySceneRange],
  )

  const setSceneDateFrom = useCallback(
    (iso: string) => {
      const d = clampSceneDate(iso)
      applySceneRange(d, d)
    },
    [applySceneRange],
  )

  const setSceneDateTo = useCallback(
    (iso: string) => {
      const d = clampSceneDate(iso)
      applySceneRange(d, d)
    },
    [applySceneRange],
  )

  /** Kept for API compat — also pins to the latest single day (today). */
  const setSceneDateAllYear = useCallback(() => {
    const t = todayIsoDate()
    applySceneRange(t, t)
  }, [applySceneRange])

  /** Legacy year setter — full calendar year window. */
  const setYear = useCallback(
    (y: number) => {
      const b = yearBounds(y)
      applySceneRange(b.from, b.to)
    },
    [applySceneRange],
  )

  const year = yearFromSceneDate(sceneDateFrom)

  const setAdminIsoSafe = useCallback((iso: string) => {
    const next = String(iso || '').trim().toUpperCase()
    // Empty = All countries (FoW worldwide glob).
    if (!next) {
      setAdminIso('')
      return
    }
    setAdminIso(next.slice(0, 2))
  }, [])

  const uploadImageFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    try {
      const loaded = await loadFieldImageFile(file)
      setUploadedImage(loaded)
      setError(null)
      setErrorDetail(null)
      if (phase === 'error' || phase === 'empty' || phase === 'done') setPhase('idle')
    } catch (err) {
      setUploadedImage(null)
      setError((err as Error)?.message || 'Could not load image file.')
      setPhase('error')
    }
  }, [phase])

  const clearUploadedImage = useCallback(() => {
    setUploadedImage(null)
  }, [])

  const run = useCallback(async (opts?: { source?: FieldImagerySource; year?: number; sceneDate?: string }) => {
    const activeSource = opts?.source ?? source
    let activeFrom = sceneDateFrom
    let activeTo = sceneDateTo
    if (opts?.sceneDate || opts?.year != null) {
      // Prefer an explicit scene day; year-only callers still pin to that year's latest day.
      const anchor = clampSceneDate(
        opts?.sceneDate ??
          (opts?.year != null && Number.isFinite(opts.year)
            ? yearBounds(Math.round(opts.year)).to
            : sceneDate),
      )
      activeFrom = anchor
      activeTo = anchor
      applySceneRange(activeFrom, activeTo)
    }
    const activeSceneDate = (() => {
      const y = yearFromSceneDate(activeFrom)
      const mid = `${y}-06-15`
      if (activeFrom <= mid && mid <= activeTo) return mid
      return activeTo
    })()
    const activeYear = yearFromSceneDate(activeFrom)
    const aoi = resolveAoiRef.current()
    if (!aoi) {
      setError('Draw or select an AOI before detecting field boundaries.')
      setPhase('error')
      return
    }
    if (opts?.source) setSource(opts.source)

    // Keep the drawn AOI exact for clipping — do not OBB-regularize AOI (that misses fields).
    const aoiFc: GeoJSON.FeatureCollection =
      aoi.type === 'FeatureCollection'
        ? aoi
        : {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: aoi }],
          }
    const rawBbox = bboxOfGeometry(aoiFc)
    if (!rawBbox) {
      setError('AOI has no valid bounds.')
      setPhase('error')
      return
    }
    // Slight pad so edge parcels near the AOI ring are still captured in the image.
    const bbox = padBbox(rawBbox, 0.06)
    lastDetectContextRef.current = {
      bbox,
      aoi: aoiFc,
      minAreaM2,
      adminIso: String(adminIso || '')
        .trim()
        .toUpperCase()
        .length === 2
        ? String(adminIso).trim().toUpperCase()
        : undefined,
      source: activeSource,
    }
    setValidationReference(null)
    setValidationReferenceLabel(null)
    setValidationReferenceNotice(null)
    const finishResult = (out: FieldBoundaryResult): FieldBoundaryResult => {
      rawResultRef.current = out
      const engineKey = String(out.engine || activeSource || '')
      const ftw = isFtwFieldEngine(activeSource) || isFtwFieldEngine(out.engine)
      const cadastral =
        ftw ||
        isCadastralFieldEngine(engineKey) ||
        engineKey.includes('delineate') ||
        engineKey.includes('fow')
      const effMinArea = finishMinAreaM2(minAreaM2, ftw || cadastral)
      const mergedGeo = mergeFieldFragments(
        out.geojson,
        finishMergeOptions(minAreaM2, { ftw: ftw || cadastral, enabled: mergeFragments }),
      )
      const preRegularize: FieldBoundaryResult = {
        ...out,
        geojson: mergedGeo,
        count: mergedGeo.features.length,
      }
      const softenMeters = regularizeMethod === 'right-angles' ? 3.2 : 5.2
      const builtin = isBuiltinFieldEngine(out.engine)
      const optimized = optimizeFieldBoundaryResult(preRegularize, {
        regularizeFootprints: regularizeFootprints,
        regularizeMethod,
        softenKept: true,
        softenMeters,
        minFillRatio: builtin ? 0.38 : cadastral ? 0.48 : 0.55,
        maxAreaInflation: builtin ? 1.9 : cadastral ? 1.52 : 1.45,
      })
      // Regularize can inflate footprints — re-clip to AOI and unstack overlays.
      let geojson = refineFieldPolygonsToAoi(optimized.geojson, aoiFc, {
        minAreaM2: effMinArea,
        dropIou: 0.15,
      })
      if (
        activeSource === 'delineate-fbis' ||
        String(optimized.engine || '').includes('delineate')
      ) {
        geojson = styleDelineateFbisGeojson(geojson)
      }
      const validFeatures = geojson.features.filter(f => {
        const g = f?.geometry
        if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return false
        return (
          summarizeFieldGeometry({ type: 'FeatureCollection', features: [f] }).totalAreaHa > 0
        )
      })
      geojson = { type: 'FeatureCollection', features: validFeatures }
      return {
        ...optimized,
        geojson,
        count: geojson.features.length,
        aoiApplied: true,
        stats: {
          ...(optimized.stats || { field: 0 }),
          field: geojson.features.length,
        },
      }
    }

    if (isFieldFileSource(activeSource) && !uploadedImage) {
      setError('Choose an image file (Drone / GeoTIFF / PNG / JPEG) before detecting.')
      setPhase('error')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    setErrorDetail(null)
    setNotice(null)
    setOffline(false)
    setProgress(0)
    setStage(null)
    setPhase('capturing')
    try {
      const iso = String(adminIso || '')
        .trim()
        .toUpperCase()
      const fowAdminIso = iso.length === 2 ? iso : undefined

      // —— Delineate Anything (v2 + fallbacks): map capture → instance masks → black edges ——
      if (activeSource === 'delineate-fbis') {
        setNotice('Delineate Anything — capturing map RGB…')
        setProgress(5)
        let viewDa: FieldCapturedView | null = null
        if (isFieldFileSource(imagery) && uploadedImage) {
          viewDa = { image: uploadedImage.dataUrl, bbox: uploadedImage.bbox ?? bbox }
        } else {
          viewDa = await captureView({ bbox, aoi: aoiFc })
        }
        if (!viewDa?.image) {
          throw new FieldBoundaryServiceError(
            'Could not capture AOI imagery for Delineate Anything. Wait for Esri / Google / Sentinel tiles, then retry.',
          )
        }
        setPhase('detecting')
        setProgress(15)
        setNotice('Delineate Anything (v2) — instance segmentation…')
        const cfg = await fetchDelineateAnythingConfig(controller.signal)
        if (!cfg.configured) {
          setNotice('Delineate Anything unavailable — detecting fields on map RGB…')
          setProgress(40)
          const fallback = await detectFieldBoundaries(
            {
              image: viewDa.image,
              bbox: viewDa.bbox,
              aoi: aoiFc,
              minConfidence: Math.min(minConfidence, 0.2),
              minAreaM2: Math.max(0.05, minAreaM2),
              source: 'basemap',
              highRes: true,
              signal: controller.signal,
            },
            trackJob(40),
          )
          if (fallback.geojson.features.length) {
            setResult(finishResult(fallback))
            setNotice(null)
            setProgress(100)
            setPhase('done')
            return
          }
          const { short, detail } = formatFieldBoundaryUserError(null, {
            source: 'delineate-fbis',
            empty: true,
          })
          setError(short)
          setErrorDetail(detail || undefined)
          setResult(null)
          setPhase('empty')
          return
        }

        const runDa = async (confidence: number, model: string, minArea: number) => {
          const da = await predictDelineateAnything({
            imageDataUrl: viewDa!.image,
            bbox: viewDa!.bbox,
            confidence,
            model,
            minAreaM2: minArea,
            signal: controller.signal,
          })
          return da.geojson
        }

        try {
          // Primary pass — user confidence (capped so we do not miss faint parcels).
          setNotice('Delineate Anything (v2) — detecting fields…')
          let merged = await runDa(Math.min(minConfidence, 0.22), 'v2', Math.max(0.05, Math.min(minAreaM2, 80)))
          setProgress(40)
          // Soft recall pass — pick up missed orchards / low-contrast parcels, then merge.
          setNotice('Delineate Anything — recall pass (fill gaps)…')
          const soft = await runDa(0.1, 'v2', 1)
          merged = mergeFieldDetections(merged, soft, {
            minAreaM2: Math.max(0.05, Math.min(minAreaM2, 25)),
            dropIou: 0.18,
          })
          setProgress(55)
          if (merged.features.length < 3) {
            setNotice('Delineate Anything — small-model gap fill…')
            const small = await runDa(0.08, 'small', 1)
            merged = mergeFieldDetections(merged, small, {
              minAreaM2: Math.max(0.05, Math.min(minAreaM2, 25)),
              dropIou: 0.18,
            })
          }

          if (merged.features.length) {
            const styled = styleDelineateFbisGeojson(merged)
            const out: FieldBoundaryResult = {
              geojson: styled,
              count: styled.features.length,
              score: Number(minConfidence),
              engine: 'delineate-anything',
              device: 'cpu',
              stats: { field: styled.features.length },
              aoiApplied: true,
            }
            const finished = finishResult(out)
            setResult(finished)
            setNotice(null)
            setProgress(100)
            setPhase(finished.geojson.features.length ? 'done' : 'empty')
            if (!finished.geojson.features.length) {
              setError('No fields remain inside the AOI after clip — enlarge AOI or lower Min area.')
            }
            return
          }

          // Same capture → agri Mask R-CNN / local DA / SAM (do not dead-end on empty YOLO).
          setNotice('Delineate Anything empty — detecting fields on the same map RGB…')
          setProgress(60)
          const fallback = await detectFieldBoundaries(
            {
              image: viewDa.image,
              bbox: viewDa.bbox,
              aoi: aoiFc,
              minConfidence: Math.min(minConfidence, 0.2),
              minAreaM2: Math.max(0.05, minAreaM2),
              source: 'basemap',
              highRes: true,
              signal: controller.signal,
            },
            trackJob(60),
          )
          if (fallback.geojson.features.length) {
            setResult(finishResult(fallback))
            setNotice(null)
            setProgress(100)
            setPhase('done')
            return
          }

          const { short, detail } = formatFieldBoundaryUserError(null, {
            source: 'delineate-fbis',
            empty: true,
          })
          setError(short)
          setErrorDetail(
            `${detail || ''} Capture may lack field contrast — switch Basemap to Esri/Google, zoom into cropland, lower confidence to ~0.15, ensure :8096, then retry.`,
          )
          setResult(null)
          setPhase('empty')
          return
        } catch (daErr) {
          if ((daErr as Error)?.name === 'AbortError') throw daErr
          if (daErr instanceof DelineateAnythingServiceError) {
            throw new FieldBoundaryServiceError(daErr.message, daErr.offline)
          }
          throw daErr
        }
      }

      // —— Map RGB (Basemap Esri/Google, Sentinel-2, …): live canvas → detect like Drone ——
      if (isMapRgbImagerySource(activeSource)) {
        setNotice(
          `Capturing ${activeSource === 'basemap' ? 'Esri / Google basemap' : activeSource} RGB (drone-style)…`,
        )
        setProgress(5)
        setPhase('capturing')
        const mapView = await captureView({ bbox, aoi: aoiFc })
        if (!mapView?.image) {
          throw new FieldBoundaryServiceError(
            'Could not capture map RGB. Wait for Esri / Google / Sentinel tiles to load, then retry.',
          )
        }
        setPhase('detecting')
        setProgress(15)

        // Prefer Delineate Anything on the photo when :8096 is up (better on Esri/Google).
        try {
          const daCfg = await fetchDelineateAnythingConfig(controller.signal)
          if (daCfg.configured) {
            setNotice('Delineate Anything on map RGB…')
            const da = await predictDelineateAnything({
              imageDataUrl: mapView.image,
              bbox: mapView.bbox,
              confidence: Math.min(minConfidence, 0.3),
              model: 'v2',
              minAreaM2: Math.max(0.05, minAreaM2),
              signal: controller.signal,
            })
            const styled = styleDelineateFbisGeojson(da.geojson)
            if (styled.features.length) {
              const out: FieldBoundaryResult = {
                geojson: styled,
                count: styled.features.length,
                score: Number(da.score ?? minConfidence),
                engine: da.engine || 'delineate-anything',
                device: da.device || 'cpu',
                stats: { field: styled.features.length },
                aoiApplied: true,
              }
              setResult(finishResult(out))
              setNotice(
                `Map RGB · ${styled.features.length} fields (Delineate Anything on ${activeSource})`,
              )
              setProgress(100)
              setPhase('done')
              return
            }
          }
        } catch (daMapErr) {
          if ((daMapErr as Error)?.name === 'AbortError') throw daMapErr
          // Fall through to agri-field-boundary Mask R-CNN / DA bundle.
        }

        setNotice('Detecting fields on map RGB…')
        setProgress(25)
        const detectMap = async (confidence: number) =>
          detectFieldBoundaries(
            {
              image: mapView.image,
              bbox: mapView.bbox,
              aoi: aoiFc,
              minConfidence: confidence,
              minAreaM2,
              source: activeSource,
              highRes: true,
              signal: controller.signal,
            },
            trackJob(25),
          )

        let mapOut = await detectMap(Math.min(minConfidence, 0.35))
        if (!mapOut.geojson.features.length && minConfidence > 0.12) {
          setNotice('Retrying map RGB at lower confidence…')
          mapOut = await detectMap(0.12)
          if (mapOut.geojson.features.length) setMinConfidence(0.12)
        }
        if (!mapOut.geojson.features.length) {
          const { short, detail } = formatFieldBoundaryUserError(null, {
            source: activeSource,
            empty: true,
          })
          setError(short)
          setErrorDetail(detail)
          setResult(null)
          setPhase('empty')
          return
        }
        setResult(finishResult(mapOut))
        setNotice(`Map RGB · ${mapOut.geojson.features.length} fields (${mapOut.engine || activeSource})`)
        setProgress(100)
        setPhase('done')
        return
      }

      const tryFtwLive = async (noticeMsg: string): Promise<boolean> => {
        if (health?.ftw_live !== true) return false
        try {
          setNotice(noticeMsg)
          setProgress(2)
          const liveOut = await detectFieldBoundaries(
            {
              bbox,
              aoi: aoiFc,
              minAreaM2,
              source: 'ftw-live',
              year: activeYear,
              sceneDate: activeSceneDate,
              sceneDateFrom: activeFrom,
              sceneDateTo: activeTo,
              adminIso: fowAdminIso,
              signal: controller.signal,
            },
            trackJob(0),
          )
          if (liveOut.geojson.features.length) {
            setSource('ftw-live')
            setResult(finishResult(liveOut))
            setProgress(100)
            setPhase('done')
            return true
          }
        } catch (liveErr) {
          if ((liveErr as Error)?.name === 'AbortError') throw liveErr
        }
        setNotice(null)
        return false
      }

      const tryFowCatalog = async (opts: {
        noticeOnFowHit?: string
        /** When FoW country parquet is missing, skip doomed admin_iso probe. */
        skipMissingCountry?: boolean
      }): Promise<boolean> => {
        if (opts.skipMissingCountry && isFowCatalogMissing(fowAdminIso)) {
          return false
        }
        try {
          setPhase('detecting')
          setProgress(5)
          const out = await fetchFowFieldBoundaries({
            bbox,
            aoi: aoiFc,
            minAreaM2,
            adminIso: fowAdminIso,
            signal: controller.signal,
          })
          if (out.geojson.features.length) {
            if (opts.noticeOnFowHit) setNotice(opts.noticeOnFowHit)
            setSource('fow')
            setResult(finishResult(out))
            setProgress(100)
            setPhase('done')
            return true
          }
        } catch (fowErr) {
          if ((fowErr as Error)?.name === 'AbortError') throw fowErr
        }
        return false
      }

      /**
       * Engine order:
       * - FoW-missing countries (e.g. AE): FTW live → FoW skip → map detect
       * - otherwise: FoW → FTW live → map detect
       */
      const tryCatalogEngines = async (opts: {
        noticeOnFowHit?: string
        noticeOnFtw: string
        noticeOnFowError: string
        skipFtwLive?: boolean
        ftwFirst?: boolean
      }): Promise<boolean> => {
        const preferFtw =
          opts.ftwFirst === true || isFowCatalogMissing(fowAdminIso)
        if (preferFtw) {
          if (!opts.skipFtwLive) {
            if (
              await tryFtwLive(
                isFowCatalogMissing(fowAdminIso)
                  ? `FoW has no catalog for ${fowAdminIso} — running FTW live Sentinel-2…`
                  : opts.noticeOnFtw,
              )
            ) {
              return true
            }
          }
          return await tryFowCatalog({
            noticeOnFowHit: opts.noticeOnFowHit,
            skipMissingCountry: true,
          })
        }
        if (await tryFowCatalog({ noticeOnFowHit: opts.noticeOnFowHit })) {
          return true
        }
        if (opts.skipFtwLive) return false
        return await tryFtwLive(opts.noticeOnFtw)
      }

      // Live path needs Python 3.12+/ftw-tools — fall back to FoW so map gets polygons.
      let effectiveSource = activeSource
      if (
        (activeSource === 'ftw-live' || activeSource === 'ftw-infer') &&
        health &&
        ((activeSource === 'ftw-live' && health.ftw_live === false) ||
          (activeSource === 'ftw-infer' && health.ftw_infer === false))
      ) {
        // Prefer map/basemap path for countries without FoW rather than empty FoW.
        if (isFowCatalogMissing(adminIso) && health.ftw_live !== true) {
          effectiveSource = 'basemap'
          setNotice(
            `FTW unavailable and FoW has no ${String(adminIso).toUpperCase()} catalog — detecting from map imagery…`,
          )
        } else {
          effectiveSource = 'fow'
          setSource('fow')
          setNotice(
            activeSource === 'ftw-live'
              ? 'FTW live unavailable on this server — ran Fields of the World instead.'
              : 'FTW inference unavailable — ran Fields of the World instead.',
          )
        }
      }

      let view: FieldCapturedView | null = null
      if (effectiveSource === 'fow') {
        if (
          await tryCatalogEngines({
            noticeOnFtw: 'No FoW parcels in AOI — ran FTW live Sentinel-2 instead.',
            noticeOnFowError: 'FoW catalog unavailable — ran FTW live Sentinel-2 instead.',
            ftwFirst: isFowCatalogMissing(fowAdminIso),
          })
        ) {
          return
        }
        // Fall through to map imagery detect instead of sticky empty FoW banner.
        setNotice(
          isFowCatalogMissing(fowAdminIso)
            ? `FoW has no ${fowAdminIso} catalog and FTW found no fields — detecting from map imagery…`
            : 'No FoW/FTW parcels — detecting from map imagery…',
        )
        effectiveSource = 'basemap'
      }

      // On-demand FTW baseline (S2) — no map capture; async detect-job + poll.
      if (effectiveSource === 'ftw-infer') {
        setPhase('detecting')
        setProgress(2)
        const out = await detectFieldBoundaries(
          {
            bbox,
            aoi: aoiFc,
            minAreaM2,
            source: 'ftw-infer',
            year: activeYear,
            sceneDate: activeSceneDate,
            sceneDateFrom: activeFrom,
            sceneDateTo: activeTo,
            adminIso: fowAdminIso,
            signal: controller.signal,
          },
          trackJob(0),
        )
        if (!out.geojson.features.length) {
          if (
            await tryCatalogEngines({
              noticeOnFowHit: 'No FTW fields — showing Fields of the World parcels.',
              noticeOnFtw: 'No FTW fields — ran FTW live Sentinel-2 instead.',
              noticeOnFowError: 'No FTW fields — FoW unavailable, tried FTW live.',
            })
          ) {
            return
          }
          setNotice('No FTW/FoW parcels — detecting from map imagery…')
          effectiveSource = 'basemap'
        } else {
          setResult(finishResult(out))
          setProgress(100)
          setPhase('done')
          return
        }
      }

      // Live Sentinel-2 stack + FTW model — no map capture; async detect-job + poll.
      if (effectiveSource === 'ftw-live') {
        // Countries without FoW still use FTW first; FoW skip if partition missing.
        if (isFowCatalogMissing(fowAdminIso)) {
          setNotice(`FoW has no catalog for ${fowAdminIso} — running FTW live Sentinel-2…`)
        }
        setPhase('detecting')
        setProgress(2)
        const out = await detectFieldBoundaries(
          {
            bbox,
            aoi: aoiFc,
            minAreaM2,
            source: 'ftw-live',
            year: activeYear,
            sceneDate: activeSceneDate,
            sceneDateFrom: activeFrom,
            sceneDateTo: activeTo,
            adminIso: fowAdminIso,
            signal: controller.signal,
          },
          trackJob(0),
        )
        if (out.stats?.fallback_from === 'ftw-live') {
          setNotice('FTW live deps missing — showing Fields of the World parcels.')
        }
        if (!out.geojson.features.length) {
          if (
            await tryCatalogEngines({
              noticeOnFowHit: 'No FTW live fields — showing Fields of the World parcels.',
              noticeOnFtw: 'No FTW live fields and no FoW parcels in this AOI.',
              noticeOnFowError: 'No FTW live fields — FoW catalog unavailable.',
              skipFtwLive: true,
            })
          ) {
            return
          }
          setNotice('No FTW/FoW parcels — detecting from map imagery…')
          effectiveSource = 'basemap'
        } else {
          setResult(finishResult(out))
          setProgress(100)
          setPhase('done')
          return
        }
      }

      // Capture map imagery + Delineate-Anything / Mask R-CNN (also final fallback).
      const captureSource: FieldImagerySource =
        effectiveSource === 'basemap' ||
        effectiveSource === 'ftw-live' ||
        effectiveSource === 'ftw-infer' ||
        effectiveSource === 'fow'
          ? 'basemap'
          : activeSource

      if (isFieldFileSource(activeSource) && uploadedImage) {
        view = {
          image: uploadedImage.dataUrl,
          bbox: uploadedImage.bbox ?? bbox,
        }
      } else {
        view = await captureView({ bbox, aoi: aoiFc })
      }
      if (!view) throw new Error('Could not capture AOI imagery.')
      setPhase('detecting')
      setProgress(2)
      const detectFromView = async (confidence: number) =>
        detectFieldBoundaries(
          {
            image: view!.image,
            bbox: view!.bbox,
            aoi: aoiFc,
            minConfidence: confidence,
            minAreaM2,
            source: captureSource,
            highRes: true,
            signal: controller.signal,
          },
          trackJob(0),
        )

      let out = await detectFromView(minConfidence)
      // Soft retry: many basemap captures need a lower threshold to polygonize.
      const retryConfidence = 0.1
      if (!out.geojson.features.length && minConfidence > retryConfidence + 0.001) {
        setNotice(
          `No fields at confidence ${(minConfidence * 100).toFixed(0)}% — retrying at ${(retryConfidence * 100).toFixed(0)}%…`,
        )
        setProgress(2)
        out = await detectFromView(retryConfidence)
        if (out.geojson.features.length) {
          setMinConfidence(retryConfidence)
          setNotice(
            `Found fields at lower confidence (${(retryConfidence * 100).toFixed(0)}%).`,
          )
          setResult(finishResult(out))
          setProgress(100)
          setPhase('done')
          return
        }
        setNotice(null)
      }

      if (!out.geojson.features.length) {
        if (
          await tryCatalogEngines({
            noticeOnFowHit: 'No fields in captured imagery — showing Fields of the World parcels.',
            noticeOnFtw: 'No fields in captured imagery — ran FTW live Sentinel-2 instead.',
            noticeOnFowError: 'No fields in captured imagery — FoW unavailable, tried FTW live.',
            // Avoid looping catalog engines we already tried above.
            skipFtwLive: true,
            ftwFirst: false,
          })
        ) {
          return
        }
        const { short, detail } = formatFieldBoundaryUserError(null, {
          source: captureSource,
          empty: true,
        })
        setError(short)
        setErrorDetail(
          detail ||
            (isMapRgbImagerySource(captureSource)
              ? 'Map RGB capture found no parcels — zoom to cropland and lower confidence.'
              : isFowCatalogMissing(fowAdminIso)
                ? `FoW has no ${fowAdminIso} country parquet — try Basemap (Esri/Google RGB) or FTW live.`
                : ''),
        )
        setResult(null)
        setPhase('empty')
        return
      }
      setSource(captureSource)
      setResult(finishResult(out))
      setProgress(100)
      setPhase('done')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      let offlineErr = err instanceof FieldBoundaryServiceError && err.offline
      const rawMsg =
        err instanceof FieldBoundaryServiceError
          ? err.message
          : (err as Error)?.message || 'Field boundary detection failed.'
      const { short, detail } = formatFieldBoundaryUserError(rawMsg, {
        offline: offlineErr,
        source: activeSource,
      })
      offlineErr = offlineErr || isOfflineFieldBoundaryError(short)
      const emptyLike =
        !offlineErr &&
        (/^No (FoW |FTW |FTW live )?fields/i.test(rawMsg) ||
          /^No fields\b/i.test(short) ||
          /^No FoW fields\b/i.test(short) ||
          /^No FTW\b/i.test(short))
      setError(short)
      setErrorDetail(
        err instanceof FieldBoundaryServiceError ? err.detail || detail : detail,
      )
      setOffline(false)
      setPhase(emptyLike ? 'empty' : 'error')
    } finally {
      setBusy(false)
    }
  }, [
    adminIso,
    applySceneRange,
    captureView,
    health,
    imagery,
    minConfidence,
    minAreaM2,
    regularizeFootprints,
    regularizeMethod,
    mergeFragments,
    setSource,
    source,
    uploadedImage,
    sceneDate,
    sceneDateFrom,
    sceneDateTo,
  ])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    validationAbortRef.current?.abort()
    rawResultRef.current = null
    lastDetectContextRef.current = null
    autoAttributesKeyRef.current = null
    setResult(null)
    setValidationReference(null)
    setValidationReferenceLabel(null)
    setValidationReferenceNotice(null)
    setValidationReferenceBusy(false)
    setUploadedImage(null)
    setError(null)
    setErrorDetail(null)
    setNotice(null)
    setOffline(false)
    setProgress(0)
    setStage(null)
    setPhase('idle')
    resetSen2sr()
  }, [resetSen2sr])

  // After Detect completes, pull FoW / FTW dataset parcels as Validation reference.
  useEffect(() => {
    if (phase !== 'done' || !result?.geojson?.features?.length) return
    const ctx = lastDetectContextRef.current
    if (!ctx) return

    const gate = shouldFetchFowValidationReference({
      engine: result.engine,
      source: ctx.source,
      adminIso: ctx.adminIso,
      hasDetection: true,
    })
    if (!gate.ok) {
      setValidationReference(null)
      setValidationReferenceLabel(null)
      setValidationReferenceNotice(gate.notice)
      setValidationReferenceBusy(false)
      return
    }

    validationAbortRef.current?.abort()
    const ac = new AbortController()
    validationAbortRef.current = ac
    setValidationReferenceBusy(true)
    setValidationReferenceNotice('Loading FoW / FTW dataset reference for Validation Detection…')

    void (async () => {
      try {
        const ref = await fetchFowValidationReference({
          bbox: ctx.bbox,
          aoi: ctx.aoi,
          minAreaM2: ctx.minAreaM2,
          adminIso: ctx.adminIso,
          signal: ac.signal,
        })
        if (ac.signal.aborted) return
        setValidationReference(ref.geojson)
        setValidationReferenceLabel(ref.label)
        setValidationReferenceNotice(ref.notice)
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        setValidationReference(null)
        setValidationReferenceLabel(null)
        setValidationReferenceNotice(
          `FoW reference unavailable — ${err instanceof Error ? err.message : String(err)}`,
        )
      } finally {
        if (!ac.signal.aborted) setValidationReferenceBusy(false)
      }
    })()

    return () => {
      ac.abort()
    }
  }, [phase, result?.engine, result?.count, result?.geojson?.features?.length])

  // Re-apply Regularize Building Footprint when the method or toggle changes —
  // no need to re-run the model for the stair / overlap fix.
  useEffect(() => {
    const raw = rawResultRef.current
    if (!raw?.geojson?.features?.length) return
    if (busy || phase === 'detecting' || phase === 'capturing') return
    const ctx = lastDetectContextRef.current
    const engineKey = String(raw.engine || ctx?.source || '')
    const ftw = isFtwFieldEngine(ctx?.source) || isFtwFieldEngine(raw.engine)
    const cadastral =
      ftw ||
      isCadastralFieldEngine(engineKey) ||
      engineKey.includes('delineate') ||
      engineKey.includes('fow')
    const baseMin = ctx?.minAreaM2 ?? 1
    const effMinArea = finishMinAreaM2(baseMin, ftw || cadastral)
    const mergedGeo = mergeFieldFragments(
      raw.geojson,
      finishMergeOptions(baseMin, { ftw: ftw || cadastral, enabled: mergeFragments }),
    )
    const softenMeters = regularizeMethod === 'right-angles' ? 3.2 : 5.2
    const builtin = isBuiltinFieldEngine(raw.engine)
    const optimized = optimizeFieldBoundaryResult(
      { ...raw, geojson: mergedGeo, count: mergedGeo.features.length },
      {
        regularizeFootprints,
        regularizeMethod,
        softenKept: true,
        softenMeters,
        minFillRatio: builtin ? 0.38 : cadastral ? 0.48 : 0.55,
        maxAreaInflation: builtin ? 1.9 : cadastral ? 1.52 : 1.45,
      },
    )
    let geojson = optimized.geojson
    if (ctx?.aoi) {
      geojson = refineFieldPolygonsToAoi(geojson, ctx.aoi, {
        minAreaM2: effMinArea,
        dropIou: 0.15,
      })
    }
    setResult({
      ...optimized,
      geojson,
      count: geojson.features.length,
      aoiApplied: Boolean(ctx?.aoi) || optimized.aoiApplied,
      stats: {
        ...(optimized.stats || { field: 0 }),
        field: geojson.features.length,
      },
    })
    setPhase(geojson.features.length ? 'done' : 'empty')
  }, [regularizeFootprints, regularizeMethod, mergeFragments]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Fill the attribute table from the full Sentinel-2 Layer index set.
   * Uses a 90-day window ending on the Image date (not the 1-day Detect window),
   * so NDVI / NDRE / NDMI and derived columns can answer for every field.
   */
  const ensureAttributes = useCallback(async (opts?: {
    force?: boolean
  }): Promise<GeoJSON.FeatureCollection | null> => {
    const fc = resultRef.current?.geojson
    if (!fc?.features?.length) return null
    if (!opts?.force && hasFieldAttributes(fc) && !fieldAttributesNeedRefresh(fc)) return fc

    // Image date is a single day for FTW Detect — zonal stats need a season window.
    const window = defaultAttributeWindow(sceneDateTo || sceneDateFrom || sceneDate)
    setAttributesBusy(true)
    setAttributesProgress('Loading Sentinel-2 Layer index statistics…')
    try {
      const enriched = await enrichFieldAttributesFromSentinel2(fc, {
        ...window,
        layerName: 'Detected field boundaries',
        layerIds: [...FIELD_ATTRIBUTE_LAYER_IDS],
        onProgress: p => setAttributesProgress(`${p.label} (${p.done}/${p.total})`),
      })
      setResult(prev => (prev ? { ...prev, geojson: enriched } : prev))
      setNotice(
        `Attributes filled from Sentinel-2 Layer index (${window.fromDate} → ${window.toDate}).`,
      )
      return enriched
    } catch (err) {
      // Never block an export on the statistics API — ship geometry either way.
      setNotice(
        `Attributes unavailable — exporting geometry only. ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return fc
    } finally {
      setAttributesBusy(false)
      setAttributesProgress(null)
    }
  }, [sceneDate, sceneDateFrom, sceneDateTo])

  /** After Detect completes, fill every attribute column from Layer index. */
  useEffect(() => {
    if (phase !== 'done') return
    const fc = result?.geojson
    if (!fc?.features?.length) return
    const key = `${fc.features.length}:${sceneDateTo || sceneDateFrom || sceneDate}`
    if (autoAttributesKeyRef.current === key) return
    if (hasFieldAttributes(fc) && !fieldAttributesNeedRefresh(fc)) {
      autoAttributesKeyRef.current = key
      return
    }
    autoAttributesKeyRef.current = key
    void ensureAttributes({ force: fieldAttributesNeedRefresh(fc) })
  }, [phase, result, sceneDate, sceneDateFrom, sceneDateTo, ensureAttributes])

  const exportGeojson = useCallback(async () => {
    const fc = await ensureAttributes()
    if (!fc?.features?.length) return
    downloadFieldBoundaryGeoPackage(fc)
  }, [ensureAttributes])

  const exportShapefile = useCallback(async () => {
    const fc = await ensureAttributes()
    if (!fc?.features?.length) return
    await downloadFieldBoundaryShapefile(fc)
  }, [ensureAttributes])

  const geojson = result?.geojson ?? null

  const totalAreaHa = useMemo(() => {
    if (!geojson) return 0
    let sum = 0
    for (const f of geojson.features) {
      sum += Number((f.properties as any)?.area_ha || 0)
    }
    if (sum > 0) return sum
    return summarizeFieldGeometry(geojson).totalAreaHa
  }, [geojson])

  const mapRgbOnlyHost = isMapRgbOnlyProductionHost(health)

  return {
    source,
    setSource,
    sourceOptions: modelOptions,
    model,
    setModel,
    modelOptions,
    imagery,
    setImagery,
    imageryOptions,
    countryOptions: FOW_COUNTRY_OPTIONS,
    adminIso,
    setAdminIso: setAdminIsoSafe,
    uploadedImage,
    uploadImageFile,
    clearUploadedImage,
    needsImageUpload: modelUsesCaptureImagery(model) && isFieldFileSource(imagery),
    sceneDate,
    setSceneDate,
    sceneDateFrom,
    sceneDateTo,
    setSceneDateFrom,
    setSceneDateTo,
    setSceneDateAllYear,
    year,
    setYear,
    minConfidence,
    setMinConfidence,
    minAreaM2,
    setMinAreaM2,
    fillOpacity,
    setFillOpacity,
    regularizeFootprints,
    setRegularizeFootprints,
    regularizeMethod,
    setRegularizeMethod,
    mergeFragments,
    setMergeFragments,
    phase,
    progress,
    stage,
    attributesBusy,
    attributesProgress,
    ensureAttributes,
    busy,
    error,
    errorDetail,
    notice,
    offline,
    health,
    mapRgbOnlyHost,
    result,
    geojson,
    fieldCount: result?.count ?? 0,
    totalAreaHa,
    engine: result?.engine ?? null,
    validationReference,
    validationReferenceLabel,
    validationReferenceNotice,
    validationReferenceBusy,
    run,
    reset,
    exportGeojson,
    exportShapefile,
    sen2sr,
  }
}
