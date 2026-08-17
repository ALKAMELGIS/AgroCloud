/**
 * Web Mercator (EPSG:3857) tile math + CORS-safe imagery mosaic builder.
 *
 * Used by the Tree Detections tool to pull high-resolution satellite imagery
 * for an AOI bounding box, stitch it onto a canvas, and georeference every
 * pixel back to lng/lat so detections can be placed on the map.
 */

export type TreeImageryProviderId = 'esri' | 'google'

export type TreeImageryProvider = {
  id: TreeImageryProviderId
  label: string
  /** Whether tiles are served with permissive CORS (required for pixel readback). */
  corsSafe: boolean
  tileUrl: (z: number, x: number, y: number) => string
  attribution: string
}

const TILE_SIZE = 256

export const TREE_IMAGERY_PROVIDERS: Record<TreeImageryProviderId, TreeImageryProvider> = {
  esri: {
    id: 'esri',
    label: 'Esri World Imagery',
    corsSafe: true,
    tileUrl: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  google: {
    id: 'google',
    label: 'Google Satellite',
    // Google tiles are not CORS-enabled → canvas readback is tainted. Kept for
    // completeness; detection falls back to Esri when a CORS-safe source is needed.
    corsSafe: false,
    tileUrl: (z, x, y) => `https://mt${(x + y) % 4}.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`,
    attribution: 'Google',
  },
}

export type LngLatBBox = { west: number; south: number; east: number; north: number }

export type TreeImageryMosaic = {
  canvas: HTMLCanvasElement
  imageData: ImageData
  width: number
  height: number
  zoom: number
  /** World pixel coordinate of the mosaic's top-left corner at `zoom`. */
  originWorldPxX: number
  originWorldPxY: number
  mapSizePx: number
  bbox: LngLatBBox
  /** Ground sample distance (m/px) at the bbox center latitude. */
  metersPerPixel: number
  tilesLoaded: number
  tilesTotal: number
  /** Std-dev of luminance in [0,1] — near 0 for flat "no-data" placeholder tiles. */
  contentStdDev: number
  /** Mean colour saturation in [0,1] — near 0 for grey placeholder tiles. */
  saturationMean: number
  pxToLngLat: (px: number, py: number) => [number, number]
}

/**
 * Heuristic: imagery servers (notably Esri World Imagery) return a near-uniform
 * light-grey "Map data not yet available" placeholder above their native max
 * zoom in many regions. Real terrain always has strong luminance texture and
 * some colour; the placeholder has neither. Used to trigger a zoom fallback so
 * the detector never analyses a blank canvas (which yields 0 detections).
 */
export function mosaicLooksBlank(mosaic: TreeImageryMosaic): boolean {
  return mosaic.contentStdDev < 0.04 && mosaic.saturationMean < 0.06
}

function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat))
}

/** lng/lat → fractional world pixel coordinate at a given zoom. */
export function lngLatToWorldPx(lng: number, lat: number, zoom: number): [number, number] {
  const mapSize = TILE_SIZE * 2 ** zoom
  const x = ((lng + 180) / 360) * mapSize
  const sinLat = Math.sin((clampLat(lat) * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * mapSize
  return [x, y]
}

/** World pixel coordinate at a given zoom → lng/lat. */
export function worldPxToLngLat(px: number, py: number, zoom: number): [number, number] {
  const mapSize = TILE_SIZE * 2 ** zoom
  const lng = (px / mapSize) * 360 - 180
  const n = Math.PI - (2 * Math.PI * py) / mapSize
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n))
  return [lng, lat]
}

export function metersPerPixelAt(lat: number, zoom: number): number {
  const mapSize = TILE_SIZE * 2 ** zoom
  return (Math.cos((lat * Math.PI) / 180) * 2 * Math.PI * 6378137) / mapSize
}

/** Highest zoom such that the bbox tile mosaic stays within `maxTiles`. */
export function pickMosaicZoom(bbox: LngLatBBox, maxTiles = 49, maxZoom = 20, minZoom = 14): number {
  for (let z = maxZoom; z >= minZoom; z -= 1) {
    const [x0] = lngLatToWorldPx(bbox.west, bbox.north, z)
    const [x1] = lngLatToWorldPx(bbox.east, bbox.south, z)
    const [, y0] = lngLatToWorldPx(bbox.west, bbox.north, z)
    const [, y1] = lngLatToWorldPx(bbox.east, bbox.south, z)
    const tx0 = Math.floor(Math.min(x0, x1) / TILE_SIZE)
    const tx1 = Math.floor(Math.max(x0, x1) / TILE_SIZE)
    const ty0 = Math.floor(Math.min(y0, y1) / TILE_SIZE)
    const ty1 = Math.floor(Math.max(y0, y1) / TILE_SIZE)
    const count = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
    if (count <= maxTiles) return z
  }
  return minZoom
}

/**
 * Smallest zoom whose ground-sample-distance is at least as fine as `targetGsd`
 * (m/px) at the given latitude — independent of the AOI extent.
 *
 * This is the key to AOI-size-independent detection: every tile in a large AOI
 * is fetched and analysed at the *same* resolution, so crown sizes (in pixels)
 * and therefore detection sensitivity are identical everywhere, instead of the
 * imagery getting coarser (and the detector mis-firing) as the AOI grows.
 */
export function pickZoomForGsd(lat: number, targetGsd: number, maxZoom = 19, minZoom = 15): number {
  for (let z = minZoom; z <= maxZoom; z += 1) {
    if (metersPerPixelAt(lat, z) <= targetGsd) return z
  }
  return maxZoom
}

export type TileRange = { tx0: number; ty0: number; tx1: number; ty1: number }

/** XYZ tile index range that covers a bbox at a given zoom. */
export function tileRangeForBBox(bbox: LngLatBBox, zoom: number): TileRange {
  const [wx0] = lngLatToWorldPx(bbox.west, bbox.north, zoom)
  const [wx1] = lngLatToWorldPx(bbox.east, bbox.south, zoom)
  const [, wy0] = lngLatToWorldPx(bbox.west, bbox.north, zoom)
  const [, wy1] = lngLatToWorldPx(bbox.east, bbox.south, zoom)
  return {
    tx0: Math.floor(Math.min(wx0, wx1) / TILE_SIZE),
    tx1: Math.floor(Math.max(wx0, wx1) / TILE_SIZE),
    ty0: Math.floor(Math.min(wy0, wy1) / TILE_SIZE),
    ty1: Math.floor(Math.max(wy0, wy1) / TILE_SIZE),
  }
}

/** lng/lat bbox that exactly bounds an inclusive XYZ tile range at `zoom`. */
export function bboxForTileRange(range: TileRange, zoom: number): LngLatBBox {
  const [west, north] = worldPxToLngLat(range.tx0 * TILE_SIZE, range.ty0 * TILE_SIZE, zoom)
  const [east, south] = worldPxToLngLat((range.tx1 + 1) * TILE_SIZE, (range.ty1 + 1) * TILE_SIZE, zoom)
  return { west, south, east, north }
}

function loadTileImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve(null)
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    const onAbort = () => {
      img.src = ''
      resolve(null)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    img.onload = () => {
      signal?.removeEventListener('abort', onAbort)
      resolve(img)
    }
    img.onerror = () => {
      signal?.removeEventListener('abort', onAbort)
      resolve(null)
    }
    img.src = url
  })
}

async function mapPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next
      next += 1
      await worker(items[i]!)
    }
  })
  await Promise.all(runners)
}

export type BuildMosaicOptions = {
  bbox: LngLatBBox
  provider?: TreeImageryProvider
  maxTiles?: number
  maxZoom?: number
  /** Force a specific zoom (skips the maxTiles-based auto pick). */
  zoom?: number
  signal?: AbortSignal
}

/**
 * Fetch + stitch a CORS-safe imagery mosaic for the bbox. Returns null when the
 * canvas could not be read (tainted) or no tiles loaded.
 */
export async function buildTreeImageryMosaic(
  options: BuildMosaicOptions,
): Promise<TreeImageryMosaic | null> {
  const { bbox, signal } = options
  const provider = options.provider ?? TREE_IMAGERY_PROVIDERS.esri
  const zoom = options.zoom ?? pickMosaicZoom(bbox, options.maxTiles ?? 49, options.maxZoom ?? 20)

  const [wx0] = lngLatToWorldPx(bbox.west, bbox.north, zoom)
  const [wx1] = lngLatToWorldPx(bbox.east, bbox.south, zoom)
  const [, wy0] = lngLatToWorldPx(bbox.west, bbox.north, zoom)
  const [, wy1] = lngLatToWorldPx(bbox.east, bbox.south, zoom)

  const tx0 = Math.floor(Math.min(wx0, wx1) / TILE_SIZE)
  const tx1 = Math.floor(Math.max(wx0, wx1) / TILE_SIZE)
  const ty0 = Math.floor(Math.min(wy0, wy1) / TILE_SIZE)
  const ty1 = Math.floor(Math.max(wy0, wy1) / TILE_SIZE)

  const nx = tx1 - tx0 + 1
  const ny = ty1 - ty0 + 1
  const width = nx * TILE_SIZE
  const height = ny * TILE_SIZE

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  const tiles: Array<{ x: number; y: number }> = []
  for (let tx = tx0; tx <= tx1; tx += 1) {
    for (let ty = ty0; ty <= ty1; ty += 1) tiles.push({ x: tx, y: ty })
  }

  let loaded = 0
  const maxTile = 2 ** zoom
  await mapPool(tiles, 6, async tile => {
    if (signal?.aborted) return
    const wrappedX = ((tile.x % maxTile) + maxTile) % maxTile
    if (tile.y < 0 || tile.y >= maxTile) return
    const img = await loadTileImage(provider.tileUrl(zoom, wrappedX, tile.y), signal)
    if (!img) return
    const dx = (tile.x - tx0) * TILE_SIZE
    const dy = (tile.y - ty0) * TILE_SIZE
    try {
      ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE)
      loaded += 1
    } catch {
      /* ignore individual draw failures */
    }
  })

  if (signal?.aborted || loaded === 0) return null

  let imageData: ImageData
  try {
    imageData = ctx.getImageData(0, 0, width, height)
  } catch {
    // Canvas tainted (non-CORS provider) → cannot read pixels.
    return null
  }

  const originWorldPxX = tx0 * TILE_SIZE
  const originWorldPxY = ty0 * TILE_SIZE
  const mapSizePx = TILE_SIZE * 2 ** zoom
  const centerLat = (bbox.north + bbox.south) / 2

  // Single-pass content assessment (sampled for speed) → detect blank/placeholder.
  const px = imageData.data
  const sampleStride = 4 * 7
  let lumSum = 0
  let lumSqSum = 0
  let satSum = 0
  let sampled = 0
  for (let i = 0; i < px.length; i += sampleStride) {
    if (px[i + 3]! === 0) continue
    const r = px[i]!
    const g = px[i + 1]!
    const b = px[i + 2]!
    const l = (r + g + b) / 3
    lumSum += l
    lumSqSum += l * l
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    satSum += mx > 0 ? (mx - mn) / mx : 0
    sampled += 1
  }
  const lumMean = sampled ? lumSum / sampled : 0
  const lumVar = sampled ? Math.max(0, lumSqSum / sampled - lumMean * lumMean) : 0
  const contentStdDev = Math.sqrt(lumVar) / 255
  const saturationMean = sampled ? satSum / sampled : 0

  return {
    canvas,
    imageData,
    width,
    height,
    zoom,
    originWorldPxX,
    originWorldPxY,
    mapSizePx,
    bbox,
    metersPerPixel: metersPerPixelAt(centerLat, zoom),
    tilesLoaded: loaded,
    tilesTotal: tiles.length,
    contentStdDev,
    saturationMean,
    pxToLngLat: (px: number, py: number) =>
      worldPxToLngLat(originWorldPxX + px, originWorldPxY + py, zoom),
  }
}

/** Axis-aligned lng/lat bbox of a GeoJSON Polygon/MultiPolygon (or Feature / FeatureCollection). */
export function geometryBBox(
  input: GeoJSON.Geometry | GeoJSON.Feature | GeoJSON.FeatureCollection | null | undefined,
): LngLatBBox | null {
  if (!input) return null
  if (input.type === 'FeatureCollection') {
    let west = Infinity
    let south = Infinity
    let east = -Infinity
    let north = -Infinity
    for (const f of input.features ?? []) {
      const b = geometryBBox(f)
      if (!b) continue
      if (b.west < west) west = b.west
      if (b.south < south) south = b.south
      if (b.east > east) east = b.east
      if (b.north > north) north = b.north
    }
    if (!Number.isFinite(west) || !Number.isFinite(east)) return null
    return { west, south, east, north }
  }
  const geom = (input as GeoJSON.Feature).type === 'Feature' ? (input as GeoJSON.Feature).geometry : (input as GeoJSON.Geometry)
  if (!geom) return null
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  const visitRing = (ring: number[][]) => {
    for (const pt of ring) {
      const lng = pt[0]!
      const lat = pt[1]!
      if (lng < west) west = lng
      if (lng > east) east = lng
      if (lat < south) south = lat
      if (lat > north) north = lat
    }
  }
  if (geom.type === 'Polygon') (geom.coordinates as number[][][]).forEach(visitRing)
  else if (geom.type === 'MultiPolygon') (geom.coordinates as number[][][][]).forEach(poly => poly.forEach(visitRing))
  else return null
  if (!Number.isFinite(west) || !Number.isFinite(east)) return null
  return { west, south, east, north }
}
