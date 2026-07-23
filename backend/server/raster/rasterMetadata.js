/**
 * Read GeoTIFF metadata via GDAL gdalinfo when available, else geotiff.js.
 */
import { spawn } from 'child_process'
import fs from 'fs'
import { fromFile } from 'geotiff'
import { reproject } from './projectionManager.js'

function runCmd(cmd, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${cmd} timed out`))
    }, timeoutMs)
    child.stdout.on('data', d => {
      stdout += d.toString()
    })
    child.stderr.on('data', d => {
      stderr += d.toString()
    })
    child.on('error', err => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr || `${cmd} exited ${code}`))
    })
  })
}

export async function hasGdal() {
  try {
    await runCmd('gdalinfo', ['--version'], 8_000)
    return true
  } catch {
    return false
  }
}

function resolveEpsgFromGeoKeys(geoKeys) {
  const projected = geoKeys?.ProjectedCSTypeGeoKey
  if (typeof projected === 'number' && projected > 0 && projected !== 32767) return `EPSG:${projected}`
  const geographic = geoKeys?.GeographicTypeGeoKey
  if (typeof geographic === 'number' && geographic > 0 && geographic !== 32767) return `EPSG:${geographic}`
  return null
}

function detectCrsFromBounds(west, south, east, north) {
  const spanX = Math.abs(east - west)
  const spanY = Math.abs(north - south)
  const maxAbsX = Math.max(Math.abs(west), Math.abs(east))
  const maxAbsY = Math.max(Math.abs(south), Math.abs(north))
  if (maxAbsX > 1_000_000 && maxAbsY > 1_000_000) return 'EPSG:3857'
  if (west >= -180 && east <= 180 && south >= -90 && north <= 90 && spanX <= 360 && spanY <= 180) {
    return 'EPSG:4326'
  }
  return null
}

function reprojectPoint(x, y, sourceCrs) {
  try {
    return reproject(sourceCrs, 'EPSG:4326', [x, y])
  } catch (err) {
    throw new Error(
      `Cannot reproject from ${sourceCrs} to WGS84 — ${err?.message || 'unknown coordinate system'}`,
    )
  }
}

function cornersToWgs84(corners, sourceCrs) {
  return corners.map(([x, y]) => reprojectPoint(x, y, sourceCrs))
}

function footprintFromCorners(wgsCorners) {
  const ring = [...wgsCorners.map(([lng, lat]) => [lng, lat]), [wgsCorners[0][0], wgsCorners[0][1]]]
  const lngs = wgsCorners.map(c => c[0])
  const lats = wgsCorners.map(c => c[1])
  return {
    bboxWgs84: {
      west: Math.min(...lngs),
      east: Math.max(...lngs),
      south: Math.min(...lats),
      north: Math.max(...lats),
    },
    footprint: {
      type: 'Feature',
      properties: { kind: 'raster_extent' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    },
  }
}

function parseGdalMetadataTags(info) {
  const meta = info?.metadata?.[''] || info?.metadata || {}
  const acquisitionDate =
    meta.ACQUISITION_DATE || meta.acquisition_date || meta.TIFFTAG_DATETIME || meta.DATE || null
  const sensor = meta.SENSOR || meta.SENSOR_NAME || meta.INSTRUMENT || meta.PLATFORM || null
  return { acquisitionDate, sensor }
}

export async function readRasterMetadataWithGdal(filePath) {
  const { stdout } = await runCmd('gdalinfo', ['-json', filePath])
  const info = JSON.parse(stdout)
  const wkt = info.coordinateSystem?.wkt || ''
  const auth = info.coordinateSystem?.dataAxisToSRSAxisMapping
  let crs =
    (info.stac?.proj?.epsg && `EPSG:${info.stac.proj.epsg}`) ||
    (info.coordinateSystem?.projjson?.id?.code
      ? `EPSG:${info.coordinateSystem.projjson.id.code}`
      : null)
  if (!crs && /AUTHORITY\["EPSG","(\d+)"\]/i.test(wkt)) {
    crs = `EPSG:${RegExp.$1}`
  }
  const corners = (info.cornerCoordinates
    ? [
        info.cornerCoordinates.upperLeft,
        info.cornerCoordinates.upperRight,
        info.cornerCoordinates.lowerRight,
        info.cornerCoordinates.lowerLeft,
      ]
    : []
  ).filter(c => Array.isArray(c) && c.length >= 2)
  if (!crs && corners.length === 4) {
    crs = detectCrsFromBounds(corners[0][0], corners[3][1], corners[1][0], corners[0][1])
  }
  if (!crs) {
    throw new Error(
      'Cannot determine CRS from GeoTIFF. Embed EPSG GeoKeys or provide a .prj sidecar and re-upload.',
    )
  }
  if (corners.length < 4) {
    throw new Error('GeoTIFF has no georeferencing (missing corner coordinates).')
  }
  const wgsCorners = cornersToWgs84(corners, crs)
  const { bboxWgs84, footprint } = footprintFromCorners(wgsCorners)
  const size = info.size || [0, 0]
  const geoTransform = info.geoTransform || []
  const pixelSizeX = Math.abs(geoTransform[1] || 0)
  const pixelSizeY = Math.abs(geoTransform[5] || 0)
  let resolutionMeters = null
  if (crs === 'EPSG:4326') {
    const midLat = (bboxWgs84.south + bboxWgs84.north) / 2
    const mPerDeg = 111_320 * Math.cos((midLat * Math.PI) / 180)
    resolutionMeters = pixelSizeX * mPerDeg
  } else {
    resolutionMeters = pixelSizeX || pixelSizeY || null
  }
  const { acquisitionDate, sensor } = parseGdalMetadataTags(info)
  return {
    crs,
    bboxWgs84,
    footprint,
    widthPx: size[0] || null,
    heightPx: size[1] || null,
    bands: Array.isArray(info.bands) ? info.bands.length : null,
    resolutionMeters,
    acquisitionDate,
    sensor,
    driver: info.driverShortName || null,
    isCog: Boolean(info.metadata?.IMAGE_STRUCTURE?.LAYOUT === 'COG' || /COG/i.test(String(info.metadata?.IMAGE_STRUCTURE?.LAYOUT || ''))),
  }
}

export async function readRasterMetadataWithGeotiff(filePath) {
  const tiff = await fromFile(filePath)
  const image = await tiff.getImage()
  const widthPx = image.getWidth()
  const heightPx = image.getHeight()
  const bands = image.getSamplesPerPixel()
  const geoKeys = image.getGeoKeys?.() || {}
  let crs = resolveEpsgFromGeoKeys(geoKeys)
  const bbox = image.getBoundingBox?.()
  const [w, s, e, n] = bbox || [0, 0, 0, 0]
  if (!crs) crs = detectCrsFromBounds(w, s, e, n)
  if (!crs) {
    throw new Error(
      'Cannot determine CRS from GeoTIFF. Embed EPSG GeoKeys or provide a .prj sidecar and re-upload.',
    )
  }
  const origin = image.getOrigin?.() || [w, n]
  const res = image.getResolution?.() || [Math.abs(e - w) / widthPx, -Math.abs(n - s) / heightPx]
  const pixelSizeX = Math.abs(res[0] || 0)
  const pixelSizeY = Math.abs(res[1] || 0)
  // Pixel-edge corners (area convention)
  const cornersSource = [
    [origin[0], origin[1]],
    [origin[0] + widthPx * res[0], origin[1]],
    [origin[0] + widthPx * res[0], origin[1] + heightPx * res[1]],
    [origin[0], origin[1] + heightPx * res[1]],
  ]
  const wgsCorners = cornersToWgs84(cornersSource, crs)
  const { bboxWgs84, footprint } = footprintFromCorners(wgsCorners)
  let resolutionMeters = null
  if (crs === 'EPSG:4326') {
    const midLat = (bboxWgs84.south + bboxWgs84.north) / 2
    const mPerDeg = 111_320 * Math.cos((midLat * Math.PI) / 180)
    resolutionMeters = pixelSizeX * mPerDeg
  } else {
    resolutionMeters = pixelSizeX || pixelSizeY || null
  }
  const fd = image.getFileDirectory?.() || {}
  const acquisitionDate = fd.DateTime || fd.TIFFTAG_DATETIME || null
  return {
    crs,
    bboxWgs84,
    footprint,
    widthPx,
    heightPx,
    bands,
    resolutionMeters,
    acquisitionDate,
    sensor: null,
    driver: 'GTiff',
    isCog: Boolean(image.fileDirectory?.TileOffsets?.length),
  }
}

export async function readRasterMetadata(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Raster file not found: ${filePath}`)
  if (await hasGdal()) {
    try {
      return await readRasterMetadataWithGdal(filePath)
    } catch (err) {
      console.warn('[raster] gdalinfo failed, falling back to geotiff.js:', err.message)
    }
  }
  return readRasterMetadataWithGeotiff(filePath)
}

/**
 * Read the four raster corners in the file's NATIVE (source) coordinates — independent of
 * which CRS we think it is. Used by the assign-CRS flow to recompute the WGS84 footprint
 * against a user-picked/overridden coordinate system.
 * @returns {{ corners:number[][], widthPx:number|null, heightPx:number|null, pixelSizeX:number, pixelSizeY:number }}
 */
export async function readRasterSourceCorners(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Raster file not found: ${filePath}`)
  if (await hasGdal()) {
    try {
      const { stdout } = await runCmd('gdalinfo', ['-json', filePath])
      const info = JSON.parse(stdout)
      const c = info.cornerCoordinates
      const corners = (c ? [c.upperLeft, c.upperRight, c.lowerRight, c.lowerLeft] : []).filter(
        p => Array.isArray(p) && p.length >= 2,
      )
      if (corners.length === 4) {
        const size = info.size || [0, 0]
        const gt = info.geoTransform || []
        return {
          corners,
          widthPx: size[0] || null,
          heightPx: size[1] || null,
          pixelSizeX: Math.abs(gt[1] || 0),
          pixelSizeY: Math.abs(gt[5] || 0),
        }
      }
    } catch (err) {
      console.warn('[raster] gdalinfo corner read failed, falling back to geotiff.js:', err.message)
    }
  }
  const tiff = await fromFile(filePath)
  const image = await tiff.getImage()
  const widthPx = image.getWidth()
  const heightPx = image.getHeight()
  const origin = image.getOrigin?.()
  const res = image.getResolution?.()
  if (!origin || !res) throw new Error('Raster has no georeferencing (missing origin/resolution).')
  const corners = [
    [origin[0], origin[1]],
    [origin[0] + widthPx * res[0], origin[1]],
    [origin[0] + widthPx * res[0], origin[1] + heightPx * res[1]],
    [origin[0], origin[1] + heightPx * res[1]],
  ]
  return {
    corners,
    widthPx,
    heightPx,
    pixelSizeX: Math.abs(res[0] || 0),
    pixelSizeY: Math.abs(res[1] || 0),
  }
}

/**
 * Reproject native-CRS corners into WGS84 and build the extent bbox + footprint for a
 * chosen CRS. Also returns an approximate ground resolution in metres.
 * @returns {{ crs:string, bboxWgs84:object, footprint:object, resolutionMeters:number|null }}
 */
export function footprintForCrs(corners, crs, pixelSizeX = 0, pixelSizeY = 0) {
  const wgsCorners = cornersToWgs84(corners, crs)
  const { bboxWgs84, footprint } = footprintFromCorners(wgsCorners)
  let resolutionMeters = null
  if (crs === 'EPSG:4326') {
    const midLat = (bboxWgs84.south + bboxWgs84.north) / 2
    const mPerDeg = 111_320 * Math.cos((midLat * Math.PI) / 180)
    resolutionMeters = pixelSizeX * mPerDeg || null
  } else {
    resolutionMeters = pixelSizeX || pixelSizeY || null
  }
  return { crs, bboxWgs84, footprint, resolutionMeters }
}
