/**
 * Open terrain (DEM) tile fetch + decode for the Hydro Watershed Workflow tool.
 *
 * Uses the AWS-hosted, CORS-enabled "Terrarium" terrain-RGB tiles (Mapzen / Nextzen
 * open elevation, EPSG:3857) so elevation pixels can be read back from a canvas and
 * processed entirely client-side. Reuses the Web-Mercator tile math already proven
 * by the Tree Detections tool.
 *
 * Terrarium decode: elevation_m = (R * 256 + G + B / 256) - 32768
 */

import {
  geometryBBox,
  lngLatToWorldPx,
  metersPerPixelAt,
  worldPxToLngLat,
  type LngLatBBox,
} from '../treeDetection/webMercatorTiles'

export { geometryBBox }
export type { LngLatBBox }

const TILE_SIZE = 256

/** AWS open terrain tiles — permissive CORS, free, global, max native zoom ~15. */
const TERRARIUM_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`

export type DemGrid = {
  width: number
  height: number
  /** Elevation in metres, row-major (length = width*height). */
  elev: Float32Array
  bbox: LngLatBBox
  zoom: number
  originWorldPxX: number
  originWorldPxY: number
  /** Ground sample distance (m/px) at the bbox centre latitude. */
  metersPerPixel: number
  /** Image-overlay corner coordinates: [top-left, top-right, bottom-right, bottom-left]. */
  cornerCoords: [[number, number], [number, number], [number, number], [number, number]]
  tilesLoaded: number
  tilesTotal: number
  pxToLngLat: (px: number, py: number) => [number, number]
}

/** Highest zoom such that the bbox DEM mosaic stays within `maxTiles` (≈10–100 m/px). */
function pickDemZoom(bbox: LngLatBBox, maxTiles: number, maxZoom: number, minZoom: number): number {
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

export type BuildDemOptions = {
  bbox: LngLatBBox
  /** Tile budget (mosaic resolution). Default 16 → up to ~1024² grid. */
  maxTiles?: number
  maxZoom?: number
  minZoom?: number
  signal?: AbortSignal
}

/**
 * Fetch + stitch a Terrarium DEM mosaic for the bbox and decode every pixel to
 * metres. Returns null when no tiles could be loaded.
 */
export async function buildDemGrid(options: BuildDemOptions): Promise<DemGrid | null> {
  const { bbox, signal } = options
  const zoom = pickDemZoom(bbox, options.maxTiles ?? 16, options.maxZoom ?? 14, options.minZoom ?? 9)

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
  const loadedMask = new Uint8Array(nx * ny)
  await mapPool(tiles, 6, async tile => {
    if (signal?.aborted) return
    const wrappedX = ((tile.x % maxTile) + maxTile) % maxTile
    if (tile.y < 0 || tile.y >= maxTile) return
    const img = await loadTileImage(TERRARIUM_URL(zoom, wrappedX, tile.y), signal)
    if (!img) return
    const dx = (tile.x - tx0) * TILE_SIZE
    const dy = (tile.y - ty0) * TILE_SIZE
    try {
      ctx.drawImage(img, dx, dy, TILE_SIZE, TILE_SIZE)
      loaded += 1
      loadedMask[(tile.x - tx0) * ny + (tile.y - ty0)] = 1
    } catch {
      /* ignore individual draw failures */
    }
  })

  if (signal?.aborted || loaded === 0) return null

  let imageData: ImageData
  try {
    imageData = ctx.getImageData(0, 0, width, height)
  } catch {
    return null
  }

  const px = imageData.data
  const elev = new Float32Array(width * height)
  let sum = 0
  let count = 0
  for (let i = 0, p = 0; i < elev.length; i += 1, p += 4) {
    const a = px[p + 3]!
    if (a === 0) {
      elev[i] = NaN
      continue
    }
    const r = px[p]!
    const g = px[p + 1]!
    const b = px[p + 2]!
    const e = r * 256 + g + b / 256 - 32768
    elev[i] = e
    sum += e
    count += 1
  }
  // Replace no-data with the scene mean so missing tiles don't create artificial pits.
  const mean = count ? sum / count : 0
  for (let i = 0; i < elev.length; i += 1) if (!Number.isFinite(elev[i]!)) elev[i] = mean

  const originWorldPxX = tx0 * TILE_SIZE
  const originWorldPxY = ty0 * TILE_SIZE
  const centerLat = (bbox.north + bbox.south) / 2
  const pxToLngLat = (cx: number, cy: number): [number, number] =>
    worldPxToLngLat(originWorldPxX + cx, originWorldPxY + cy, zoom)

  return {
    width,
    height,
    elev,
    bbox,
    zoom,
    originWorldPxX,
    originWorldPxY,
    metersPerPixel: metersPerPixelAt(centerLat, zoom),
    cornerCoords: [pxToLngLat(0, 0), pxToLngLat(width, 0), pxToLngLat(width, height), pxToLngLat(0, height)],
    tilesLoaded: loaded,
    tilesTotal: tiles.length,
    pxToLngLat,
  }
}
