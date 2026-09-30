/**
 * Shared GIS GeoTIFF helpers — ArcGIS Pro / QGIS / GDAL friendly.
 *
 * Rules that prevent the common “solid black + ±3.4e38” symptom:
 *   • Never write IEEE NaN / Inf into Float32 strips (Pro treats them as ±FLT_MAX).
 *   • Use a finite GDAL_NODATA sentinel (default −9999).
 *   • Prefer uncompressed strips (custom LZW often fails in Pro).
 *   • Embed GDAL STATISTICS_* so Pro stretch is not type-min/max (±3.4e38).
 */

export const GIS_FLOAT_NODATA = -9999

export type FloatRasterStats = {
  min: number
  max: number
  mean: number
  stddev: number
  validCount: number
}

export function sanitizeFloat32Samples(
  samples: Float32Array,
  nodata: number = GIS_FLOAT_NODATA,
): Float32Array {
  const out = new Float32Array(samples.length)
  const nd = Number.isFinite(nodata) ? nodata : GIS_FLOAT_NODATA
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i]!
    out[i] = Number.isFinite(v) ? v : nd
  }
  return out
}

/** Stats excluding NoData (and non-finite). */
export function computeFloatRasterStats(
  samples: ArrayLike<number>,
  nodata: number = GIS_FLOAT_NODATA,
): FloatRasterStats | null {
  let min = Infinity
  let max = -Infinity
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i]!
    if (!Number.isFinite(v) || v === nodata) continue
    if (v < min) min = v
    if (v > max) max = v
    sum += v
    sumSq += v * v
    n += 1
  }
  if (n === 0) return null
  const mean = sum / n
  const variance = Math.max(0, sumSq / n - mean * mean)
  return { min, max, mean, stddev: Math.sqrt(variance), validCount: n }
}

export function buildGdalMetadataXml(stats: FloatRasterStats): string {
  const items: string[] = [
    `<Item name="STATISTICS_MINIMUM" sample="0">${fmtStat(stats.min)}</Item>`,
    `<Item name="STATISTICS_MAXIMUM" sample="0">${fmtStat(stats.max)}</Item>`,
    `<Item name="STATISTICS_MEAN" sample="0">${fmtStat(stats.mean)}</Item>`,
    `<Item name="STATISTICS_STDDEV" sample="0">${fmtStat(stats.stddev)}</Item>`,
  ]
  return `<GDALMetadata>\n${items.join('\n')}\n</GDALMetadata>\n`
}

/** PAM sidecar — ArcGIS Pro honours NoData + stats even when IFD tags are ignored. */
export function buildGdalPamAuxXml(opts: {
  nodata: number
  stats: FloatRasterStats | null
  bandName?: string
}): string {
  const statsXml = opts.stats
    ? `
    <Metadata>
      <MDI key="STATISTICS_MINIMUM">${fmtStat(opts.stats.min)}</MDI>
      <MDI key="STATISTICS_MAXIMUM">${fmtStat(opts.stats.max)}</MDI>
      <MDI key="STATISTICS_MEAN">${fmtStat(opts.stats.mean)}</MDI>
      <MDI key="STATISTICS_STDDEV">${fmtStat(opts.stats.stddev)}</MDI>
    </Metadata>`
    : ''
  const desc = opts.bandName ? `\n    <Description>${escapeXml(opts.bandName)}</Description>` : ''
  return `<?xml version="1.0"?>
<PAMDataset>
  <PAMRasterBand band="1">${desc}
    <NoDataValue>${opts.nodata}</NoDataValue>${statsXml}
  </PAMRasterBand>
</PAMDataset>
`
}

function fmtStat(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const a = Math.abs(n)
  if (a >= 1000 || (a > 0 && a < 1e-4)) return n.toExponential(6)
  return String(Math.round(n * 1e6) / 1e6)
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Minimal TIFF assembler (little-endian classic) ───────────────────────────

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

export type WriteFloat32GeoTiffOpts = {
  width: number
  height: number
  samples: Float32Array
  /** ModelPixelScale X (map units / px). */
  pixelScaleX: number
  /** ModelPixelScale Y (positive map units / px). */
  pixelScaleY: number
  /** ModelTiepoint map X of raster pixel (0,0) — typically west / top-left X. */
  tiepointX: number
  /** ModelTiepoint map Y of raster pixel (0,0) — typically north / top-left Y. */
  tiepointY: number
  /** Geographic (4326) or projected EPSG. */
  epsg: number
  geographic?: boolean
  nodata?: number
  description?: string
  /** Embed STATISTICS_* for ArcGIS stretch (default true). */
  embedStats?: boolean
}

/** Single-band Float32 GeoTIFF — never writes NaN. */
export function writeFloat32GisGeoTiff(opts: WriteFloat32GeoTiffOpts): ArrayBuffer {
  const nodata = Number.isFinite(opts.nodata) ? opts.nodata! : GIS_FLOAT_NODATA
  const samples = sanitizeFloat32Samples(opts.samples, nodata)
  const { width, height } = opts
  const raw = new Uint8Array(width * height * 4)
  const rawDv = new DataView(raw.buffer)
  for (let i = 0; i < samples.length; i += 1) {
    rawDv.setFloat32(i * 4, samples[i]!, true)
  }

  const geographic = opts.geographic ?? opts.epsg === 4326
  const geoKeys = geographic
    ? [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, opts.epsg]
    : [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, opts.epsg]

  const entries: TiffEntry[] = [
    entry(256, T_LONG, [width]),
    entry(257, T_LONG, [height]),
    entry(258, T_SHORT, [32]),
    entry(259, T_SHORT, [1]), // Uncompressed — reliable in ArcGIS Pro
    entry(262, T_SHORT, [1]), // MinIsBlack
    entry(273, T_LONG, [0]),
    entry(277, T_SHORT, [1]),
    entry(278, T_LONG, [height]),
    entry(279, T_LONG, [raw.length]),
    entry(339, T_SHORT, [3]), // IEEE float
    entry(33550, T_DOUBLE, [opts.pixelScaleX, opts.pixelScaleY, 0]),
    entry(33922, T_DOUBLE, [0, 0, 0, opts.tiepointX, opts.tiepointY, 0]),
    entry(34735, T_SHORT, geoKeys),
    entry(42113, T_ASCII, asciiBytes(String(nodata))),
  ]

  if (opts.embedStats !== false) {
    const stats = computeFloatRasterStats(samples, nodata)
    if (stats) {
      entries.push(entry(42112, T_ASCII, asciiBytes(buildGdalMetadataXml(stats))))
    }
  }
  if (opts.description) {
    entries.push(entry(270, T_ASCII, asciiBytes(opts.description.slice(0, 200))))
  }

  return assembleTiff(entries, raw)
}

export type WriteRgbGisGeoTiffOpts = {
  width: number
  height: number
  /** RGB (len = w*h*3) or RGBA (len = w*h*4). */
  pixels: Uint8Array
  samplesPerPixel: 3 | 4
  pixelScaleX: number
  pixelScaleY: number
  tiepointX: number
  tiepointY: number
  epsg: number
  geographic?: boolean
  description?: string
}

/** 3-band RGB or 4-band RGBA (unassociated alpha) GeoTIFF for immediate Pro display. */
export function writeRgbGisGeoTiff(opts: WriteRgbGisGeoTiffOpts): ArrayBuffer {
  const { width, height, pixels, samplesPerPixel } = opts
  const need = width * height * samplesPerPixel
  if (pixels.length < need) {
    throw new Error(`RGB buffer too short for GeoTIFF export (${pixels.length} < ${need}).`)
  }
  const strip = pixels.length === need ? pixels : pixels.subarray(0, need)
  const geographic = opts.geographic ?? opts.epsg === 4326
  const geoKeys = geographic
    ? [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, opts.epsg]
    : [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, opts.epsg]

  const bits = Array.from({ length: samplesPerPixel }, () => 8)
  const sampleFmt = Array.from({ length: samplesPerPixel }, () => 1)
  const entries: TiffEntry[] = [
    entry(256, T_LONG, [width]),
    entry(257, T_LONG, [height]),
    entry(258, T_SHORT, bits),
    entry(259, T_SHORT, [1]),
    entry(262, T_SHORT, [2]), // RGB
    entry(273, T_LONG, [0]),
    entry(277, T_SHORT, [samplesPerPixel]),
    entry(278, T_LONG, [height]),
    entry(279, T_LONG, [strip.length]),
    entry(284, T_SHORT, [1]), // Contig
    entry(339, T_SHORT, sampleFmt),
    entry(33550, T_DOUBLE, [opts.pixelScaleX, opts.pixelScaleY, 0]),
    entry(33922, T_DOUBLE, [0, 0, 0, opts.tiepointX, opts.tiepointY, 0]),
    entry(34735, T_SHORT, geoKeys),
  ]
  if (samplesPerPixel === 4) {
    entries.push(entry(338, T_SHORT, [2])) // ExtraSamples = unassociated alpha
  }
  if (opts.description) {
    entries.push(entry(270, T_ASCII, asciiBytes(opts.description.slice(0, 200))))
  }
  return assembleTiff(entries, strip)
}

export type WriteMultiBandFloat32Opts = {
  width: number
  height: number
  bands: Float32Array[]
  pixelScaleX: number
  pixelScaleY: number
  tiepointX: number
  tiepointY: number
  epsg: number
  geographic?: boolean
  nodata?: number
  description?: string
}

export function writeMultiBandFloat32GisGeoTiff(opts: WriteMultiBandFloat32Opts): ArrayBuffer {
  const nodata = Number.isFinite(opts.nodata) ? opts.nodata! : GIS_FLOAT_NODATA
  const { width, height, bands } = opts
  const spp = bands.length
  const n = width * height
  const raw = new Uint8Array(n * spp * 4)
  const rawDv = new DataView(raw.buffer)
  for (let p = 0; p < n; p += 1) {
    for (let b = 0; b < spp; b += 1) {
      const v = bands[b]![p]!
      rawDv.setFloat32((p * spp + b) * 4, Number.isFinite(v) ? v : nodata, true)
    }
  }
  const geographic = opts.geographic ?? opts.epsg === 4326
  const geoKeys = geographic
    ? [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, opts.epsg]
    : [1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, opts.epsg]
  const bits = Array.from({ length: spp }, () => 32)
  const sampleFmt = Array.from({ length: spp }, () => 3)
  const entries: TiffEntry[] = [
    entry(256, T_LONG, [width]),
    entry(257, T_LONG, [height]),
    entry(258, T_SHORT, bits),
    entry(259, T_SHORT, [1]),
    entry(262, T_SHORT, [1]),
    entry(273, T_LONG, [0]),
    entry(277, T_SHORT, [spp]),
    entry(278, T_LONG, [height]),
    entry(279, T_LONG, [raw.length]),
    entry(284, T_SHORT, [1]),
    entry(339, T_SHORT, sampleFmt),
    entry(33550, T_DOUBLE, [opts.pixelScaleX, opts.pixelScaleY, 0]),
    entry(33922, T_DOUBLE, [0, 0, 0, opts.tiepointX, opts.tiepointY, 0]),
    entry(34735, T_SHORT, geoKeys),
    entry(42113, T_ASCII, asciiBytes(String(nodata))),
  ]
  const stats = computeFloatRasterStats(bands[0]!, nodata)
  if (stats) {
    entries.push(entry(42112, T_ASCII, asciiBytes(buildGdalMetadataXml(stats))))
  }
  if (opts.description) {
    entries.push(entry(270, T_ASCII, asciiBytes(opts.description.slice(0, 200))))
  }
  return assembleTiff(entries, raw)
}
