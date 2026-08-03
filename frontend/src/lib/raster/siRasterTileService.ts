/**
 * Client for AgroCloud aerial raster tile service (COG → XYZ → Mapbox raster source).
 */
import { apiUrl } from '../apiOrigin'
import { createMapboxReadyImageUrl, type RasterMapCoordinates } from './siRasterMapLayer'

export type RasterBboxWgs84 = {
  west: number
  south: number
  east: number
  north: number
}

/** Rich description of a coordinate reference system (from ProjectionManager). */
export type CrsInfo = {
  code: string
  epsg?: number | null
  name: string
  authority?: string
  datum?: string | null
  units?: string | null
  kind?: string | null
  areaOfUse?: string | null
  accuracy?: number | null
}

/** GIS validation summary: source CRS → map display CRS + datum/transform/warnings. */
export type CrsValidation = {
  sourceCrs: string
  sourceName?: string
  sourceDatum?: string | null
  targetCrs: string
  targetName?: string
  targetDatum?: string
  transformationApplied?: string
  units?: string | null
  accuracy?: number | null
  warnings: string[]
}

export type AgroCloudRasterRecord = {
  id: string
  name: string
  status: 'uploading' | 'processing' | 'ready' | 'failed' | 'needs_georef' | string
  sourceKind?: 'image' | string | null
  /** Where georeferencing came from: 'dimap' | 'worldfile' | 'embedded' | 'manual:<mode>' | null. */
  georefSource?: string | null
  error?: string | null
  crs?: string | null
  crsInfo?: CrsInfo | null
  crsValidation?: CrsValidation | null
  bboxWgs84?: RasterBboxWgs84 | null
  footprint?: GeoJSON.Feature | null
  widthPx?: number | null
  heightPx?: number | null
  bands?: number | null
  resolutionMeters?: number | null
  /** Approximate ground pixel size in metres (derived server-side from extent + px dims). */
  pixelSizeMeters?: number | null
  /** File size in bytes of the baked COG (or source). */
  byteSize?: number | null
  /** True when a baked Cloud-Optimized GeoTIFF exists on the server. */
  isCog?: boolean | null
  acquisitionDate?: string | null
  sensor?: string | null
  tiles?: string[] | null
  tilejson?: {
    tiles: string[]
    bounds?: number[]
    minzoom?: number
    maxzoom?: number
  } | null
}

export type ServerRasterLayerConfig = {
  rasterId: string
  name: string
  tiles: string[]
  tileSize: number
  crs: string
  crsInfo: CrsInfo | null
  crsValidation: CrsValidation | null
  bboxWgs84: RasterBboxWgs84
  footprint: GeoJSON.FeatureCollection
  widthPx: number
  heightPx: number
  bands: number
  resolutionMeters: number | null
  pixelSizeMeters: number | null
  byteSize: number | null
  isCog: boolean
  acquisitionDate: string | null
  sensor: string | null
  wmsUrl: string
  wmtsUrl: string
  metadataSummary: string
  georefSource: string | null
}

const POLL_MS = 1500
const POLL_TIMEOUT_MS = 10 * 60 * 1000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export type RasterGeoreferenceBounds = {
  west: number
  south: number
  east: number
  north: number
}

export type RasterLonLat = [number, number]

/** Four image corners in lon/lat (supports rotated placement). */
export type RasterGeorefCorners = {
  nw: RasterLonLat
  ne: RasterLonLat
  se: RasterLonLat
  sw: RasterLonLat
}

/** A ground control point: image pixel (col,row) ↔ world (lon,lat). */
export type RasterGcp = {
  col: number
  row: number
  lon: number
  lat: number
}

/** Placement request for a non-georeferenced image. */
export type RasterGeoreferencePayload =
  | { mode: 'bbox'; bounds: RasterGeoreferenceBounds }
  | { mode: 'corners'; corners: RasterGeorefCorners }
  | { mode: 'gcps'; gcps: RasterGcp[] }

/**
 * Thrown when an uploaded image (PNG/JPEG) has no georeferencing and must be
 * placed on the map before it can be tiled/classified.
 */
export class RasterNeedsGeoreferenceError extends Error {
  rasterId: string
  rasterName: string
  widthPx: number
  heightPx: number
  constructor(record: AgroCloudRasterRecord) {
    super('This image has no georeferencing. Place it on the map to continue.')
    this.name = 'RasterNeedsGeoreferenceError'
    this.rasterId = record.id
    this.rasterName = record.name
    this.widthPx = record.widthPx || 0
    this.heightPx = record.heightPx || 0
  }
}

export async function uploadRasterToServer(
  files: File[],
  opts?: { name?: string; signal?: AbortSignal },
): Promise<AgroCloudRasterRecord> {
  const primary =
    files.find(f => /\.(tif|tiff|jp2|j2k)$/i.test(f.name)) ||
    files.find(f => /\.(png|jpe?g|webp)$/i.test(f.name)) ||
    files[0]
  if (!primary) throw new Error('No raster file to upload')

  const form = new FormData()
  form.append('raster', primary, primary.name)
  form.append('name', opts?.name || primary.name)
  for (const f of files) {
    if (f === primary) continue
    // World files, projection, and metadata sidecars (incl. Airbus DIMAP DIM_*.XML).
    if (/\.(tfw|tifw|pgw|jgw|jpgw|wld|prj|xml)$/i.test(f.name)) {
      form.append('sidecar', f, f.name)
    }
  }

  const res = await fetch(apiUrl('/api/raster/upload'), {
    method: 'POST',
    body: form,
    signal: opts?.signal,
  })
  if (!res.ok) {
    let detail = `Upload failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return (await res.json()) as AgroCloudRasterRecord
}

export async function fetchRasterRecord(id: string, signal?: AbortSignal): Promise<AgroCloudRasterRecord> {
  const res = await fetch(apiUrl(`/api/raster/${id}`), { signal })
  if (!res.ok) throw new Error(`Raster status failed (${res.status})`)
  return (await res.json()) as AgroCloudRasterRecord
}

/** List rasters known to the server (`GET /api/raster`). */
export async function listRasters(signal?: AbortSignal): Promise<AgroCloudRasterRecord[]> {
  const res = await fetch(apiUrl('/api/raster'), { signal })
  if (!res.ok) throw new Error(`List rasters failed (${res.status})`)
  const body = (await res.json()) as { rasters?: AgroCloudRasterRecord[] }
  return Array.isArray(body?.rasters) ? body.rasters : []
}

/** Ready rasters only — suitable for SegFormer / classification input pickers. */
export async function listReadyRasters(signal?: AbortSignal): Promise<AgroCloudRasterRecord[]> {
  const all = await listRasters(signal)
  return all.filter(r => r.status === 'ready' && r.bboxWgs84)
}

export async function pollRasterUntilReady(
  id: string,
  opts?: { signal?: AbortSignal; onStatus?: (r: AgroCloudRasterRecord) => void },
): Promise<AgroCloudRasterRecord> {
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const record = await fetchRasterRecord(id, opts?.signal)
    opts?.onStatus?.(record)
    if (record.status === 'ready') return record
    // Non-georeferenced images stop here; the caller opens the placement step.
    if (record.status === 'needs_georef') return record
    if (record.status === 'failed') {
      throw new Error(record.error || 'Raster processing failed')
    }
    await sleep(POLL_MS)
  }
  throw new Error('Timed out waiting for raster tiles to become ready')
}

export function footprintCollectionFromRecord(record: AgroCloudRasterRecord): GeoJSON.FeatureCollection {
  if (record.footprint?.geometry) {
    return { type: 'FeatureCollection', features: [record.footprint] }
  }
  const b = record.bboxWgs84
  if (!b) {
    return { type: 'FeatureCollection', features: [] }
  }
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
              [b.west, b.north],
              [b.east, b.north],
              [b.east, b.south],
              [b.west, b.south],
              [b.west, b.north],
            ],
          ],
        },
      },
    ],
  }
}

/**
 * The backend bakes ABSOLUTE tile URLs from the request Host (e.g. `http://127.0.0.1:3011`
 * because the Vite proxy sets `changeOrigin`). Mapbox GL (WebGL) then loads tiles from that
 * literal host, which is unreachable whenever the app is opened from another device, a LAN IP,
 * a tunnel, a custom domain or inside Docker. Rewrite our own tiler routes to the app's API
 * origin so tiles always travel the same path the rest of the app already uses. Non-local
 * tilers (e.g. TiTiler) are left untouched.
 */
function normalizeRasterTileUrl(url: string, recordId: string): string {
  if (/\/api\/raster\/[^/]+\/tiles\//i.test(String(url))) {
    return apiUrl(`/api/raster/${recordId}/tiles/{z}/{x}/{y}.png`)
  }
  return url
}

export function layerConfigFromReadyRecord(record: AgroCloudRasterRecord): ServerRasterLayerConfig {
  if (record.status !== 'ready') throw new Error('Raster is not ready')
  const rawTiles = record.tiles?.length
    ? record.tiles
    : record.tilejson?.tiles?.length
      ? record.tilejson.tiles
      : [apiUrl(`/api/raster/${record.id}/tiles/{z}/{x}/{y}.png`)]
  const tiles = rawTiles.map(u => normalizeRasterTileUrl(u, record.id))
  const bbox = record.bboxWgs84 || { west: -1, south: -1, east: 1, north: 1 }
  const resM = record.resolutionMeters
  const metaParts = [
    record.crs || 'CRS unknown',
    record.widthPx && record.heightPx ? `${record.widthPx}×${record.heightPx}px` : null,
    typeof resM === 'number' && Number.isFinite(resM) ? `~${resM.toFixed(2)} m/px` : null,
    record.acquisitionDate ? `Acquired ${record.acquisitionDate}` : null,
    record.sensor ? `Sensor ${record.sensor}` : null,
    `BBox ${bbox.west.toFixed(5)}, ${bbox.south.toFixed(5)}, ${bbox.east.toFixed(5)}, ${bbox.north.toFixed(5)}`,
  ].filter(Boolean)

  return {
    rasterId: record.id,
    name: record.name,
    tiles,
    tileSize: 256,
    crs: record.crs || 'EPSG:4326',
    crsInfo: record.crsInfo || null,
    crsValidation: record.crsValidation || null,
    bboxWgs84: bbox,
    footprint: footprintCollectionFromRecord(record),
    widthPx: record.widthPx || 0,
    heightPx: record.heightPx || 0,
    bands: record.bands || 0,
    resolutionMeters: typeof resM === 'number' ? resM : null,
    pixelSizeMeters: typeof record.pixelSizeMeters === 'number' ? record.pixelSizeMeters : null,
    byteSize: typeof record.byteSize === 'number' ? record.byteSize : null,
    isCog: !!record.isCog,
    acquisitionDate: record.acquisitionDate || null,
    sensor: record.sensor || null,
    wmsUrl: apiUrl(`/api/raster/${record.id}/wms`),
    wmtsUrl: apiUrl(`/api/raster/${record.id}/wmts`),
    metadataSummary: metaParts.join(' · '),
    georefSource: record.georefSource || null,
  }
}

/** Upload + poll → Mapbox-ready XYZ layer config. */
export async function ingestRasterFilesViaServer(
  files: File[],
  opts?: {
    name?: string
    signal?: AbortSignal
    onStatus?: (r: AgroCloudRasterRecord) => void
  },
): Promise<ServerRasterLayerConfig> {
  const uploaded = await uploadRasterToServer(files, opts)
  const ready = await pollRasterUntilReady(uploaded.id, opts)
  if (ready.status === 'needs_georef') {
    throw new RasterNeedsGeoreferenceError(ready)
  }
  return layerConfigFromReadyRecord(ready)
}

/**
 * Apply a placement (bbox / corners / GCPs, or a bare WGS84 bounds for back-compat) to a
 * non-georeferenced image, then wait for the server to bake a georeferenced GeoTIFF and
 * return a Mapbox-ready layer config.
 */
export async function georeferenceRasterOnServer(
  rasterId: string,
  placement: RasterGeoreferencePayload | RasterGeoreferenceBounds,
  opts?: { signal?: AbortSignal; onStatus?: (r: AgroCloudRasterRecord) => void },
): Promise<ServerRasterLayerConfig> {
  const body =
    'mode' in placement ? placement : { mode: 'bbox' as const, bounds: placement }
  const res = await fetch(apiUrl(`/api/raster/${rasterId}/georeference`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts?.signal,
  })
  if (!res.ok) {
    let detail = `Georeferencing failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  const record = (await res.json()) as AgroCloudRasterRecord
  const ready = record.status === 'ready' ? record : await pollRasterUntilReady(rasterId, opts)
  return layerConfigFromReadyRecord(ready)
}

/**
 * Download the baked GeoTIFF/COG for a raster as a file via the browser. Streams
 * `GET /api/raster/:id/download` into a Blob and triggers a save dialog.
 */
export async function downloadRasterGeoTiff(rasterId: string, filename?: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/raster/${rasterId}/download`))
  if (!res.ok) {
    let detail = `Export failed (${res.status})`
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    const base = (filename || `raster-${rasterId}`).replace(/\.[^.]+$/, '')
    a.download = `${base}.tif`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/**
 * A plain-image (PNG/JPEG/...) overlay: the ORIGINAL decoded image rendered via a Mapbox
 * `image` source at four corner coordinates. Used instead of the server's multiband
 * GeoTIFF → XYZ tile path so RGB photos stay pixel-perfect (no striping/duplication/
 * mirrored scanlines that came from re-encoding RGB bytes as raster bands).
 */
export type RasterImageOverlay = { url: string; coordinates: RasterMapCoordinates }

const PLAIN_IMAGE_NAME_RE = /\.(png|jpe?g|webp|gif|bmp)$/i
const PLAIN_IMAGE_MIME_RE = /^image\/(png|jpe?g|webp|gif|bmp)$/i

/** True for standard RGB photo formats that must be textured directly (not band-reinterpreted). */
export function isPlainRasterImageFile(file: File | null | undefined): boolean {
  if (!file) return false
  return PLAIN_IMAGE_NAME_RE.test(file.name) || PLAIN_IMAGE_MIME_RE.test(file.type)
}

/**
 * Four corner coordinates in Mapbox image-source order [TL, TR, BR, BL], derived from the
 * server footprint polygon (reflects rotation/affine) or the axis-aligned WGS84 bbox.
 */
export function imageOverlayCornersFromConfig(config: ServerRasterLayerConfig): RasterMapCoordinates {
  const geom = config.footprint?.features?.[0]?.geometry
  if (geom && geom.type === 'Polygon') {
    const ring = geom.coordinates?.[0]
    if (ring && ring.length >= 4) {
      return [
        [ring[0][0], ring[0][1]],
        [ring[1][0], ring[1][1]],
        [ring[2][0], ring[2][1]],
        [ring[3][0], ring[3][1]],
      ]
    }
  }
  const b = config.bboxWgs84
  return [
    [b.west, b.north],
    [b.east, b.north],
    [b.east, b.south],
    [b.west, b.south],
  ]
}

/**
 * Build an image-source overlay from the ORIGINAL uploaded file + a ready placement.
 * Decodes the file with the browser (createImageBitmap / Image), preserving its exact
 * pixels; only downscales when it exceeds the WebGL texture limit. Returns null when the
 * file is not a plain image or cannot be decoded (caller falls back to the tile layer).
 */
export async function buildRasterImageOverlay(
  file: File | null | undefined,
  config: ServerRasterLayerConfig,
): Promise<RasterImageOverlay | null> {
  if (!isPlainRasterImageFile(file)) return null
  try {
    const { url } = await createMapboxReadyImageUrl(file as File)
    return { url, coordinates: imageOverlayCornersFromConfig(config) }
  } catch {
    return null
  }
}
