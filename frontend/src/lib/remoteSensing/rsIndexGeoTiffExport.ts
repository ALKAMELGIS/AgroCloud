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
import { SENTINEL_LST_RAMP } from '../lstIndex'
import { downloadBlob } from '../hydroWatershed/geoTiffExport'
import {
  GIS_FLOAT_NODATA,
  buildGdalPamAuxXml,
  computeFloatRasterStats,
  writeFloat32GisGeoTiff,
  writeMultiBandFloat32GisGeoTiff,
  writeRgbGisGeoTiff,
} from '../gis/gisGeoTiffWriter'

/** ArcGIS-friendly nodata (NaN Float32 often fails to display in Pro). */
const FLOAT_NODATA = GIS_FLOAT_NODATA

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
  lst: {
    bands: ['B04', 'B08', 'B11'],
    // Encode LST °C as −1…1: ((lst−5)/50)*2−1 for the shared Float32 pipeline.
    expr:
      '((()=>{var ndvi=(s.B08-s.B04)/(s.B08+s.B04);var ndmi=(s.B08-s.B11)/(s.B08+s.B11);var dry=Math.max(0,Math.min(1,0.5-0.5*Math.max(-1,Math.min(1,ndmi))));var lst=Math.max(5,Math.min(55,38-12*Math.max(-0.2,Math.min(1,ndvi))+8*dry));return Math.max(-1,Math.min(1,((lst-5)/50)*2-1));})())',
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
    AWEI: 'awei',
    NBR: 'nbr',
    NDMI: 'ndmi',
    EVI: 'evi',
    SAVI: 'savi',
    GNDVI: 'gndvi',
    NDSI: 'ndsi',
    NDRE: 'ndre',
    ET: 'et',
    EVAPOTRANSPIRATION: 'et',
    LST: 'lst',
    LANDSURFACETEMPERATURE: 'lst',
    LANDSURFACETEMP: 'lst',
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
    case 'lst':
      // Float32 grid already stores °C after fetch decode.
      return sampleRampHex(value, SENTINEL_LST_RAMP as ReadonlyArray<readonly [number, number]>)
    case 'ndvi':
    case 'evi':
    case 'savi':
    case 'gndvi':
    case 'ndre':
    default:
      return sampleSentinelNdviColorMap(value)
  }
}

/** Pack Float32 index → RGBA for ArcGIS display. Nodata → transparent (alpha=0). */
export function indexGridToRgb(
  values: Float32Array,
  profile: SentinelIndexEvalProfile,
): Uint8Array {
  const out = new Uint8Array(values.length * 4)
  for (let p = 0; p < values.length; p += 1) {
    const v = values[p]!
    const o = p * 4
    if (!Number.isFinite(v) || v === FLOAT_NODATA) {
      out[o] = 0
      out[o + 1] = 0
      out[o + 2] = 0
      out[o + 3] = 0
      continue
    }
    const hex = indexColorHex(profile, v)
    out[o] = (hex >> 16) & 0xff
    out[o + 1] = (hex >> 8) & 0xff
    out[o + 2] = hex & 0xff
    out[o + 3] = 255
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

// ── TIFF helpers (Float32 / RGBA, EPSG:4326) via shared ArcGIS-safe writer ───

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
  void opts.compress
  return writeFloat32GisGeoTiff({
    width: opts.width,
    height: opts.height,
    samples: opts.samples,
    pixelScaleX: (opts.east - opts.west) / opts.width,
    pixelScaleY: (opts.north - opts.south) / opts.height,
    tiepointX: opts.west,
    tiepointY: opts.north,
    epsg: 4326,
    geographic: true,
    nodata: FLOAT_NODATA,
    description: opts.description,
    embedStats: true,
  })
}

/** RGBA GeoTIFF — nodata is transparent so Pro does not show a solid black AOI. */
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
  void opts.compress
  const spp: 3 | 4 = opts.rgb.length >= opts.width * opts.height * 4 ? 4 : 3
  return writeRgbGisGeoTiff({
    width: opts.width,
    height: opts.height,
    pixels: opts.rgb,
    samplesPerPixel: spp,
    pixelScaleX: (opts.east - opts.west) / opts.width,
    pixelScaleY: (opts.north - opts.south) / opts.height,
    tiepointX: opts.west,
    tiepointY: opts.north,
    epsg: 4326,
    geographic: true,
    description: 'Index colour composite (RGBA)',
  })
}

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
  void opts.compress
  return writeMultiBandFloat32GisGeoTiff({
    width: opts.width,
    height: opts.height,
    bands: opts.bands,
    pixelScaleX: (opts.east - opts.west) / opts.width,
    pixelScaleY: (opts.north - opts.south) / opts.height,
    tiepointX: opts.west,
    tiepointY: opts.north,
    epsg: 4326,
    geographic: true,
    nodata: FLOAT_NODATA,
    description: opts.description,
  })
}

// ── WMS fetch ────────────────────────────────────────────────────────────────

/**
 * Match Layer Live map evalscripts: mask only missing samples (`dataMask`).
 * Do NOT apply SCL/CLM cloud holes — those punch transparent gaps that look like
 * incomplete GeoTIFFs in ArcGIS Pro while the map still looks continuous.
 */
function buildIndexFloatEvalscript(profile: SentinelIndexEvalProfile): string {
  const spec = INDEX_BANDS[profile]
  const inputs = [...spec.bands, 'dataMask']
  return `//VERSION=3
function setup() {
  return {
    input: [{ bands: ${JSON.stringify(inputs)} }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  if (!s.dataMask) return [0, 0, 0, 0];
  var v = ${spec.expr};
  if (isNaN(v)) return [0, 0, 0, 0];
  var enc = Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  return [enc, 127, 127, 255];
}`
}

function buildSpectraEvalscript(bands: string[]): string {
  const unique = bands.slice(0, 3)
  const inputs = [...unique, 'dataMask']
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
  if (!s.dataMask) return [0, 0, 0, 0];
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
  // MAXCC=100: do not drop the selected scene for cloud % — completeness over strict filtering.
  let url =
    `${getSentinelHubWmsBaseUrl()}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&BBOX=${minX},${minY},${maxX},${maxY}&CRS=EPSG:3857` +
    `&FORMAT=image/png&TRANSPARENT=true&WIDTH=${sizeW}&HEIGHT=${sizeH}` +
    `&TIME=${timeStart}/${timeEnd}&MAXCC=100&SHOWLOGO=false&WARNINGS=false` +
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
  // Sentinel Hub GetMap max is 2500² — use full budget for denser AOI coverage.
  const width = Math.max(64, Math.min(2500, Math.round(spanX / mpp)))
  const height = Math.max(64, Math.min(2500, Math.round(spanY / mpp)))
  // Pin export to the selected scene day (same as Layer Live), not a ±3d mosaic that
  // can leave orbit/cloud holes different from the map.
  const day = sceneDate.slice(0, 10)
  const next = new Date(`${day}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const dayEnd = next.toISOString().slice(0, 10)
  const { data } = await fetchWmsRgba(
    [minX, minY, maxX, maxY],
    day,
    dayEnd,
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
    if (profile === 'lst') {
      // Decode normalized −1…1 → °C for GIS Float32 export.
      values[p] = ((values[p]! + 1) / 2) * 50 + 5
    }
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
  const width = Math.max(64, Math.min(2500, Math.round(spanX / mpp)))
  const height = Math.max(64, Math.min(2500, Math.round(spanY / mpp)))
  const day = sceneDate.slice(0, 10)
  const next = new Date(`${day}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const dayEnd = next.toISOString().slice(0, 10)
  const { data } = await fetchWmsRgba(
    [minX, minY, maxX, maxY],
    day,
    dayEnd,
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
  const stats = computeFloatRasterStats(floatSamples, FLOAT_NODATA)
  if (!stats || stats.validCount < 16) {
    throw new Error(
      'GeoTIFF export found almost no valid pixels (empty WMS / no coverage for this scene). Try another imagery date or verify the AOI intersects the Sentinel-2 footprint.',
    )
  }

  const rgba = indexGridToRgb(floatSamples, profile)
  const rgbTif = writeRgbGeoTiff4326({
    width: indexGrid.width,
    height: indexGrid.height,
    rgb: rgba,
    west: indexGrid.west,
    north: indexGrid.north,
    east: indexGrid.east,
    south: indexGrid.south,
    compress: false,
  })
  // RGB/RGBA first — open this in ArcGIS Pro Map.
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
  zip.file(
    `${stem}.tif.aux.xml`,
    buildGdalPamAuxXml({
      nodata: FLOAT_NODATA,
      stats,
      bandName: profile.toUpperCase(),
    }),
  )

  for (const c of companions) {
    const name = `${c.id.toUpperCase()}_${sceneDate.replace(/-/g, '')}`
    const cSamples = sanitizeFloatNodata(c.grid.values)
    const cStats = computeFloatRasterStats(cSamples, FLOAT_NODATA)
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
    if (cStats) {
      zip.file(
        `${name}.tif.aux.xml`,
        buildGdalPamAuxXml({
          nodata: FLOAT_NODATA,
          stats: cStats,
          bandName: c.id.toUpperCase(),
        }),
      )
    }
  }

  if (spectra?.bands.length) {
    const spectraBands = spectra.bands.map(b => sanitizeFloatNodata(b.values))
    const spectraTif = writeMultiBandFloat32GeoTiff4326({
      width: spectra.width,
      height: spectra.height,
      bands: spectraBands,
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
    const s0 = computeFloatRasterStats(spectraBands[0]!, FLOAT_NODATA)
    if (s0) {
      zip.file(
        `${stem}_spectra.tif.aux.xml`,
        buildGdalPamAuxXml({
          nodata: FLOAT_NODATA,
          stats: s0,
          bandName: spectra.bands[0]?.name || 'spectra',
        }),
      )
    }
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
      '1. Unzip this archive (keep .tif next to .tif.aux.xml / .tfw / .prj).',
      `2. Add ${stem}_rgb.tif to the map (Catalog → Add To Current Map).`,
      '3. Right-click layer → Zoom To Layer.',
      '   → Index colours appear immediately (RGBA composite; nodata is transparent).',
      '',
      `Float32 analysis: ${stem}.tif (real ${profile.toUpperCase()} values).`,
      `  NoData = ${FLOAT_NODATA} (never NaN). Statistics are embedded + .aux.xml sidecar.`,
      '  Symbology → Stretch → Min-Max (Exclude NoData) + colour ramp if needed.',
      '',
      `Valid pixels in this export: ${stats.validCount}`,
      `Value range: ${stats.min.toFixed(4)} … ${stats.max.toFixed(4)}`,
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
