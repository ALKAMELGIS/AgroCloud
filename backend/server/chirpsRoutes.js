/**
 * UCSB CHIRPS Daily / Monthly rainfall proxy.
 *
 * Sources:
 *   Daily:  https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/tifs/p05/{YYYY}/chirps-v2.0.{YYYY}.{MM}.{DD}.tif.gz
 *   Monthly: https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/chirps-v2.0.{YYYY}.{MM}.tif.gz
 *
 * Endpoints:
 *   POST /api/chirps/raster     — AOI-clipped Float32 grid (+ RGBA preview) for one date/period
 *   POST /api/chirps/timeseries — AOI-mean daily or monthly series for analytics (SPI, RAI, …)
 */

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { promisify } from 'util'
import { fileURLToPath } from 'url'
import { fromArrayBuffer } from 'geotiff'

const gunzip = promisify(zlib.gunzip)

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(SERVER_DIR, '.chirps-cache')
const CHIRPS_NODATA = -9999
const MAX_GRID = 256
const MAX_DAILY_SERIES = 120
const MAX_MONTHLY_SERIES = 240

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

function parseIsoDate(s) {
  const m = String(s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), iso: `${m[1]}-${m[2]}-${m[3]}` }
}

function daysInclusive(startIso, endIso) {
  const a = new Date(`${startIso}T00:00:00Z`).getTime()
  const b = new Date(`${endIso}T00:00:00Z`).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return []
  const out = []
  for (let t = a; t <= b; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

function monthsInclusive(startIso, endIso) {
  const s = parseIsoDate(startIso)
  const e = parseIsoDate(endIso)
  if (!s || !e) return []
  const out = []
  let y = s.y
  let m = s.m
  while (y < e.y || (y === e.y && m <= e.m)) {
    out.push(`${y}-${pad2(m)}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function dailyUrl(iso) {
  const p = parseIsoDate(iso)
  if (!p) throw new Error(`Invalid date ${iso}`)
  return `https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_daily/tifs/p05/${p.y}/chirps-v2.0.${p.y}.${pad2(p.m)}.${pad2(p.d)}.tif.gz`
}

function monthlyUrl(ym) {
  const m = String(ym).match(/^(\d{4})-(\d{2})$/)
  if (!m) throw new Error(`Invalid month ${ym}`)
  return `https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/chirps-v2.0.${m[1]}.${m[2]}.tif.gz`
}

async function fetchChirpsGz(url, cacheKey) {
  ensureCacheDir()
  const cachePath = path.join(CACHE_DIR, cacheKey)
  if (fs.existsSync(cachePath)) {
    return fs.promises.readFile(cachePath)
  }
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AgroCloud-CHIRPS/1.0', Accept: 'application/octet-stream,*/*' },
  })
  if (!res.ok) {
    throw new Error(`CHIRPS download failed (${res.status}) for ${url}`)
  }
  const gz = Buffer.from(await res.arrayBuffer())
  const tif = await gunzip(gz)
  await fs.promises.writeFile(cachePath, tif)
  return tif
}

async function openChirpsTiff(kind, key) {
  const url = kind === 'monthly' ? monthlyUrl(key) : dailyUrl(key)
  const cacheKey = `${kind}-${key.replace(/[^0-9-]/g, '')}.tif`
  const buf = await fetchChirpsGz(url, cacheKey)
  const tiff = await fromArrayBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const image = await tiff.getImage()
  return { image, url }
}

function shiftIsoDays(iso, deltaDays) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

function shiftYmMonths(ym, deltaMonths) {
  const m = String(ym).match(/^(\d{4})-(\d{2})$/)
  if (!m) return null
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + deltaMonths, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * CHIRPS daily products lag ~several days; missing “today” is common.
 * Try the requested key, then a lag-aware jump, then walk backward.
 */
async function openChirpsTiffNearest(kind, key, maxLookback = 45) {
  let lastErr = null
  const tried = new Set()
  const attempt = async cursor => {
    if (!cursor || tried.has(cursor)) return null
    tried.add(cursor)
    try {
      const opened = await openChirpsTiff(kind, cursor)
      return { ...opened, resolvedKey: cursor, requestedKey: key, lookbackSteps: tried.size - 1 }
    } catch (err) {
      lastErr = err
      return null
    }
  }

  if (kind === 'monthly') {
    let cursor = key
    for (let i = 0; i < Math.min(12, maxLookback); i += 1) {
      const hit = await attempt(cursor)
      if (hit) return hit
      cursor = shiftYmMonths(cursor, -1)
      if (!cursor) break
    }
    throw lastErr || new Error(`No CHIRPS monthly product near ${key}`)
  }

  // Daily: requested → −5d → −15d, then day-by-day from −5d.
  for (const jump of [0, -5, -15]) {
    const hit = await attempt(shiftIsoDays(key, jump) || key)
    if (hit) return hit
  }
  let cursor = shiftIsoDays(key, -5) || key
  while (tried.size < maxLookback) {
    cursor = shiftIsoDays(cursor, -1)
    const hit = await attempt(cursor)
    if (hit) return hit
    if (!cursor) break
  }
  throw lastErr || new Error(`No CHIRPS daily product near ${key}`)
}

/**
 * Read AOI window from a CHIRPS GeoTIFF (EPSG:4326, PixelIsArea).
 * Returns row-major Float32 mm values + georef.
 */
async function readAoiGrid(image, bbox, maxDim = MAX_GRID) {
  const [west, south, east, north] = bbox
  const width = image.getWidth()
  const height = image.getHeight()
  const bboxGeo = typeof image.getBoundingBox === 'function' ? image.getBoundingBox() : null
  // CHIRPS global: typically [-180, -50, 180, 50] approx
  const fileWest = bboxGeo ? bboxGeo[0] : -180
  const fileSouth = bboxGeo ? bboxGeo[1] : -50
  const fileEast = bboxGeo ? bboxGeo[2] : 180
  const fileNorth = bboxGeo ? bboxGeo[3] : 50
  const pxW = (fileEast - fileWest) / width
  const pxH = (fileNorth - fileSouth) / height

  const c0 = Math.max(0, Math.floor((west - fileWest) / pxW))
  const c1 = Math.min(width - 1, Math.ceil((east - fileWest) / pxW))
  const r0 = Math.max(0, Math.floor((fileNorth - north) / pxH))
  const r1 = Math.min(height - 1, Math.ceil((fileNorth - south) / pxH))
  if (c1 <= c0 || r1 <= r0) {
    throw new Error('AOI does not intersect CHIRPS grid')
  }

  let winW = c1 - c0 + 1
  let winH = r1 - r0 + 1
  let step = 1
  while (Math.ceil(winW / step) > maxDim || Math.ceil(winH / step) > maxDim) step += 1
  const outW = Math.ceil(winW / step)
  const outH = Math.ceil(winH / step)

  const rasters = await image.readRasters({
    window: [c0, r0, c1 + 1, r1 + 1],
    width: outW,
    height: outH,
    resampleMethod: 'bilinear',
  })
  const band = rasters[0]
  const values = new Float32Array(outW * outH)
  let sum = 0
  let n = 0
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i += 1) {
    let v = Number(band[i])
    if (!Number.isFinite(v) || v <= -9000) {
      values[i] = CHIRPS_NODATA
      continue
    }
    values[i] = v
    sum += v
    n += 1
    if (v < min) min = v
    if (v > max) max = v
  }

  const outWest = fileWest + c0 * pxW
  const outNorth = fileNorth - r0 * pxH
  const outEast = fileWest + (c0 + winW) * pxW
  const outSouth = fileNorth - (r0 + winH) * pxH

  return {
    width: outW,
    height: outH,
    west: outWest,
    south: outSouth,
    east: outEast,
    north: outNorth,
    nodata: CHIRPS_NODATA,
    values: Array.from(values),
    stats: n
      ? { min, max, mean: sum / n, validCount: n }
      : { min: null, max: null, mean: null, validCount: 0 },
  }
}

function meanOfGrid(grid) {
  const { values, nodata } = grid
  let sum = 0
  let n = 0
  for (const v of values) {
    if (!Number.isFinite(v) || v === nodata || v <= -9000) continue
    sum += v
    n += 1
  }
  return n ? sum / n : null
}

/** Professional precip ramp → RGBA data URL for MapLibre image source. */
function gridToRgbaDataUrl(grid) {
  const { width, height, values, nodata } = grid
  // Absolute mm ramp (dry tan → wet blue) so 0 mm AOI cells stay visible on the map.
  const mmStops = [
    [0, [196, 164, 132]],
    [2, [245, 240, 230]],
    [5, [200, 224, 244]],
    [15, [107, 174, 214]],
    [30, [33, 113, 181]],
    [60, [8, 48, 107]],
    [100, [4, 30, 66]],
  ]
  function colorAtMm(mm) {
    const x = Math.max(0, Number(mm) || 0)
    for (let i = 0; i < mmStops.length - 1; i += 1) {
      const [a, ca] = mmStops[i]
      const [b, cb] = mmStops[i + 1]
      if (x >= a && x <= b) {
        const u = (x - a) / (b - a || 1)
        return [
          Math.round(ca[0] + (cb[0] - ca[0]) * u),
          Math.round(ca[1] + (cb[1] - ca[1]) * u),
          Math.round(ca[2] + (cb[2] - ca[2]) * u),
        ]
      }
    }
    if (x > mmStops[mmStops.length - 1][0]) return mmStops[mmStops.length - 1][1]
    return mmStops[0][1]
  }

  // Use pngjs if available; else raw PPM-like — backend has pngjs.
  return import('pngjs').then(({ PNG }) => {
    const png = new PNG({ width, height })
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i]
      const o = i * 4
      if (!Number.isFinite(v) || v === nodata || v <= -9000) {
        png.data[o] = 0
        png.data[o + 1] = 0
        png.data[o + 2] = 0
        png.data[o + 3] = 0
        continue
      }
      const [r, g, b] = colorAtMm(v)
      png.data[o] = r
      png.data[o + 1] = g
      png.data[o + 2] = b
      png.data[o + 3] = 220
    }
    const buf = PNG.sync.write(png)
    return `data:image/png;base64,${buf.toString('base64')}`
  })
}

function parseBbox(body) {
  const west = Number(body.west ?? body.bbox?.[0])
  const south = Number(body.south ?? body.bbox?.[1])
  const east = Number(body.east ?? body.bbox?.[2])
  const north = Number(body.north ?? body.bbox?.[3])
  if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) {
    throw new Error('Valid AOI bbox required: west,south,east,north')
  }
  if (east - west > 20 || north - south > 20) {
    throw new Error('AOI too large for CHIRPS clip (max 20° span). Draw a smaller polygon.')
  }
  return [west, south, east, north]
}

export function registerChirpsRoutes(app) {
  app.post('/api/chirps/raster', async (req, res) => {
    try {
      const bbox = parseBbox(req.body || {})
      const aggregation = String(req.body?.aggregation || 'daily').toLowerCase()
      const date = String(req.body?.date || req.body?.end || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date (YYYY-MM-DD) is required' })
      }

      let kind = 'daily'
      let key = date
      if (aggregation === 'monthly' || aggregation === 'seasonal' || aggregation === 'annual') {
        kind = 'monthly'
        key = date.slice(0, 7)
      }

      const opened = await openChirpsTiffNearest(kind, key)
      const { image, url, resolvedKey, requestedKey, lookbackSteps } = opened
      const resolvedDate = kind === 'monthly' ? `${resolvedKey}-01` : resolvedKey
      const grid = await readAoiGrid(image, bbox)
      const previewDataUrl = await gridToRgbaDataUrl(grid)

      res.json({
        source: 'UCSB CHIRPS v2.0',
        product: kind === 'monthly' ? 'CHIRPS monthly' : 'CHIRPS daily',
        url,
        date: resolvedDate,
        requestedDate: kind === 'monthly' ? `${requestedKey}-01` : requestedKey,
        lookbackSteps: lookbackSteps || 0,
        aggregation,
        unit: 'mm',
        nodata: CHIRPS_NODATA,
        width: grid.width,
        height: grid.height,
        west: grid.west,
        south: grid.south,
        east: grid.east,
        north: grid.north,
        stats: grid.stats,
        values: grid.values,
        previewDataUrl,
        coordinates: [
          [grid.west, grid.north],
          [grid.east, grid.north],
          [grid.east, grid.south],
          [grid.west, grid.south],
        ],
      })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.post('/api/chirps/timeseries', async (req, res) => {
    try {
      const bbox = parseBbox(req.body || {})
      const start = String(req.body?.start || '').slice(0, 10)
      const end = String(req.body?.end || '').slice(0, 10)
      const aggregation = String(req.body?.aggregation || 'daily').toLowerCase()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        return res.status(400).json({ error: 'start and end (YYYY-MM-DD) are required' })
      }

      const points = []
      let seriesStart = start
      let seriesEnd = end
      if (aggregation === 'daily') {
        let days = daysInclusive(start, end)
        if (days.length > MAX_DAILY_SERIES) {
          // Prefer latest window so analytics stay near the scene / end date.
          days = days.slice(-MAX_DAILY_SERIES)
          seriesStart = days[0]
          seriesEnd = days[days.length - 1]
        }
        for (const day of days) {
          try {
            const { image } = await openChirpsTiff('daily', day)
            const grid = await readAoiGrid(image, bbox, 64)
            points.push({ date: day, rainfallMm: meanOfGrid(grid) })
          } catch {
            points.push({ date: day, rainfallMm: null })
          }
        }
      } else {
        let months = monthsInclusive(start, end)
        if (months.length > MAX_MONTHLY_SERIES) {
          months = months.slice(-MAX_MONTHLY_SERIES)
          seriesStart = `${months[0]}-01`
          seriesEnd = `${months[months.length - 1]}-01`
        }
        for (const ym of months) {
          try {
            const { image } = await openChirpsTiff('monthly', ym)
            const grid = await readAoiGrid(image, bbox, 64)
            points.push({ date: `${ym}-01`, period: ym, rainfallMm: meanOfGrid(grid) })
          } catch {
            points.push({ date: `${ym}-01`, period: ym, rainfallMm: null })
          }
        }
      }

      const valid = points.map(p => p.rainfallMm).filter(v => v != null && Number.isFinite(v))
      const sum = valid.reduce((a, b) => a + b, 0)
      const mean = valid.length ? sum / valid.length : null
      const variance =
        valid.length > 1
          ? valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length
          : 0

      res.json({
        source: 'UCSB CHIRPS v2.0',
        unit: 'mm',
        aggregation,
        start: seriesStart,
        end: seriesEnd,
        requestedStart: start,
        requestedEnd: end,
        points,
        summary: {
          totalMm: valid.length ? sum : null,
          meanMm: mean,
          stdMm: Math.sqrt(variance),
          n: valid.length,
        },
      })
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.get('/api/chirps/health', (_req, res) => {
    res.json({ ok: true, source: 'UCSB CHIRPS v2.0', cacheDir: CACHE_DIR })
  })
}
