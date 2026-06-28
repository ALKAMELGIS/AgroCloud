/**
 * Esri WorldElevation3D / Terrain3D → Mapbox terrain-RGB tile proxy.
 *
 * Esri serves elevation tiles as LERC (application/octet-stream). Mapbox GL JS has no client-side
 * way to decode LERC into a `raster-dem` source (it lacks MapLibre's `addProtocol`, and cannot
 * transform tile responses). So we decode LERC here on the server and re-encode each tile as a
 * standard Mapbox terrain-RGB PNG, which Mapbox (and MapLibre) consume directly over plain HTTP.
 *
 * Endpoint: GET /api/terrain/esri-rgb/:z/:x/:y(.png)
 * @see https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer
 */
import { PNG } from 'pngjs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
// `lerc` is a CommonJS module exposing { decode }.
const Lerc = require('lerc')
const lercDecode = typeof Lerc.decode === 'function' ? Lerc.decode : Lerc.default?.decode

/** Esri elevation tiles are 257×257 (1px shared border); Mapbox terrain tiles are 256×256. */
const TILE = 256
const MAX_CACHE_ENTRIES = 2000

const esriTileUrl = (z, y, x) =>
  `https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/${z}/${y}/${x}`

/** Insertion-ordered LRU cache of encoded PNG Buffers, keyed by `z/x/y`. */
const cache = new Map()

function cacheGet(key) {
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
  }
  return hit
}

function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
}

/** Mapbox terrain-RGB ("mapbox" encoding): height = -10000 + (R*65536 + G*256 + B) * 0.1 */
function encodeElevation(meters) {
  const safe = Number.isFinite(meters) ? meters : 0
  const v = Math.max(0, Math.min(0xffffff, Math.round((safe + 10000) / 0.1)))
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]
}

function writeFlatField(png) {
  const [r, g, b] = encodeElevation(0)
  for (let i = 0; i < TILE * TILE; i++) {
    const d = i * 4
    png.data[d] = r
    png.data[d + 1] = g
    png.data[d + 2] = b
    png.data[d + 3] = 255
  }
}

let flatTilePng = null
/** Sea-level (0 m) terrain-RGB tile — graceful fallback when a tile can't be decoded. */
function flatTile() {
  if (!flatTilePng) {
    const png = new PNG({ width: TILE, height: TILE })
    writeFlatField(png)
    flatTilePng = PNG.sync.write(png)
  }
  return flatTilePng
}

function lercToTerrainRgbPng(decoded) {
  const { width, pixels } = decoded
  const band = pixels[0]
  const mask = decoded.mask
  const noData = decoded.statistics?.[0]?.noDataValue
  const png = new PNG({ width: TILE, height: TILE })
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const src = y * width + x
      let h = band[src]
      if ((mask && mask[src] === 0) || (noData != null && h === noData)) h = 0
      const [r, g, b] = encodeElevation(h)
      const d = (y * TILE + x) * 4
      png.data[d] = r
      png.data[d + 1] = g
      png.data[d + 2] = b
      png.data[d + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

async function buildTile(z, y, x) {
  let response
  try {
    response = await fetch(esriTileUrl(z, y, x))
  } catch {
    return flatTile()
  }
  if (!response.ok) return flatTile()
  try {
    const arrayBuffer = await response.arrayBuffer()
    const decoded = lercDecode(arrayBuffer)
    if (!decoded?.pixels?.length || !decoded.width) return flatTile()
    return lercToTerrainRgbPng(decoded)
  } catch {
    return flatTile()
  }
}

/** Register the Esri terrain-RGB tile route on the Express app. */
export function registerEsriTerrainTileRoutes(app) {
  if (typeof lercDecode !== 'function') {
    console.warn('[terrain] lerc decoder unavailable — 3D Esri terrain tiles disabled.')
    return
  }
  app.get('/api/terrain/esri-rgb/:z/:x/:y', async (req, res) => {
    const z = Number.parseInt(req.params.z, 10)
    const x = Number.parseInt(req.params.x, 10)
    const y = Number.parseInt(String(req.params.y).replace(/\.png$/i, ''), 10)
    if (![z, x, y].every(Number.isFinite) || z < 0 || z > 17) {
      return res.status(400).type('txt').send('Bad tile coordinates')
    }
    const key = `${z}/${x}/${y}`
    try {
      let png = cacheGet(key)
      if (!png) {
        png = await buildTile(z, y, x)
        cacheSet(key, png)
      }
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
      res.setHeader('Access-Control-Allow-Origin', '*')
      return res.end(png)
    } catch {
      return res.status(502).type('txt').send('Terrain tile error')
    }
  })
}
