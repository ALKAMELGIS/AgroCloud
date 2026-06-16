/**
 * AOI zonal statistics via Sentinel Hub OGC WMS + custom EVALSCRIPT.
 * Uses the same PUBLIC_DATA_FEATURED_COLLECTIONS + WMS instance as Layer Live (no Statistical API OAuth).
 */

import { PNG } from 'pngjs'

const SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN = 'PUBLIC_DATA_FEATURED_COLLECTIONS'
const PC_SENTINEL_STAC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
const WMS_TILE_PIXELS = 256
const MAX_SCENE_FETCHES = 160
const WMS_FETCH_CONCURRENCY = 4

/** @type {Map<string, { layer: string; expiresAt: number }>} */
const wmsProxyLayerCache = new Map()

const WMS_ZONAL_STATS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "B08", "B11", "SCL", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var scl = s.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  if (!s.dataMask || cloud) return [0, 0, 0, 0];
  var dNdvi = s.B08 + s.B04;
  var ndvi = dNdvi > 1e-6 ? (s.B08 - s.B04) / dNdvi : 0;
  var dNdwi = s.B03 + s.B08;
  var ndwi = dNdwi > 1e-6 ? (s.B03 - s.B08) / dNdwi : 0;
  var dNdmi = s.B08 + s.B11;
  var ndmi = dNdmi > 1e-6 ? (s.B08 - s.B11) / dNdmi : 0;
  function enc(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  }
  return [enc(ndvi), enc(ndwi), enc(ndmi), 255];
}`

const WMS_STATS_EVALSCRIPT_B64 = Buffer.from(WMS_ZONAL_STATS_EVALSCRIPT, 'utf8').toString('base64')

export function evalscriptToBase64Param(script) {
  return Buffer.from(String(script || '').replace(/\r\n/g, '\n').trim(), 'utf8').toString('base64')
}

export function lngLatToWebMercator(lng, lat) {
  const x = (lng * 20037508.34) / 180
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (20037508.34 / 180)
  return [x, y]
}

function ringClosed(ring) {
  if (ring.length < 2) return ring
  const a = ring[0]
  const b = ring[ring.length - 1]
  if (a[0] === b[0] && a[1] === b[1]) return ring
  return [...ring, a]
}

function decimateMax(ring, maxPts) {
  if (ring.length <= maxPts) return ring
  const step = Math.ceil(ring.length / maxPts)
  const out = []
  for (let i = 0; i < ring.length; i += step) out.push(ring[i])
  const last = ring[ring.length - 1]
  const prev = out[out.length - 1]
  if (prev[0] !== last[0] || prev[1] !== last[1]) out.push(last)
  return out
}

function ringWgs84To3857CoordPairs(ring) {
  return ring
    .map(([lng, lat]) => {
      const [x, y] = lngLatToWebMercator(lng, lat)
      return `${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(', ')
}

function polygon3857WktFromRing(ring) {
  return `POLYGON((${ringWgs84To3857CoordPairs(ring)}))`
}

function multiPolygon3857Wkt(rings) {
  if (rings.length === 1) return polygon3857WktFromRing(rings[0])
  const parts = rings.map(r => `((${ringWgs84To3857CoordPairs(r)}))`).join(', ')
  return `MULTIPOLYGON(${parts})`
}

/** @param {GeoJSON.Geometry | null | undefined} geometry */
export function geometryToWmsClipWkt3857(geometry) {
  if (!geometry || typeof geometry !== 'object') return null
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0]
    if (!Array.isArray(ring) || !ring.length) return null
    const simplified = decimateMax(ringClosed(ring), 36)
    return polygon3857WktFromRing(simplified)
  }
  if (geometry.type === 'MultiPolygon') {
    const rings = geometry.coordinates
      ?.map(poly => {
        const ring = poly?.[0]
        if (!Array.isArray(ring) || !ring.length) return null
        return decimateMax(ringClosed(ring), 28)
      })
      .filter(Boolean)
    if (!rings?.length) return null
    return multiPolygon3857Wkt(rings)
  }
  return null
}

/** @param {GeoJSON.Geometry} geometry */
export function bbox3857FromGeometry(geometry) {
  const points = []
  function walk(coords) {
    if (!coords) return
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      points.push(coords)
      return
    }
    if (Array.isArray(coords)) coords.forEach(walk)
  }
  walk(geometry.coordinates)
  if (!points.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [lng, lat] of points) {
    const [x, y] = lngLatToWebMercator(lng, lat)
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null
  const padX = Math.max(8, (maxX - minX) * 0.02)
  const padY = Math.max(8, (maxY - minY) * 0.02)
  return [minX - padX, minY - padY, maxX + padX, maxY + padY]
}

export function decodeWmsZonalStatsFromPng(buffer) {
  const png = PNG.sync.read(buffer)
  let ndviSum = 0
  let ndwiSum = 0
  let ndmiSum = 0
  let count = 0
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i]
    const g = png.data[i + 1]
    const b = png.data[i + 2]
    const a = png.data[i + 3]
    if (a < 128 || (r === 0 && g === 0 && b === 0)) continue
    ndviSum += r / 127 - 1
    ndwiSum += g / 127 - 1
    ndmiSum += b / 127 - 1
    count += 1
  }
  if (count === 0) {
    return { ndvi: null, ndwi: null, ndmi: null, sampleCount: 0 }
  }
  return {
    ndvi: Number((ndviSum / count).toFixed(4)),
    ndwi: Number((ndwiSum / count).toFixed(4)),
    ndmi: Number((ndmiSum / count).toFixed(4)),
    sampleCount: count,
  }
}

function addDaysToIso(iso, days) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function stacFeatureCalendarIso(feature) {
  const dt = feature?.properties?.datetime
  if (typeof dt !== 'string' || dt.length < 10) return null
  return dt.slice(0, 10)
}

/** @param {GeoJSON.Geometry} geometry */
export async function fetchPcSentinelSceneDates(geometry, fromIso, toIso, maxCloudCoverage) {
  const body = {
    collections: ['sentinel-2-l2a'],
    intersects: geometry,
    datetime: `${fromIso.slice(0, 10)}T00:00:00Z/${toIso.slice(0, 10)}T23:59:59Z`,
    limit: 500,
    sortby: [{ field: 'datetime', direction: 'asc' }],
  }
  if (typeof maxCloudCoverage === 'number' && Number.isFinite(maxCloudCoverage)) {
    body.query = { 'eo:cloud_cover': { lt: maxCloudCoverage } }
  }

  const res = await fetch(PC_SENTINEL_STAC_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Planetary Computer STAC search failed (${res.status}): ${text.slice(0, 180)}`)
  }
  const json = await res.json()
  const features = Array.isArray(json.features) ? json.features : []
  const dates = [
    ...new Set(
      features.map(stacFeatureCalendarIso).filter(d => typeof d === 'string' && d.length >= 10),
    ),
  ]
  dates.sort((a, b) => a.localeCompare(b))
  return dates.slice(0, MAX_SCENE_FETCHES)
}

async function resolveWmsEvalProxyLayer(baseUrl, accessToken) {
  const cacheKey = `${baseUrl}|${accessToken}`
  const now = Date.now()
  const cached = wmsProxyLayerCache.get(cacheKey)
  if (cached && cached.expiresAt > now) return cached.layer

  const capUrl = `${baseUrl}?SERVICE=WMS&REQUEST=GetCapabilities&access_token=${encodeURIComponent(accessToken)}`
  const res = await fetch(capUrl, { headers: { Accept: 'application/xml' } })
  const text = await res.text()
  if (!res.ok) throw new Error(`WMS GetCapabilities failed (${res.status})`)

  const names = [...text.matchAll(/<Name>([^<]+)<\/Name>/g)]
    .map(m => String(m[1] || '').trim())
    .filter(n => n && !/^(wms|default)$/i.test(n))

  const layer =
    names.find(n => /true.?color/i.test(n)) ??
    names.find(n => /1[-_]true/i.test(n)) ??
    names.find(n => /ndvi/i.test(n)) ??
    names[0] ??
    '1_TRUE_COLOR'

  wmsProxyLayerCache.set(cacheKey, { layer, expiresAt: now + 3600_000 })
  return layer
}

function buildWmsGetMapUrl(options) {
  const [minX, minY, maxX, maxY] = options.bbox3857
  let url =
    `${options.baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(options.layer)}` +
    `&CRS=EPSG:3857` +
    `&BBOX=${minX},${minY},${maxX},${maxY}` +
    `&WIDTH=${options.width ?? WMS_TILE_PIXELS}` +
    `&HEIGHT=${options.height ?? WMS_TILE_PIXELS}` +
    `&FORMAT=image/png&TRANSPARENT=true` +
    `&TIME=${options.timeStart}/${options.timeEnd}` +
    `&MAXCC=${options.cloudCoverage ?? 80}` +
    `&SHOWLOGO=false&WARNINGS=false` +
    `&EVALSCRIPT=${encodeURIComponent(options.evalscriptB64 ?? WMS_STATS_EVALSCRIPT_B64)}`
  if (options.geometryWkt3857) {
    url += `&GEOMETRY=${encodeURIComponent(options.geometryWkt3857)}`
  }
  url += `&access_token=${encodeURIComponent(options.accessToken)}`
  return url
}

async function fetchWmsZonalStatsForScene(options) {
  const url = buildWmsGetMapUrl(options)
  const res = await fetch(url, { headers: { Accept: 'image/png' } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WMS GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  return decodeWmsZonalStatsFromPng(buffer)
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

function buildStatisticalApiCompatibleResponse(rows) {
  return {
    status: 'OK',
    data: rows.map(row => ({
      interval: {
        from: `${row.date}T00:00:00Z`,
        to: `${addDaysToIso(row.date, 1)}T00:00:00Z`,
      },
      outputs: {
        indices: {
          bands: {
            ndvi: {
              stats: {
                mean: row.ndvi,
                sampleCount: row.sampleCount,
                noDataCount: row.ndvi == null ? row.sampleCount : 0,
              },
            },
            ndwi: {
              stats: {
                mean: row.ndwi,
                sampleCount: row.sampleCount,
                noDataCount: row.ndwi == null ? row.sampleCount : 0,
              },
            },
            ndmi: {
              stats: {
                mean: row.ndmi,
                sampleCount: row.sampleCount,
                noDataCount: row.ndmi == null ? row.sampleCount : 0,
              },
            },
            evi: {
              stats: {
                mean: null,
                sampleCount: row.sampleCount,
                noDataCount: row.sampleCount,
              },
            },
          },
        },
      },
    })),
  }
}

/**
 * @param {{ accessToken: string; instanceId: string }} wmsConfig
 * @param {Record<string, unknown>} body Statistical API request body
 */
export async function postSentinelStatisticsViaWms(wmsConfig, body) {
  const accessToken = String(wmsConfig.accessToken || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN).trim()
  const instanceId = String(wmsConfig.instanceId || '').trim()
  if (!instanceId) {
    throw new Error('SENTINEL_HUB_WMS_INSTANCE_ID is required for WMS-based AOI statistics.')
  }

  const geometry = body?.input?.bounds?.geometry
  if (!geometry || typeof geometry !== 'object') {
    throw new Error('Statistics request missing input.bounds.geometry.')
  }

  const timeRange = body?.aggregation?.timeRange
  const fromIso = String(timeRange?.from || '').slice(0, 10)
  const toIso = String(timeRange?.to || '').slice(0, 10)
  if (!fromIso || !toIso) {
    throw new Error('Statistics request missing aggregation.timeRange.')
  }

  const maxCloudCoverage = body?.input?.data?.[0]?.dataFilter?.maxCloudCoverage
  const cloudCoverage =
    typeof maxCloudCoverage === 'number' && Number.isFinite(maxCloudCoverage) ? maxCloudCoverage : 80

  const geometryWkt3857 = geometryToWmsClipWkt3857(geometry)
  const bbox3857 = bbox3857FromGeometry(geometry)
  if (!geometryWkt3857 || !bbox3857) {
    throw new Error('Could not derive WMS clip geometry from AOI.')
  }

  const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${instanceId}`
  const layer = await resolveWmsEvalProxyLayer(baseUrl, accessToken)
  const sceneDates = await fetchPcSentinelSceneDates(geometry, fromIso, toIso, cloudCoverage)

  if (!sceneDates.length) {
    return buildStatisticalApiCompatibleResponse([])
  }

  const wmsBase = {
    baseUrl,
    accessToken,
    layer,
    bbox3857,
    geometryWkt3857,
    cloudCoverage,
    evalscriptB64: WMS_STATS_EVALSCRIPT_B64,
  }

  const rows = await mapPool(sceneDates, WMS_FETCH_CONCURRENCY, async sceneDate => {
    try {
      const stats = await fetchWmsZonalStatsForScene({
        ...wmsBase,
        timeStart: sceneDate,
        timeEnd: addDaysToIso(sceneDate, 1),
      })
      if (stats.sampleCount === 0 || stats.ndvi == null) return null
      return { date: sceneDate, ...stats }
    } catch {
      return null
    }
  })

  const validRows = rows.filter(Boolean).sort((a, b) => a.date.localeCompare(b.date))
  return buildStatisticalApiCompatibleResponse(validRows)
}

export function isWmsStatisticsFallbackReady(accessToken, instanceId) {
  return Boolean(String(accessToken || '').trim() && String(instanceId || '').trim())
}
