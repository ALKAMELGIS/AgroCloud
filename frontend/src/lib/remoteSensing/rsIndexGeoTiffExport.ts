/**
 * Remote Sensing — Export active index as GIS-ready GeoTIFF.
 *
 * ZIP contents (ArcGIS Pro / QGIS / GDAL):
 *   • {layer}_{date}_rgb.tif   — 3-band RGB (open this in Map — colours show immediately)
 *   • {layer}_{date}.tif       — Float32 real index values (EPSG:4326, NoData=-9999)
 *   • *.prj / *.tfw            — WGS84 sidecars
 *   • NDVI/NDWI/NDMI_*.tif     — companion spectral indices (Float32)
 *   • {layer}_{date}_spectra.tif — source Sentinel-2 bands (Float32 reflectance 0–1)
 *   • README.txt
 *
 * Why RGB is included: ArcGIS Pro default stretch on Float32 (−1…1) often looks
 * blank/black on the map canvas. Open *_rgb.tif for display; use the Float32 for analysis.
 */

import JSZip from 'jszip'
import {
  appendSentinelHubWmsAccessToken,
  getSentinelHubWmsLayerCatalog,
  resolveSentinelHubWmsEvalscriptProxyLayerName,
} from '../sentinelHubWmsLayers'
import { getSentinelHubWmsBaseUrl } from '../sentinelHubWmsInstance'
import {
  isSentinelIndexColorRampProfile,
  sampleSentinelNdviColorMap,
  SENTINEL_NDMI_MOISTURE_RAMP,
  SENTINEL_NDWI_RAMP,
  type SentinelIndexEvalProfile,
} from '../sentinelHubWmsIndexEvalscripts'
import { SENTINEL_ET_RAMP } from '../etIndex'
import { downloadBlob } from '../hydroWatershed/geoTiffExport'

/** ArcGIS-friendly nodata (NaN Float32 often fails to display in Pro). */
const FLOAT_NODATA = -9999

export type RsIndexGeoTiffExportInput = {
  layerId: string
  sceneDate: string
  geometry: GeoJSON.Geometry
  /** Target ground sampling (m). Default 10 (Sentinel-2 native). */
  metersPerPixel?: number
  aoiName?: string
  signal?: AbortSignal
  onProgress?: (label: string) => void
}

type IndexGrid = {
  values: Float32Array
  valid: Uint8Array
  width: number
  height: number
  west: number
  south: number
  east: number
  north: number
}

type SpectraGrid = {
  bands: Array<{ name: string; values: Float32Array }>
  valid: Uint8Array
  width: number
  height: number
  west: number
  south: number
  east: number
  north: number
}

const INDEX_BANDS: Record<SentinelIndexEvalProfile, { bands: string[]; expr: string }> = {
  ndvi: { bands: ['B04', 'B08'], expr: '(s.B08-s.B04)/(s.B08+s.B04)' },
  ndwi: { bands: ['B03', 'B08'], expr: '(s.B03-s.B08)/(s.B03+s.B08)' },
  mndwi: { bands: ['B03', 'B11'], expr: '(s.B03-s.B11)/(s.B03+s.B11)' },
  ndmi: { bands: ['B8A', 'B11'], expr: '(s.B8A-s.B11)/(s.B8A+s.B11)' },
  evi: {
    bands: ['B02', 'B04', 'B08'],
    expr: '2.5*((s.B08-s.B04)/(s.B08+6.0*s.B04-7.5*s.B02+1.0))',
  },
  savi: {
    bands: ['B04', 'B08'],
    expr: '((s.B08-s.B04)*1.5)/(s.B08+s.B04+0.5)',
  },
  gndvi: { bands: ['B03', 'B08'], expr: '(s.B08-s.B03)/(s.B08+s.B03)' },
  ndsi: { bands: ['B03', 'B11'], expr: '(s.B03-s.B11)/(s.B03+s.B11)' },
  ndre: { bands: ['B05', 'B08'], expr: '(s.B08-s.B05)/(s.B08+s.B05)' },
  et: {
    bands: ['B03', 'B04', 'B08', 'B11'],
    // Moisture demand proxy (mm/day scale left to analyst); export raw moisture score 0–1.
    expr: 'Math.max(0,Math.min(1,1-(0.6*((s.B08-s.B11)/(s.B08+s.B11))+0.4*((s.B03-s.B08)/(s.B03+s.B08)))))',
  },
}

function resolveIndexProfile(layerId: string): SentinelIndexEvalProfile | null {
  const raw = String(layerId || '').trim()
  if (!raw) return null
  if (isSentinelIndexColorRampProfile(raw.toLowerCase())) {
    return raw.toLowerCase() as SentinelIndexEvalProfile
  }
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const map: Record<string, SentinelIndexEvalProfile> = {
    NDVI: 'ndvi',
    NDWI: 'ndwi',
    MNDWI: 'mndwi',
    NDMI: 'ndmi',
    EVI: 'evi',
    SAVI: 'savi',
    GNDVI: 'gndvi',
    NDSI: 'ndsi',
    NDRE: 'ndre',
    ET: 'et',
    EVAPOTRANSPIRATION: 'et',
  }
  for (const [k, v] of Object.entries(map)) {
    if (key === k || key.includes(k)) return v
  }
  return null
}

function geometryBbox4326(geometry: GeoJSON.Geometry): [number, number, number, number] {
  const pts: number[][] = []
  const walk = (c: unknown): void => {
    if (!c) return
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      pts.push(c as number[])
      return
    }
    if (Array.isArray(c)) c.forEach(walk)
  }
  walk((geometry as { coordinates?: unknown }).coordinates)
  if (!pts.length) throw new Error('AOI polygon has no coordinates.')
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

function lngLatTo3857(lng: number, lat: number): [number, number] {
  const x = (lng * 20037508.34) / 180
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)
  y = (y * 20037508.34) / 180
  return [x, y]
}

function toBase64(text: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(text)))
  return text
}

function safeStem(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'index'
  )
}

function buildPrjWgs84(): string {
  return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]\n'
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
  return [
    sx.toFixed(12),
    '0.000000000000',
    '0.000000000000',
    (-sy).toFixed(12),
    (west + sx / 2).toFixed(12),
    (north - sy / 2).toFixed(12),
    '',
  ].join('\n')
}

function sampleRampHex(value: number, ramp: ReadonlyArray<readonly [number, number]>): number {
  if (!ramp.length) return 0
  if (value <= ramp[0]![0]) return ramp[0]![1]
  if (value >= ramp[ramp.length - 1]![0]) return ramp[ramp.length - 1]![1]
  for (let i = 0; i < ramp.length - 1; i += 1) {
    const [v0, c0] = ramp[i]!
    const [v1, c1] = ramp[i + 1]!
    if (value >= v0 && value <= v1) {
      const span = v1 - v0
      const t = span > 0 ? (value - v0) / span : 0
      const r0 = (c0 >> 16) & 0xff
      const g0 = (c0 >> 8) & 0xff
      const b0 = c0 & 0xff
      const r1 = (c1 >> 16) & 0xff
      const g1 = (c1 >> 8) & 0xff
      const b1 = c1 & 0xff
      const r = Math.round(r0 + (r1 - r0) * t)
      const g = Math.round(g0 + (g1 - g0) * t)
      const b = Math.round(b0 + (b1 - b0) * t)
      return (r << 16) | (g << 8) | b
    }
  }
  return ramp[ramp.length - 1]![1]
}

function indexColorHex(profile: SentinelIndexEvalProfile, value: number): number {
  if (!Number.isFinite(value)) return 0
  switch (profile) {
    case 'ndwi':
    case 'mndwi':
    case 'ndsi':
      return sampleRampHex(value, SENTINEL_NDWI_RAMP)
    case 'ndmi':
      return sampleRampHex(value, SENTINEL_NDMI_MOISTURE_RAMP)
    case 'et':
      return sampleRampHex(value, SENTINEL_ET_RAMP as ReadonlyArray<readonly [number, number]>)
    case 'ndvi':
    case 'evi':
    case 'savi':
    case 'gndvi':
    case 'ndre':
    default:
      return sampleSentinelNdviColorMap(value)
  }
}

/** Pack Float32 index → RGB for ArcGIS display. Nodata → black. */
export function indexGridToRgb(
  values: Float32Array,
  profile: SentinelIndexEvalProfile,
): Uint8Array {
  const out = new Uint8Array(values.length * 3)
  for (let p = 0; p < values.length; p += 1) {
    const v = values[p]!
    const o = p * 3
    if (!Number.isFinite(v) || v === FLOAT_NODATA) {
      out[o] = 0
      out[o + 1] = 0
      out[o + 2] = 0
      continue
    }
    const hex = indexColorHex(profile, v)
    out[o] = (hex >> 16) & 0xff
    out[o + 1] = (hex >> 8) & 0xff
    out[o + 2] = hex & 0xff
  }
  return out
}

/** Replace NaN / non-finite with ArcGIS-safe nodata. */
function sanitizeFloatNodata(values: Float32Array): Float32Array {
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i]!
    out[i] = Number.isFinite(v) ? v : FLOAT_NODATA
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
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInGeometry(lng: number, lat: number, geometry: GeoJSON.Geometry): boolean {
  if (geometry.type === 'Polygon') {
    const outer = geometry.coordinates[0]
    if (!outer || outer.length < 3) return false
    if (!pointInRing(lng, lat, outer as number[][])) return false
    for (let h = 1; h < geometry.coordinates.length; h += 1) {
      if (pointInRing(lng, lat, geometry.coordinates[h] as number[][])) return false
    }
    return true
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some(poly =>
      pointInGeometry(lng, lat, { type: 'Polygon', coordinates: poly }),
    )
  }
  return true
}

function applyAoiNodata(
  values: Float32Array,
  valid: Uint8Array,
  width: number,
  height: number,
  bounds: [number, number, number, number],
  geometry: GeoJSON.Geometry,
): void {
  const [w, s, e, n] = bounds
  const dx = (e - w) / width
  const dy = (n - s) / height
  for (let row = 0; row < height; row += 1) {
    const lat = n - (row + 0.5) * dy
    for (let col = 0; col < width; col += 1) {
      const lng = w + (col + 0.5) * dx
      const p = row * width + col
      if (!pointInGeometry(lng, lat, geometry)) {
        values[p] = FLOAT_NODATA
        valid[p] = 0
      }
    }
  }
}

// ── TIFF helpers (Float32, EPSG:4326) ────────────────────────────────────────

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
  if (type === T_ASCII) buf.set(values as Uint8Array)
  else if (type === T_SHORT) (values as number[]).forEach((v, i) => dv.setUint16(i * 2, v, true))
  else if (type === T_LONG) (values as number[]).forEach((v, i) => dv.setUint32(i * 4, v, true))
  else if (type === T_DOUBLE) (values as number[]).forEach((v, i) => dv.setFloat64(i * 8, v, true))
  return { tag, type, count, data: buf }
}

function asciiBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length + 1)
  for (let i = 0; i < s.length; i += 1) b[i] = s.charCodeAt(i) & 0xff
  return b
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
      if (existing !== undefined) omega = existing
      else {
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

function writeFloat32GeoTiff4326(opts: {
  width: number
  height: number
  samples: Float32Array
  west: number
  north: number
  east: number
  south: number
  compress?: boolean
  description?: string
}): ArrayBuffer {
  const { width, height, samples } = opts
  const raw = new Uint8Array(width * height * 4)
  const rawDv = new DataView(raw.buffer)
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i]!
    rawDv.setFloat32(i * 4, Number.isFinite(v) ? v : FLOAT_NODATA, true)
  }
  // Uncompressed by default — custom LZW + Float32 often fails to open in ArcGIS Pro.
  const strip = opts.compress === true ? lzwCompress(raw) : raw
  const compression = opts.compress === true ? 5 : 1
  const pixelScaleX = (opts.east - opts.west) / width
  const pixelScaleY = (opts.north - opts.south) / height
  const geoKeys = [
    1, 1, 0, 3,
    1024, 0, 1, 2, // Geographic
    1025, 0, 1, 1, // PixelIsArea
    2048, 0, 1, 4326, // WGS84
  ]
  const entries: TiffEntry[] = [
    entry(256, T_LONG, [width]),
    entry(257, T_LONG, [height]),
    entry(258, T_SHORT, [32]),
    entry(259, T_SHORT, [compression]),
    entry(262, T_SHORT, [1]),
    entry(273, T_LONG, [0]),
    entry(277, T_SHORT, [1]),
    entry(278, T_LONG, [height]),
    entry(279, T_LONG, [strip.length]),
    entry(339, T_SHORT, [3]), // IEEE float
    entry(33550, T_DOUBLE, [pixelScaleX, pixelScaleY, 0]),
    entry(33922, T_DOUBLE, [0, 0, 0, opts.west, opts.north, 0]),
    entry(34735, T_SHORT, geoKeys),
    entry(42113, T_ASCII, asciiBytes(String(FLOAT_NODATA))),
  ]
  if (opts.description) {
    entries.push(entry(270, T_ASCII, asciiBytes(opts.description.slice(0, 200))))
    entries.sort((a, b) => a.tag - b.tag)
  }

  return assembleTiff(entries, strip)
}

/** 3-band RGB GeoTIFF — displays immediately in ArcGIS Pro. */
function writeRgbGeoTiff4326(opts: {
  width: number
  height: number
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
  const strip = opts.compress === true ? lzwCompress(rgb) : rgb
  const compression = opts.compress === true ? 5 : 1
  const pixelScaleX = (opts.east - opts.west) / width
  const pixelScaleY = (opts.north - opts.south) / height
  const geoKeys = [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]
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
    entry(284, T_SHORT, [1]),
    entry(339, T_SHORT, [1, 1, 1]),
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

/** Contiguous multi-band Float32 GeoTIFF (spectral stack). */
function writeMultiBandFloat32GeoTiff4326(opts: {
  width: number
  height: number
  bands: Float32Array[]
  west: number
  north: number
  east: number
  south: number
  compress?: boolean
  description?: string
}): ArrayBuffer {
  const { width, height, bands } = opts
  const spp = bands.length
  const n = width * height
  const raw = new Uint8Array(n * spp * 4)
  const rawDv = new DataView(raw.buffer)
  for (let p = 0; p < n; p += 1) {
    for (let b = 0; b < spp; b += 1) {
      const v = bands[b]![p]!
      rawDv.setFloat32((p * spp + b) * 4, Number.isFinite(v) ? v : FLOAT_NODATA, true)
    }
  }
  const strip = opts.compress === true ? lzwCompress(raw) : raw
  const compression = opts.compress === true ? 5 : 1
  const pixelScaleX = (opts.east - opts.west) / width
  const pixelScaleY = (opts.north - opts.south) / height
  const geoKeys = [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]
  const bits = Array.from({ length: spp }, () => 32)
  const sampleFmt = Array.from({ length: spp }, () => 3)
  const entries: TiffEntry[] = [
    entry(256, T_LONG, [width]),
    entry(257, T_LONG, [height]),
    entry(258, T_SHORT, bits),
    entry(259, T_SHORT, [compression]),
    entry(262, T_SHORT, [1]),
    entry(273, T_LONG, [0]),
    entry(277, T_SHORT, [spp]),
    entry(278, T_LONG, [height]),
    entry(279, T_LONG, [strip.length]),
    entry(284, T_SHORT, [1]), // Contig
    entry(339, T_SHORT, sampleFmt),
    entry(33550, T_DOUBLE, [pixelScaleX, pixelScaleY, 0]),
    entry(33922, T_DOUBLE, [0, 0, 0, opts.west, opts.north, 0]),
    entry(34735, T_SHORT, geoKeys),
    entry(42113, T_ASCII, asciiBytes(String(FLOAT_NODATA))),
  ]
  if (opts.description) {
    entries.push(entry(270, T_ASCII, asciiBytes(opts.description.slice(0, 200))))
  }
  return assembleTiff(entries, strip)
}

// ── WMS fetch ────────────────────────────────────────────────────────────────

function buildIndexFloatEvalscript(profile: SentinelIndexEvalProfile): string {
  const spec = INDEX_BANDS[profile]
  const inputs = [...spec.bands, 'SCL', 'CLM', 'dataMask']
  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: ${JSON.stringify(inputs)} }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var scl = s.SCL;
  var cloud = (scl == 0 || scl == 1 || scl == 3 || scl == 8 || scl == 9) || s.CLM == 1;
  if (!s.dataMask || cloud) return [0, 0, 0, 0];
  var v = ${spec.expr};
  if (isNaN(v)) return [0, 0, 0, 0];
  var enc = Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  return [enc, 127, 127, 255];
}`
}

function buildSpectraEvalscript(bands: string[]): string {
  const unique = bands.slice(0, 3)
  const inputs = [...unique, 'SCL', 'CLM', 'dataMask']
  const channels = [
    unique[0] ? `enc(s.${unique[0]})` : '0',
    unique[1] ? `enc(s.${unique[1]})` : '0',
    unique[2] ? `enc(s.${unique[2]})` : '0',
  ]
  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: ${JSON.stringify(inputs)} }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var scl = s.SCL;
  var cloud = (scl == 0 || scl == 1 || scl == 3 || scl == 8 || scl == 9) || s.CLM == 1;
  if (!s.dataMask || cloud) return [0, 0, 0, 0];
  function enc(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round(v * 254)));
  }
  return [${channels.join(', ')}, 255];
}`
}

async function fetchWmsRgba(
  bbox3857: [number, number, number, number],
  timeStart: string,
  timeEnd: string,
  sizeW: number,
  sizeH: number,
  evalscript: string,
  signal?: AbortSignal,
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const layer = resolveSentinelHubWmsEvalscriptProxyLayerName(getSentinelHubWmsLayerCatalog())
  const [minX, minY, maxX, maxY] = bbox3857
  let url =
    `${getSentinelHubWmsBaseUrl()}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${sizeW}&HEIGHT=${sizeH}` +
    `&TIME=${timeStart}/${timeEnd}&MAXCC=40&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(toBase64(evalscript))}`
  url = appendSentinelHubWmsAccessToken(url)
  const res = await fetch(url, { headers: { Accept: 'image/png' }, signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sentinel Hub WMS GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  const blob = await res.blob()
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = sizeW
    canvas.height = sizeH
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas unavailable for GeoTIFF export')
    ctx.drawImage(bitmap, 0, 0, sizeW, sizeH)
    const { data } = ctx.getImageData(0, 0, sizeW, sizeH)
    return { data, width: sizeW, height: sizeH }
  } finally {
    bitmap.close()
  }
}

async function fetchIndexGrid(
  profile: SentinelIndexEvalProfile,
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  metersPerPixel: number,
  signal?: AbortSignal,
): Promise<IndexGrid> {
  const [w, s, e, n] = geometryBbox4326(geometry)
  const [minX, minY] = lngLatTo3857(w, s)
  const [maxX, maxY] = lngLatTo3857(e, n)
  const spanX = maxX - minX
  const spanY = maxY - minY
  const mpp = Math.max(3, metersPerPixel)
  const width = Math.max(64, Math.min(2048, Math.round(spanX / mpp)))
  const height = Math.max(64, Math.min(2048, Math.round(spanY / mpp)))
  const day = new Date(`${sceneDate}T00:00:00Z`)
  const t0 = new Date(day.getTime() - 3 * 86400000).toISOString().slice(0, 10)
  const t1 = new Date(day.getTime() + 3 * 86400000).toISOString().slice(0, 10)
  const { data } = await fetchWmsRgba(
    [minX, minY, maxX, maxY],
    t0,
    t1,
    width,
    height,
    buildIndexFloatEvalscript(profile),
    signal,
  )
  const values = new Float32Array(width * height)
  const valid = new Uint8Array(width * height)
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4
    const a = data[i + 3]!
    if (a < 128) {
      values[p] = FLOAT_NODATA
      valid[p] = 0
      continue
    }
    values[p] = data[i]! / 127 - 1
    valid[p] = 1
  }
  applyAoiNodata(values, valid, width, height, [w, s, e, n], geometry)
  return { values, valid, width, height, west: w, south: s, east: e, north: n }
}

async function fetchSpectraGrid(
  bands: string[],
  geometry: GeoJSON.Geometry,
  sceneDate: string,
  metersPerPixel: number,
  signal?: AbortSignal,
): Promise<SpectraGrid> {
  const unique = [...new Set(bands)].slice(0, 3)
  const [w, s, e, n] = geometryBbox4326(geometry)
  const [minX, minY] = lngLatTo3857(w, s)
  const [maxX, maxY] = lngLatTo3857(e, n)
  const spanX = maxX - minX
  const spanY = maxY - minY
  const mpp = Math.max(3, metersPerPixel)
  const width = Math.max(64, Math.min(2048, Math.round(spanX / mpp)))
  const height = Math.max(64, Math.min(2048, Math.round(spanY / mpp)))
  const day = new Date(`${sceneDate}T00:00:00Z`)
  const t0 = new Date(day.getTime() - 3 * 86400000).toISOString().slice(0, 10)
  const t1 = new Date(day.getTime() + 3 * 86400000).toISOString().slice(0, 10)
  const { data } = await fetchWmsRgba(
    [minX, minY, maxX, maxY],
    t0,
    t1,
    width,
    height,
    buildSpectraEvalscript(unique),
    signal,
  )
  const valid = new Uint8Array(width * height)
  const outBands = unique.map(name => ({ name, values: new Float32Array(width * height) }))
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4
    const a = data[i + 3]!
    if (a < 128) {
      valid[p] = 0
      for (const b of outBands) b.values[p] = FLOAT_NODATA
      continue
    }
    valid[p] = 1
    for (let b = 0; b < outBands.length; b += 1) {
      outBands[b]!.values[p] = data[i + b]! / 254
    }
  }
  for (const b of outBands) {
    applyAoiNodata(b.values, valid, width, height, [w, s, e, n], geometry)
  }
  return { bands: outBands, valid, width, height, west: w, south: s, east: e, north: n }
}

/**
 * Export the active Remote Sensing index (+ spectral companions) as a GIS ZIP.
 */
export async function exportRemoteSensingIndexGeoTiff(
  input: RsIndexGeoTiffExportInput,
): Promise<{ filename: string }> {
  const profile = resolveIndexProfile(input.layerId)
  if (!profile) {
    throw new Error(
      `Layer "${input.layerId}" is not a spectral index (NDVI, NDWI, NDMI, …). Select an index layer to export GeoTIFF.`,
    )
  }
  const geom = input.geometry
  if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) {
    throw new Error('Draw an AOI polygon before exporting GeoTIFF.')
  }
  const sceneDate = String(input.sceneDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sceneDate)) {
    throw new Error('Select a valid imagery date before exporting GeoTIFF.')
  }
  const mpp = input.metersPerPixel ?? 10

  input.onProgress?.(`Fetching ${profile.toUpperCase()} Float32 grid…`)
  const indexGrid = await fetchIndexGrid(profile, geom, sceneDate, mpp, input.signal)

  input.onProgress?.('Fetching companion indices (NDVI · NDWI · NDMI)…')
  const companions: Array<{ id: SentinelIndexEvalProfile; grid: IndexGrid }> = []
  for (const id of ['ndvi', 'ndwi', 'ndmi'] as const) {
    if (id === profile) continue
    try {
      companions.push({
        id,
        grid: await fetchIndexGrid(id, geom, sceneDate, mpp, input.signal),
      })
    } catch {
      /* optional companions */
    }
  }

  input.onProgress?.('Fetching source spectral bands…')
  const bandNames = INDEX_BANDS[profile].bands
  let spectra: SpectraGrid | null = null
  try {
    spectra = await fetchSpectraGrid(bandNames, geom, sceneDate, mpp, input.signal)
  } catch {
    spectra = null
  }

  input.onProgress?.('Writing GeoTIFF (EPSG:4326)…')
  const stem = `${safeStem(profile)}_${sceneDate.replace(/-/g, '')}`
  const aoi = safeStem(input.aoiName || 'aoi')
  const zip = new JSZip()
  const prj = buildPrjWgs84()
  const tfw = buildWorldFile4326(
    indexGrid.west,
    indexGrid.north,
    indexGrid.east,
    indexGrid.south,
    indexGrid.width,
    indexGrid.height,
  )

  const floatSamples = sanitizeFloatNodata(indexGrid.values)
  const rgb = indexGridToRgb(floatSamples, profile)
  const rgbTif = writeRgbGeoTiff4326({
    width: indexGrid.width,
    height: indexGrid.height,
    rgb,
    west: indexGrid.west,
    north: indexGrid.north,
    east: indexGrid.east,
    south: indexGrid.south,
    compress: false,
  })
  // RGB first — open this in ArcGIS Pro Map.
  zip.file(`${stem}_rgb.tif`, rgbTif)
  zip.file(`${stem}_rgb.tfw`, tfw)
  zip.file(`${stem}_rgb.prj`, prj)

  const mainTif = writeFloat32GeoTiff4326({
    width: indexGrid.width,
    height: indexGrid.height,
    samples: floatSamples,
    west: indexGrid.west,
    north: indexGrid.north,
    east: indexGrid.east,
    south: indexGrid.south,
    compress: false,
    description: `${profile.toUpperCase()} Float32 · ${sceneDate} · AgroCloud`,
  })
  zip.file(`${stem}.tif`, mainTif)
  zip.file(`${stem}.tfw`, tfw)
  zip.file(`${stem}.prj`, prj)

  for (const c of companions) {
    const name = `${c.id.toUpperCase()}_${sceneDate.replace(/-/g, '')}`
    const cSamples = sanitizeFloatNodata(c.grid.values)
    const cTfw = buildWorldFile4326(
      c.grid.west,
      c.grid.north,
      c.grid.east,
      c.grid.south,
      c.grid.width,
      c.grid.height,
    )
    zip.file(
      `${name}.tif`,
      writeFloat32GeoTiff4326({
        width: c.grid.width,
        height: c.grid.height,
        samples: cSamples,
        west: c.grid.west,
        north: c.grid.north,
        east: c.grid.east,
        south: c.grid.south,
        compress: false,
        description: `${c.id.toUpperCase()} Float32 companion`,
      }),
    )
    zip.file(`${name}.tfw`, cTfw)
    zip.file(`${name}.prj`, prj)
  }

  if (spectra?.bands.length) {
    const spectraTif = writeMultiBandFloat32GeoTiff4326({
      width: spectra.width,
      height: spectra.height,
      bands: spectra.bands.map(b => sanitizeFloatNodata(b.values)),
      west: spectra.west,
      north: spectra.north,
      east: spectra.east,
      south: spectra.south,
      compress: false,
      description: `Spectra ${spectra.bands.map(b => b.name).join(',')} reflectance 0–1`,
    })
    zip.file(`${stem}_spectra.tif`, spectraTif)
    zip.file(
      `${stem}_spectra.tfw`,
      buildWorldFile4326(
        spectra.west,
        spectra.north,
        spectra.east,
        spectra.south,
        spectra.width,
        spectra.height,
      ),
    )
    zip.file(`${stem}_spectra.prj`, prj)
    zip.file(
      `${stem}_spectra_bands.txt`,
      [
        'Band order (1-based) in multi-band GeoTIFF:',
        ...spectra.bands.map((b, i) => `${i + 1}\t${b.name}\treflectance 0–1 (Float32)`),
        '',
        `Scene: ${sceneDate}`,
        `CRS: EPSG:4326 (WGS84) — see .prj sidecar`,
        `NoData: ${FLOAT_NODATA}`,
      ].join('\n'),
    )
  }

  zip.file(
    'README.txt',
    [
      'AgroCloud Remote Sensing — GIS GeoTIFF export',
      '',
      '=== ArcGIS Pro (IMPORTANT) ===',
      '1. Unzip this archive.',
      `2. Add ${stem}_rgb.tif to the map (Catalog → Add To Current Map).`,
      '3. Right-click layer → Zoom To Layer.',
      '   → Index colours appear immediately (RGB composite).',
      '',
      `Do NOT rely on only ${stem}.tif for display — Float32 (−1…1) often looks`,
      'blank/black under ArcGIS default stretch. Use Float32 for analysis:',
      '   Symbology → Stretch → Min-Max (exclude NoData -9999) + colour ramp.',
      '',
      `Primary RGB: ${stem}_rgb.tif (WGS84)`,
      `Primary Float32: ${stem}.tif  (real ${profile.toUpperCase()} values, NoData=${FLOAT_NODATA})`,
      `Scene date: ${sceneDate}`,
      `AOI: ${aoi}`,
      'CRS: EPSG:4326 / WGS84 (.prj + .tfw included)',
      '',
      'Companion NDVI/NDWI/NDMI TIFFs share the same grid & CRS.',
      '_spectra.tif holds source Sentinel-2 bands (reflectance 0–1).',
      '',
      'Generated by AgroCloud Satellite Intelligence',
    ].join('\n'),
  )

  input.onProgress?.('Packaging ZIP…')
  const blob = await zip.generateAsync({ type: 'blob' })
  const filename = `rs_${stem}_${aoi}.zip`
  downloadBlob(blob, filename)
  return { filename }
}

export { resolveIndexProfile }
