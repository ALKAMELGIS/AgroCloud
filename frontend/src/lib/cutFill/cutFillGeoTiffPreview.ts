/**
 * Cut/Fill GeoTIFF preview as a Mapbox raster tile source.
 *
 * Mapbox GL JS in this app has no `addProtocol`, so XYZ tiles are served by
 * rewriting matching XMLHttpRequest URLs to a PNG blob. Pixels come from the
 * analysis grid (same Web Mercator georeference as the AOI). A real EPSG:4326
 * RGBA GeoTIFF is written from those pixels for the preview product.
 *
 * Display ΔZ = design elevation − existing elevation.
 * CUT is negative ΔZ, FILL is positive ΔZ, NO CHANGE is inside tolerance.
 * The engine stores existing − design, so display ΔZ is the negation.
 */
import { writeRgbGisGeoTiff } from '../gis/gisGeoTiffWriter'
import { lngLatToWorldPx, worldPxToLngLat } from '../treeDetection/webMercatorTiles'
import type { CutFillAnalysisResult } from './cutFillTypes'

export type CutFillGeoTiffPreviewMode = 'class' | 'difference'

export type CutFillRasterGrid = {
  id: string
  mode: CutFillGeoTiffPreviewMode
  rgba: Uint8Array
  width: number
  height: number
  zoom: number
  originWorldPxX: number
  originWorldPxY: number
  west: number
  south: number
  east: number
  north: number
  /** EPSG:4326 RGBA GeoTIFF bytes for this preview. */
  geotiff: ArrayBuffer
}

const TILE = 256
const TILE_RE = /\/__cutfill\/([^/?#]+)\/(\d+)\/(\d+)\/(\d+)\.png(?:[?#].*)?$/

const CUT_RGBA: [number, number, number, number] = [220, 38, 38, 255]
const FILL_RGBA: [number, number, number, number] = [22, 163, 74, 255]
const NO_CHANGE_RGBA: [number, number, number, number] = [161, 161, 170, 170]

let rasterSeq = 0
const grids = new Map<string, CutFillRasterGrid>()
let xhrInstalled = false
let emptyTilePng: Uint8Array | null = null

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i]!
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function adler32(data: Uint8Array): number {
  let a = 1
  let b = 0
  for (let i = 0; i < data.length; i += 1) {
    a = (a + data[i]!) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function zlibStore(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])]
  let offset = 0
  while (offset < data.length || (offset === 0 && data.length === 0)) {
    const len = Math.min(65535, data.length - offset)
    const last = offset + len >= data.length
    const hdr = new Uint8Array(5)
    hdr[0] = last ? 1 : 0
    hdr[1] = len & 255
    hdr[2] = (len >> 8) & 255
    const nlen = (~len) & 0xffff
    hdr[3] = nlen & 255
    hdr[4] = (nlen >> 8) & 255
    blocks.push(hdr, data.subarray(offset, offset + len))
    offset += len
    if (last) break
  }
  const sum = adler32(data)
  const tail = new Uint8Array(4)
  tail[0] = (sum >>> 24) & 255
  tail[1] = (sum >>> 16) & 255
  tail[2] = (sum >>> 8) & 255
  tail[3] = sum & 255
  blocks.push(tail)
  const total = blocks.reduce((n, part) => n + part.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of blocks) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out[4] = type.charCodeAt(0)
  out[5] = type.charCodeAt(1)
  out[6] = type.charCodeAt(2)
  out[7] = type.charCodeAt(3)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

/** Uncompressed RGBA PNG. Used so tile bytes are ready inside XMLHttpRequest.open. */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1)
    raw[row] = 0
    raw.set(rgba.subarray(y * stride, y * stride + stride), row + 1)
  }
  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 6
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  const parts = [signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStore(raw)), pngChunk('IEND', new Uint8Array())]
  const total = parts.reduce((n, part) => n + part.length, 0)
  const png = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    png.set(part, cursor)
    cursor += part.length
  }
  return png
}

function differenceRgba(engineDz: number): [number, number, number, number] {
  const displayDz = -engineDz
  if (displayDz < -0.05) {
    const t = Math.min(1, -displayDz / 8)
    return [Math.round(252 - 40 * (1 - t)), Math.round(90 * (1 - t) + 40), 36, 255]
  }
  if (displayDz > 0.05) {
    const t = Math.min(1, displayDz / 8)
    return [34, Math.round(150 + 70 * t), Math.round(80 - 20 * t), 255]
  }
  return NO_CHANGE_RGBA
}

function paintPreviewRgba(
  mode: CutFillGeoTiffPreviewMode,
  width: number,
  height: number,
  difference: Float32Array,
  classification: Uint8Array,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4)
  const n = width * height
  for (let i = 0; i < n; i += 1) {
    const dz = difference[i]
    if (dz == null || !Number.isFinite(dz)) continue
    const color =
      mode === 'class'
        ? classification[i] === 1
          ? CUT_RGBA
          : classification[i] === 2
            ? FILL_RGBA
            : NO_CHANGE_RGBA
        : differenceRgba(dz)
    const p = i * 4
    rgba[p] = color[0]
    rgba[p + 1] = color[1]
    rgba[p + 2] = color[2]
    rgba[p + 3] = color[3]
  }
  return rgba
}

export function writeCutFillPreviewGeoTiff(grid: Omit<CutFillRasterGrid, 'geotiff' | 'id'> & { id?: string }): ArrayBuffer {
  return writeRgbGisGeoTiff({
    width: grid.width,
    height: grid.height,
    pixels: grid.rgba,
    samplesPerPixel: 4,
    pixelScaleX: (grid.east - grid.west) / Math.max(1, grid.width),
    pixelScaleY: (grid.north - grid.south) / Math.max(1, grid.height),
    tiepointX: grid.west,
    tiepointY: grid.north,
    epsg: 4326,
    geographic: true,
    description: 'Cut/Fill preview. dZ = design - existing. CUT < 0, FILL > 0.',
  })
}

export function createCutFillRasterGrid(input: {
  mode: CutFillGeoTiffPreviewMode
  width: number
  height: number
  zoom: number
  originWorldPxX: number
  originWorldPxY: number
  west: number
  south: number
  east: number
  north: number
  difference: Float32Array
  classification: Uint8Array
  id?: string
}): CutFillRasterGrid {
  const rgba = paintPreviewRgba(input.mode, input.width, input.height, input.difference, input.classification)
  const draft = {
    mode: input.mode,
    rgba,
    width: input.width,
    height: input.height,
    zoom: input.zoom,
    originWorldPxX: input.originWorldPxX,
    originWorldPxY: input.originWorldPxY,
    west: input.west,
    south: input.south,
    east: input.east,
    north: input.north,
  }
  rasterSeq += 1
  return {
    ...draft,
    id: input.id ?? `${input.mode}-${rasterSeq}`,
    geotiff: writeCutFillPreviewGeoTiff(draft),
  }
}

export function buildCutFillGeoTiffPreview(
  result: CutFillAnalysisResult,
  mode: CutFillGeoTiffPreviewMode,
): CutFillRasterGrid | null {
  const dem = result.dem
  if (!dem?.width || !dem.height || !result.difference || !result.classification) return null
  const bbox = dem.bbox
  const coords = dem.cornerCoords
  const west = bbox?.west ?? Math.min(coords[0][0], coords[3][0])
  const east = bbox?.east ?? Math.max(coords[1][0], coords[2][0])
  const north = bbox?.north ?? Math.max(coords[0][1], coords[1][1])
  const south = bbox?.south ?? Math.min(coords[2][1], coords[3][1])
  if (![west, south, east, north, dem.zoom, dem.originWorldPxX, dem.originWorldPxY].every(Number.isFinite)) return null
  return createCutFillRasterGrid({
    mode,
    width: dem.width,
    height: dem.height,
    zoom: dem.zoom,
    originWorldPxX: dem.originWorldPxX,
    originWorldPxY: dem.originWorldPxY,
    west,
    south,
    east,
    north,
    difference: result.difference,
    classification: result.classification,
  })
}

function emptyTile(): Uint8Array {
  if (!emptyTilePng) emptyTilePng = encodeRgbaPng(TILE, TILE, new Uint8Array(TILE * TILE * 4))
  return emptyTilePng
}

function tileIntersects(grid: CutFillRasterGrid, z: number, x: number, y: number): boolean {
  const [west, north] = worldPxToLngLat(x * TILE, y * TILE, z)
  const [east, south] = worldPxToLngLat((x + 1) * TILE, (y + 1) * TILE, z)
  return east >= grid.west && west <= grid.east && north >= grid.south && south <= grid.north
}

/** Paint one XYZ tile from the analysis grid. Outside the AOI stays transparent. */
export function renderCutFillTilePng(id: string, z: number, x: number, y: number): Uint8Array {
  const grid = grids.get(decodeURIComponent(id))
  if (!grid || !tileIntersects(grid, z, x, y)) return emptyTile()
  const image = new Uint8Array(TILE * TILE * 4)
  let opaque = 0
  for (let py = 0; py < TILE; py += 1) {
    for (let px = 0; px < TILE; px += 1) {
      const [lng, lat] = worldPxToLngLat(x * TILE + px + 0.5, y * TILE + py + 0.5, z)
      const [wx, wy] = lngLatToWorldPx(lng, lat, grid.zoom)
      const gx = Math.floor(wx - grid.originWorldPxX)
      const gy = Math.floor(wy - grid.originWorldPxY)
      if (gx < 0 || gy < 0 || gx >= grid.width || gy >= grid.height) continue
      const src = (gy * grid.width + gx) * 4
      if (grid.rgba[src + 3] === 0) continue
      const dst = (py * TILE + px) * 4
      image[dst] = grid.rgba[src]!
      image[dst + 1] = grid.rgba[src + 1]!
      image[dst + 2] = grid.rgba[src + 2]!
      image[dst + 3] = grid.rgba[src + 3]!
      opaque += 1
    }
  }
  if (opaque === 0) return emptyTile()
  return encodeRgbaPng(TILE, TILE, image)
}

/** RGBA PNG for a Mapbox image source. Corners stay on the full analysis grid. */
export function cutFillPreviewPng(grid: CutFillRasterGrid, maxEdge = 768): Uint8Array {
  const longest = Math.max(grid.width, grid.height)
  if (longest <= maxEdge) return encodeRgbaPng(grid.width, grid.height, grid.rgba)
  const w = Math.max(1, Math.round((grid.width / longest) * maxEdge))
  const h = Math.max(1, Math.round((grid.height / longest) * maxEdge))
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(grid.height - 1, Math.floor(((y + 0.5) * grid.height) / h))
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(grid.width - 1, Math.floor(((x + 0.5) * grid.width) / w))
      const src = (sy * grid.width + sx) * 4
      const dst = (y * w + x) * 4
      out[dst] = grid.rgba[src]!
      out[dst + 1] = grid.rgba[src + 1]!
      out[dst + 2] = grid.rgba[src + 2]!
      out[dst + 3] = grid.rgba[src + 3]!
    }
  }
  return encodeRgbaPng(w, h, out)
}

export function cutFillRasterTileTemplate(id: string): string {
  const origin = typeof location !== 'undefined' && location.origin ? location.origin : 'http://localhost'
  return `${origin}/__cutfill/${encodeURIComponent(id)}/{z}/{x}/{y}.png`
}

export function registerCutFillRasterGrid(grid: CutFillRasterGrid): void {
  installCutFillRasterTileXhr()
  grids.set(grid.id, grid)
}

export function unregisterCutFillRasterGrid(id: string): void {
  grids.delete(id)
}

/** Main-thread Mapbox raster loads use XMLHttpRequest. Rewrite our tile URLs to PNG blobs. */
export function installCutFillRasterTileXhr(): void {
  if (xhrInstalled || typeof XMLHttpRequest === 'undefined') return
  xhrInstalled = true
  const origOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function openCutFillTile(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    const raw = typeof url === 'string' ? url : url instanceof URL ? url.href : String(url ?? '')
    const match = TILE_RE.exec(raw)
    if (!match) {
      return origOpen.call(this, method, url, async ?? true, username, password)
    }
    const png = renderCutFillTilePng(match[1]!, Number(match[2]), Number(match[3]), Number(match[4]))
    const bytes = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
    this.addEventListener('loadend', () => URL.revokeObjectURL(blobUrl), { once: true })
    return origOpen.call(this, method, blobUrl, async ?? true, username, password)
  }
}
