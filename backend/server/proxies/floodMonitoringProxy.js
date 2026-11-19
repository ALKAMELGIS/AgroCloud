/**
 * SAR-based flood extent monitoring — server-side orchestrator.
 *
 * Inspired by "Fast flood extent monitoring with SAR change detection using Google Earth Engine"
 * (CHL-UA/SAR-flood-monitoring, IEEE TGRS 2023, doi:10.1109/TGRS.2023.3240097). We reproduce the
 * core idea with the data source this platform can actually reach: Sentinel-1 GRD VV/VH backscatter
 * via the Sentinel Hub / CDSE **Process API** (OAuth). SAR sees through clouds, so it is the right
 * sensor for flood mapping.
 *
 * Pipeline (strictly AOI-bounded):
 *   AOI → fetch S1 GRD (pre-event + post-event) → convert to dB → threshold low backscatter = water
 *   → flood = post-water AND NOT pre-water (change detection) → flood-extent raster + change raster
 *   → vectorize boundaries (marching squares) → flood statistics.
 *
 * Endpoints:
 *   GET  /api/flood-monitoring/config           → { configured, source, hint }
 *   POST /api/flood-monitoring/run              → 202 { jobId }   body: { aoi, preDate, postDate?, threshold? }
 *   GET  /api/flood-monitoring/jobs/:jobId      → { id, status, progress, message, result, error }
 */

import { randomUUID } from 'crypto'
import { fromArrayBuffer } from 'geotiff'
import { PNG } from 'pngjs'
import { resolveSentinelHubProcessAuth } from './sentinelHubStatisticsProxy.js'

/** @typedef {'queued'|'fetching'|'detecting'|'vectorizing'|'done'|'error'} JobStatus */

/** @type {Map<string, any>} */
const JOBS = new Map()
const JOB_TTL_MS = 30 * 60 * 1000
/** Largest tile edge requested from the Process API (keeps memory + latency bounded). */
const MAX_DIM = 1024
const MIN_DIM = 16
/** Default VV backscatter (dB) below which a pixel is treated as smooth open water. */
const DEFAULT_WATER_DB = -17
/** S1 revisit is ~6–12 days; widen each date into a window so a scene is found. */
const SCENE_WINDOW_DAYS = 6

function pruneJobs() {
  const now = Date.now()
  for (const [id, job] of JOBS) {
    if (now - job.updatedAt > JOB_TTL_MS) JOBS.delete(id)
  }
}

function newJob() {
  const id = randomUUID()
  const job = {
    id,
    status: /** @type {JobStatus} */ ('queued'),
    progress: 0,
    message: 'Queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: null,
    error: null,
  }
  JOBS.set(id, job)
  return job
}

function setJob(job, patch, broadcast) {
  Object.assign(job, patch, { updatedAt: Date.now() })
  if (typeof broadcast === 'function') {
    broadcast({ topic: 'flood-monitoring/job', payload: publicJob(job) })
  }
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    result: job.result,
    error: job.error,
  }
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

/** All [lng,lat] vertices of a Polygon/MultiPolygon. */
function geometryCoords(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates.flat()
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2)
  return []
}

/** Polygon/MultiPolygon → [west, south, east, north] (EPSG:4326). */
function geometryBbox(geometry) {
  const coords = geometryCoords(geometry).filter(p => Array.isArray(p) && p.length >= 2)
  if (!coords.length) throw new Error('AOI polygon has no coordinates')
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lng, lat] of coords) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [w, s, e, n]
}

/** Output pixel grid from a bbox at ~10 m (Sentinel-1 GRD native), clamped to [MIN_DIM, MAX_DIM]. */
function gridSizeForBbox([w, s, e, n]) {
  const midLat = ((s + n) / 2) * (Math.PI / 180)
  const widthM = Math.max(1, (e - w) * 111320 * Math.cos(midLat))
  const heightM = Math.max(1, (n - s) * 110540)
  const clamp = v => Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(v / 10)))
  return { width: clamp(widthM), height: clamp(heightM) }
}

/** Spherical ring area (m²) — geodesic, sign-aware. */
function ringAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  const R = 6378137
  let total = 0
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i]
    const [lng2, lat2] = ring[(i + 1) % ring.length]
    total += (lng2 - lng1) * (Math.PI / 180) * (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180))
  }
  return Math.abs((total * R * R) / 2)
}

function geometryAreaHa(geometry) {
  let m2 = 0
  if (geometry?.type === 'Polygon') {
    geometry.coordinates.forEach((ring, i) => {
      m2 += (i === 0 ? 1 : -1) * ringAreaM2(ring)
    })
  } else if (geometry?.type === 'MultiPolygon') {
    geometry.coordinates.forEach(poly =>
      poly.forEach((ring, i) => {
        m2 += (i === 0 ? 1 : -1) * ringAreaM2(ring)
      }),
    )
  }
  return Math.max(0, m2) / 10000
}

/** Ray-casting point-in-polygon over the outer ring(s) of a Polygon/MultiPolygon. */
function pointInGeometry(lng, lat, geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const rings of polys) {
    if (!rings?.length) continue
    if (pointInRing(lng, lat, rings[0])) {
      let inHole = false
      for (let h = 1; h < rings.length; h++) {
        if (pointInRing(lng, lat, rings[h])) {
          inHole = true
          break
        }
      }
      if (!inHole) return true
    }
  }
  return false
}

function pointInRing(lng, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// ── Sentinel-1 GRD fetch (Process API) ───────────────────────────────────────

const S1_EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{ bands: ["VV", "VH", "dataMask"] }],
    output: { bands: 3, sampleType: "FLOAT32" },
  };
}
function evaluatePixel(s) {
  return [s.VV, s.VH, s.dataMask];
}`

function isoDayRange(dateStr) {
  const base = new Date(`${dateStr}T00:00:00Z`).getTime()
  if (!Number.isFinite(base)) throw new Error(`Invalid date: ${dateStr}`)
  const from = new Date(base - SCENE_WINDOW_DAYS * 86400_000).toISOString()
  const to = new Date(base + SCENE_WINDOW_DAYS * 86400_000 + 86399_000).toISOString()
  return { from, to }
}

/**
 * Fetch Sentinel-1 GRD VV/VH/dataMask as FLOAT32 over the AOI bbox for one date window.
 * Returns { width, height, vv, vh, mask } typed arrays (gamma0, orthorectified, linear power).
 */
async function fetchS1Grd({ processUrl, token }, bbox, dateStr, width, height) {
  const { from, to } = isoDayRange(dateStr)
  const body = {
    input: {
      bounds: {
        bbox,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [
        {
          type: 'sentinel-1-grd',
          dataFilter: { timeRange: { from, to }, mosaickingOrder: 'mostRecent' },
          processing: { backCoeff: 'GAMMA0_ELLIPSOID', orthorectify: true, demInstance: 'COPERNICUS_30' },
        },
      ],
    },
    output: {
      width,
      height,
      responses: [{ identifier: 'default', format: { type: 'image/tiff' } }],
    },
    evalscript: S1_EVALSCRIPT,
  }

  const res = await fetch(processUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'image/tiff',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sentinel-1 Process API failed (${res.status}): ${text.slice(0, 240)}`)
  }
  const buf = await res.arrayBuffer()
  const tiff = await fromArrayBuffer(buf)
  const image = await tiff.getImage()
  const rasters = await image.readRasters({ interleave: false })
  const w = image.getWidth()
  const h = image.getHeight()
  return {
    width: w,
    height: h,
    vv: rasters[0],
    vh: rasters[1],
    mask: rasters[2],
  }
}

// ── Sentinel-1 GRD fetch (Microsoft Planetary Computer — free, no auth) ───────

const PC_STAC_SEARCH = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
const PC_DATA_BBOX = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox'
/**
 * Source preference: terrain-corrected RTC (γ⁰, linear power) gives the cleanest
 * water detection, but its coverage is partial. The GRD collection is GLOBAL and
 * shares the same acquisitions, so it backs RTC up wherever RTC has a hole.
 */
const PC_SOURCES = [
  { collection: 'sentinel-1-rtc', nodata: -32768, kind: 'rtc' },
  { collection: 'sentinel-1-grd', nodata: 0, kind: 'grd' },
]
/** Sentinel-1 σ⁰ calibration constant — maps GRD amplitude DN to a γ⁰-comparable dB scale. */
const GRD_CAL = 1000
/** STAC discovery window (S1 single-sat revisit ~12 days; widen for coverage edges). */
const PC_SEARCH_WINDOW_DAYS = 30

/** Find the scene in a collection nearest a target date that intersects the AOI. */
async function pcFindNearestS1Item(bbox, dateStr, collection) {
  const base = new Date(`${dateStr}T00:00:00Z`).getTime()
  if (!Number.isFinite(base)) throw new Error(`Invalid date: ${dateStr}`)
  const from = new Date(base - PC_SEARCH_WINDOW_DAYS * 86400_000).toISOString()
  const to = new Date(base + PC_SEARCH_WINDOW_DAYS * 86400_000 + 86399_000).toISOString()
  const body = { collections: [collection], bbox, datetime: `${from}/${to}`, limit: 60 }
  const res = await fetch(PC_STAC_SEARCH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Planetary Computer STAC search failed (${res.status}): ${t.slice(0, 160)}`)
  }
  const json = await res.json()
  const feats = Array.isArray(json?.features) ? json.features : []
  if (!feats.length) return null
  let best = null
  let bestDiff = Infinity
  for (const f of feats) {
    const dt = new Date(f?.properties?.datetime || f?.properties?.start_datetime || 0).getTime()
    const diff = Math.abs(dt - base)
    if (diff < bestDiff) {
      bestDiff = diff
      best = f
    }
  }
  return best
}

/** Crop + decode a single PC item's VV/VH to γ⁰-comparable linear power + validity mask. */
async function pcCropScene(bbox, item, source, maxDim) {
  const id = item.id
  const usedDate = String(item?.properties?.datetime || '').slice(0, 10)
  const [w, s, e, n] = bbox
  const dim = Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(maxDim)))
  const url =
    `${PC_DATA_BBOX}/${w},${s},${e},${n}.tif` +
    `?collection=${source.collection}&item=${encodeURIComponent(id)}` +
    `&assets=vv&assets=vh&max_size=${dim}&nodata=${source.nodata}`
  const res = await fetch(url, { headers: { Accept: 'image/tiff' } })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Planetary Computer crop failed (${res.status}): ${t.slice(0, 160)}`)
  }
  const buf = await res.arrayBuffer()
  const tiff = await fromArrayBuffer(buf)
  const image = await tiff.getImage()
  const rasters = await image.readRasters({ interleave: false })
  const wpx = image.getWidth()
  const hpx = image.getHeight()
  const srcVv = rasters[0]
  const srcVh = rasters[1]
  const n2 = wpx * hpx
  const vv = new Float32Array(n2)
  const vh = new Float32Array(n2)
  const mask = new Uint8Array(n2)
  if (source.kind === 'grd') {
    // GRD is uint16 amplitude DN — convert to σ⁰ linear power: (DN / cal)².
    const inv = 1 / GRD_CAL
    for (let i = 0; i < n2; i++) {
      const a = srcVv[i]
      const b = srcVh[i]
      if (a > 0 && Number.isFinite(a)) {
        const la = a * inv
        const lb = (b > 0 ? b : a) * inv
        vv[i] = la * la
        vh[i] = lb * lb
        mask[i] = 1
      }
    }
  } else {
    // RTC is already γ⁰ linear power; nodata is a large negative sentinel.
    for (let i = 0; i < n2; i++) {
      const a = srcVv[i]
      if (Number.isFinite(a) && a !== source.nodata && a > 0) {
        vv[i] = a
        vh[i] = srcVh[i] > 0 ? srcVh[i] : a
        mask[i] = 1
      }
    }
  }
  return { width: wpx, height: hpx, vv, vh, mask, usedDate: usedDate || '', source: source.kind, itemId: id }
}

/**
 * Fetch Sentinel-1 VV/VH clipped to the AOI via the Planetary Computer (no auth).
 * Tries RTC first, then the global GRD collection so coverage holes don't break the run.
 */
async function fetchS1FromPlanetaryComputer(bbox, dateStr, maxDim) {
  const errors = []
  for (const source of PC_SOURCES) {
    try {
      const item = await pcFindNearestS1Item(bbox, dateStr, source.collection)
      if (!item) {
        errors.push(`${source.collection}: no scene within ±${PC_SEARCH_WINDOW_DAYS}d`)
        continue
      }
      return await pcCropScene(bbox, item, source, maxDim)
    } catch (e) {
      errors.push(`${source.collection}: ${e instanceof Error ? e.message : e}`)
    }
  }
  throw new Error(`No Sentinel-1 coverage near ${dateStr} for this AOI (${errors.join('; ')}).`)
}

// ── SAR water / flood detection ──────────────────────────────────────────────

const toDb = linear => (linear > 0 ? 10 * Math.log10(linear) : -50)

/** Per-pixel water mask: smooth open water has low VV backscatter (dB below threshold). */
function waterMaskFromS1(scene, waterDb) {
  const { width, height, vv, vh, mask } = scene
  const out = new Uint8Array(width * height)
  const valid = new Uint8Array(width * height)
  for (let i = 0; i < out.length; i++) {
    const hasData = mask ? mask[i] > 0 : true
    valid[i] = hasData ? 1 : 0
    if (!hasData) continue
    const vvDb = toDb(vv[i])
    // VH reinforces the decision (water is dark in both); allow VV-only when VH missing.
    const vhDb = vh ? toDb(vh[i]) : vvDb - 8
    if (vvDb < waterDb && vhDb < waterDb - 4) out[i] = 1
  }
  return { width, height, water: out, valid }
}

/**
 * Bilinearly resample a {width,height,data} grid onto the post grid dimensions so pre/post
 * masks align pixel-for-pixel even if the Process API returned slightly different sizes.
 */
function resampleNearest(src, w, h) {
  if (src.width === w && src.height === h) return src
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y / h) * src.height))
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x / w) * src.width))
      out[y * w + x] = src.water[sy * src.width + sx]
    }
  }
  return { width: w, height: h, water: out, valid: null }
}

// ── Raster PNG encoders (RGBA, north-up; row 0 = north) ───────────────────────

function encodeRgba(width, height, paintPixel) {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = paintPixel(i)
    const d = i * 4
    png.data[d] = r
    png.data[d + 1] = g
    png.data[d + 2] = b
    png.data[d + 3] = a
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`
}

// ── Marching-squares vectorization (binary grid → GeoJSON MultiPolygon) ───────

/**
 * Trace the outline of every "true" region in a binary grid and return rings in pixel space.
 * Uses per-cell square emission then merges shared edges — robust and dependency-free.
 */
function maskToPixelRings(grid, width, height) {
  // Build the set of boundary edges (edges between a flooded and a non-flooded cell).
  const edges = new Map() // "x1,y1|x2,y2" → [ [x1,y1],[x2,y2] ]
  const key = (a, b) => `${a[0]},${a[1]}|${b[0]},${b[1]}`
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : grid[y * width + x])
  const addEdge = (a, b) => {
    const k1 = key(a, b)
    const k2 = key(b, a)
    if (edges.has(k2)) edges.delete(k2)
    else edges.set(k1, [a, b])
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!grid[y * width + x]) continue
      // Cell corners (pixel grid; y grows downward → handled at projection time).
      const tl = [x, y]
      const tr = [x + 1, y]
      const br = [x + 1, y + 1]
      const bl = [x, y + 1]
      if (!at(x, y - 1)) addEdge(tl, tr) // top
      if (!at(x + 1, y)) addEdge(tr, br) // right
      if (!at(x, y + 1)) addEdge(br, bl) // bottom
      if (!at(x - 1, y)) addEdge(bl, tl) // left
    }
  }
  // Stitch directed edges into closed rings.
  const adj = new Map()
  for (const [, [a, b]] of edges) {
    const ak = `${a[0]},${a[1]}`
    if (!adj.has(ak)) adj.set(ak, [])
    adj.get(ak).push(b)
  }
  const rings = []
  const used = new Set()
  for (const [, [start]] of edges) {
    const startK = `${start[0]},${start[1]}`
    if (used.has(startK)) continue
    const ring = [start]
    let curr = start
    let guard = 0
    while (guard++ < edges.size + 2) {
      const ck = `${curr[0]},${curr[1]}`
      const nexts = adj.get(ck)
      if (!nexts || !nexts.length) break
      const next = nexts.shift()
      used.add(ck)
      if (next[0] === start[0] && next[1] === start[1]) {
        ring.push(next)
        break
      }
      ring.push(next)
      curr = next
    }
    if (ring.length >= 4) rings.push(ring)
  }
  return rings
}

/** Collapse colinear runs so rings stay light to render. */
function simplifyRing(ring) {
  if (ring.length < 4) return ring
  const out = [ring[0]]
  for (let i = 1; i < ring.length - 1; i++) {
    const [ax, ay] = out[out.length - 1]
    const [bx, by] = ring[i]
    const [cx, cy] = ring[i + 1]
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    if (cross !== 0) out.push(ring[i])
  }
  out.push(ring[ring.length - 1])
  return out
}

/** Pixel ring (col,row) → lng/lat ring (row 0 = north). */
function pixelRingToLngLat(ring, [w, s, e, n], width, height) {
  return ring.map(([px, py]) => [w + (px / width) * (e - w), n - (py / height) * (n - s)])
}

function maskToGeoJson(grid, width, height, bbox, properties) {
  const rings = maskToPixelRings(grid, width, height)
    .map(simplifyRing)
    .filter(r => r.length >= 4)
  if (!rings.length) return { type: 'FeatureCollection', features: [] }
  const polygons = rings.map(r => [pixelRingToLngLat(r, bbox, width, height)])
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: properties || {},
        geometry: { type: 'MultiPolygon', coordinates: polygons },
      },
    ],
  }
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

async function runFloodPipeline(job, params, ctx) {
  const { secretsFilePath, broadcast } = ctx
  const { aoi, preDate, postDate, threshold } = params
  const waterDb = Number.isFinite(threshold) ? Number(threshold) : DEFAULT_WATER_DB

  try {
    // Optional Sentinel Hub / CDSE OAuth (higher-tier fallback). Not required —
    // the primary source is the Microsoft Planetary Computer (free, no auth).
    const auth = await resolveSentinelHubProcessAuth(secretsFilePath).catch(() => null)

    const bbox = geometryBbox(aoi)
    const { width, height } = gridSizeForBbox(bbox)
    const maxDim = Math.min(MAX_DIM, Math.max(width, height))
    const aoiHa = geometryAreaHa(aoi)

    const fetchScene = async (dateStr, label) => {
      try {
        return await fetchS1FromPlanetaryComputer(bbox, dateStr, maxDim)
      } catch (pcErr) {
        if (auth) {
          const s = await fetchS1Grd(auth, bbox, dateStr, width, height)
          return { ...s, source: 'sentinel-hub', usedDate: dateStr }
        }
        throw new Error(
          `Could not fetch a Sentinel-1 ${label} scene near ${dateStr}: ${pcErr instanceof Error ? pcErr.message : pcErr}`,
        )
      }
    }

    const eventDate = postDate || preDate
    setJob(job, { status: 'fetching', progress: 0.15, message: `Fetching Sentinel-1 (post-event ${eventDate})…` }, broadcast)
    const postScene = await fetchScene(eventDate, 'post-event')
    const postMask = waterMaskFromS1(postScene, waterDb)

    const W = postScene.width
    const H = postScene.height

    let preMask = null
    let preSceneDate = null
    if (postDate && preDate && preDate !== postDate) {
      setJob(job, { status: 'fetching', progress: 0.4, message: `Fetching Sentinel-1 (pre-event ${preDate})…` }, broadcast)
      const preScene = await fetchScene(preDate, 'pre-event')
      preSceneDate = preScene.usedDate || preDate
      const preWater = waterMaskFromS1(preScene, waterDb)
      preMask = resampleNearest(preWater, W, H)
    }

    setJob(job, { status: 'detecting', progress: 0.62, message: 'Detecting flood extent (SAR change detection)…' }, broadcast)

    const flood = new Uint8Array(W * H) // newly inundated (post-water & !pre-water), inside AOI
    const change = new Uint8Array(W * H) // 1=pre-only(receded) 2=persistent 3=new flood
    let floodPx = 0
    let preWaterPx = 0
    let postWaterPx = 0
    let aoiPx = 0

    for (let y = 0; y < H; y++) {
      const lat = bbox[3] - ((y + 0.5) / H) * (bbox[3] - bbox[1])
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        const lng = bbox[0] + ((x + 0.5) / W) * (bbox[2] - bbox[0])
        if (!pointInGeometry(lng, lat, aoi)) continue
        aoiPx++
        const post = postMask.water[i] === 1
        const pre = preMask ? preMask.water[i] === 1 : false
        if (post) postWaterPx++
        if (pre) preWaterPx++
        if (preMask) {
          if (pre && post) change[i] = 2
          else if (pre && !post) change[i] = 1
          else if (!pre && post) {
            change[i] = 3
            flood[i] = 1
            floodPx++
          }
        } else if (post) {
          // Single-date mode: flood == detected open water inside AOI.
          change[i] = 3
          flood[i] = 1
          floodPx++
        }
      }
    }

    const pxToHa = aoiPx > 0 ? aoiHa / aoiPx : 0
    const floodedHa = floodPx * pxToHa
    const stats = {
      aoiHa: round2(aoiHa),
      floodedHa: round2(floodedHa),
      pctInundated: aoiHa > 0 ? round2((floodedHa / aoiHa) * 100) : 0,
      preWaterHa: round2(preWaterPx * pxToHa),
      postWaterHa: round2(postWaterPx * pxToHa),
      mode: preMask ? 'change-detection' : 'single-date',
      thresholdDb: waterDb,
      preDate: preMask ? preSceneDate || preDate : null,
      postDate: postScene.usedDate || eventDate,
      resolution: `${W}×${H}px`,
      source:
        postScene.source === 'sentinel-hub'
          ? 'Sentinel-1 GRD (Sentinel Hub)'
          : postScene.source === 'grd'
            ? 'Sentinel-1 GRD (Planetary Computer)'
            : 'Sentinel-1 RTC (Planetary Computer)',
    }

    // Flood-distribution breakdown for the dashboard charts.
    const classStats = preMask
      ? [
          { name: 'New flooding', color: '#ef4444', pct: pctOf(floodPx, aoiPx), areaHa: round2(floodPx * pxToHa) },
          {
            name: 'Persistent water',
            color: '#2563eb',
            pct: pctOf(countEq(change, 2), aoiPx),
            areaHa: round2(countEq(change, 2) * pxToHa),
          },
          {
            name: 'Receded water',
            color: '#22d3ee',
            pct: pctOf(countEq(change, 1), aoiPx),
            areaHa: round2(countEq(change, 1) * pxToHa),
          },
          { name: 'Dry land', color: '#64748b', pct: pctOf(aoiPx - floodPx - countEq(change, 2) - countEq(change, 1), aoiPx), areaHa: round2((aoiPx - floodPx - countEq(change, 2) - countEq(change, 1)) * pxToHa) },
        ]
      : [
          { name: 'Open water (flood)', color: '#2563eb', pct: pctOf(floodPx, aoiPx), areaHa: round2(floodPx * pxToHa) },
          { name: 'Dry land', color: '#64748b', pct: pctOf(aoiPx - floodPx, aoiPx), areaHa: round2((aoiPx - floodPx) * pxToHa) },
        ]

    setJob(job, { status: 'vectorizing', progress: 0.82, message: 'Building flood rasters & boundaries…' }, broadcast)

    // Flood-extent raster: solid blue where flooded, transparent elsewhere.
    const floodRaster = encodeRgba(W, H, i => (flood[i] ? [37, 99, 235, 200] : [0, 0, 0, 0]))
    // Change-detection raster: receded=cyan, persistent=blue, new flood=red.
    const changeRaster = encodeRgba(W, H, i => {
      switch (change[i]) {
        case 1:
          return [34, 211, 238, 170]
        case 2:
          return [37, 99, 235, 150]
        case 3:
          return [239, 68, 68, 210]
        default:
          return [0, 0, 0, 0]
      }
    })

    const vector = maskToGeoJson(flood, W, H, bbox, { kind: 'flood-extent', floodedHa: round2(floodedHa) })

    const result = {
      bounds: bbox, // [w, s, e, n]
      flood: { url: floodRaster, bounds: bbox },
      change: { url: changeRaster, bounds: bbox },
      vector,
      stats,
      classStats,
    }

    setJob(job, { status: 'done', progress: 1, message: 'Flood analysis complete.', result }, broadcast)
  } catch (err) {
    setJob(
      job,
      { status: 'error', progress: 1, message: 'Flood analysis failed.', error: err instanceof Error ? err.message : String(err) },
      broadcast,
    )
  }
}

const round2 = v => Math.round((Number(v) || 0) * 100) / 100
const pctOf = (n, d) => (d > 0 ? round2((n / d) * 100) : 0)
function countEq(arr, v) {
  let c = 0
  for (let i = 0; i < arr.length; i++) if (arr[i] === v) c++
  return c
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerFloodMonitoringRoutes(app, { secretsFilePath, broadcast } = {}) {
  app.get('/api/flood-monitoring/config', async (_req, res) => {
    // Sentinel-1 is served by the Microsoft Planetary Computer (free, no auth),
    // so the tool is always usable. OAuth (Sentinel Hub / CDSE) is only an
    // optional higher-tier fallback.
    let oauth = false
    try {
      oauth = Boolean(await resolveSentinelHubProcessAuth(secretsFilePath))
    } catch {
      oauth = false
    }
    res.json({
      configured: true,
      source: oauth ? 'sentinel-1 (planetary-computer + sentinel-hub)' : 'sentinel-1-rtc (planetary-computer)',
      hint: null,
    })
  })

  app.post('/api/flood-monitoring/run', (req, res) => {
    pruneJobs()
    const body = req.body || {}
    const aoi = body.aoi
    if (!aoi || (aoi.type !== 'Polygon' && aoi.type !== 'MultiPolygon')) {
      return res.status(400).json({ error: 'aoi (GeoJSON Polygon/MultiPolygon) is required.' })
    }
    const postDate = typeof body.postDate === 'string' ? body.postDate.slice(0, 10) : ''
    const preDate = typeof body.preDate === 'string' ? body.preDate.slice(0, 10) : ''
    if (!postDate && !preDate) {
      return res.status(400).json({ error: 'At least one event date (postDate) is required.' })
    }
    const threshold = Number.isFinite(body.threshold) ? Number(body.threshold) : undefined

    const job = newJob()
    res.status(202).json({ jobId: job.id })
    void runFloodPipeline(job, { aoi, preDate, postDate: postDate || preDate, threshold }, { secretsFilePath, broadcast })
  })

  app.get('/api/flood-monitoring/jobs/:jobId', (req, res) => {
    const job = JOBS.get(req.params.jobId)
    if (!job) return res.status(404).json({ error: 'Job not found or expired.' })
    res.json(publicJob(job))
  })
}
