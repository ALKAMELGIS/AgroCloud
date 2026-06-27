/**
 * Self-contained, GIS-grade GeoTIFF (.tif) writer for the analysis-result
 * rasters produced by the Hydro Watershed Workflow tool.
 *
 * Design goals (ArcGIS Pro / QGIS compatible, no quality loss):
 *   • Single-band 32-bit IEEE float — the NATIVE computed values are written
 *     verbatim (no rescaling, no 8-bit quantisation, no resampling).
 *   • Fully georeferenced: EPSG:3857 (Web Mercator) — the exact CRS the DEM grid
 *     is sampled in — via ModelPixelScale + ModelTiepoint + GeoKeyDirectory, so
 *     the pixel size and geotransform match the source grid 1:1.
 *   • Clipped to the AOI: the output is cropped to the AOI mask's pixel window
 *     and every pixel outside the AOI polygon is written as NoData (NaN), so the
 *     file bounds match the AOI and it holds no data outside the study area.
 *   • Lossless LZW compression (TIFF tag 259 = 5) to keep files small without
 *     altering a single value.
 *
 * The DEM grid comes from square Web-Mercator terrain tiles, so each pixel is a
 * regular square in EPSG:3857 — a north-up, axis-aligned grid that maps to a
 * GeoTIFF with no resampling whatsoever.
 */

/** Circumference of the Web-Mercator world in projected metres. */
const WORLD_METERS = 2 * Math.PI * 6378137
const TILE_SIZE = 256

/** A single-band raster + the georeferencing needed to write a GeoTIFF. */
export type GeoBand = {
  /** Native values, row-major (length = width*height). */
  values: Float32Array
  width: number
  height: number
  /** Web-Mercator zoom the grid was sampled at. */
  zoom: number
  /** World-pixel coordinate of the grid's top-left corner at `zoom`. */
  originWorldPxX: number
  originWorldPxY: number
  /** NoData sentinel (defaults to NaN). */
  nodata: number
  /** Human-readable layer / file name. */
  name: string
}

type ClipWindow = { c0: number; r0: number; c1: number; r1: number }

/** Tight pixel window (inclusive) of the AOI mask, or the full grid if no mask. */
function maskWindow(mask: Uint8Array | null, width: number, height: number): ClipWindow {
  if (!mask) return { c0: 0, r0: 0, c1: width - 1, r1: height - 1 }
  let c0 = width
  let r0 = height
  let c1 = -1
  let r1 = -1
  for (let r = 0; r < height; r += 1) {
    const row = r * width
    for (let c = 0; c < width; c += 1) {
      if (!mask[row + c]) continue
      if (c < c0) c0 = c
      if (c > c1) c1 = c
      if (r < r0) r0 = r
      if (r > r1) r1 = r
    }
  }
  if (c1 < 0) return { c0: 0, r0: 0, c1: width - 1, r1: height - 1 }
  return { c0, r0, c1, r1 }
}

// ── TIFF LZW (tag 259 = 5), MSB-first, 9→12 bit codes with early change ───────

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
        // Early-change width bump (one code before the bit boundary).
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

// ── Minimal TIFF/GeoTIFF assembler ────────────────────────────────────────────

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
  return b // NUL-terminated
}

type WriteGeoTiffOptions = {
  width: number
  height: number
  /** Row-major Float32 sample values for the cropped window. */
  samples: Float32Array
  pixelScale: number // metres / px (square)
  tiepointX: number // top-left X in EPSG:3857 metres
  tiepointY: number // top-left Y in EPSG:3857 metres
  epsg: number
  nodata: number
  compress: boolean
}

/** Assemble a single-band Float32 GeoTIFF as an ArrayBuffer. */
function writeGeoTiff(opts: WriteGeoTiffOptions): ArrayBuffer {
  const { width, height, samples } = opts

  // Raw little-endian Float32 strip, then optional LZW.
  const raw = new Uint8Array(width * height * 4)
  const rawDv = new DataView(raw.buffer)
  for (let i = 0; i < samples.length; i += 1) rawDv.setFloat32(i * 4, samples[i]!, true)
  const strip = opts.compress ? lzwCompress(raw) : raw
  const compression = opts.compress ? 5 : 1

  const nodataStr =
    Number.isNaN(opts.nodata) ? 'nan' : Number.isFinite(opts.nodata) ? String(opts.nodata) : 'nan'

  // GeoKeyDirectory: Projected CRS = EPSG code, PixelIsArea.
  const geoKeys = [
    1, 1, 0, 3, // version, revision, minor, number-of-keys
    1024, 0, 1, 1, // GTModelTypeGeoKey = ModelTypeProjected
    1025, 0, 1, 1, // GTRasterTypeGeoKey = RasterPixelIsArea
    3072, 0, 1, opts.epsg, // ProjectedCSTypeGeoKey
  ]

  // Tags MUST be written in ascending tag order.
  const entries: TiffEntry[] = [
    entry(256, T_LONG, [width]),
    entry(257, T_LONG, [height]),
    entry(258, T_SHORT, [32]), // BitsPerSample
    entry(259, T_SHORT, [compression]),
    entry(262, T_SHORT, [1]), // PhotometricInterpretation = BlackIsZero
    entry(273, T_LONG, [0]), // StripOffsets — patched below
    entry(277, T_SHORT, [1]), // SamplesPerPixel
    entry(278, T_LONG, [height]), // RowsPerStrip (single strip)
    entry(279, T_LONG, [strip.length]), // StripByteCounts
    entry(339, T_SHORT, [3]), // SampleFormat = IEEE float
    entry(33550, T_DOUBLE, [opts.pixelScale, opts.pixelScale, 0]), // ModelPixelScale
    entry(33922, T_DOUBLE, [0, 0, 0, opts.tiepointX, opts.tiepointY, 0]), // ModelTiepoint
    entry(34735, T_SHORT, geoKeys), // GeoKeyDirectory
    entry(42113, T_ASCII, asciiBytes(nodataStr)), // GDAL_NODATA
  ]

  const numTags = entries.length
  const ifdOffset = 8
  const ifdSize = 2 + numTags * 12 + 4
  let extraOffset = ifdOffset + ifdSize

  // Lay out external (>4 byte) tag payloads, word-aligned.
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

  // Header (little-endian classic TIFF).
  dv.setUint16(0, 0x4949, true) // "II"
  dv.setUint16(2, 42, true)
  dv.setUint32(4, ifdOffset, true)

  // Patch dynamic values.
  const stripOffsetEntry = entries.find(e => e.tag === 273)!
  new DataView(stripOffsetEntry.data.buffer).setUint32(0, stripOffset, true)

  // IFD.
  dv.setUint16(ifdOffset, numTags, true)
  let p = ifdOffset + 2
  for (const e of entries) {
    dv.setUint16(p, e.tag, true)
    dv.setUint16(p + 2, e.type, true)
    dv.setUint32(p + 4, e.count, true)
    if (e.data.length <= 4) {
      // Inline, left-justified.
      bytes.set(e.data, p + 8)
    } else {
      const ext = externals.find(x => x.entry === e)!
      dv.setUint32(p + 8, ext.offset, true)
    }
    p += 12
  }
  dv.setUint32(p, 0, true) // next IFD = none

  // External payloads + strip.
  for (const ext of externals) bytes.set(ext.entry.data, ext.offset)
  bytes.set(strip, stripOffset)

  return buffer
}

export type ExportGeoTiffResult = { blob: Blob; filename: string }

/**
 * Clip a band to its AOI mask and return a georeferenced, LZW-compressed,
 * single-band Float32 GeoTIFF (EPSG:3857) as a downloadable Blob.
 */
export function buildAoiGeoTiff(
  band: GeoBand,
  aoiMask: Uint8Array | null,
  opts?: { epsg?: number; compress?: boolean },
): ExportGeoTiffResult {
  const { width, height, values } = band
  const nodata = Number.isFinite(band.nodata) ? band.nodata : NaN
  const win = maskWindow(aoiMask, width, height)
  const cw = win.c1 - win.c0 + 1
  const ch = win.r1 - win.r0 + 1

  // Crop to the AOI window; blank everything outside the AOI polygon.
  const out = new Float32Array(cw * ch)
  for (let r = 0; r < ch; r += 1) {
    const srcRow = (win.r0 + r) * width
    const dstRow = r * cw
    for (let c = 0; c < cw; c += 1) {
      const srcIdx = srcRow + win.c0 + c
      const inside = !aoiMask || aoiMask[srcIdx]
      out[dstRow + c] = inside ? values[srcIdx]! : nodata
    }
  }

  // EPSG:3857 georeferencing for the cropped window (no resampling).
  const mapSize = TILE_SIZE * 2 ** band.zoom
  const pixelScale = WORLD_METERS / mapSize
  const winOriginPxX = band.originWorldPxX + win.c0
  const winOriginPxY = band.originWorldPxY + win.r0
  const tiepointX = -WORLD_METERS / 2 + winOriginPxX * pixelScale
  const tiepointY = WORLD_METERS / 2 - winOriginPxY * pixelScale

  const arrayBuffer = writeGeoTiff({
    width: cw,
    height: ch,
    samples: out,
    pixelScale,
    tiepointX,
    tiepointY,
    epsg: opts?.epsg ?? 3857,
    nodata,
    compress: opts?.compress ?? true,
  })

  const safe = band.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return { blob: new Blob([arrayBuffer], { type: 'image/tiff' }), filename: `${safe || 'raster'}.tif` }
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click has been processed.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
