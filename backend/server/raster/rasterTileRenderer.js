/**
 * XYZ tile renderer (EPSG:3857) for uploaded GeoTIFF/COG using geotiff.js + ProjectionManager.
 * Used when TiTiler is not configured; TiTiler is preferred when TITILER_URL is set.
 */
import fs from 'fs'
import path from 'path'
import { fromFile } from 'geotiff'
import { PNG } from 'pngjs'
import { reproject } from './projectionManager.js'
import { RASTER_TILE_CACHE_ROOT } from './rasterStore.js'

const TILE = 256
const WEB_MERCATOR_HALF = 20037508.342789244
const tiffCache = new Map()

function tileToMercatorBbox(z, x, y) {
  const n = 2 ** z
  const mercX = lon => (lon * WEB_MERCATOR_HALF) / 180
  const mercY = lat => {
    const latRad = (lat * Math.PI) / 180
    return (WEB_MERCATOR_HALF * Math.log(Math.tan(Math.PI / 4 + latRad / 2))) / Math.PI
  }
  const west = (x / n) * 360 - 180
  const east = ((x + 1) / n) * 360 - 180
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI
  return [mercX(west), mercY(south), mercX(east), mercY(north)]
}

function mercToLngLat(x, y) {
  const lng = (x / WEB_MERCATOR_HALF) * 180
  const latRad = Math.atan(Math.sinh((y / WEB_MERCATOR_HALF) * Math.PI))
  return [lng, (latRad * 180) / Math.PI]
}

function toSource(lng, lat, sourceCrs) {
  // Map WGS84 lon/lat into the raster's native CRS (any EPSG, via ProjectionManager).
  return reproject('EPSG:4326', sourceCrs, [lng, lat])
}

async function loadTiff(filePath) {
  let entry = tiffCache.get(filePath)
  if (entry) return entry
  const tiff = await fromFile(filePath)
  const image = await tiff.getImage()
  entry = { tiff, image }
  tiffCache.set(filePath, entry)
  if (tiffCache.size > 24) {
    const oldest = tiffCache.keys().next().value
    tiffCache.delete(oldest)
  }
  return entry
}

/**
 * Encode interleaved raster samples to an RGBA PNG.
 * @param {number} channels stride of `data` (1 = grayscale, 3 = RGB, >=4 = RGB(+extra))
 * @param {{ noData?: number|null, alphaChannel?: number }} opts
 *   noData -> pixels equal to this value become transparent (fixes black borders);
 *   alphaChannel -> index within the stride to use as alpha (RGBA rasters).
 */
function stretchRgb(data, tw, th, channels, opts = {}) {
  const noData = Number.isFinite(opts.noData) ? Number(opts.noData) : null
  const alphaChannel = Number.isInteger(opts.alphaChannel) ? opts.alphaChannel : -1
  const png = new PNG({ width: tw, height: th })
  const out = png.data
  const npx = tw * th
  if (channels >= 3 && data.length >= npx * channels) {
    // Gain from RGB channels only (ignore alpha / extra bands).
    let mx = 1e-9
    for (let i = 0; i < npx; i++) {
      const o = i * channels
      for (let c = 0; c < 3; c++) {
        const v = Math.abs(Number(data[o + c]))
        if (Number.isFinite(v) && v > mx) mx = v
      }
    }
    const gain = mx > 255 ? 255 / mx : 1
    for (let i = 0; i < npx; i++) {
      const o = i * channels
      const p = i * 4
      const r = Number(data[o])
      const g = Number(data[o + 1])
      const b = Number(data[o + 2])
      out[p] = clamp255(r * gain)
      out[p + 1] = clamp255(g * gain)
      out[p + 2] = clamp255(b * gain)
      let a = 255
      if (alphaChannel >= 0 && channels > alphaChannel) a = clamp255(Number(data[o + alphaChannel]))
      if (!Number.isFinite(r) && !Number.isFinite(g) && !Number.isFinite(b)) a = 0
      else if (noData != null && r === noData && g === noData && b === noData) a = 0
      out[p + 3] = a
    }
  } else {
    const flat = data
    let mn = Infinity
    let mx = -Infinity
    for (const v of flat) {
      if (!Number.isFinite(v) || (noData != null && v === noData)) continue
      if (v < mn) mn = v
      if (v > mx) mx = v
    }
    if (!Number.isFinite(mn) || !Number.isFinite(mx) || mx <= mn) {
      mn = 0
      mx = 255
    }
    for (let i = 0; i < npx; i++) {
      const v = flat[i]
      const t = Number.isFinite(v) ? (v - mn) / (mx - mn) : 0
      const g = Math.max(0, Math.min(255, Math.round(t * 255)))
      const o = i * 4
      out[o] = g
      out[o + 1] = g
      out[o + 2] = g
      out[o + 3] = Number.isFinite(v) && !(noData != null && v === noData) ? 255 : 0
    }
  }
  return PNG.sync.write(png)
}

/** Read GDAL nodata + alpha-band info from a geotiff image's file directory. */
function readNoDataAndAlpha(image) {
  const fd = image.getFileDirectory?.() || {}
  const rawNoData = fd.GDAL_NODATA
  const noData =
    rawNoData != null && String(rawNoData).trim() !== '' ? Number.parseFloat(rawNoData) : null
  const samples = image.getSamplesPerPixel()
  // TIFF ExtraSamples: 1 = associated alpha, 2 = unassociated alpha.
  const extra = fd.ExtraSamples
  const extraHasAlpha = Array.isArray(extra)
    ? extra.some(v => v === 1 || v === 2)
    : extra === 1 || extra === 2
  const hasAlpha = samples === 4 && extraHasAlpha
  return { noData: Number.isFinite(noData) ? noData : null, hasAlpha, alphaChannel: hasAlpha ? 3 : -1 }
}

function emptyTile() {
  const png = new PNG({ width: TILE, height: TILE })
  for (let i = 0; i < TILE * TILE; i++) {
    const o = i * 4
    png.data[o] = 0
    png.data[o + 1] = 0
    png.data[o + 2] = 0
    png.data[o + 3] = 0
  }
  return PNG.sync.write(png)
}

function clamp255(v) {
  return Math.min(255, Math.max(0, Math.round(v)))
}

/**
 * Render a tile for a raster carrying a full affine (GeoTIFF ModelTransformation, i.e. a
 * rotated/skewed placement). Does a proper per-output-pixel inverse warp: for each tile
 * pixel we map merc → wgs → source world → source pixel and sample. North-up rasters use
 * the faster window path in renderRasterTilePng instead.
 */
async function renderAffineTile(image, mt, sourceCrs, bbox, widthPx, heightPx) {
  const [minMx, minMy, maxMx, maxMy] = bbox
  const a = { m00: mt[0], m01: mt[1], m03: mt[3], m10: mt[4], m11: mt[5], m13: mt[7] }
  const det = a.m00 * a.m11 - a.m01 * a.m10
  if (!Number.isFinite(det) || Math.abs(det) < 1e-20) return emptyTile()
  const worldToPixel = (wx, wy) => {
    const dx = wx - a.m03
    const dy = wy - a.m13
    return [(a.m11 * dx - a.m01 * dy) / det, (-a.m10 * dx + a.m00 * dy) / det]
  }

  // Source-pixel bounding box of the tile's four corners → the window we need to read.
  const cornerPix = [
    mercToLngLat(minMx, maxMy),
    mercToLngLat(maxMx, maxMy),
    mercToLngLat(maxMx, minMy),
    mercToLngLat(minMx, minMy),
  ]
    .map(([lng, lat]) => toSource(lng, lat, sourceCrs))
    .map(([wx, wy]) => worldToPixel(wx, wy))
  const cols = cornerPix.map(c => c[0])
  const rows = cornerPix.map(c => c[1])
  const left = Math.max(0, Math.min(widthPx, Math.floor(Math.min(...cols))))
  const right = Math.max(0, Math.min(widthPx, Math.ceil(Math.max(...cols))))
  const top = Math.max(0, Math.min(heightPx, Math.floor(Math.min(...rows))))
  const bottom = Math.max(0, Math.min(heightPx, Math.ceil(Math.max(...rows))))
  const winW = right - left
  const winH = bottom - top
  if (winW < 1 || winH < 1) return emptyTile()

  // Cap the decoded window so extreme low-zoom reads stay cheap.
  const capW = Math.max(1, Math.min(winW, 1024))
  const capH = Math.max(1, Math.min(winH, 1024))
  const samples = image.getSamplesPerPixel()
  const rasters = await image.readRasters({
    window: [left, top, right, bottom],
    width: capW,
    height: capH,
    interleave: samples >= 3,
    resampleMethod: 'bilinear',
  })
  const buf =
    samples >= 3 && !Array.isArray(rasters)
      ? rasters
      : Array.isArray(rasters)
        ? rasters[0]
        : rasters
  const isRgb = samples >= 3
  const stride = isRgb ? samples : 1
  const { noData, alphaChannel } = readNoDataAndAlpha(image)

  let mx = 1e-9
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(Number(buf[i]))
    if (Number.isFinite(v) && v > mx) mx = v
  }
  const gain = mx > 255 ? 255 / mx : 1

  const png = new PNG({ width: TILE, height: TILE })
  const out = png.data
  for (let j = 0; j < TILE; j++) {
    const my = maxMy - ((j + 0.5) / TILE) * (maxMy - minMy)
    for (let i = 0; i < TILE; i++) {
      const mxx = minMx + ((i + 0.5) / TILE) * (maxMx - minMx)
      const [lng, lat] = mercToLngLat(mxx, my)
      const [wx, wy] = toSource(lng, lat, sourceCrs)
      const [col, row] = worldToPixel(wx, wy)
      const o = (j * TILE + i) * 4
      if (col < left || col >= right || row < top || row >= bottom) {
        out[o + 3] = 0
        continue
      }
      const lx = Math.min(capW - 1, Math.max(0, Math.floor(((col - left) / winW) * capW)))
      const ly = Math.min(capH - 1, Math.max(0, Math.floor(((row - top) / winH) * capH)))
      if (isRgb) {
        const s = (ly * capW + lx) * stride
        const r = Number(buf[s])
        const g = Number(buf[s + 1])
        const b = Number(buf[s + 2])
        out[o] = clamp255(r * gain)
        out[o + 1] = clamp255(g * gain)
        out[o + 2] = clamp255(b * gain)
        let alpha = 255
        if (alphaChannel >= 0 && stride > alphaChannel) alpha = clamp255(Number(buf[s + alphaChannel]))
        if (noData != null && r === noData && g === noData && b === noData) alpha = 0
        out[o + 3] = alpha
      } else {
        const s = ly * capW + lx
        const v = Number(buf[s])
        const g = clamp255(v * gain)
        out[o] = g
        out[o + 1] = g
        out[o + 2] = g
        out[o + 3] = noData != null && v === noData ? 0 : 255
      }
    }
  }
  return PNG.sync.write(png)
}

/**
 * Render one XYZ tile as PNG Buffer.
 */
export async function renderRasterTilePng(record, z, x, y) {
  const filePath = record.cogPath || record.sourcePath
  if (!filePath || !fs.existsSync(filePath)) throw new Error('Raster file missing on disk')
  const sourceCrs = record.crs || 'EPSG:4326'
  const { image } = await loadTiff(filePath)
  const widthPx = image.getWidth()
  const heightPx = image.getHeight()
  const bbox = tileToMercatorBbox(z, x, y)
  const [minMx, minMy, maxMx, maxMy] = bbox

  // Rotated/skewed placement (GeoTIFF ModelTransformation) → per-pixel affine warp.
  const modelTransformation = image.getFileDirectory()?.ModelTransformation
  if (modelTransformation && modelTransformation.length >= 8) {
    return await renderAffineTile(image, modelTransformation, sourceCrs, bbox, widthPx, heightPx)
  }

  const origin = image.getOrigin()
  const res = image.getResolution()

  const wgsCorners = [
    mercToLngLat(minMx, maxMy),
    mercToLngLat(maxMx, maxMy),
    mercToLngLat(maxMx, minMy),
    mercToLngLat(minMx, minMy),
  ]
  const srcCorners = wgsCorners.map(([lng, lat]) => toSource(lng, lat, sourceCrs))
  const xs = srcCorners.map(c => c[0])
  const ys = srcCorners.map(c => c[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  // Inverse affine (pixel-is-area): col = (x - originX) / resX
  const col0 = Math.floor((minX - origin[0]) / res[0])
  const col1 = Math.ceil((maxX - origin[0]) / res[0])
  const rowA = Math.floor((minY - origin[1]) / res[1])
  const rowB = Math.ceil((maxY - origin[1]) / res[1])
  const row0 = Math.min(rowA, rowB)
  const row1 = Math.max(rowA, rowB)

  const left = Math.max(0, Math.min(widthPx - 1, col0))
  const right = Math.max(0, Math.min(widthPx, col1))
  const top = Math.max(0, Math.min(heightPx - 1, row0))
  const bottom = Math.max(0, Math.min(heightPx, row1))
  if (right <= left || bottom <= top) return emptyTile()

  const samples = image.getSamplesPerPixel()
  const { noData, alphaChannel } = readNoDataAndAlpha(image)
  const rasters = await image.readRasters({
    window: [left, top, right, bottom],
    width: TILE,
    height: TILE,
    interleave: samples >= 3,
    resampleMethod: 'bilinear',
  })
  const data =
    samples >= 3 && !Array.isArray(rasters)
      ? rasters
      : Array.isArray(rasters)
        ? rasters[0]
        : rasters
  const channels = samples >= 3 && !Array.isArray(rasters) ? samples : 1
  return stretchRgb(data, TILE, TILE, channels, { noData, alphaChannel })
}

export function tileCachePath(id, z, x, y) {
  return path.join(RASTER_TILE_CACHE_ROOT, id, String(z), String(x), `${y}.png`)
}

export function readTileCache(id, z, x, y) {
  const p = tileCachePath(id, z, x, y)
  if (fs.existsSync(p)) return fs.readFileSync(p)
  return null
}

export function writeTileCache(id, z, x, y, buf) {
  const p = tileCachePath(id, z, x, y)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, buf)
}
