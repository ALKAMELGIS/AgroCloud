import { useCallback, useMemo, useRef, useState } from 'react'
import {
  detectFieldBoundaries,
  fetchFowFieldBoundaries,
  FieldBoundaryServiceError,
  type FieldBoundaryResult,
  type FieldImagerySource,
} from '../../../lib/agriFieldBoundary/fieldBoundaryClient'
import {
  downloadFieldBoundaryGeoPackage,
  downloadFieldBoundaryShapefile,
} from '../../../lib/agriFieldBoundary/polygonShapefileExport'
import { createGeoTiffPngPreviewUrl } from '../../../lib/raster/siRasterMapLayer'

export type FieldBoundaryPhase = 'idle' | 'capturing' | 'detecting' | 'done' | 'error'

export type FieldCapturedView = {
  image: string
  bbox: [number, number, number, number]
}

export type FieldUploadedImage = {
  name: string
  dataUrl: string
  bbox?: [number, number, number, number]
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

const SOURCES: Array<{ id: FieldImagerySource; label: string }> = [
  { id: 'basemap', label: 'Basemap' },
  { id: 'fow', label: 'Fields of the World' },
  { id: 'sentinel2', label: 'Sentinel-2' },
  { id: 'landsat', label: 'Landsat' },
  { id: 'planet', label: 'Planet' },
  { id: 'airbus', label: 'Airbus' },
  { id: 'drone', label: 'Drone' },
  { id: 'geotiff', label: 'GeoTIFF' },
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
]

/**
 * Mask R-CNN / instance-segmentation field boundary workflow:
 * AOI → high-res capture → detect → colorful GeoJSON fields.
 */
export function useAgriFieldBoundary({ captureView, resolveAoi }: UseAgriFieldBoundaryOptions) {
  const [source, setSourceState] = useState<FieldImagerySource>('basemap')
  const [uploadedImage, setUploadedImage] = useState<FieldUploadedImage | null>(null)
  const [minConfidence, setMinConfidence] = useState(0.35)
  const [minAreaM2, setMinAreaM2] = useState(150)
  const [fillOpacity, setFillOpacity] = useState(0.55)
  const [phase, setPhase] = useState<FieldBoundaryPhase>('idle')
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [result, setResult] = useState<FieldBoundaryResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const resolveAoiRef = useRef(resolveAoi)
  resolveAoiRef.current = resolveAoi

  const setSource = useCallback((next: FieldImagerySource) => {
    setSourceState(prev => {
      if (prev !== next && !isFieldFileSource(next)) {
        setUploadedImage(null)
      }
      return next
    })
    setError(null)
    if (phase === 'error') setPhase('idle')
  }, [phase])

  const uploadImageFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    try {
      const loaded = await loadFieldImageFile(file)
      setUploadedImage(loaded)
      setError(null)
      if (phase === 'error' || phase === 'done') setPhase('idle')
    } catch (err) {
      setUploadedImage(null)
      setError((err as Error)?.message || 'Could not load image file.')
      setPhase('error')
    }
  }, [phase])

  const clearUploadedImage = useCallback(() => {
    setUploadedImage(null)
  }, [])

  const run = useCallback(async () => {
    const aoi = resolveAoiRef.current()
    if (!aoi) {
      setError('Draw or select an AOI before detecting field boundaries.')
      setPhase('error')
      return
    }
    const rawBbox = bboxOfGeometry(aoi)
    if (!rawBbox) {
      setError('AOI has no valid bounds.')
      setPhase('error')
      return
    }
    const bbox = padBbox(rawBbox)

    if (isFieldFileSource(source) && !uploadedImage) {
      setError('Choose an image file (Drone / GeoTIFF / PNG / JPEG) before detecting.')
      setPhase('error')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError(null)
    setOffline(false)
    setProgress(0)
    setPhase('capturing')
    try {
      const aoiFc: GeoJSON.FeatureCollection =
        aoi.type === 'FeatureCollection'
          ? aoi
          : {
              type: 'FeatureCollection',
              features: [{ type: 'Feature', properties: {}, geometry: aoi }],
            }

      let view: FieldCapturedView | null = null
      if (source === 'fow') {
        setPhase('detecting')
        setProgress(5)
        const out = await fetchFowFieldBoundaries({
          bbox,
          aoi: aoiFc,
          minAreaM2,
          signal: controller.signal,
        })
        if (!out.geojson.features.length) {
          setError('No FoW fields in this AOI. Try another region or enlarge the AOI.')
          setResult(null)
          setPhase('error')
          return
        }
        setResult(out)
        setProgress(100)
        setPhase('done')
        return
      }

      if (isFieldFileSource(source) && uploadedImage) {
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
      const out = await detectFieldBoundaries(
        {
          image: view.image,
          bbox: view.bbox,
          aoi: aoiFc,
          minConfidence,
          minAreaM2,
          source,
          highRes: true,
          signal: controller.signal,
        },
        (pct, _stage) => setProgress(Math.max(0, Math.min(100, Math.round(pct)))),
      )
      if (!out.geojson.features.length) {
        setError('No fields detected. Lower confidence or enlarge the AOI.')
        setResult(null)
        setPhase('error')
        return
      }
      setResult(out)
      setProgress(100)
      setPhase('done')
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      const offlineErr = err instanceof FieldBoundaryServiceError && err.offline
      setOffline(offlineErr)
      setError((err as Error)?.message || 'Field boundary detection failed.')
      setPhase('error')
    } finally {
      setBusy(false)
    }
  }, [captureView, minConfidence, minAreaM2, source, uploadedImage])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setResult(null)
    setUploadedImage(null)
    setError(null)
    setOffline(false)
    setProgress(0)
    setPhase('idle')
  }, [])

  const exportGeojson = useCallback(() => {
    if (!result?.geojson?.features?.length) return
    downloadFieldBoundaryGeoPackage(result.geojson)
  }, [result])

  const exportShapefile = useCallback(async () => {
    if (!result?.geojson?.features?.length) return
    await downloadFieldBoundaryShapefile(result.geojson)
  }, [result])

  const geojson = result?.geojson ?? null

  const totalAreaHa = useMemo(() => {
    if (!geojson) return 0
    let sum = 0
    for (const f of geojson.features) {
      sum += Number((f.properties as any)?.area_ha || 0)
    }
    return sum
  }, [geojson])

  return {
    source,
    setSource,
    sourceOptions: SOURCES,
    uploadedImage,
    uploadImageFile,
    clearUploadedImage,
    needsImageUpload: isFieldFileSource(source),
    minConfidence,
    setMinConfidence,
    minAreaM2,
    setMinAreaM2,
    fillOpacity,
    setFillOpacity,
    phase,
    progress,
    busy,
    error,
    offline,
    result,
    geojson,
    fieldCount: result?.count ?? 0,
    totalAreaHa,
    engine: result?.engine ?? null,
    run,
    reset,
    exportGeojson,
    exportShapefile,
  }
}
