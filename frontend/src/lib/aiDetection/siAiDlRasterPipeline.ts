import JSZip from 'jszip'
import proj4 from 'proj4'
import { parseRemoteUrlAsFile, type RasterMapCoordinates } from '../../utils/FileLoader'
import {
  findRasterSidecars,
  boundsFromLngLatCorners,
  resolveGeorefFromSidecars,
  rasterFileExtension as rasterExtension,
  isWorldSidecarFile,
  isAuxXmlSidecarFile,
  parseWorldFile,
  boundsFromWorldFile,
  geoTiffCornersInSourceCrs,
  geoTiffHasEmbeddedGeoref,
  mapboxCoordinatesFromSourceCorners,
  resolveCrsFromGeoKeys,
  parseEpsgFromPrjWkt,
  type WorldFileTransform,
} from './siRasterGeoref'
import { createMapboxReadyImageUrl, fitImageWithinWgs84Bounds } from '../raster/siRasterMapLayer'

export type { WorldFileTransform } from './siRasterGeoref'
export { parseWorldFile, boundsFromWorldFile } from './siRasterGeoref'

export type AiDlRasterSourceKind = 'geotiff' | 'image' | 'service-url' | 'map-layer'

/** Source CRS code — EPSG:4326, EPSG:3857, UTM, or a registered proj4 definition. */
export type AiDlRasterCrs = string

export type AiDlRasterBounds = {
  west: number
  south: number
  east: number
  north: number
}

export type AiDlRasterValidationReport = {
  format: string
  readable: boolean
  widthPx: number
  heightPx: number
  bands: number
  noDataValues: number[]
  hasSpatialReference: boolean
  sourceCrs: AiDlRasterCrs
  targetCrs: 'EPSG:3857'
  errors: string[]
  warnings: string[]
}

export type AiDlRasterProcessingStep =
  | 'validation'
  | 'crs-detection'
  | 'georeferencing'
  | 'viewport-placement'
  | 'reprojection'
  | 'normalization'
  | 'map-ready'

export type AiDlProcessedRaster = {
  id: string
  label: string
  sourceKind: AiDlRasterSourceKind
  previewUrl: string
  coordinates: RasterMapCoordinates
  boundsWgs84: AiDlRasterBounds
  boundsWebMercator: AiDlRasterBounds
  validation: AiDlRasterValidationReport
  stepsCompleted: AiDlRasterProcessingStep[]
  readyForInference: boolean
  layerId?: string
  serviceUrl?: string
}

export type AiDlRasterGeorefRequest = {
  file: File
  widthPx: number
  heightPx: number
  bands: number
  worldFile?: WorldFileTransform | null
}

export type AiDlManualGeoref = {
  crs: AiDlRasterCrs
  bounds: AiDlRasterBounds
}

const WEB_MERCATOR_HALF = 20037508.342789244

export function worldFileExtensionForImage(fileName: string): string | null {
  return worldFileExtensionForRaster(fileName)
}

export function worldFileExtensionForRaster(fileName: string): string | null {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  if (ext === 'png') return 'pgw'
  if (ext === 'jpg' || ext === 'jpeg') return 'jgw'
  if (ext === 'tif' || ext === 'tiff') return 'tfw'
  return null
}

const RASTER_DATA_EXTENSIONS = new Set([
  'tif',
  'tiff',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'jp2',
  'img',
])
const ZIP_EXTENSION = 'zip'

export const DEFAULT_RASTER_VIEWPORT_BOUNDS: AiDlRasterBounds = {
  west: -0.05,
  south: -0.05,
  east: 0.05,
  north: 0.05,
}

export function isRasterDataFile(file: File): boolean {
  const ext = rasterExtension(file.name)
  // Do not classify bare .zip as raster — shapefile/KMZ/GeoJSON archives are vector.
  // Raster ZIPs are handled explicitly inside importAoiRasterFiles via pickRasterZipCandidate.
  return RASTER_DATA_EXTENSIONS.has(ext)
}

export function isWorldFileOnly(file: File): boolean {
  return isWorldSidecarFile(file) || isAuxXmlSidecarFile(file) || rasterExtension(file.name) === 'prj'
}

export function rasterNeedsWorldSidecar(raster: File, companions: File[]): boolean {
  const ext = rasterExtension(raster.name)
  if (isGeoTiffExt(ext)) return false
  if (isImageExt(ext) || RASTER_DATA_EXTENSIONS.has(ext)) {
    return !findRasterSidecars([raster, ...companions], raster)
  }
  return false
}

export function isAiDlRasterGeorefRequest(
  value: AiDlProcessedRaster | AiDlRasterGeorefRequest,
): value is AiDlRasterGeorefRequest {
  return !('readyForInference' in value)
}

/** True ZIP archives that may contain GeoTIFF/PNG rasters (not shapefile parts). */
export function pickRasterZipCandidate(files: File[]): File | null {
  return files.find(f => rasterExtension(f.name) === ZIP_EXTENSION) ?? null
}

export function pickRasterUploadFiles(files: File[]): { raster: File; companions: File[] } | null {
  const raster = files.find(f => RASTER_DATA_EXTENSIONS.has(rasterExtension(f.name))) ?? null
  if (!raster) return null
  const companions = files.filter(f => f !== raster)
  return { raster, companions }
}

const MISSING_GEOREF_MESSAGE =
  'No georeferencing sidecar found. Select the image together with its world file (.jgw / .pgw / .tfw / .wld) and optional .prj from the satellite export folder.'

export const MISSING_GEOREF_ERROR = MISSING_GEOREF_MESSAGE

const MISSING_GEOTIFF_GEOREF_MESSAGE =
  'GeoTIFF has no embedded georeferencing and no world file (.tfw / .wld) was provided. Re-export with spatial reference or add a sidecar.'

export const EMPTY_RASTER_IMAGE_MESSAGE =
  'Raster image is empty (0 bytes). If the file is on OneDrive, right-click it and choose "Always keep on this device", then import again.'

export function validateRasterImageFile(file: File): void {
  if (file.size <= 0) throw new Error(EMPTY_RASTER_IMAGE_MESSAGE)
}

export function detectCrsFromBounds(bounds: AiDlRasterBounds): AiDlRasterCrs {
  const spanX = Math.abs(bounds.east - bounds.west)
  const spanY = Math.abs(bounds.north - bounds.south)
  const maxCoord = Math.max(
    Math.abs(bounds.west),
    Math.abs(bounds.east),
    Math.abs(bounds.south),
    Math.abs(bounds.north),
  )
  if (maxCoord > 1_000_000 || spanX > 1_000_000 || spanY > 1_000_000) return 'EPSG:3857'
  if (
    bounds.west >= -180 &&
    bounds.east <= 180 &&
    bounds.south >= -90 &&
    bounds.north <= 90 &&
    spanX <= 360 &&
    spanY <= 180
  ) {
    return 'EPSG:4326'
  }
  return 'EPSG:3857'
}

export function webMercatorToWgs84Bounds(bounds: AiDlRasterBounds): AiDlRasterBounds {
  const toLng = (x: number) => (x / WEB_MERCATOR_HALF) * 180
  const toLat = (y: number) => {
    const latRad = Math.atan(Math.sinh((y / WEB_MERCATOR_HALF) * Math.PI))
    return (latRad * 180) / Math.PI
  }
  const west = toLng(bounds.west)
  const east = toLng(bounds.east)
  const south = toLat(bounds.south)
  const north = toLat(bounds.north)
  return {
    west: Math.min(west, east),
    east: Math.max(west, east),
    south: Math.min(south, north),
    north: Math.max(south, north),
  }
}

export function wgs84ToWebMercatorBounds(bounds: AiDlRasterBounds): AiDlRasterBounds {
  const toX = (lng: number) => (lng * WEB_MERCATOR_HALF) / 180
  const toY = (lat: number) => {
    const latRad = (lat * Math.PI) / 180
    return (WEB_MERCATOR_HALF * Math.log(Math.tan(Math.PI / 4 + latRad / 2))) / Math.PI
  }
  const west = toX(bounds.west)
  const east = toX(bounds.east)
  const south = toY(bounds.south)
  const north = toY(bounds.north)
  return {
    west: Math.min(west, east),
    east: Math.max(west, east),
    south: Math.min(south, north),
    north: Math.max(south, north),
  }
}

export function mapboxCoordinatesFromWgs84Bounds(bounds: AiDlRasterBounds): RasterMapCoordinates {
  return [
    [bounds.west, bounds.north],
    [bounds.east, bounds.north],
    [bounds.east, bounds.south],
    [bounds.west, bounds.south],
  ]
}

function normalizeBounds(bounds: AiDlRasterBounds): AiDlRasterBounds {
  return {
    west: Math.min(bounds.west, bounds.east),
    east: Math.max(bounds.west, bounds.east),
    south: Math.min(bounds.south, bounds.north),
    north: Math.max(bounds.south, bounds.north),
  }
}

export function reprojectBoundsToWgs84(bounds: AiDlRasterBounds, sourceCrs: AiDlRasterCrs): AiDlRasterBounds {
  const b = normalizeBounds(bounds)
  if (sourceCrs === 'EPSG:4326') return b
  if (sourceCrs === 'EPSG:3857') return webMercatorToWgs84Bounds(b)
  try {
    const corners = [
      [b.west, b.south],
      [b.east, b.south],
      [b.east, b.north],
      [b.west, b.north],
    ] as [number, number][]
    const wgs = corners.map(([x, y]) => proj4(sourceCrs, 'EPSG:4326', [x, y]) as [number, number])
    const lngs = wgs.map(c => c[0])
    const lats = wgs.map(c => c[1])
    return {
      west: Math.min(...lngs),
      east: Math.max(...lngs),
      south: Math.min(...lats),
      north: Math.max(...lats),
    }
  } catch {
    return b
  }
}

export function reprojectBoundsToWebMercator(bounds: AiDlRasterBounds, sourceCrs: AiDlRasterCrs): AiDlRasterBounds {
  const wgs = sourceCrs === 'EPSG:4326' ? normalizeBounds(bounds) : reprojectBoundsToWgs84(bounds, sourceCrs)
  return wgs84ToWebMercatorBounds(wgs)
}

function rasterExtension(fileName: string): string {
  return (fileName.split('.').pop() || '').toLowerCase()
}

async function extractRasterBundleFromZip(zipFile: File): Promise<File[]> {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer())
  const out: File[] = []
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const name = path.split('/').pop() || path
    const ext = rasterExtension(name)
    if (
      !RASTER_DATA_EXTENSIONS.has(ext) &&
      !isWorldSidecarFile({ name } as File) &&
      !isAuxXmlSidecarFile({ name } as File) &&
      ext !== 'prj'
    ) {
      continue
    }
    const buf = await entry.async('arraybuffer')
    out.push(new File([buf], name))
  }
  if (!out.some(f => RASTER_DATA_EXTENSIONS.has(rasterExtension(f.name)))) {
    throw new Error('ZIP archive does not contain a GeoTIFF, PNG, or JPG raster.')
  }
  return out
}

function isImageExt(ext: string): boolean {
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
}

function isGeoTiffExt(ext: string): boolean {
  return ext === 'tif' || ext === 'tiff'
}

async function readImageSize(file: File): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file)
      const size = { width: bmp.width, height: bmp.height }
      bmp.close?.()
      if (size.width > 0 && size.height > 0) return size
    } catch {
      /* fall through */
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image is not readable or is corrupt.'))
    }
    img.src = url
  })
}

function findCompanionWorldFile(files: File[], imageFile: File): File | null {
  return findRasterSidecars(files, imageFile)?.worldFile ?? null
}

async function loadImageGeoref(
  imageFile: File,
  companionFiles: File[],
  widthPx: number,
  heightPx: number,
) {
  const sidecars = findRasterSidecars([imageFile, ...companionFiles], imageFile)
  if (!sidecars) throw new Error(MISSING_GEOREF_MESSAGE)

  const prjWkt = sidecars.prjFile ? await sidecars.prjFile.text() : null
  const worldFileText = sidecars.worldFile ? await sidecars.worldFile.text() : null
  const auxXmlText = sidecars.auxXmlFile ? await sidecars.auxXmlFile.text() : null
  return resolveGeorefFromSidecars({
    rasterFile: imageFile,
    companionFiles,
    widthPx,
    heightPx,
    worldFileText,
    auxXmlText,
    prjWkt,
  })
}

function buildValidationBase(
  format: string,
  widthPx: number,
  heightPx: number,
  bands: number,
  hasSpatialReference: boolean,
  sourceCrs: AiDlRasterCrs,
  errors: string[] = [],
  warnings: string[] = [],
): AiDlRasterValidationReport {
  return {
    format,
    readable: errors.length === 0,
    widthPx,
    heightPx,
    bands,
    noDataValues: [],
    hasSpatialReference,
    sourceCrs,
    targetCrs: 'EPSG:3857',
    errors,
    warnings,
  }
}

function finalizeProcessedRaster(input: {
  id: string
  label: string
  sourceKind: AiDlRasterSourceKind
  previewUrl: string
  bounds: AiDlRasterBounds
  sourceCrs: AiDlRasterCrs
  validation: AiDlRasterValidationReport
  stepsCompleted: AiDlRasterProcessingStep[]
  layerId?: string
  serviceUrl?: string
  coordinatesWgs84?: RasterMapCoordinates
}): AiDlProcessedRaster {
  const boundsWgs84 = input.coordinatesWgs84
    ? boundsFromLngLatCorners(input.coordinatesWgs84)
    : reprojectBoundsToWgs84(input.bounds, input.sourceCrs)
  const boundsWebMercator = reprojectBoundsToWebMercator(boundsWgs84, 'EPSG:4326')
  const coordinates = input.coordinatesWgs84 ?? mapboxCoordinatesFromWgs84Bounds(boundsWgs84)
  return {
    id: input.id,
    label: input.label,
    sourceKind: input.sourceKind,
    previewUrl: input.previewUrl,
    coordinates,
    boundsWgs84,
    boundsWebMercator,
    validation: input.validation,
    stepsCompleted: input.stepsCompleted,
    readyForInference: true,
    layerId: input.layerId,
    serviceUrl: input.serviceUrl,
  }
}

export async function inspectGeoTiff(file: File, companionFiles: File[] = []): Promise<{
  widthPx: number
  heightPx: number
  bands: number
  bounds: AiDlRasterBounds
  sourceCrs: AiDlRasterCrs
  coordinatesWgs84: RasterMapCoordinates
  noDataValues: number[]
  warnings: string[]
  hasEmbeddedGeoref: boolean
}> {
  const { fromArrayBuffer } = await import('geotiff')
  const tiff = await fromArrayBuffer(await file.arrayBuffer())
  const image = await tiff.getImage()
  const widthPx = image.getWidth()
  const heightPx = image.getHeight()
  const bands = image.getSamplesPerPixel()
  const warnings: string[] = []
  const noDataValues: number[] = []
  try {
    const nd = image.getGDALNoData?.()
    if (typeof nd === 'number' && Number.isFinite(nd)) noDataValues.push(nd)
  } catch {
    /* ignore */
  }

  const sidecars = findRasterSidecars([file, ...companionFiles], file)
  const hasEmbeddedGeoref = geoTiffHasEmbeddedGeoref(image)

  if (!hasEmbeddedGeoref && !sidecars) {
    throw new Error(MISSING_GEOTIFF_GEOREF_MESSAGE)
  }

  if (!hasEmbeddedGeoref && sidecars) {
    const prjWkt = sidecars.prjFile ? await sidecars.prjFile.text() : null
    const worldFileText = sidecars.worldFile ? await sidecars.worldFile.text() : null
    const auxXmlText = sidecars.auxXmlFile ? await sidecars.auxXmlFile.text() : null
    const georef = await resolveGeorefFromSidecars({
      rasterFile: file,
      companionFiles,
      widthPx,
      heightPx,
      worldFileText,
      auxXmlText,
      prjWkt,
    })
    return {
      widthPx,
      heightPx,
      bands,
      bounds: georef.boundsSource,
      sourceCrs: georef.sourceCrs,
      coordinatesWgs84: georef.coordinatesWgs84,
      noDataValues,
      warnings: ['GeoTIFF georeferencing read from world file sidecar.'],
      hasEmbeddedGeoref: false,
    }
  }

  const geoKeys = image.getGeoKeys?.() ?? {}
  let sourceCrs = resolveCrsFromGeoKeys(geoKeys)
  if (!sourceCrs) {
    const prjWkt = sidecars?.prjFile ? await sidecars.prjFile.text() : null
    if (prjWkt) {
      sourceCrs = parseEpsgFromPrjWkt(prjWkt)
      if (sourceCrs) warnings.push(`CRS from ${sidecars?.prjFile?.name} (${sourceCrs}).`)
    }
  }
  if (!sourceCrs) {
    const cornersSource = geoTiffCornersInSourceCrs(image, widthPx, heightPx)
    const probeBounds = {
      west: Math.min(...cornersSource.map(c => c[0])),
      east: Math.max(...cornersSource.map(c => c[0])),
      south: Math.min(...cornersSource.map(c => c[1])),
      north: Math.max(...cornersSource.map(c => c[1])),
    }
    sourceCrs = detectCrsFromBounds(probeBounds)
    warnings.push(`CRS inferred as ${sourceCrs} from GeoTIFF extent — add a .prj sidecar for exact CRS.`)
  }

  const cornersSource = geoTiffCornersInSourceCrs(image, widthPx, heightPx)
  const coordinatesWgs84 = mapboxCoordinatesFromSourceCorners(cornersSource, sourceCrs)
  const bounds = {
    west: Math.min(...cornersSource.map(c => c[0])),
    east: Math.max(...cornersSource.map(c => c[0])),
    south: Math.min(...cornersSource.map(c => c[1])),
    north: Math.max(...cornersSource.map(c => c[1])),
  }

  return {
    widthPx,
    heightPx,
    bands,
    bounds,
    sourceCrs,
    coordinatesWgs84,
    noDataValues,
    warnings,
    hasEmbeddedGeoref: true,
  }
}

export async function processGeoTiffFile(file: File, companionFiles: File[] = []): Promise<AiDlProcessedRaster> {
  const inspected = await inspectGeoTiff(file, companionFiles)
  const errors: string[] = []
  if (inspected.widthPx <= 0 || inspected.heightPx <= 0) errors.push('Raster has invalid dimensions.')
  if (inspected.bands <= 0) errors.push('Raster has no readable bands.')
  const validation = buildValidationBase(
    'GeoTIFF',
    inspected.widthPx,
    inspected.heightPx,
    inspected.bands,
    true,
    inspected.sourceCrs,
    errors,
    inspected.warnings,
  )
  validation.noDataValues = inspected.noDataValues
  if (errors.length) {
    throw new Error(errors.join(' '))
  }

  let previewUrl = ''
  try {
    const preview = await createMapboxReadyImageUrl(file)
    previewUrl = preview.url
    if (preview.downscaled) {
      validation.warnings.push(
        `Preview downscaled to ${preview.widthPx}×${preview.heightPx}px for map display (original ${inspected.widthPx}×${inspected.heightPx}px). Georeferencing unchanged.`,
      )
    }
  } catch {
    previewUrl = URL.createObjectURL(file)
    validation.warnings.push('GeoTIFF map preview fallback — georeferencing unchanged.')
  }

  return finalizeProcessedRaster({
    id: `ai-dl-raster-${Date.now()}`,
    label: file.name,
    sourceKind: 'geotiff',
    previewUrl,
    bounds: inspected.bounds,
    sourceCrs: inspected.sourceCrs,
    coordinatesWgs84: inspected.coordinatesWgs84,
    validation,
    stepsCompleted: ['validation', 'crs-detection', 'georeferencing', 'reprojection', 'normalization', 'map-ready'],
  })
}

export async function processImageWithViewportPlacement(
  file: File,
  mapBounds?: AiDlRasterBounds,
): Promise<AiDlProcessedRaster> {
  validateRasterImageFile(file)
  const { width, height } = await readImageSize(file)
  if (width <= 0 || height <= 0) throw new Error('Image has invalid dimensions.')
  const ext = rasterExtension(file.name)
  const bands = ['png', 'webp', 'gif'].includes(ext) ? 4 : 3
  const bounds = mapBounds ?? DEFAULT_RASTER_VIEWPORT_BOUNDS
  const coordinatesWgs84 = fitImageWithinWgs84Bounds(bounds, width, height)
  const boundsWgs84 = boundsFromLngLatCorners(coordinatesWgs84)
  const preview = await createMapboxReadyImageUrl(file)
  const validation = buildValidationBase(`Image (${ext.toUpperCase()})`, width, height, bands, false, 'EPSG:4326', [], [
    mapBounds
      ? 'No georeferencing sidecar — placed on current map view.'
      : 'No georeferencing sidecar — placed on default map extent.',
    ...(preview.downscaled
      ? [`Preview downscaled to ${preview.widthPx}×${preview.heightPx}px for map display.`]
      : []),
  ])
  return finalizeProcessedRaster({
    id: `ai-dl-raster-${Date.now()}`,
    label: file.name,
    sourceKind: 'image',
    previewUrl: preview.url,
    bounds: boundsWgs84,
    sourceCrs: 'EPSG:4326',
    coordinatesWgs84,
    validation,
    stepsCompleted: ['validation', 'viewport-placement', 'map-ready'],
  })
}

export async function processGeoreferencedImageFile(
  file: File,
  companionFiles: File[] = [],
): Promise<AiDlProcessedRaster> {
  validateRasterImageFile(file)
  const { width, height } = await readImageSize(file)
  const ext = rasterExtension(file.name)
  const bands = ext === 'png' ? 4 : 3
  const formatLabel = isGeoTiffExt(ext) ? 'GeoTIFF' : `Image (${ext.toUpperCase()})`
  const georef = await loadImageGeoref(file, companionFiles, width, height)
  const sidecars = findRasterSidecars([file, ...companionFiles], file)

  const validation = buildValidationBase(formatLabel, width, height, bands, true, georef.sourceCrs, [], [
    sidecars?.prjFile
      ? `CRS from ${sidecars.prjFile.name} (${georef.sourceCrs}).`
      : sidecars?.auxXmlFile
        ? `Georeferencing from ${sidecars.auxXmlFile.name} (${georef.sourceCrs}).`
        : sidecars?.worldFile
          ? `CRS inferred as ${georef.sourceCrs} from ${sidecars.worldFile.name}.`
          : `CRS inferred as ${georef.sourceCrs} from world file coordinates.`,
  ])

  const preview = await createMapboxReadyImageUrl(file)
  if (preview.downscaled) {
    validation.warnings.push(
      `Preview downscaled to ${preview.widthPx}×${preview.heightPx}px for map display (original ${width}×${height}px). Georeferencing unchanged.`,
    )
  }

  return finalizeProcessedRaster({
    id: `ai-dl-raster-${Date.now()}`,
    label: file.name,
    sourceKind: 'image',
    previewUrl: preview.url,
    bounds: georef.boundsSource,
    sourceCrs: georef.sourceCrs,
    coordinatesWgs84: georef.coordinatesWgs84,
    validation,
    stepsCompleted: ['validation', 'crs-detection', 'georeferencing', 'reprojection', 'normalization', 'map-ready'],
  })
}

/** @deprecated manual georeferencing is disabled — use sidecar world files + .prj */
export async function processImageFileWithGeoref(
  file: File,
  _georef: { bounds: AiDlRasterBounds; crs: AiDlRasterCrs },
  _worldFile?: WorldFileTransform | null,
): Promise<AiDlProcessedRaster> {
  return processGeoreferencedImageFile(file, [])
}

export async function prepareTiffRasterInput(
  file: File,
  companionFiles: File[] = [],
): Promise<AiDlProcessedRaster> {
  const ext = rasterExtension(file.name)
  if (!isGeoTiffExt(ext)) throw new Error('Unsupported TIFF format.')

  if (findRasterSidecars([file, ...companionFiles], file)) {
    let widthPx = 0
    let heightPx = 0
    try {
      const inspected = await inspectGeoTiff(file, companionFiles)
      widthPx = inspected.widthPx
      heightPx = inspected.heightPx
    } catch {
      const size = await readImageSize(file)
      widthPx = size.width
      heightPx = size.height
    }
    if (widthPx <= 0 || heightPx <= 0) throw new Error('TIFF has invalid dimensions.')
    return processGeoreferencedImageFile(file, companionFiles)
  }

  return processGeoTiffFile(file, companionFiles)
}

export async function prepareImageRasterInput(
  file: File,
  companionFiles: File[] = [],
): Promise<AiDlProcessedRaster> {
  const ext = rasterExtension(file.name)
  if (!isImageExt(ext)) throw new Error('Unsupported image format. Use PNG, JPG, WebP, GIF, or BMP.')
  if (!findRasterSidecars([file, ...companionFiles], file)) {
    throw new Error(MISSING_GEOREF_MESSAGE)
  }
  return processGeoreferencedImageFile(file, companionFiles)
}

export async function processRasterUrl(
  url: string,
  mapBounds?: AiDlRasterBounds,
): Promise<AiDlProcessedRaster> {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('Raster service URL is required.')

  const lower = trimmed.toLowerCase()
  const isImageService =
    lower.includes('/imageserver') || lower.includes('/mapserver') || lower.includes('{z}') || lower.includes('/tile/')

  if (isImageService) {
    const fallback = mapBounds ?? { west: -1, south: -1, east: 1, north: 1 }
    const validation = buildValidationBase('Raster Service URL', 0, 0, 3, true, 'EPSG:4326', [], [
      'Using remote raster service — local pixel validation skipped.',
    ])
    return finalizeProcessedRaster({
      id: `ai-dl-service-${Date.now()}`,
      label: trimmed.split('/').filter(Boolean).pop() || 'Raster Service',
      sourceKind: 'service-url',
      previewUrl: '',
      bounds: fallback,
      sourceCrs: 'EPSG:4326',
      validation,
      stepsCompleted: ['validation', 'crs-detection', 'map-ready'],
      serviceUrl: trimmed,
    })
  }

  const file = await parseRemoteUrlAsFile(trimmed)
  return processRasterFiles([file], mapBounds)
}

export async function processRasterFiles(
  files: File[],
  _mapBounds?: AiDlRasterBounds,
): Promise<AiDlProcessedRaster> {
  let bundle = files
  if (files.length === 1 && rasterExtension(files[0].name) === ZIP_EXTENSION) {
    bundle = await extractRasterBundleFromZip(files[0])
  }

  const rasterFile =
    bundle.find(f => isGeoTiffExt(rasterExtension(f.name)) || isImageExt(rasterExtension(f.name))) ??
    bundle.find(f => RASTER_DATA_EXTENSIONS.has(rasterExtension(f.name))) ??
    bundle[0]
  if (!rasterFile) throw new Error('No raster file selected.')

  const ext = rasterExtension(rasterFile.name)
  if (isGeoTiffExt(ext)) return prepareTiffRasterInput(rasterFile, bundle)
  if (isImageExt(ext)) return prepareImageRasterInput(rasterFile, bundle)
  if (RASTER_DATA_EXTENSIONS.has(ext)) return prepareImageRasterInput(rasterFile, bundle)
  throw new Error('Unsupported raster format. Use GeoTIFF, PNG, JPG, WebP, GIF, or BMP.')
}

export function processExistingMapLayer(input: {
  layerId: string
  label: string
  previewUrl?: string
  coordinates?: RasterMapCoordinates
  serviceUrl?: string
}): AiDlProcessedRaster {
  if (!input.coordinates && !input.serviceUrl) {
    throw new Error('Selected map layer has no raster extent or service URL.')
  }
  const bounds = input.coordinates
    ? normalizeBounds({
        west: Math.min(...input.coordinates.map(c => c[0])),
        south: Math.min(...input.coordinates.map(c => c[1])),
        east: Math.max(...input.coordinates.map(c => c[0])),
        north: Math.max(...input.coordinates.map(c => c[1])),
      })
    : { west: -1, south: -1, east: 1, north: 1 }
  const sourceCrs = detectCrsFromBounds(bounds)
  const validation = buildValidationBase(
    input.serviceUrl ? 'Map Raster Service' : 'Map Raster Layer',
    0,
    0,
    3,
    true,
    sourceCrs,
    [],
    ['Using existing map layer — on-disk validation skipped.'],
  )
  return finalizeProcessedRaster({
    id: `ai-dl-layer-${input.layerId}`,
    label: input.label,
    sourceKind: 'map-layer',
    previewUrl: input.previewUrl ?? '',
    bounds,
    sourceCrs,
    validation,
    stepsCompleted: ['validation', 'crs-detection', 'reprojection', 'map-ready'],
    layerId: input.layerId,
    serviceUrl: input.serviceUrl,
  })
}

export function rasterFootprintGeoJson(bounds: AiDlRasterBounds) {
  const b = normalizeBounds(bounds)
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'raster_extent' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [b.west, b.south],
              [b.east, b.south],
              [b.east, b.north],
              [b.west, b.north],
              [b.west, b.south],
            ],
          ],
        },
      },
    ],
  }
}

export { footprintGeoJsonFromMapCoordinates } from '../raster/siRasterMapLayer'
