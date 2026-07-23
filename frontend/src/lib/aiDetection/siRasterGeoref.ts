import proj4 from 'proj4'
import type { RasterMapCoordinates } from '../../utils/FileLoader'

export type AiDlRasterBounds = {
  west: number
  south: number
  east: number
  north: number
}

export type WorldFileTransform = {
  pixelSizeX: number
  rotationY: number
  rotationX: number
  pixelSizeY: number
  upperLeftX: number
  upperLeftY: number
}

const WORLD_FILE_EXTENSIONS = new Set([
  'pgw',
  'pngw',
  'jgw',
  'jpgw',
  'jpegw',
  'tfw',
  'tifw',
  'wld',
  'gfw',
])

export function parseWorldFile(content: string): WorldFileTransform | null {
  const lines = content
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
  if (lines.length < 6) return null
  const nums = lines.slice(0, 6).map(Number)
  if (nums.some(n => !Number.isFinite(n))) return null
  return {
    pixelSizeX: nums[0],
    rotationY: nums[1],
    rotationX: nums[2],
    pixelSizeY: nums[3],
    upperLeftX: nums[4],
    upperLeftY: nums[5],
  }
}

const GEOKEY_USER_DEFINED = 32767

/** Reject world files that cannot produce a valid geographic footprint. */
export function validateWorldFileTransform(
  worldFile: WorldFileTransform,
  widthPx: number,
  heightPx: number,
): void {
  if (widthPx <= 0 || heightPx <= 0) {
    throw new Error('Raster has invalid dimensions.')
  }
  const values = [
    worldFile.pixelSizeX,
    worldFile.pixelSizeY,
    worldFile.rotationX,
    worldFile.rotationY,
    worldFile.upperLeftX,
    worldFile.upperLeftY,
  ]
  if (values.some(v => !Number.isFinite(v))) {
    throw new Error('World file contains non-finite values — georeferencing is incomplete.')
  }
  if (Math.abs(worldFile.pixelSizeX) < 1e-12 && Math.abs(worldFile.rotationX) < 1e-12) {
    throw new Error('World file has zero X pixel scale — cannot compute geographic extent.')
  }
  if (Math.abs(worldFile.pixelSizeY) < 1e-12 && Math.abs(worldFile.rotationY) < 1e-12) {
    throw new Error('World file has zero Y pixel scale — cannot compute geographic extent.')
  }

  const corners = imageCornersInSourceCrs(worldFile, widthPx, heightPx)
  if (corners.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new Error('World file produces non-finite geographic coordinates.')
  }

  const bounds = boundsFromWorldFile(worldFile, widthPx, heightPx)
  const spanX = Math.abs(bounds.east - bounds.west)
  const spanY = Math.abs(bounds.north - bounds.south)
  if (spanX <= 0 || spanY <= 0) {
    throw new Error('World file produces a degenerate geographic extent (zero width or height).')
  }
}

export function boundsFromWorldFile(
  worldFile: WorldFileTransform,
  widthPx: number,
  heightPx: number,
): AiDlRasterBounds {
  const corners = imageCornersInSourceCrs(worldFile, widthPx, heightPx)
  const xs = corners.map(c => c[0])
  const ys = corners.map(c => c[1])
  return {
    west: Math.min(...xs),
    east: Math.max(...xs),
    south: Math.min(...ys),
    north: Math.max(...ys),
  }
}

export type RasterSidecarFiles = {
  worldFile: File | null
  auxXmlFile: File | null
  prjFile: File | null
}

export function rasterFileStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').toLowerCase()
}

export function isAuxXmlSidecarFile(file: File): boolean {
  return /\.aux\.xml$/i.test(file.name)
}

/** Stem used to pair sidecars with a raster (handles `image.jpg.aux.xml`). */
export function rasterSidecarMatchKey(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.aux.xml')) return lower.slice(0, -'.aux.xml'.length)
  return rasterFileStem(fileName)
}

export function rasterFileExtension(fileName: string): string {
  return (fileName.split('.').pop() || '').toLowerCase()
}

export function isWorldSidecarFile(file: File): boolean {
  return WORLD_FILE_EXTENSIONS.has(rasterFileExtension(file.name))
}

export function isPrjSidecarFile(file: File): boolean {
  return rasterFileExtension(file.name) === 'prj'
}

/** Extract the most specific EPSG code from an ESRI .prj WKT string. */
export function parseEpsgFromPrjWkt(wkt: string): string | null {
  const trimmed = wkt.trim()
  if (!trimmed) return null

  const authorityMatches = [...trimmed.matchAll(/AUTHORITY\["EPSG","(\d+)"\]/gi)]
  if (authorityMatches.length) {
    const code = authorityMatches[authorityMatches.length - 1]?.[1]
    return code ? `EPSG:${code}` : null
  }

  if (/PROJCS\["WGS_1984_Web_Mercator/i.test(trimmed) || /Pseudo-Mercator/i.test(trimmed)) {
    return 'EPSG:3857'
  }
  if (/GEOGCS\["GCS_WGS_1984"|GEOGCS\["WGS 84"/i.test(trimmed)) {
    return 'EPSG:4326'
  }

  const utm = trimmed.match(/UTM[_ ]Zone[_ ]?(\d{1,2})([NS])/i)
  if (utm) {
    const zone = Number(utm[1])
    const north = utm[2].toUpperCase() === 'N'
    if (zone >= 1 && zone <= 60) return `EPSG:${north ? 32600 + zone : 32700 + zone}`
  }

  return null
}

export function parseGeotransformFromAuxXml(content: string): WorldFileTransform | null {
  const match = content.match(/<GeoTransform>\s*([^<]+)\s*<\/GeoTransform>/i)
  if (!match?.[1]) return null
  const nums = match[1]
    .split(',')
    .map(v => Number(v.trim()))
    .filter(n => Number.isFinite(n))
  if (nums.length < 6) return null
  const [gt0, gt1, gt2, gt3, gt4, gt5] = nums
  return {
    pixelSizeX: gt1,
    rotationY: gt4,
    rotationX: gt2,
    pixelSizeY: gt5,
    upperLeftX: gt0 + 0.5 * gt1 + 0.5 * gt2,
    upperLeftY: gt3 + 0.5 * gt4 + 0.5 * gt5,
  }
}

export function parsePrjWktFromAuxXml(content: string): string | null {
  const srsMatch = content.match(/<SRS[^>]*>([^<]+)<\/SRS>/i)
  return srsMatch?.[1]?.trim() || null
}

export function findRasterSidecars(files: File[], rasterFile: File): RasterSidecarFiles | null {
  const stem = rasterFileStem(rasterFile.name)
  const rasterKey = rasterSidecarMatchKey(rasterFile.name)
  const preferredWorldExt = (() => {
    const ext = rasterFileExtension(rasterFile.name)
    if (ext === 'png') return 'pgw'
    if (ext === 'jpg' || ext === 'jpeg') return 'jgw'
    if (ext === 'tif' || ext === 'tiff') return 'tfw'
    return null
  })()

  const worldCandidates = files.filter(f => {
    if (f === rasterFile) return false
    if (!isWorldSidecarFile(f)) return false
    const sidecarStem = rasterFileStem(f.name)
    return sidecarStem === stem || rasterSidecarMatchKey(f.name) === rasterKey
  })

  const pickWorldFile = (candidates: File[]): File | null => {
    if (!candidates.length) return null
    if (preferredWorldExt) {
      const preferred = candidates.filter(
        f =>
          rasterFileExtension(f.name) === preferredWorldExt ||
          rasterFileExtension(f.name) === `${preferredWorldExt.slice(0, -1)}w`,
      )
      if (preferred.length >= 1) return preferred[0]
    }
    return candidates[0]
  }

  let worldFile = pickWorldFile(worldCandidates)

  if (!worldFile) {
    const looseWorldCandidates = files.filter(f => f !== rasterFile && isWorldSidecarFile(f))
    if (looseWorldCandidates.length === 1) {
      worldFile = looseWorldCandidates[0]
    } else if (looseWorldCandidates.length > 1) {
      worldFile = pickWorldFile(looseWorldCandidates)
    }
  }

  const auxCandidates = files.filter(f => {
    if (f === rasterFile) return false
    if (!isAuxXmlSidecarFile(f)) return false
    return rasterSidecarMatchKey(f.name) === rasterFile.name.toLowerCase()
  })
  const auxXmlFile = auxCandidates.length === 1 ? auxCandidates[0] : auxCandidates[0] ?? null

  if (!worldFile && !auxXmlFile) return null

  const prjCandidates = files.filter(f => f !== rasterFile && isPrjSidecarFile(f))
  const prjFile =
    prjCandidates.find(f => rasterFileStem(f.name) === stem) ??
    (prjCandidates.length === 1 ? prjCandidates[0] : null)

  return { worldFile, auxXmlFile, prjFile }
}

/** Map pixel column/row (center-of-pixel convention) to source CRS coordinates. */
export function sourceCoordFromWorldFile(
  worldFile: WorldFileTransform,
  col: number,
  row: number,
): [number, number] {
  const x = worldFile.upperLeftX + col * worldFile.pixelSizeX + row * worldFile.rotationX
  const y = worldFile.upperLeftY + col * worldFile.rotationY + row * worldFile.pixelSizeY
  return [x, y]
}

/** Four image corners in source CRS (ESRI world-file center-of-pixel convention). */
export function imageCornersInSourceCrs(
  worldFile: WorldFileTransform,
  widthPx: number,
  heightPx: number,
): [number, number][] {
  return [
    sourceCoordFromWorldFile(worldFile, -0.5, -0.5),
    sourceCoordFromWorldFile(worldFile, widthPx - 0.5, -0.5),
    sourceCoordFromWorldFile(worldFile, widthPx - 0.5, heightPx - 0.5),
    sourceCoordFromWorldFile(worldFile, -0.5, heightPx - 0.5),
  ]
}

export function boundsFromLngLatCorners(corners: RasterMapCoordinates): AiDlRasterBounds {
  const lngs = corners.map(c => c[0])
  const lats = corners.map(c => c[1])
  return {
    west: Math.min(...lngs),
    east: Math.max(...lngs),
    south: Math.min(...lats),
    north: Math.max(...lats),
  }
}

export function resolveSourceCrs(worldFile: WorldFileTransform, prjWkt?: string | null): string {
  if (prjWkt) {
    const fromPrj = parseEpsgFromPrjWkt(prjWkt)
    if (fromPrj) {
      if (!proj4.defs(fromPrj)) {
        try {
          proj4.defs(fromPrj, prjWkt)
        } catch {
          /* use built-in EPSG definition when available */
        }
      }
      return fromPrj
    }
    try {
      const defName = `RASTER_PRJ_${Math.abs(hashCode(prjWkt))}`
      if (!proj4.defs(defName)) proj4.defs(defName, prjWkt)
      return defName
    } catch {
      /* fall through */
    }
  }

  const probe = imageCornersInSourceCrs(worldFile, 100, 100)
  const xs = probe.map(c => c[0])
  const ys = probe.map(c => c[1])
  const maxAbsX = Math.max(...xs.map(Math.abs))
  const maxAbsY = Math.max(...ys.map(Math.abs))
  if (maxAbsX > 1_000_000 && maxAbsY > 1_000_000) {
    return 'EPSG:3857'
  }
  if (
    Math.min(...xs) >= -180 &&
    Math.max(...xs) <= 180 &&
    Math.min(...ys) >= -90 &&
    Math.max(...ys) <= 90
  ) {
    return 'EPSG:4326'
  }
  throw new Error(
    'World file coordinates are not WGS84 or Web Mercator. Add a matching .prj (EPSG) sidecar so the imagery can be placed accurately.',
  )
}

export function reprojectToWgs84(x: number, y: number, sourceCrs: string): [number, number] {
  if (sourceCrs === 'EPSG:4326') return [x, y]
  try {
    const out = proj4(sourceCrs, 'EPSG:4326', [x, y]) as [number, number]
    if (!Number.isFinite(out[0]) || !Number.isFinite(out[1])) throw new Error('non-finite')
    return out
  } catch {
    throw new Error(`Could not reproject coordinates from ${sourceCrs} to EPSG:4326.`)
  }
}

export function mapboxCoordinatesFromSourceCorners(
  corners: [number, number][],
  sourceCrs: string,
): RasterMapCoordinates {
  const wgsCorners = corners.map(([x, y]) => reprojectToWgs84(x, y, sourceCrs))
  return [
    [wgsCorners[0][0], wgsCorners[0][1]],
    [wgsCorners[1][0], wgsCorners[1][1]],
    [wgsCorners[2][0], wgsCorners[2][1]],
    [wgsCorners[3][0], wgsCorners[3][1]],
  ]
}

export type GeoTiffImageLike = {
  getFileDirectory: () => {
    ModelTransformation?: number[]
    ModelTiepoint?: number[]
    ModelPixelScale?: number[]
  }
  getOrigin: () => number[]
  getResolution: () => number[]
  getGeoKeys: () => Record<string, number | string>
  pixelIsArea: () => boolean
}

export function geoTiffHasEmbeddedGeoref(image: GeoTiffImageLike): boolean {
  const fd = image.getFileDirectory()
  if (fd.ModelTransformation && fd.ModelTransformation.length >= 16) return true
  return !!(fd.ModelTiepoint && fd.ModelTiepoint.length >= 6 && fd.ModelPixelScale)
}

/** Map pixel column/row to source CRS using embedded GeoTIFF affine tags. */
export function geoTiffPixelToSourceCoord(image: GeoTiffImageLike, col: number, row: number): [number, number] {
  const fd = image.getFileDirectory()
  const mt = fd.ModelTransformation
  if (mt && mt.length >= 16) {
    return [mt[3] + mt[0] * col + mt[1] * row, mt[7] + mt[4] * col + mt[5] * row]
  }
  if (fd.ModelTiepoint && fd.ModelPixelScale) {
    const origin = image.getOrigin()
    const resolution = image.getResolution()
    return [origin[0] + col * resolution[0], origin[1] + row * resolution[1]]
  }
  throw new Error(
    'GeoTIFF has no embedded georeferencing (ModelTransformation, ModelTiepoint, or ModelPixelScale).',
  )
}

/** Four image corners in source CRS using GeoTIFF affine transform (supports rotation). */
export function geoTiffCornersInSourceCrs(
  image: GeoTiffImageLike,
  widthPx: number,
  heightPx: number,
): [number, number][] {
  const half = image.pixelIsArea() ? 0 : 0.5
  return [
    geoTiffPixelToSourceCoord(image, -half, -half),
    geoTiffPixelToSourceCoord(image, widthPx - half, -half),
    geoTiffPixelToSourceCoord(image, widthPx - half, heightPx - half),
    geoTiffPixelToSourceCoord(image, -half, heightPx - half),
  ]
}

export function resolveCrsFromGeoKeys(geoKeys: Record<string, number | string>): string | null {
  const projected = geoKeys.ProjectedCSTypeGeoKey
  if (typeof projected === 'number' && projected > 0 && projected !== GEOKEY_USER_DEFINED) {
    return `EPSG:${projected}`
  }
  const geographic = geoKeys.GeographicTypeGeoKey
  if (typeof geographic === 'number' && geographic > 0 && geographic !== GEOKEY_USER_DEFINED) {
    return `EPSG:${geographic}`
  }
  return null
}

export async function resolveGeorefFromSidecars(input: {
  rasterFile: File
  companionFiles: File[]
  widthPx: number
  heightPx: number
  worldFileText?: string | null
  auxXmlText?: string | null
  prjWkt?: string | null
}): Promise<{
  sourceCrs: string
  worldFile: WorldFileTransform
  boundsSource: AiDlRasterBounds
  coordinatesWgs84: RasterMapCoordinates
  boundsWgs84: AiDlRasterBounds
}> {
  let worldFile: WorldFileTransform | null = null
  if (input.worldFileText) {
    worldFile = parseWorldFile(input.worldFileText)
  }
  if (!worldFile && input.auxXmlText) {
    worldFile = parseGeotransformFromAuxXml(input.auxXmlText)
  }
  if (!worldFile) {
    throw new Error('Invalid georeferencing sidecar — expected a world file or GDAL .aux.xml GeoTransform.')
  }
  validateWorldFileTransform(worldFile, input.widthPx, input.heightPx)

  const prjFromAux = input.auxXmlText ? parsePrjWktFromAuxXml(input.auxXmlText) : null
  const sourceCrs = resolveSourceCrs(worldFile, input.prjWkt ?? prjFromAux)
  const cornersSource = imageCornersInSourceCrs(worldFile, input.widthPx, input.heightPx)
  const coordinatesWgs84 = mapboxCoordinatesFromSourceCorners(cornersSource, sourceCrs)
  const boundsWgs84 = boundsFromLngLatCorners(coordinatesWgs84)
  const boundsSource = boundsFromWorldFile(worldFile, input.widthPx, input.heightPx)

  return {
    sourceCrs,
    worldFile,
    boundsSource,
    coordinatesWgs84,
    boundsWgs84,
  }
}

function hashCode(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}
