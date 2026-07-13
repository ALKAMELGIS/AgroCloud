/**
 * Client-side SAR flood-monitoring engine.
 *
 * Faithful in-browser port of the backend orchestrator
 * (`backend/server/floodMonitoringProxy.js`). Lets the Flood Monitoring tool run
 * fully client-side on a static deployment (GitHub Pages / Hostinger static) with
 * NO Node backend:
 *   AOI → Sentinel-1 GRD/RTC (VV/VH) via the Microsoft Planetary Computer (free,
 *   no auth) → dB threshold water mask → SAR change detection → flood extent +
 *   change rasters + boundaries + statistics.
 *
 * The Planetary Computer STAC + data APIs send `Access-Control-Allow-Origin: *`,
 * so the browser can search scenes and read GeoTIFF pixels directly. The same
 * `geotiff` decoder used elsewhere in the frontend runs in the browser; PNG
 * rasters are produced with a canvas instead of the Node `pngjs` dependency.
 *
 * This mirrors the backend's PRIMARY data path exactly (Planetary Computer first).
 * The Sentinel Hub / CDSE OAuth path is a backend-only higher-tier fallback and is
 * intentionally omitted here (its client secret never ships to the browser).
 */

import { fromArrayBuffer } from 'geotiff'
import type {
  FloodBounds,
  FloodClassStat,
  FloodMonitoringJob,
  FloodMonitoringJobStatus,
  FloodMonitoringResult,
  RunFloodInput,
} from './floodMonitoringPipeline'

type AoiGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon

/** Largest tile edge requested from the data API (keeps memory + latency bounded). */
const MAX_DIM = 1024
const MIN_DIM = 16
/** Default VV backscatter (dB) below which a pixel is treated as smooth open water. */
const DEFAULT_WATER_DB = -17

// ── Geometry helpers (ported) ────────────────────────────────────────────────

function geometryCoords(geometry: AoiGeometry): number[][] {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return geometry.coordinates.flat() as number[][]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2) as number[][]
  return []
}

/** Polygon/MultiPolygon → [west, south, east, north] (EPSG:4326). */
function geometryBbox(geometry: AoiGeometry): FloodBounds {
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
function gridSizeForBbox([w, s, e, n]: FloodBounds): { width: number; height: number } {
  const midLat = ((s + n) / 2) * (Math.PI / 180)
  const widthM = Math.max(1, (e - w) * 111320 * Math.cos(midLat))
  const heightM = Math.max(1, (n - s) * 110540)
  const clamp = (v: number) => Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(v / 10)))
  return { width: clamp(widthM), height: clamp(heightM) }
}

/** Spherical ring area (m²) — geodesic, sign-aware. */
function ringAreaM2(ring: number[][]): number {
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

function geometryAreaHa(geometry: AoiGeometry): number {
  let m2 = 0
  if (geometry?.type === 'Polygon') {
    geometry.coordinates.forEach((ring, i) => {
      m2 += (i === 0 ? 1 : -1) * ringAreaM2(ring as number[][])
    })
  } else if (geometry?.type === 'MultiPolygon') {
    geometry.coordinates.forEach(poly =>
      poly.forEach((ring, i) => {
        m2 += (i === 0 ? 1 : -1) * ringAreaM2(ring as number[][])
      }),
    )
  }
  return Math.max(0, m2) / 10000
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
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

/** Ray-casting point-in-polygon over the outer ring(s) of a Polygon/MultiPolygon. */
function pointInGeometry(lng: number, lat: number, geometry: AoiGeometry): boolean {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const rings of polys) {
    if (!rings?.length) continue
    if (pointInRing(lng, lat, rings[0] as number[][])) {
      let inHole = false
      for (let h = 1; h < rings.length; h++) {
        if (pointInRing(lng, lat, rings[h] as number[][])) {
          inHole = true
          break
        }
      }
      if (!inHole) return true
    }
  }
  return false
}

// ── Sentinel-1 GRD/RTC fetch (Microsoft Planetary Computer — free, no auth) ────

const PC_STAC_SEARCH = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
const PC_DATA_BBOX = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox'
/**
 * Source preference: terrain-corrected RTC (γ⁰, linear power) gives the cleanest
 * water detection, but its coverage is partial. The GRD collection is GLOBAL and
 * shares the same acquisitions, so it backs RTC up wherever RTC has a hole.
 */
const PC_SOURCES: Array<{ collection: string; nodata: number; kind: 'rtc' | 'grd' }> = [
  { collection: 'sentinel-1-rtc', nodata: -32768, kind: 'rtc' },
  { collection: 'sentinel-1-grd', nodata: 0, kind: 'grd' },
]
/** Sentinel-1 σ⁰ calibration constant — maps GRD amplitude DN to a γ⁰-comparable dB scale. */
const GRD_CAL = 1000
/** STAC discovery window (S1 single-sat revisit ~12 days; widen for coverage edges). */
const PC_SEARCH_WINDOW_DAYS = 30

type S1Scene = {
  width: number
  height: number
  vv: Float32Array
  vh: Float32Array
  mask: Uint8Array
  usedDate: string
  source: 'rtc' | 'grd'
  itemId: string
}

/** Find the scene in a collection nearest a target date that intersects the AOI. */
async function pcFindNearestS1Item(
  bbox: FloodBounds,
  dateStr: string,
  collection: string,
  signal?: AbortSignal,
): Promise<any | null> {
  const base = new Date(`${dateStr}T00:00:00Z`).getTime()
  if (!Number.isFinite(base)) throw new Error(`Invalid date: ${dateStr}`)
  const from = new Date(base - PC_SEARCH_WINDOW_DAYS * 86400_000).toISOString()
  const to = new Date(base + PC_SEARCH_WINDOW_DAYS * 86400_000 + 86399_000).toISOString()
  const body = { collections: [collection], bbox, datetime: `${from}/${to}`, limit: 60 }
  const res = await fetch(PC_STAC_SEARCH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
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
async function pcCropScene(
  bbox: FloodBounds,
  item: any,
  source: { collection: string; nodata: number; kind: 'rtc' | 'grd' },
  maxDim: number,
  signal?: AbortSignal,
): Promise<S1Scene> {
  const id = item.id
  const usedDate = String(item?.properties?.datetime || '').slice(0, 10)
  const [w, s, e, n] = bbox
  const dim = Math.max(MIN_DIM, Math.min(MAX_DIM, Math.round(maxDim)))
  const url =
    `${PC_DATA_BBOX}/${w},${s},${e},${n}.tif` +
    `?collection=${source.collection}&item=${encodeURIComponent(id)}` +
    `&assets=vv&assets=vh&max_size=${dim}&nodata=${source.nodata}`
  const res = await fetch(url, { headers: { Accept: 'image/tiff' }, signal })
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
  const srcVv = rasters[0] as unknown as ArrayLike<number>
  const srcVh = rasters[1] as unknown as ArrayLike<number>
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
async function fetchS1FromPlanetaryComputer(
  bbox: FloodBounds,
  dateStr: string,
  maxDim: number,
  signal?: AbortSignal,
): Promise<S1Scene> {
  const errors: string[] = []
  for (const source of PC_SOURCES) {
    try {
      const item = await pcFindNearestS1Item(bbox, dateStr, source.collection, signal)
      if (!item) {
        errors.push(`${source.collection}: no scene within ±${PC_SEARCH_WINDOW_DAYS}d`)
        continue
      }
      return await pcCropScene(bbox, item, source, maxDim, signal)
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') throw e
      errors.push(`${source.collection}: ${e instanceof Error ? e.message : e}`)
    }
  }
  throw new Error(`No Sentinel-1 coverage near ${dateStr} for this AOI (${errors.join('; ')}).`)
}

// ── SAR water / flood detection (ported) ─────────────────────────────────────

const toDb = (linear: number): number => (linear > 0 ? 10 * Math.log10(linear) : -50)

type WaterMask = { width: number; height: number; water: Uint8Array; valid: Uint8Array | null }

/** Per-pixel water mask: smooth open water has low VV backscatter (dB below threshold). */
function waterMaskFromS1(scene: S1Scene, waterDb: number): WaterMask {
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

/** Nearest-neighbour resample of a water mask onto the post grid dimensions. */
function resampleNearest(src: WaterMask, w: number, h: number): WaterMask {
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

// ── Raster PNG encoders (canvas; RGBA, north-up; row 0 = north) ───────────────

function rgbaToPngDataUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable for flood raster rendering.')
  const imgData = ctx.createImageData(width, height)
  imgData.data.set(rgba)
  ctx.putImageData(imgData, 0, 0)
  return canvas.toDataURL('image/png')
}

function encodeRgba(width: number, height: number, paintPixel: (i: number) => [number, number, number, number]): string {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const [r, g, b, a] = paintPixel(i)
    const d = i * 4
    rgba[d] = r
    rgba[d + 1] = g
    rgba[d + 2] = b
    rgba[d + 3] = a
  }
  return rgbaToPngDataUrl(rgba, width, height)
}

// ── Marching-squares vectorization (binary grid → GeoJSON MultiPolygon) ───────

function maskToPixelRings(grid: Uint8Array, width: number, height: number): number[][][] {
  const edges = new Map<string, [number[], number[]]>()
  const key = (a: number[], b: number[]) => `${a[0]},${a[1]}|${b[0]},${b[1]}`
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : grid[y * width + x])
  const addEdge = (a: number[], b: number[]) => {
    const k1 = key(a, b)
    const k2 = key(b, a)
    if (edges.has(k2)) edges.delete(k2)
    else edges.set(k1, [a, b])
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!grid[y * width + x]) continue
      const tl = [x, y]
      const tr = [x + 1, y]
      const br = [x + 1, y + 1]
      const bl = [x, y + 1]
      if (!at(x, y - 1)) addEdge(tl, tr)
      if (!at(x + 1, y)) addEdge(tr, br)
      if (!at(x, y + 1)) addEdge(br, bl)
      if (!at(x - 1, y)) addEdge(bl, tl)
    }
  }
  const adj = new Map<string, number[][]>()
  for (const [, [a, b]] of edges) {
    const ak = `${a[0]},${a[1]}`
    if (!adj.has(ak)) adj.set(ak, [])
    adj.get(ak)!.push(b)
  }
  const rings: number[][][] = []
  const used = new Set<string>()
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
      const next = nexts.shift()!
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

function simplifyRing(ring: number[][]): number[][] {
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

function pixelRingToLngLat(ring: number[][], [w, s, e, n]: FloodBounds, width: number, height: number): number[][] {
  return ring.map(([px, py]) => [w + (px / width) * (e - w), n - (py / height) * (n - s)])
}

function maskToGeoJson(
  grid: Uint8Array,
  width: number,
  height: number,
  bbox: FloodBounds,
  properties: Record<string, unknown>,
): GeoJSON.FeatureCollection {
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
        geometry: { type: 'MultiPolygon', coordinates: polygons as GeoJSON.Position[][][] },
      },
    ],
  }
}

// ── Small numeric helpers ─────────────────────────────────────────────────────

const round2 = (v: number): number => Math.round((Number(v) || 0) * 100) / 100
const pctOf = (n: number, d: number): number => (d > 0 ? round2((n / d) * 100) : 0)
function countEq(arr: Uint8Array, v: number): number {
  let c = 0
  for (let i = 0; i < arr.length; i++) if (arr[i] === v) c++
  return c
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

function snapshot(
  jobId: string,
  status: FloodMonitoringJobStatus,
  progress: number,
  message: string,
  extra?: Partial<FloodMonitoringJob>,
): FloodMonitoringJob {
  return {
    id: jobId,
    status,
    progress,
    message,
    result: null,
    error: null,
    ...extra,
  }
}

/**
 * Run the SAR flood-monitoring pipeline fully in the browser.
 * Calls `onUpdate` with progressive job snapshots (matching the backend job shape),
 * so the existing poll loop works unchanged.
 */
export async function runClientFloodMonitoring(
  jobId: string,
  input: RunFloodInput,
  onUpdate: (job: FloodMonitoringJob) => void,
  signal?: AbortSignal,
): Promise<FloodMonitoringJob> {
  const fail = (message: string): FloodMonitoringJob => {
    const job = snapshot(jobId, 'error', 1, 'Flood analysis failed.', { error: message })
    onUpdate(job)
    return job
  }

  try {
    if (typeof document === 'undefined') {
      return fail('Client flood monitoring requires a browser environment.')
    }
    const { aoi, preDate, postDate, threshold } = input
    const waterDb = Number.isFinite(threshold) ? Number(threshold) : DEFAULT_WATER_DB

    const bbox = geometryBbox(aoi)
    const { width, height } = gridSizeForBbox(bbox)
    const maxDim = Math.min(MAX_DIM, Math.max(width, height))
    const aoiHa = geometryAreaHa(aoi)

    const eventDate = postDate || (preDate as string)
    onUpdate(snapshot(jobId, 'fetching', 0.15, `Fetching Sentinel-1 (post-event ${eventDate})…`))
    const postScene = await fetchS1FromPlanetaryComputer(bbox, eventDate, maxDim, signal)
    const postMask = waterMaskFromS1(postScene, waterDb)

    const W = postScene.width
    const H = postScene.height

    let preMask: WaterMask | null = null
    let preSceneDate: string | null = null
    let preItemId: string | null = null
    if (postDate && preDate && preDate !== postDate) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      onUpdate(snapshot(jobId, 'fetching', 0.4, `Fetching Sentinel-1 (pre-event ${preDate})…`))
      const preScene = await fetchS1FromPlanetaryComputer(bbox, preDate, maxDim, signal)
      preSceneDate = preScene.usedDate || preDate
      preItemId = preScene.itemId || null
      const preWater = waterMaskFromS1(preScene, waterDb)
      preMask = resampleNearest(preWater, W, H)
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    onUpdate(snapshot(jobId, 'detecting', 0.62, 'Detecting flood extent (SAR change detection)…'))

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
      mode: (preMask ? 'change-detection' : 'single-date') as 'change-detection' | 'single-date',
      thresholdDb: waterDb,
      preDate: preMask ? preSceneDate || (preDate as string) : null,
      postDate: postScene.usedDate || eventDate,
      resolution: `${W}×${H}px`,
      postItemId: postScene.itemId || null,
      preItemId,
      polarization: 'VV',
      sourceLabel: postScene.source || 'Sentinel-1',
    }

    const classStats: FloodClassStat[] = preMask
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
          {
            name: 'Dry land',
            color: '#64748b',
            pct: pctOf(aoiPx - floodPx - countEq(change, 2) - countEq(change, 1), aoiPx),
            areaHa: round2((aoiPx - floodPx - countEq(change, 2) - countEq(change, 1)) * pxToHa),
          },
        ]
      : [
          { name: 'Open water (flood)', color: '#2563eb', pct: pctOf(floodPx, aoiPx), areaHa: round2(floodPx * pxToHa) },
          { name: 'Dry land', color: '#64748b', pct: pctOf(aoiPx - floodPx, aoiPx), areaHa: round2((aoiPx - floodPx) * pxToHa) },
        ]

    onUpdate(snapshot(jobId, 'vectorizing', 0.82, 'Building flood rasters & boundaries…'))

    const floodRaster = encodeRgba(W, H, i => (flood[i] ? [37, 99, 235, 200] : [0, 0, 0, 0]))
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

    const result: FloodMonitoringResult = {
      bounds: bbox,
      flood: { url: floodRaster, bounds: bbox },
      change: { url: changeRaster, bounds: bbox },
      vector,
      stats,
      classStats,
    }

    const done = snapshot(jobId, 'done', 1, 'Flood analysis complete.', { result })
    onUpdate(done)
    return done
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') {
      const aborted = snapshot(jobId, 'error', 1, 'Flood analysis cancelled.', { error: 'Aborted' })
      return aborted
    }
    return fail(err instanceof Error ? err.message : String(err))
  }
}
