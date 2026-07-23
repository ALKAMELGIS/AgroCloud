import { useCallback, useMemo, useRef, useState } from 'react'
import { pointInPolygonGeometry } from '../../../lib/geoAiGeoJsonSpatial'
import {
  segmentWithSamJob,
  SamDetectionServiceError,
  type SamFeatureMode,
  type SamFeatureStats,
  type SamPixelPoint,
} from '../../../lib/samDetection/samDetectionClient'

export type SamClassType = 'fg' | 'bg'
export type { SamFeatureMode }
export type SamAoiSource = 'layer' | 'draw'

/** Forced GIS modes that require a Detected Object Type before Segment. */
export type SamForcedFeatureMode = Exclude<SamFeatureMode, 'auto'>

export type SamObjectTypeOption = {
  id: string
  label: string
}

/** Catalog of Detected Object Types per GIS output mode. */
export const SAM_OBJECT_TYPES: Record<SamForcedFeatureMode, SamObjectTypeOption[]> = {
  point: [
    { id: 'trees', label: 'Trees' },
    { id: 'poles', label: 'Poles' },
    { id: 'vehicles', label: 'Vehicles' },
    { id: 'other', label: 'Other' },
  ],
  line: [
    { id: 'roads', label: 'Roads' },
    { id: 'rivers', label: 'Rivers' },
    { id: 'pipelines', label: 'Pipelines' },
    { id: 'other', label: 'Other' },
  ],
  polygon: [
    { id: 'fields', label: 'Fields' },
    { id: 'buildings', label: 'Buildings' },
    { id: 'water_bodies', label: 'Water Bodies' },
    { id: 'forest', label: 'Forest' },
    { id: 'other', label: 'Other' },
  ],
}

export function defaultObjectTypeId(mode: SamFeatureMode): string {
  if (mode === 'auto') return ''
  return SAM_OBJECT_TYPES[mode][0]?.id ?? 'other'
}

export function resolveDetectedObjectType(
  mode: SamFeatureMode,
  objectTypeId: string,
  customLabel: string,
): string | null {
  if (mode === 'auto') return null
  const opts = SAM_OBJECT_TYPES[mode]
  const hit = opts.find(o => o.id === objectTypeId) ?? opts[0]
  if (!hit) return null
  if (hit.id === 'other') {
    const custom = customLabel.trim()
    return custom || null
  }
  return hit.label
}

export type SamPromptPoint = {
  id: string
  lng: number
  lat: number
  /** 1 = foreground (keep), 0 = background (exclude). */
  label: 0 | 1
}

export type SamSegmentPhase = 'idle' | 'capturing' | 'segmenting' | 'done' | 'error'

/** A captured RGB view + its WGS84 bounds, produced by the parent (map-aware). */
export type SamCapturedView = {
  image: string
  bbox: [number, number, number, number]
}

export type SamAoiGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.FeatureCollection

export type UseSamDetectionOptions = {
  /**
   * High-res capture of the AOI extent for SAM.
   * Parent should pad the AOI bbox slightly and prefer satellite imagery.
   */
  captureView: (opts: {
    bbox: [number, number, number, number]
    aoi: SamAoiGeometry
  }) => Promise<SamCapturedView | null>
  /** Resolve the active analysis AOI (layer polygons or drawn polygon). */
  resolveAoi: () => SamAoiGeometry | null
}

function newId(): string {
  return `sam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

/** Convert a point's lng/lat to captured-image pixel coordinates (origin top-left). */
function lngLatToPixel(
  lng: number,
  lat: number,
  bbox: [number, number, number, number],
  width: number,
  height: number,
): SamPixelPoint {
  const [west, south, east, north] = bbox
  const x = ((lng - west) / Math.max(1e-12, east - west)) * width
  const y = ((north - lat) / Math.max(1e-12, north - south)) * height
  return { x, y, label: 1 }
}

function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Could not read captured image dimensions.'))
    img.src = dataUrl
  })
}

function walkCoords(c: unknown, out: number[][]) {
  if (!c) return
  if (typeof (c as number[])[0] === 'number' && typeof (c as number[])[1] === 'number') {
    out.push(c as number[])
    return
  }
  if (Array.isArray(c)) c.forEach(x => walkCoords(x, out))
}

/** Bounding box [west, south, east, north] for any GeoJSON geometry / FC. */
export function bboxOfSamAoi(aoi: SamAoiGeometry): [number, number, number, number] | null {
  const coords: number[][] = []
  if (aoi.type === 'FeatureCollection') {
    for (const f of aoi.features) {
      if (f?.geometry) walkCoords((f.geometry as GeoJSON.Geometry).coordinates, coords)
    }
  } else {
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

/** Expand AOI bbox by a fraction of its span (helps capture edge context). */
export function padSamAoiBbox(
  bbox: [number, number, number, number],
  padFrac = 0.04,
): [number, number, number, number] {
  const [w, s, e, n] = bbox
  const dx = Math.max(1e-6, e - w) * padFrac
  const dy = Math.max(1e-6, n - s) * padFrac
  return [w - dx, s - dy, e + dx, n + dy]
}

const EMPTY_STATS: SamFeatureStats = { point: 0, line: 0, polygon: 0 }

const SOURCE_IMAGE_LABEL = 'AOI high-res satellite capture'

export type SamAoiUnit = {
  aoiId: string
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

/** Normalize any AOI input into discrete polygon units with stable aoi_id values. */
export function normalizeSamAoiUnits(aoi: SamAoiGeometry | null | undefined): SamAoiUnit[] {
  if (!aoi) return []
  const units: SamAoiUnit[] = []

  if (aoi.type === 'FeatureCollection') {
    aoi.features.forEach((f, i) => {
      const g = f?.geometry
      if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return
      const props = (f.properties || {}) as Record<string, unknown>
      const aoiId = String(
        props.aoi_id ||
          props.aoiId ||
          props.OBJECTID ||
          props.objectid ||
          f.id ||
          `aoi-${i + 1}`,
      )
      units.push({ aoiId, geometry: g })
    })
    return units
  }

  if (aoi.type === 'Polygon' || aoi.type === 'MultiPolygon') {
    units.push({ aoiId: 'drawn-aoi-1', geometry: aoi })
  }
  return units
}

/** Representative lng/lat used to assign a detection to an AOI unit. */
function featureRepresentativePoint(geom: GeoJSON.Geometry | null | undefined): [number, number] | null {
  if (!geom) return null
  if (geom.type === 'Point') {
    const [lng, lat] = geom.coordinates
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null
  }
  if (geom.type === 'MultiPoint') {
    const c = geom.coordinates[0]
    return c && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? [c[0], c[1]] : null
  }
  if (geom.type === 'LineString') {
    const mid = geom.coordinates[Math.floor(geom.coordinates.length / 2)]
    return mid && Number.isFinite(mid[0]) && Number.isFinite(mid[1]) ? [mid[0], mid[1]] : null
  }
  if (geom.type === 'MultiLineString') {
    const line = geom.coordinates[0]
    const mid = line?.[Math.floor((line?.length || 0) / 2)]
    return mid && Number.isFinite(mid[0]) && Number.isFinite(mid[1]) ? [mid[0], mid[1]] : null
  }
  // Polygon / MultiPolygon — use first exterior ring centroid (average of vertices).
  const ring =
    geom.type === 'Polygon'
      ? geom.coordinates[0]
      : geom.type === 'MultiPolygon'
        ? geom.coordinates[0]?.[0]
        : null
  if (!ring?.length) return null
  let sx = 0
  let sy = 0
  let n = 0
  for (const pt of ring) {
    if (!pt || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue
    sx += pt[0]
    sy += pt[1]
    n += 1
  }
  return n > 0 ? [sx / n, sy / n] : null
}

function findContainingAoiId(geom: GeoJSON.Geometry | null | undefined, units: SamAoiUnit[]): string | null {
  const pt = featureRepresentativePoint(geom)
  if (!pt) return null
  const [lng, lat] = pt
  for (const unit of units) {
    if (pointInPolygonGeometry(lng, lat, unit.geometry)) return unit.aoiId
  }
  // Fallback: if only one AOI unit, assign it (backend already clipped to AOI).
  if (units.length === 1) return units[0]!.aoiId
  return null
}

/** Keep detections inside AOI units and stamp classified GIS attributes (incl. aoi_id). */
function stampClassifiedGisAttributes(
  features: GeoJSON.Feature[],
  opts: {
    featureMode: SamFeatureMode
    detectedObjectType: string | null
    objectTypeId: string
    detectionDate: string
    aoiUnits: SamAoiUnit[]
  },
): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = []

  for (const f of features) {
    const aoiId = findContainingAoiId(f.geometry, opts.aoiUnits)
    if (!aoiId) continue // drop detections outside every AOI unit

    const props = (f.properties || {}) as Record<string, unknown>
    const objectId = String(props.object_id || f.id || newId())
    const conf = Number(props.confidence ?? props.confidence_score ?? 0)
    const mode =
      opts.featureMode === 'auto' ? String(props.feature_type || 'auto') : opts.featureMode
    const objectType =
      opts.detectedObjectType ||
      String(props.detected_object_type || props.class || 'unclassified')

    const lon = Number(props.longitude ?? props.centroid_lon)
    const lat = Number(props.latitude ?? props.centroid_lat)
    const area = Number(props.area_m2)
    const diameter = Number(props.diameter_m)
    const size = Number(props.size_m)

    const next: Record<string, unknown> = {
      ...props,
      object_id: objectId,
      instance_id: props.instance_id ?? objectId,
      aoi_id: aoiId,
      detection_mode: mode,
      detected_object_type: objectType,
      object_type_id: opts.objectTypeId || undefined,
      confidence_score: Number.isFinite(conf) ? conf : 0,
      confidence: Number.isFinite(conf) ? conf : props.confidence,
      detection_date: opts.detectionDate,
      source_image: SOURCE_IMAGE_LABEL,
      class: objectType,
      role: props.role || props.geometry_role || (f.geometry?.type === 'Point' ? 'centroid' : 'mask'),
    }

    if (Number.isFinite(area)) next.area_m2 = area
    if (Number.isFinite(diameter)) next.diameter_m = diameter
    if (Number.isFinite(size)) next.size_m = size
    if (Number.isFinite(lon)) {
      next.longitude = lon
      next.centroid_lon = lon
    }
    if (Number.isFinite(lat)) {
      next.latitude = lat
      next.centroid_lat = lat
    }
    if (props.length_m != null && next.length_m == null) next.length_m = props.length_m
    if (props.perimeter_m != null && next.perimeter_m == null) next.perimeter_m = props.perimeter_m

    out.push({
      ...f,
      id: String(f.id || `${objectId}-${next.role}`),
      properties: next,
    })
  }

  // Stable order: group by AOI then object_id for organized per-AOI results.
  out.sort((a, b) => {
    const aa = String((a.properties as any)?.aoi_id || '')
    const bb = String((b.properties as any)?.aoi_id || '')
    if (aa !== bb) return aa.localeCompare(bb)
    const oa = String((a.properties as any)?.object_id || '')
    const ob = String((b.properties as any)?.object_id || '')
    if (oa !== ob) return oa.localeCompare(ob)
    // Mask before centroid within the same instance
    const ra = String((a.properties as any)?.role || '')
    const rb = String((b.properties as any)?.role || '')
    return ra.localeCompare(rb)
  })

  return out
}

function countUniqueInstances(features: GeoJSON.Feature[]): number {
  const ids = new Set<string>()
  for (const f of features) {
    const props = (f.properties || {}) as Record<string, unknown>
    const oid = props.object_id ?? props.instance_id
    if (oid != null) ids.add(String(oid))
    else if (props.role !== 'centroid') ids.add(String(f.id || JSON.stringify(f.geometry)))
  }
  return ids.size
}

function recountFeatureStats(features: GeoJSON.Feature[]): SamFeatureStats {
  const stats: SamFeatureStats = { point: 0, line: 0, polygon: 0 }
  for (const f of features) {
    const t = f.geometry?.type
    if (t === 'Point' || t === 'MultiPoint') stats.point += 1
    else if (t === 'LineString' || t === 'MultiLineString') stats.line += 1
    else if (t === 'Polygon' || t === 'MultiPolygon') stats.polygon += 1
  }
  return stats
}

/**
 * Interactive Segment Anything Model (SAM) detection state machine.
 *
 * Requires an AOI (layer or drawn). Drops FG/BG prompts, runs high-res SAM
 * only inside the AOI, and keeps high-confidence GIS features.
 */
export function useSamDetection({ captureView, resolveAoi }: UseSamDetectionOptions) {
  const [points, setPoints] = useState<SamPromptPoint[]>([])
  const [classType, setClassType] = useState<SamClassType>('fg')
  const [featureMode, setFeatureModeState] = useState<SamFeatureMode>('auto')
  const [objectTypeId, setObjectTypeId] = useState('')
  const [customObjectType, setCustomObjectType] = useState('')
  const [maskOpacity, setMaskOpacity] = useState(0.5)
  const [minConfidence, setMinConfidence] = useState(0.55)
  const [phase, setPhase] = useState<SamSegmentPhase>('idle')
  /** 0–100 while segmenting (from async SAM job). */
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [result, setResult] = useState<{
    geojson: GeoJSON.FeatureCollection
    score: number
    count: number
    stats: SamFeatureStats
  } | null>(null)
  const [saved, setSaved] = useState<GeoJSON.Feature[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const resolveAoiRef = useRef(resolveAoi)
  resolveAoiRef.current = resolveAoi

  const setFeatureMode = useCallback((mode: SamFeatureMode) => {
    setFeatureModeState(mode)
    setObjectTypeId(defaultObjectTypeId(mode))
    setCustomObjectType('')
  }, [])

  const detectedObjectType = useMemo(
    () => resolveDetectedObjectType(featureMode, objectTypeId, customObjectType),
    [featureMode, objectTypeId, customObjectType],
  )

  const objectTypeReady = featureMode === 'auto' || Boolean(detectedObjectType)

  const addPoint = useCallback(
    (lng: number, lat: number) => {
      setPoints(prev => [...prev, { id: newId(), lng, lat, label: classType === 'fg' ? 1 : 0 }])
    },
    [classType],
  )

  const undoLastPoint = useCallback(() => {
    setPoints(prev => prev.slice(0, -1))
  }, [])

  const clearPoints = useCallback(() => {
    setPoints([])
  }, [])

  const segment = useCallback(async () => {
    if (featureMode !== 'auto' && !detectedObjectType) {
      setError('Select a Detected Object Type (or enter Other text) before running Segment.')
      setPhase('error')
      return
    }
    const aoi = resolveAoiRef.current()
    if (!aoi) {
      setError('Select an AOI Layer or draw an AOI polygon before running Segment.')
      setPhase('error')
      return
    }
    const aoiUnits = normalizeSamAoiUnits(aoi)
    if (!aoiUnits.length) {
      setError('AOI has no valid polygon units.')
      setPhase('error')
      return
    }
    const rawBbox = bboxOfSamAoi(aoi)
    if (!rawBbox) {
      setError('AOI has no valid polygon bounds.')
      setPhase('error')
      return
    }
    const bbox = padSamAoiBbox(rawBbox, 0.03)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    setOffline(false)
    setProgress(0)
    setStage('capturing')
    setPhase('capturing')
    try {
      // Always send a FeatureCollection with aoi_id so backend masks per analysis boundary.
      const aoiFc: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: aoiUnits.map(u => ({
          type: 'Feature',
          properties: { aoi_id: u.aoiId },
          geometry: u.geometry,
        })),
      }
      const view = await captureView({ bbox, aoi: aoiFc })
      if (!view) throw new Error('Could not capture a high-resolution image of the AOI.')
      const { width, height } = await imageSize(view.image)
      // Optional FG/BG prompts are still forwarded as hints; full_aoi scans the whole AOI.
      const pixelPoints: SamPixelPoint[] = points.map(p => {
        const px = lngLatToPixel(p.lng, p.lat, view.bbox, width, height)
        return { x: Math.round(px.x), y: Math.round(px.y), label: p.label }
      })
      setPhase('segmenting')
      setProgress(2)
      setStage('queued')
      const out = await segmentWithSamJob(
        {
          image: view.image,
          bbox: view.bbox,
          points: pixelPoints,
          featureMode,
          aoi: aoiFc,
          minConfidence,
          highRes: true,
          fullAoi: true,
          objectType: objectTypeId || detectedObjectType,
          instanceSegmentation: true,
          signal: controller.signal,
        },
        (pct, jobStage) => {
          setProgress(Math.max(0, Math.min(100, Math.round(pct))))
          setStage(jobStage || 'scanning')
        },
      )
      const detectionDate = new Date().toISOString()
      const stamped = stampClassifiedGisAttributes(out.geojson.features, {
        featureMode,
        detectedObjectType,
        objectTypeId,
        detectionDate,
        aoiUnits,
      })
      if (!stamped.length) {
        setError(
          'No detections found inside the AOI. Try lowering Confidence or check imagery coverage.',
        )
        setResult(null)
        setPhase('error')
        return
      }
      const objectCount = countUniqueInstances(stamped)
      setResult({
        geojson: { type: 'FeatureCollection', features: stamped },
        score: out.score,
        count: objectCount,
        stats: recountFeatureStats(stamped),
      })
      setProgress(100)
      setStage('done')
      setPhase('done')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const offlineErr = err instanceof SamDetectionServiceError && err.offline
      setOffline(offlineErr)
      setError((err as Error)?.message || 'SAM segmentation failed.')
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }, [points, captureView, featureMode, minConfidence, detectedObjectType, objectTypeId])

  /** Persist the current segmented features and clear prompts for the next object. */
  const save = useCallback(() => {
    if (!result?.geojson?.features?.length) return
    const stamped = result.geojson.features.map(f => {
      const props = (f.properties || {}) as Record<string, unknown>
      const objectId = String(props.object_id || f.id || newId())
      return {
        ...f,
        id: objectId,
        properties: {
          ...props,
          object_id: objectId,
          savedAt: Date.now(),
        },
      }
    })
    setSaved(prev => [...prev, ...stamped])
    setPoints([])
    setResult(null)
    setPhase('idle')
  }, [result])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setPoints([])
    setResult(null)
    setError(null)
    setOffline(false)
    setProgress(0)
    setStage('')
    setPhase('idle')
  }, [])

  const clearAll = useCallback(() => {
    reset()
    setSaved([])
  }, [reset])

  const pointsGeojson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: points.map(p => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { promptType: p.label === 1 ? 'fg' : 'bg', id: p.id },
      })),
    }),
    [points],
  )

  const maskGeojson = result?.geojson ?? null

  const savedGeojson = useMemo<GeoJSON.FeatureCollection>(
    () => ({ type: 'FeatureCollection', features: saved }),
    [saved],
  )

  const exportSaved = useCallback(() => {
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: saved,
    }
    const blob = new Blob(
      [
        JSON.stringify(
          {
            type: 'FeatureCollection',
            name: 'sam_detections',
            crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
            features: fc.features,
          },
          null,
          2,
        ),
      ],
      { type: 'application/geo+json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sam-detections.geojson'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }, [saved])

  const fgCount = points.filter(p => p.label === 1).length
  const bgCount = points.length - fgCount

  return {
    points,
    classType,
    setClassType,
    featureMode,
    setFeatureMode,
    objectTypeId,
    setObjectTypeId,
    customObjectType,
    setCustomObjectType,
    detectedObjectType,
    objectTypeReady,
    objectTypeOptions: featureMode === 'auto' ? [] : SAM_OBJECT_TYPES[featureMode],
    maskOpacity,
    setMaskOpacity,
    minConfidence,
    setMinConfidence,
    addPoint,
    undoLastPoint,
    clearPoints,
    phase,
    progress,
    stage,
    busy,
    error,
    offline,
    result,
    savedCount: saved.length,
    fgCount,
    bgCount,
    featureStats: result?.stats ?? EMPTY_STATS,
    segment,
    save,
    reset,
    clearAll,
    exportSaved,
    pointsGeojson,
    maskGeojson,
    savedGeojson,
  }
}
