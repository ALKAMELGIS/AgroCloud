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

/**
 * Per-pixel grid for AOI class-area histograms: R=NDVI, G=NDWI, B=NIR (B08),
 * A=valid mask. NIR + NDVI let the classifier recover Red and derive SAVI, so
 * the WMS fallback can reproduce the adaptive Water / Bare soil / vegetation
 * classes without the full Statistical API.
 */
const WMS_CLASS_GRID_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B08", "SCL", "dataMask"] }],
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
  function enc(v) { return Math.max(0, Math.min(254, Math.round((v + 1) * 127))); }
  function encNir(v) { return Math.max(0, Math.min(255, Math.round(v * 200))); }
  return [enc(ndvi), enc(ndwi), encNir(s.B08), 255];
}`

const WMS_CLASS_GRID_EVALSCRIPT_B64 = Buffer.from(WMS_CLASS_GRID_EVALSCRIPT, 'utf8').toString(
  'base64',
)

/** Extract the AGRO_CLASS_HISTOGRAM marker JSON embedded in a request evalscript. */
function parseAgroClassMarker(evalscript) {
  const text = String(evalscript || '')
  const match = text.match(/AGRO_CLASS_HISTOGRAM\s+(\{[\s\S]*?\})/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

/** Internal land class 1..N for a vegetation index value given ascending breaks. */
function landClassFor(value, breaks) {
  for (let i = 0; i < breaks.length; i += 1) {
    if (value < breaks[i]) return i + 1
  }
  return breaks.length + 1
}

/** Place a value into the histogram bin index for ascending `binEdges`, clamped to extremes. */
function binIndexFor(value, binEdges) {
  const nBins = binEdges.length - 1
  if (nBins < 1) return -1
  if (value < binEdges[0]) return 0
  if (value >= binEdges[nBins]) return nBins - 1
  for (let i = 0; i < nBins; i += 1) {
    if (value >= binEdges[i] && value < binEdges[i + 1]) return i
  }
  return nBins - 1
}

/** Statistical-API-compatible single-scene histogram response for one output band. */
function buildHistogramCompatibleResponse(date, outputId, binEdges, counts, sampleCount) {
  const bins = []
  for (let i = 0; i < binEdges.length - 1; i += 1) {
    bins.push({ lowEdge: binEdges[i], highEdge: binEdges[i + 1], count: counts[i] || 0 })
  }
  return {
    status: 'OK',
    data: [
      {
        interval: { from: `${date}T00:00:00Z`, to: `${addDaysToIso(date, 1)}T00:00:00Z` },
        outputs: {
          [outputId]: {
            bands: {
              [outputId]: {
                histogram: { bins, overflow: 0, underflow: 0 },
                stats: { sampleCount, noDataCount: 0 },
              },
            },
          },
        },
      },
    ],
  }
}

/** Decode the NDVI/NDWI/NIR class grid PNG into per-pixel typed arrays. */
function decodeClassGridPng(buffer) {
  const png = PNG.sync.read(buffer)
  const n = png.width * png.height
  const ndvi = new Float32Array(n)
  const ndwi = new Float32Array(n)
  const nir = new Float32Array(n)
  const valid = new Uint8Array(n)
  for (let p = 0; p < n; p += 1) {
    const i = p * 4
    const a = png.data[i + 3]
    if (a < 128) {
      valid[p] = 0
      continue
    }
    ndvi[p] = png.data[i] / 127 - 1
    ndwi[p] = png.data[i + 1] / 127 - 1
    nir[p] = png.data[i + 2] / 200
    valid[p] = 1
  }
  return { ndvi, ndwi, nir, valid, width: png.width, height: png.height }
}

async function fetchWmsClassGridForScene(options) {
  const bbox = options.bbox3857
  const spanX = bbox[2] - bbox[0]
  const spanY = bbox[3] - bbox[1]
  const mpp = 10
  const width = Math.max(64, Math.min(1024, Math.round(spanX / mpp)))
  const height = Math.max(64, Math.min(1024, Math.round(spanY / mpp)))
  const url = buildWmsGetMapUrl({
    baseUrl: options.baseUrl,
    accessToken: options.accessToken,
    layer: options.layer,
    bbox3857: bbox,
    width,
    height,
    timeStart: options.timeStart,
    timeEnd: options.timeEnd,
    cloudCoverage: options.cloudCoverage,
    format: 'image/png',
    evalscriptB64: WMS_CLASS_GRID_EVALSCRIPT_B64,
    geometryWkt3857: options.geometryWkt3857,
  })
  const res = await fetch(url, { headers: { Accept: 'image/png' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`WMS class grid GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  return decodeClassGridPng(Buffer.from(await res.arrayBuffer()))
}

/** Classify a decoded WMS index grid into per-class pixel counts for `binEdges`. */
function classifyGridToCounts(grid, marker, binEdges) {
  const counts = new Array(binEdges.length - 1).fill(0)
  let sampleCount = 0
  const isAdaptive = marker.mode === 'adaptive'
  const kind = String(marker.kind || 'ndvi')
  const landBreaks = Array.isArray(marker.landBreaks) ? marker.landBreaks : []
  const valueIndex = String(marker.index || 'ndvi')
  const n = grid.width * grid.height

  for (let p = 0; p < n; p += 1) {
    if (!grid.valid[p]) continue
    const ndvi = grid.ndvi[p]
    const ndwi = grid.ndwi[p]
    const nir = grid.nir[p]
    const red = 1 + ndvi > 1e-6 ? (nir * (1 - ndvi)) / (1 + ndvi) : 0
    const savi = ((nir - red) / (nir + red + 0.5)) * 1.5

    let value
    if (isAdaptive) {
      const veg = kind === 'savi' ? savi : ndvi
      const water = ndwi > 0 && nir < 0.12 && veg < 0.1
      value = water ? 0 : landClassFor(veg, landBreaks)
    } else if (valueIndex === 'ndwi') {
      value = ndwi
    } else if (valueIndex === 'savi') {
      value = savi
    } else {
      value = ndvi
    }

    const bi = binIndexFor(value, binEdges)
    if (bi >= 0) {
      counts[bi] += 1
      sampleCount += 1
    }
  }

  return { counts, sampleCount }
}

/**
 * Compute a per-class pixel histogram for an AOI/date via OGC WMS, reproducing
 * either the adaptive land-cover classes or plain index-value classes.
 *
 * Robustness: the user's exact selected day often has no Sentinel-2 acquisition
 * (or is fully clouded), which previously yielded an all-zero legend. We instead
 * search a window AROUND the selected date, order candidate scenes by proximity,
 * escalate the cloud-cover threshold, and use the first scene that produces real
 * (non-zero) classified pixels — so the legend shows actual per-class areas.
 *
 * @param {{ accessToken: string; instanceId: string }} wmsConfig
 * @param {Record<string, unknown>} body Statistical API request body
 * @param {{ mode: string; kind?: string; landBreaks?: number[]; index?: string; edges?: number[]; outputId?: string }} marker
 */
async function computeClassHistogramViaWms(wmsConfig, body, marker) {
  const accessToken = String(wmsConfig.accessToken || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN).trim()
  const instanceId = String(wmsConfig.instanceId || '').trim()
  if (!instanceId) {
    throw new Error('SENTINEL_HUB_WMS_INSTANCE_ID is required for WMS-based AOI statistics.')
  }

  const geometry = body?.input?.bounds?.geometry
  if (!geometry || typeof geometry !== 'object') {
    throw new Error('Statistics request missing input.bounds.geometry.')
  }

  const outputId = String(marker.outputId || 'idx')
  const binEdges =
    body?.calculations?.[outputId]?.histograms?.[outputId]?.bins ||
    (Array.isArray(marker.edges) ? marker.edges : null)
  const timeRange = body?.aggregation?.timeRange
  const fromIso = String(timeRange?.from || '').slice(0, 10)
  const toIso = String(timeRange?.to || '').slice(0, 10)
  if (!Array.isArray(binEdges) || binEdges.length < 2 || !fromIso || !toIso) {
    return buildHistogramCompatibleResponse(fromIso || '1970-01-01', outputId, binEdges || [0, 1], [], 0)
  }

  const maxCloudCoverage = body?.input?.data?.[0]?.dataFilter?.maxCloudCoverage
  const requestedCc =
    typeof maxCloudCoverage === 'number' && Number.isFinite(maxCloudCoverage) ? maxCloudCoverage : 80

  const geometryWkt3857 = geometryToWmsClipWkt3857(geometry)
  const bbox3857 = bbox3857FromGeometry(geometry)
  if (!geometryWkt3857 || !bbox3857) {
    throw new Error('Could not derive WMS clip geometry from AOI.')
  }

  const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${instanceId}`
  const layer = await resolveWmsEvalProxyLayer(baseUrl, accessToken)

  // The scene date the user is looking at. The frontend sends a 1-day window
  // [scene, scene+1); derive the scene from the window end so it stays correct
  // even if the window was widened upstream.
  const endMinusOne = addDaysToIso(toIso, -1)
  const referenceIso = endMinusOne >= fromIso ? endMinusOne : fromIso

  // Generous search window around the selected date so a usable scene is found.
  const searchFrom = addDaysToIso(referenceIso, -28)
  const searchTo = addDaysToIso(referenceIso, 7)
  const ccCandidates = [...new Set([requestedCc, 95, 100])]

  let sceneDates = []
  for (const cc of ccCandidates) {
    sceneDates = await fetchPcSentinelSceneDates(geometry, searchFrom, searchTo, cc)
    if (sceneDates.length) break
  }
  if (!sceneDates.length) {
    return buildHistogramCompatibleResponse(referenceIso, outputId, binEdges, [], 0)
  }

  // Try scenes nearest to the selected date first; stop at the first with pixels.
  const refTime = new Date(`${referenceIso}T12:00:00Z`).getTime()
  const ordered = sceneDates
    .slice()
    .sort(
      (a, b) =>
        Math.abs(new Date(`${a}T12:00:00Z`).getTime() - refTime) -
        Math.abs(new Date(`${b}T12:00:00Z`).getTime() - refTime),
    )
    .slice(0, 8)

  const gridCloudCoverage = Math.max(requestedCc, 95)
  for (const sceneDate of ordered) {
    let grid
    try {
      grid = await fetchWmsClassGridForScene({
        baseUrl,
        accessToken,
        layer,
        bbox3857,
        geometryWkt3857,
        cloudCoverage: gridCloudCoverage,
        timeStart: sceneDate,
        timeEnd: addDaysToIso(sceneDate, 1),
      })
    } catch {
      continue
    }
    const { counts, sampleCount } = classifyGridToCounts(grid, marker, binEdges)
    if (sampleCount > 0) {
      return buildHistogramCompatibleResponse(sceneDate, outputId, binEdges, counts, sampleCount)
    }
  }

  return buildHistogramCompatibleResponse(referenceIso, outputId, binEdges, [], 0)
}

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
  const format = options.format ?? 'image/png'
  let url =
    `${options.baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=${encodeURIComponent(options.layer)}` +
    `&CRS=EPSG:3857` +
    `&BBOX=${minX},${minY},${maxX},${maxY}` +
    `&WIDTH=${options.width ?? WMS_TILE_PIXELS}` +
    `&HEIGHT=${options.height ?? WMS_TILE_PIXELS}` +
    `&FORMAT=${encodeURIComponent(format)}&TRANSPARENT=true` +
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

/**
 * Fetch a per-pixel index grid (NDVI / NDWI / NDMI) for an AOI/date window via
 * OGC WMS (reuses the encoded stats evalscript). Used by the country-aware crop
 * classifier to build multi-temporal NDVI signatures.
 * @param {{
 *   accessToken: string; instanceId: string; geometry: GeoJSON.Geometry;
 *   timeStart: string; timeEnd: string; cloudCoverage?: number; size?: number;
 * }} options
 * @returns {Promise<{ ndvi: Float32Array; ndwi: Float32Array; ndmi: Float32Array; valid: Uint8Array; width: number; height: number; bbox3857: number[] }>}
 */
export async function fetchSentinelWmsIndicesGrid(options) {
  const accessToken = String(options.accessToken || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN).trim()
  const instanceId = String(options.instanceId || '').trim()
  if (!instanceId) throw new Error('SENTINEL_HUB_WMS_INSTANCE_ID is required for AOI imagery.')
  const bbox3857 = bbox3857FromGeometry(options.geometry)
  if (!bbox3857) throw new Error('Could not derive bbox from AOI geometry.')

  // High spatial resolution: sample at (close to) Sentinel-2 native 10 m/px and
  // keep the grid aspect ratio aligned with the AOI bbox so fields aren't
  // distorted. Capped so very large AOIs stay within WMS limits / payload size.
  const spanX = bbox3857[2] - bbox3857[0]
  const spanY = bbox3857[3] - bbox3857[1]
  const mpp = Math.max(5, options.metersPerPixel ?? 10)
  const maxSize = options.maxSize ?? 1024
  const minSize = options.minSize ?? 128
  let width
  let height
  if (options.size) {
    width = options.size
    height = options.size
  } else {
    width = Math.max(minSize, Math.min(maxSize, Math.round(spanX / mpp)))
    height = Math.max(minSize, Math.min(maxSize, Math.round(spanY / mpp)))
  }
  const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${instanceId}`
  const layer = await resolveWmsEvalProxyLayer(baseUrl, accessToken)
  const url = buildWmsGetMapUrl({
    baseUrl,
    accessToken,
    layer,
    bbox3857,
    width,
    height,
    timeStart: options.timeStart,
    timeEnd: options.timeEnd,
    cloudCoverage: options.cloudCoverage ?? 60,
    format: 'image/png',
  })
  const res = await fetch(url, { headers: { Accept: 'image/png' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`WMS indices GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()))
  const n = png.width * png.height
  const ndvi = new Float32Array(n)
  const ndwi = new Float32Array(n)
  const ndmi = new Float32Array(n)
  const valid = new Uint8Array(n)
  for (let p = 0; p < n; p += 1) {
    const i = p * 4
    const r = png.data[i]
    const g = png.data[i + 1]
    const b = png.data[i + 2]
    const a = png.data[i + 3]
    if (a < 128 || (r === 0 && g === 0 && b === 0)) {
      valid[p] = 0
      continue
    }
    ndvi[p] = r / 127 - 1
    ndwi[p] = g / 127 - 1
    ndmi[p] = b / 127 - 1
    valid[p] = 1
  }
  return { ndvi, ndwi, ndmi, valid, width: png.width, height: png.height, bbox3857 }
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

  // Per-class area histograms (NDVI/SAVI adaptive land cover, index value classes).
  const classMarker = parseAgroClassMarker(body?.aggregation?.evalscript)
  if (classMarker) {
    return computeClassHistogramViaWms({ accessToken, instanceId }, body, classMarker)
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

const WMS_TRUE_COLOR_EVALSCRIPT = `//VERSION=3
function setup() {
  return { input: ["B02", "B03", "B04", "dataMask"], output: { bands: 3, sampleType: "UINT8" } };
}
function evaluatePixel(s) {
  if (!s.dataMask) return [0, 0, 0];
  function c(v) { return Math.max(0, Math.min(255, Math.round(2.5 * v * 255))); }
  return [c(s.B04), c(s.B03), c(s.B02)];
}`

const WMS_TRUE_COLOR_EVALSCRIPT_B64 = Buffer.from(WMS_TRUE_COLOR_EVALSCRIPT, 'utf8').toString('base64')

/**
 * Fetch a true-color RGB PNG for an AOI via Sentinel Hub OGC WMS (no Statistical API OAuth).
 * Reuses the same access token + WMS instance as Layer Live.
 * @param {{
 *   accessToken: string;
 *   instanceId: string;
 *   geometry: GeoJSON.Geometry;
 *   timeStart: string;
 *   timeEnd: string;
 *   cloudCoverage?: number;
 *   size?: number;
 * }} options
 * @returns {Promise<Buffer>}
 */
export async function fetchSentinelWmsTrueColorPng(options) {
  const accessToken = String(options.accessToken || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN).trim()
  const instanceId = String(options.instanceId || '').trim()
  if (!instanceId) {
    throw new Error('SENTINEL_HUB_WMS_INSTANCE_ID is required for AOI imagery.')
  }
  const bbox3857 = bbox3857FromGeometry(options.geometry)
  if (!bbox3857) throw new Error('Could not derive bbox from AOI geometry.')

  const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${instanceId}`
  const layer = await resolveWmsEvalProxyLayer(baseUrl, accessToken)
  const url = buildWmsGetMapUrl({
    baseUrl,
    accessToken,
    layer,
    bbox3857,
    width: options.size ?? WMS_TILE_PIXELS,
    height: options.size ?? WMS_TILE_PIXELS,
    timeStart: options.timeStart,
    timeEnd: options.timeEnd,
    cloudCoverage: options.cloudCoverage ?? 60,
    evalscriptB64: WMS_TRUE_COLOR_EVALSCRIPT_B64,
  })
  const res = await fetch(url, { headers: { Accept: 'image/png' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`WMS GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** HLS-equivalent 6 bands (Blue, Green, Red, Narrow NIR, SWIR1, SWIR2) scaled to reflectance×10000. */
const WMS_HLS_BANDS_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B8A", "B11", "B12", "dataMask"],
    output: { bands: 6, sampleType: "UINT16" }
  };
}
function evaluatePixel(s) {
  function r(v) { return Math.max(0, Math.min(65535, Math.round(v * 10000))); }
  return [r(s.B02), r(s.B03), r(s.B04), r(s.B8A), r(s.B11), r(s.B12)];
}`

const WMS_HLS_BANDS_EVALSCRIPT_B64 = Buffer.from(WMS_HLS_BANDS_EVALSCRIPT, 'utf8').toString('base64')

/**
 * Fetch a 6-band (HLS-equivalent) UINT16 GeoTIFF for an AOI/timestep via OGC WMS.
 * Band order: Blue, Green, Red, Narrow NIR, SWIR1, SWIR2 (matches Prithvi HLS input).
 * @param {{
 *   accessToken: string;
 *   instanceId: string;
 *   geometry: GeoJSON.Geometry;
 *   timeStart: string;
 *   timeEnd: string;
 *   cloudCoverage?: number;
 *   size?: number;
 * }} options
 * @returns {Promise<{ buffer: Buffer; bbox3857: number[]; width: number; height: number }>}
 */
export async function fetchSentinelWmsBandsTiff(options) {
  const accessToken = String(options.accessToken || SENTINEL_HUB_PUBLIC_WMS_ACCESS_TOKEN).trim()
  const instanceId = String(options.instanceId || '').trim()
  if (!instanceId) throw new Error('SENTINEL_HUB_WMS_INSTANCE_ID is required for AOI imagery.')
  const bbox3857 = bbox3857FromGeometry(options.geometry)
  if (!bbox3857) throw new Error('Could not derive bbox from AOI geometry.')

  const size = options.size ?? 224
  const baseUrl = `https://services.sentinel-hub.com/ogc/wms/${instanceId}`
  const layer = await resolveWmsEvalProxyLayer(baseUrl, accessToken)
  const url = buildWmsGetMapUrl({
    baseUrl,
    accessToken,
    layer,
    bbox3857,
    width: size,
    height: size,
    timeStart: options.timeStart,
    timeEnd: options.timeEnd,
    cloudCoverage: options.cloudCoverage ?? 60,
    format: 'image/tiff',
    evalscriptB64: WMS_HLS_BANDS_EVALSCRIPT_B64,
  })
  const res = await fetch(url, { headers: { Accept: 'image/tiff' } })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`WMS bands GetMap failed (${res.status}): ${text.slice(0, 160)}`)
  }
  return { buffer: Buffer.from(await res.arrayBuffer()), bbox3857, width: size, height: size }
}
