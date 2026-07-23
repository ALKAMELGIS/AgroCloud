/**
 * TileJSON + XYZ + WMS/WMTS proxy. Prefers TiTiler when TITILER_URL is set.
 */
import {
  renderRasterTilePng,
  readTileCache,
  writeTileCache,
} from './rasterTileRenderer.js'
import { publicCogUrlForTitiler } from './rasterStore.js'

const TITILER_URL = (process.env.TITILER_URL || '').replace(/\/$/, '')
const TILE_CACHE_CONTROL = 'public, max-age=86400'

export function buildTileJson(req, record) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.headers['x-forwarded-host'] || req.get('host')
  const base = `${proto}://${host}/api/raster/${record.id}`
  const b = record.bboxWgs84 || { west: -180, south: -85, east: 180, north: 85 }
  return {
    tilejson: '2.2.0',
    name: record.name,
    scheme: 'xyz',
    tiles: [`${base}/tiles/{z}/{x}/{y}.png`],
    minzoom: 0,
    maxzoom: 22,
    bounds: [b.west, b.south, b.east, b.north],
    center: [(b.west + b.east) / 2, (b.south + b.north) / 2, 12],
    attribution: 'AgroCloud Raster',
  }
}

async function fetchTitilerTile(record, z, x, y) {
  if (!TITILER_URL) return null
  const url = `${TITILER_URL}/cog/tiles/WebMercatorQuad/${z}/${x}/${y}.png?url=${encodeURIComponent(
    publicCogUrlForTitiler(record.id, record),
  )}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`TiTiler ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

export async function getRasterTilePng(record, z, x, y) {
  const cached = readTileCache(record.id, z, x, y)
  if (cached) return { buf: cached, cacheHit: true }

  let buf = null
  if (TITILER_URL) {
    try {
      buf = await fetchTitilerTile(record, z, x, y)
    } catch (err) {
      console.warn('[raster] TiTiler tile failed, using local renderer:', err.message)
    }
  }
  if (!buf) {
    buf = await renderRasterTilePng(record, z, x, y)
  }
  try {
    writeTileCache(record.id, z, x, y, buf)
  } catch {
    /* disk full — still return tile */
  }
  return { buf, cacheHit: false }
}

export function setTileHeaders(res) {
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('Cache-Control', TILE_CACHE_CONTROL)
  res.setHeader('Access-Control-Allow-Origin', '*')
}

/**
 * Minimal WMS GetMap → XYZ-style single image via TiTiler or local warp bbox.
 */
export async function handleWmsGetMap(req, res, record) {
  const { REQUEST, BBOX, WIDTH, HEIGHT, FORMAT } = {
    REQUEST: String(req.query.REQUEST || req.query.request || ''),
    BBOX: String(req.query.BBOX || req.query.bbox || ''),
    WIDTH: Number(req.query.WIDTH || req.query.width || 256),
    HEIGHT: Number(req.query.HEIGHT || req.query.height || 256),
    FORMAT: String(req.query.FORMAT || req.query.format || 'image/png'),
  }
  if (/GetCapabilities/i.test(REQUEST)) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
    const host = req.headers['x-forwarded-host'] || req.get('host')
    const online = `${proto}://${host}/api/raster/${record.id}/wms`
    const b = record.bboxWgs84 || { west: -180, south: -90, east: 180, north: 90 }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0">
  <Service><Name>WMS</Name><Title>${escapeXml(record.name)}</Title></Service>
  <Capability>
    <Request>
      <GetMap>
        <Format>image/png</Format>
        <DCPType><HTTP><Get><OnlineResource xlink:href="${online}"/></Get></HTTP></DCPType>
      </GetMap>
    </Request>
    <Layer>
      <Title>${escapeXml(record.name)}</Title>
      <CRS>EPSG:3857</CRS>
      <CRS>EPSG:4326</CRS>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>${b.west}</westBoundLongitude>
        <eastBoundLongitude>${b.east}</eastBoundLongitude>
        <southBoundLatitude>${b.south}</southBoundLatitude>
        <northBoundLatitude>${b.north}</northBoundLatitude>
      </EX_GeographicBoundingBox>
      <Layer queryable="0">
        <Name>raster</Name>
        <Title>${escapeXml(record.name)}</Title>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`
    res.setHeader('Content-Type', 'text/xml')
    return res.send(xml)
  }

  if (!/GetMap/i.test(REQUEST) || !BBOX) {
    return res.status(400).json({ error: 'WMS GetMap requires REQUEST=GetMap and BBOX' })
  }

  if (TITILER_URL) {
    try {
      const url = `${TITILER_URL}/cog/bbox/${BBOX}/png?url=${encodeURIComponent(
        publicCogUrlForTitiler(record.id, record),
      )}&max_size=${Math.max(WIDTH, HEIGHT)}`
      const upstream = await fetch(url)
      if (!upstream.ok) throw new Error(`TiTiler WMS ${upstream.status}`)
      const buf = Buffer.from(await upstream.arrayBuffer())
      res.setHeader('Content-Type', FORMAT.includes('jpeg') ? 'image/jpeg' : 'image/png')
      res.setHeader('Cache-Control', TILE_CACHE_CONTROL)
      return res.send(buf)
    } catch (err) {
      console.warn('[raster] TiTiler WMS failed:', err.message)
    }
  }

  // Approximate: render center tile at estimated zoom from bbox width
  const parts = BBOX.split(',').map(Number)
  if (parts.length !== 4 || parts.some(n => !Number.isFinite(n))) {
    return res.status(400).json({ error: 'Invalid BBOX' })
  }
  const [minX, minY, maxX, maxY] = parts
  const z = Math.min(18, Math.max(0, Math.round(Math.log2(40_075_016 / Math.max(1, maxX - minX)))))
  const n = 2 ** z
  const lon = (((minX + maxX) / 2) / WEB_MERCATOR_HALF) * 180
  const latRad = Math.atan(Math.sinh((((minY + maxY) / 2) / WEB_MERCATOR_HALF) * Math.PI))
  const lat = (latRad * 180) / Math.PI
  const x = Math.floor(((lon + 180) / 360) * n)
  const y = Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n)
  const { buf } = await getRasterTilePng(record, z, x, y)
  setTileHeaders(res)
  return res.send(buf)
}

const WEB_MERCATOR_HALF = 20037508.342789244

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * WMTS GetCapabilities / GetTile (REST-ish).
 */
export function handleWmts(req, res, record) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http'
  const host = req.headers['x-forwarded-host'] || req.get('host')
  const tileTemplate = `${proto}://${host}/api/raster/${record.id}/tiles/{TileMatrix}/{TileCol}/{TileRow}.png`
  const request = String(req.query.REQUEST || req.query.request || 'GetCapabilities')
  if (/GetTile/i.test(request)) {
    return null // caller should use XYZ route
  }
  const b = record.bboxWgs84 || { west: -180, south: -85, east: 180, north: 85 }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0" version="1.0.0">
  <Contents>
    <Layer>
      <ows:Title xmlns:ows="http://www.opengis.net/ows/1.1">${escapeXml(record.name)}</ows:Title>
      <ows:Identifier xmlns:ows="http://www.opengis.net/ows/1.1">${record.id}</ows:Identifier>
      <ows:WGS84BoundingBox xmlns:ows="http://www.opengis.net/ows/1.1">
        <ows:LowerCorner>${b.west} ${b.south}</ows:LowerCorner>
        <ows:UpperCorner>${b.east} ${b.north}</ows:UpperCorner>
      </ows:WGS84BoundingBox>
      <ResourceURL format="image/png" resourceType="tile" template="${tileTemplate}"/>
    </Layer>
  </Contents>
</Capabilities>`
  res.setHeader('Content-Type', 'application/xml')
  res.send(xml)
  return true
}

export function titilerConfigured() {
  return Boolean(TITILER_URL)
}
