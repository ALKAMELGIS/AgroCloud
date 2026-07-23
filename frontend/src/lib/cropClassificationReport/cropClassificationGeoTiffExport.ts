/**
 * Export Crop AI prediction as GIS-ready GeoTIFFs for ArcGIS Pro / QGIS.
 *
 * Output (ZIP):
 *   • *_rgb.tif   — 3-band UInt8 RGB (EPSG:4326). Opens & displays immediately
 *                   in ArcGIS Pro Map (default RGB renderer — no Unique Values needed).
 *   • *_class.tif — single-band UInt8 class IDs + TIFF ColorMap + GDAL_NODATA=0
 *   • *.clr / *_classes.csv / *.prj / *.tfw — ArcGIS sidecars
 *
 * Why RGB is primary: ArcGIS Pro defaults stretch single-band class codes (1…N)
 * across 0–255, so crops appear nearly black / “invisible” on the map canvas.
 */

import JSZip from 'jszip'
import type { CropClassLegendItem, CropClassificationResult } from '../siPrithviCropPipeline'
import { PRITHVI_CROP_CLASSES } from '../siPrithviCropPipeline'
import { downloadBlob } from '../hydroWatershed/geoTiffExport'

export type CropGeoTiffClass = {
  value: number
  name: string
  color: string
  r: number
  g: number
  b: number
}

export type ExportCropGeoTiffInput = {
  result: CropClassificationResult
  aoiName?: string
  geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  onProgress?: (label: string) => void
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  if (h.length === 3) {
    return [
      parseInt(h[0]! + h[0]!, 16),
      parseInt(h[1]! + h[1]!, 16),
      parseInt(h[2]! + h[2]!, 16),
    ]
  }
  if (h.length >= 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  return [148, 163, 184]
}

export function buildClassTable(result: CropClassificationResult): CropGeoTiffClass[] {
  const legend: CropClassLegendItem[] =
    result.legend && result.legend.length
      ? result.legend
      : PRITHVI_CROP_CLASSES.map(c => ({ id: c.id, name: c.name, color: c.color }))

  const present = new Set(
    (result.classStats ?? []).map(s => String(s.name ?? '').toLowerCase()).filter(Boolean),
  )
  const filtered =
    present.size > 0
      ? legend.filter(l => present.has(String(l.name).toLowerCase()))
      : legend
  const list = filtered.length ? filtered : legend

  const used = new Set<number>()
  return list.map((item, i) => {
    let value =
      typeof item.id === 'number' && Number.isFinite(item.id)
        ? Math.max(1, Math.round(item.id))
        : typeof item.id === 'string' && /^\d+$/.test(item.id)
          ? Math.max(1, Number(item.id))
          : i + 1
    while (used.has(value) || value === 0) value += 1
    used.add(value)
    const [r, g, b] = hexToRgb(item.color)
    return { value, name: item.name, color: item.color, r, g, b }
  })
}

async function loadRgba(
  url: string,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('Failed to load crop prediction image'))
    im.src = url
  })
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable for GeoTIFF export')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, width, height)
  return { data, width, height }
}

/** Map RGBA pixels → class values (0 = NoData). Nearest RGB within tolerance. */
export function rgbaToClassRaster(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  classes: CropGeoTiffClass[],
  maxDistSq = 72 * 72,
): Uint8Array {
  const out = new Uint8Array(width * height)
  const palette = classes.map(c => ({ value: c.value, r: c.r, g: c.g, b: c.b }))
  // Exact colour lookup first (fast path).
  const exact = new Map<number, number>()
  for (const c of palette) {
    exact.set((c.r << 16) | (c.g << 8) | c.b, c.value)
  }

  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4
    const a = rgba[i + 3]!
    const r = rgba[i]!
    const g = rgba[i + 1]!
    const b = rgba[i + 2]!
    if (a < 16 || (r < 8 && g < 8 && b < 8 && a < 40)) {
      out[p] = 0
      continue
    }
    const key = (r << 16) | (g << 8) | b
    const hit = exact.get(key)
    if (hit != null) {
      out[p] = hit
      continue
    }
    let best = 0
    let bestD = maxDistSq + 1
    for (const c of palette) {
      const dr = r - c.r
      const dg = g - c.g
      const db = b - c.b
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) {
        bestD = d
        best = c.value
      }
    }
    out[p] = bestD <= maxDistSq ? best : 0
  }
  return out
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!
    const yi = ring[i]![1]!
    const xj = ring[j]![0]!
    const yj = ring[j]![1]!
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygon(lng: number, lat: number, geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const polys =
    geom.type === 'Polygon'
      ? [geom.coordinates]
      : geom.coordinates
  for (const poly of polys) {
    const outer = poly[0]
    if (!outer || outer.length < 3) continue
    if (!pointInRing(lng, lat, outer as number[][])) continue
    let inHole = false
    for (let h = 1; h < poly.length; h += 1) {
      if (pointInRing(lng, lat, poly[h] as number[][])) {
        inHole = true
        break
      }
    }
    if (!inHole) return true
  }
  return false
}

function applyAoiMask(
  raster: Uint8Array,
  width: number,
  height: number,
  bounds: [number, number, number, number],
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined,
): void {
  if (!geometry) return
  const [w, s, e, n] = bounds
  const dx = (e - w) / width
  const dy = (n - s) / height
  const before = new Uint8Array(raster)
  let kept = 0
  let had = 0
  for (let row = 0; row < height; row += 1) {
    const lat = n - (row + 0.5) * dy
    for (let col = 0; col < width; col += 1) {
      const idx = row * width + col
      if (before[idx]! > 0) had += 1
      const lng = w + (col + 0.5) * dx
      if (!pointInPolygon(lng, lat, geometry)) {
        raster[idx] = 0
      } else if (raster[idx]! > 0) {
        kept += 1
      }
    }
  }
  // If AOI mask wiped nearly all class pixels (geometry/CRS mismatch), keep unmasked.
  if (had > 0 && kept < had * 0.05) {
    raster.set(before)
  }
}

/** Paint class IDs → packed RGB (R,G,B per pixel). 0 → black. */
export function classRasterToRgb(
  raster: Uint8Array,
  classes: CropGeoTiffClass[],
): Uint8Array {
  const lut = new Uint8Array(256 * 3)
  for (const c of classes) {
    const i = Math.max(0, Math.min(255, c.value))
    lut[i * 3] = c.r
    lut[i * 3 + 1] = c.g
    lut[i * 3 + 2] = c.b
  }
  const out = new Uint8Array(raster.length * 3)
  for (let p = 0; p < raster.length; p += 1) {
    const v = raster[p]!
    const o = p * 3
    if (v === 0) {
      out[o] = 0
      out[o + 1] = 0
      out[o + 2] = 0
      continue
    }
    const li = v * 3
    out[o] = lut[li]!
    out[o + 1] = lut[li + 1]!
    out[o + 2] = lut[li + 2]!
  }
  return out
}

function buildWorldFile4326(
  west: number,
  north: number,
  east: number,
  south: number,
  width: number,
  height: number,
): string {
  const sx = (east - west) / width
  const sy = (north - south) / height
  // ESRI world file: centre of upper-left pixel
  const lines = [
    sx.toFixed(12),
    '0.000000000000',
    '0.000000000000',
    (-sy).toFixed(12),
    (west + sx / 2).toFixed(12),
    (north - sy / 2).toFixed(12),
  ]
  return `${lines.join('\n')}\n`
}

// ── TIFF helpers (UInt8 paletted GeoTIFF, EPSG:4326) ─────────────────────────

const T_ASCII = 2
const T_SHORT = 3
const T_LONG = 4
const T_DOUBLE = 12
const TYPE_SIZE: Record<number, number> = { [T_ASCII]: 1, [T_SHORT]: 2, [T_LONG]: 4, [T_DOUBLE]: 8 }

type TiffEntry = { tag: number; type: number; count: number; data: Uint8Array }

function entry(tag: number, type: number, values: number[] | Uint8Array): TiffEntry {
  const count = type === T_ASCII ? (values as Uint8Array).length : (values as number[]).length
  const size = count * TYPE_SIZE[type]!
  const buf = new Uint8Array(size)
  const dv = new DataView(buf.buffer)
  if (type === T_ASCII) {
    buf.set(values as Uint8Array)
  } else if (type === T_SHORT) {
    ;(values as number[]).forEach((v, i) => dv.setUint16(i * 2, v, true))
  } else if (type === T_LONG) {
    ;(values as number[]).forEach((v, i) => dv.setUint32(i * 4, v, true))
  } else if (type === T_DOUBLE) {
    ;(values as number[]).forEach((v, i) => dv.setFloat64(i * 8, v, true))
  }
  return { tag, type, count, data: buf }
}

function asciiBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length + 1)
  for (let i = 0; i < s.length; i += 1) b[i] = s.charCodeAt(i) & 0xff
  return b
}

/** Build TIFF ColorMap: 256 R + 256 G + 256 B as UInt16 (0–65535). */
function buildColorMap(classes: CropGeoTiffClass[]): number[] {
  const map = new Array(256 * 3).fill(0)
  // Index 0 = nodata → transparent-ish black
  for (const c of classes) {
    const idx = Math.max(0, Math.min(255, c.value))
    map[idx] = Math.round((c.r / 255) * 65535)
    map[256 + idx] = Math.round((c.g / 255) * 65535)
    map[512 + idx] = Math.round((c.b / 255) * 65535)
  }
  return map
}

function lzwCompress(input: Uint8Array): Uint8Array {
  const out: number[] = []
  let bitBuffer = 0
  let bitCount = 0
  const write = (code: number, width: number) => {
    bitBuffer = (bitBuffer << width) | code
    bitCount += width
    while (bitCount >= 8) {
      bitCount -= 8
      out.push((bitBuffer >> bitCount) & 0xff)
    }
    bitBuffer &= (1 << bitCount) - 1
  }
  const CLEAR = 256
  const EOI = 257
  let dict = new Map<number, number>()
  let nextCode = 258
  let width = 9
  const reset = () => {
    dict = new Map()
    nextCode = 258
    width = 9
  }
  write(CLEAR, width)
  if (input.length > 0) {
    let omega = input[0]!
    for (let i = 1; i < input.length; i += 1) {
      const k = input[i]!
      const key = (omega << 8) | k
      const existing = dict.get(key)
      if (existing !== undefined) {
        omega = existing
      } else {
        write(omega, width)
        dict.set(key, nextCode)
        nextCode += 1
        if (nextCode === 511) width = 10
        else if (nextCode === 1023) width = 11
        else if (nextCode === 2047) width = 12
        if (nextCode === 4094) {
          write(CLEAR, width)
          reset()
        }
        omega = k
      }
    }
    write(omega, width)
  }
  write(EOI, width)
  if (bitCount > 0) out.push((bitBuffer << (8 - bitCount)) & 0xff)
  return Uint8Array.from(out)
}

export function writePalettedGeoTiff4326(opts: {
  width: number
  height: number
  samples: Uint8Array
  west: number
  north: number
  east: number
  south: number
  classes: CropGeoTiffClass[]
  compress?: boolean
}): ArrayBuffer {
  const { width, height, samples } = opts
  const stripRaw = samples
  // Default uncompressed — ArcGIS Pro is more reliable with raw strips than custom LZW.
  const strip = opts.compress === true ? lzwCompress(stripRaw) : stripRaw
  const compression = opts.compress === true ? 5 : 1

  const pixelScaleX = (opts.east - opts.west) / width
  const pixelScaleY = (opts.north - opts.south) / height

  // Geographic CRS WGS84 (EPSG:4326)
  const geoKeys = [
    1, 1, 0, 3,
    1024, 0, 1, 2, // ModelTypeGeographic
    1025, 0, 1, 1, // RasterPixelIsArea
    2048, 0, 1, 4326, // GeographicTypeGeoKey = WGS 84
  ]

  const colorMap = buildColorMap(opts.classes)

  const entries: TiffEntry[] = [
    entry(256, T_LONG, [width]),
    entry(257, T_LONG, [height]),
    entry(258, T_SHORT, [8]),
    entry(259, T_SHORT, [compression]),
    entry(262, T_SHORT, [3]), // Palette
    entry(273, T_LONG, [0]), // StripOffsets — patched
    entry(277, T_SHORT, [1]),
    entry(278, T_LONG, [height]),
    entry(279, T_LONG, [strip.length]),
    entry(282, T_LONG, [1]), // XResolution (placeholder rational via LONG inline — skip; use defaults)
    entry(320, T_SHORT, colorMap), // ColorMap
    entry(339, T_SHORT, [1]), // SampleFormat = unsigned int
    entry(33550, T_DOUBLE, [pixelScaleX, pixelScaleY, 0]),
    entry(33922, T_DOUBLE, [0, 0, 0, opts.west, opts.north, 0]),
    entry(34735, T_SHORT, geoKeys),
    entry(42113, T_ASCII, asciiBytes('0')),
  ].filter(e => e.tag !== 282) // drop placeholder — invalid XResolution without RATIONAL type

  return assembleTiff(entries, strip)
}

/**
 * 3-band RGB GeoTIFF (EPSG:4326) — displays immediately in ArcGIS Pro / QGIS
 * with the default RGB composite renderer (no Unique Values / .clr needed).
 */
export function writeRgbGeoTiff4326(opts: {
  width: number
  height: number
  /** Packed RGB: length = width * height * 3 */
  rgb: Uint8Array
  west: number
  north: number
  east: number
  south: number
  compress?: boolean
}): ArrayBuffer {
  const { width, height, rgb } = opts
  if (rgb.length < width * height * 3) {
    throw new Error('RGB buffer too short for GeoTIFF export.')
  }
  const stripRaw = rgb
  const strip = opts.compress === true ? lzwCompress(stripRaw) : stripRaw
  const compression = opts.compress === true ? 5 : 1
  const pixelScaleX = (opts.east - opts.west) / width
  const pixelScaleY = (opts.north - opts.south) / height
  const geoKeys = [
    1, 1, 0, 3,
    1024, 0, 1, 2,
    1025, 0, 1, 1,
    2048, 0, 1, 4326,
  ]
  const entries: TiffEntry[] = [
    entry(256, T_LONG, [width]),
    entry(257, T_LONG, [height]),
    entry(258, T_SHORT, [8, 8, 8]),
    entry(259, T_SHORT, [compression]),
    entry(262, T_SHORT, [2]), // RGB
    entry(273, T_LONG, [0]),
    entry(277, T_SHORT, [3]),
    entry(278, T_LONG, [height]),
    entry(279, T_LONG, [strip.length]),
    entry(284, T_SHORT, [1]), // PlanarConfiguration = chunky
    entry(339, T_SHORT, [1, 1, 1]), // SampleFormat unsigned
    entry(33550, T_DOUBLE, [pixelScaleX, pixelScaleY, 0]),
    entry(33922, T_DOUBLE, [0, 0, 0, opts.west, opts.north, 0]),
    entry(34735, T_SHORT, geoKeys),
  ]
  return assembleTiff(entries, strip)
}

function assembleTiff(entries: TiffEntry[], strip: Uint8Array): ArrayBuffer {
  entries.sort((a, b) => a.tag - b.tag)
  const numTags = entries.length
  const ifdOffset = 8
  const ifdSize = 2 + numTags * 12 + 4
  let extraOffset = ifdOffset + ifdSize
  const externals: Array<{ entry: TiffEntry; offset: number }> = []
  for (const e of entries) {
    if (e.data.length > 4) {
      if (extraOffset % 2 === 1) extraOffset += 1
      externals.push({ entry: e, offset: extraOffset })
      extraOffset += e.data.length
    }
  }
  if (extraOffset % 2 === 1) extraOffset += 1
  const stripOffset = extraOffset
  const total = stripOffset + strip.length

  const buffer = new ArrayBuffer(total)
  const bytes = new Uint8Array(buffer)
  const dv = new DataView(buffer)
  dv.setUint16(0, 0x4949, true)
  dv.setUint16(2, 42, true)
  dv.setUint32(4, ifdOffset, true)

  new DataView(entries.find(e => e.tag === 273)!.data.buffer).setUint32(0, stripOffset, true)

  dv.setUint16(ifdOffset, numTags, true)
  let p = ifdOffset + 2
  for (const e of entries) {
    dv.setUint16(p, e.tag, true)
    dv.setUint16(p + 2, e.type, true)
    dv.setUint32(p + 4, e.count, true)
    if (e.data.length <= 4) bytes.set(e.data, p + 8)
    else {
      const ext = externals.find(x => x.entry === e)!
      dv.setUint32(p + 8, ext.offset, true)
    }
    p += 12
  }
  dv.setUint32(p, 0, true)
  for (const ext of externals) bytes.set(ext.entry.data, ext.offset)
  bytes.set(strip, stripOffset)
  return buffer
}

function buildClr(classes: CropGeoTiffClass[]): string {
  // ArcGIS colormap: value R G B (0–255). Include 0 as nodata black.
  const lines = ['0 0 0 0', ...classes.map(c => `${c.value} ${c.r} ${c.g} ${c.b}`)]
  return `${lines.join('\n')}\n`
}

function buildClassesCsv(classes: CropGeoTiffClass[]): string {
  const rows = [
    'Value,Class,Red,Green,Blue,Hex',
    '0,NoData,0,0,0,#000000',
    ...classes.map(
      c =>
        `${c.value},"${c.name.replace(/"/g, '""')}",${c.r},${c.g},${c.b},${c.color.startsWith('#') ? c.color : `#${c.color}`}`,
    ),
  ]
  return `${rows.join('\n')}\n`
}

function buildPrjWgs84(): string {
  return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]\n'
}

function safeStem(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || 'crop_classification'
  )
}

/**
 * Build and download a ZIP with RGB GeoTIFF (ArcGIS-ready) + class GeoTIFF + sidecars.
 */
export async function exportCropClassificationGeoTiff(
  input: ExportCropGeoTiffInput,
): Promise<{ filename: string }> {
  const { result } = input
  const url = result.prediction?.url
  const bounds = result.prediction?.bounds
  if (!url) throw new Error('No crop prediction raster to export.')
  if (!bounds || bounds.length !== 4) {
    throw new Error('Prediction bounds are missing — cannot georeference the GeoTIFF.')
  }
  const [west, south, east, north] = bounds
  if (!(east > west) || !(north > south)) {
    throw new Error('Invalid prediction bounds for GeoTIFF export.')
  }

  input.onProgress?.('Loading classified raster…')
  const { data, width, height } = await loadRgba(url)
  const classes = buildClassTable(result)
  if (!classes.length) throw new Error('No crop classes available for GeoTIFF export.')

  input.onProgress?.('Mapping class values…')
  const raster = rgbaToClassRaster(data, width, height, classes)
  applyAoiMask(raster, width, height, bounds, input.geometry)

  const classifiedCount = raster.reduce((acc, v) => acc + (v > 0 ? 1 : 0), 0)
  if (classifiedCount < 1) {
    throw new Error(
      'Exported class raster is empty (no matching colours). Re-run Crop AI, then export again.',
    )
  }

  input.onProgress?.('Writing RGB GeoTIFF (EPSG:4326)…')
  const rgb = classRasterToRgb(raster, classes)
  const rgbBuf = writeRgbGeoTiff4326({
    width,
    height,
    rgb,
    west,
    north,
    east,
    south,
    compress: false,
  })

  input.onProgress?.('Writing class GeoTIFF…')
  const classBuf = writePalettedGeoTiff4326({
    width,
    height,
    samples: raster,
    west,
    north,
    east,
    south,
    classes,
    compress: false,
  })

  const stem = safeStem(input.aoiName || 'crop_classification')
  const base = `crop_classification_${stem}`
  const tfw = buildWorldFile4326(west, north, east, south, width, height)
  const prj = buildPrjWgs84()
  const zip = new JSZip()
  // RGB first — this is the file to open in ArcGIS Pro Map.
  zip.file(`${base}_rgb.tif`, rgbBuf)
  zip.file(`${base}_rgb.tfw`, tfw)
  zip.file(`${base}_rgb.prj`, prj)
  zip.file(`${base}_class.tif`, classBuf)
  zip.file(`${base}_class.tfw`, tfw)
  zip.file(`${base}_class.prj`, prj)
  zip.file(`${base}_class.clr`, buildClr(classes))
  zip.file(`${base}_classes.csv`, buildClassesCsv(classes))
  zip.file(
    'README.txt',
    [
      'AgroCloud Crop Classification — GIS export',
      '',
      '=== ArcGIS Pro (IMPORTANT) ===',
      `1. Unzip this archive.`,
      `2. Add ${base}_rgb.tif to the map (Catalog → right-click → Add To Current Map).`,
      '3. Right-click the layer → Zoom To Layer.',
      '   → Colours appear immediately (RGB composite).',
      '',
      `Do NOT open only ${base}_class.tif first — ArcGIS stretch makes class codes`,
      '1…N look almost black. For analysis use _class.tif with:',
      '   Symbology → Unique Values → Import → select the .clr file.',
      '',
      `${base}_rgb.tif    — 3-band RGB GeoTIFF (WGS84). Open this in Map.`,
      `${base}_class.tif  — UInt8 class IDs (0=NoData) + embedded ColorMap.`,
      `${base}_class.clr  — ArcGIS colormap (Value R G B).`,
      `${base}_classes.csv — Class attribute table.`,
      '*.prj / *.tfw     — WGS84 projection + world-file sidecars.',
      '',
      'CRS: EPSG:4326 / WGS84 — matches AgroCloud prediction bounds.',
      '',
    ].join('\n'),
  )

  input.onProgress?.('Packaging download…')
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  const filename = `${base}_geotiff.zip`
  downloadBlob(blob, filename)
  return { filename }
}
