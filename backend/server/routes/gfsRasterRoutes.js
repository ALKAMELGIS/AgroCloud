/**
 * NOAA GFS 0.25° raster tiles + cycle metadata (Open-Meteo map-tiles proxy).
 * GRIB2 is processed upstream; this service exposes latest cycle and PNG tiles to the SPA.
 */

const META_TTL_MS = 8 * 60_000
const TILE_CACHE_TTL_MS = 15 * 60_000

const GFS_MODEL_CANDIDATES = [
  process.env.WEATHER_GFS_TILE_MODEL,
  'ncep_gfs025',
  'gfs_seamless',
  'ncep_gfs',
].filter(Boolean)

const SPATIAL_BASE = 'https://map-tiles.open-meteo.com/data_spatial'
const TILE_BASE = 'https://map-tiles.open-meteo.com/v1'

let metaCache = { at: 0, body: null, model: null }
const tileCache = new Map()

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const err = new Error(`GFS meta HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

async function resolveGfsModel() {
  if (metaCache.model) return metaCache.model
  for (const model of GFS_MODEL_CANDIDATES) {
    try {
      const url = `${SPATIAL_BASE}/${model}/latest.json`
      const body = await fetchJson(url)
      if (body && Array.isArray(body.valid_times) && body.valid_times.length) {
        metaCache.model = model
        return model
      }
    } catch {
      await sleepMs(80)
    }
  }
  return GFS_MODEL_CANDIDATES[0] ?? 'ncep_gfs025'
}

async function loadGfsMeta(force = false) {
  if (!force && metaCache.body && Date.now() - metaCache.at < META_TTL_MS) {
    return metaCache.body
  }
  const model = await resolveGfsModel()
  const url = `${SPATIAL_BASE}/${model}/latest.json`
  const raw = await fetchJson(url)
  const body = {
    model,
    completed: Boolean(raw.completed),
    referenceTime: raw.reference_time ?? raw.referenceTime ?? null,
    lastModified: raw.last_modified_time ?? raw.lastModified ?? null,
    validTimes: Array.isArray(raw.valid_times) ? raw.valid_times : [],
    variables: Array.isArray(raw.variables) ? raw.variables : [],
    sourceLabel: 'NOAA GFS 0.25°',
    resolutionLabel: '~25 km',
  }
  metaCache = { at: Date.now(), body, model }
  return body
}

function tileCacheKey(model, variable, z, x, y, time) {
  return `${model}|${variable}|${z}|${x}|${y}|${time ?? ''}`
}

async function fetchGfsTile(model, variable, z, x, y, time) {
  const paths = [
    `${TILE_BASE}/${model}/${variable}/${z}/${x}/${y}.png`,
    `${TILE_BASE}/gfs_seamless/${variable}/${z}/${x}/${y}.png`,
  ]
  for (const base of paths) {
    const url = new URL(base)
    if (time) url.searchParams.set('time', String(time).slice(0, 16))
    const cKey = tileCacheKey(model, variable, z, x, y, time)
    const hit = tileCache.get(cKey)
    if (hit && Date.now() - hit.at < TILE_CACHE_TTL_MS) return hit.buf
    const res = await fetch(url.toString())
    if (!res.ok) continue
    const buf = Buffer.from(await res.arrayBuffer())
    tileCache.set(cKey, { at: Date.now(), buf })
    if (tileCache.size > 4000) {
      const oldest = tileCache.keys().next().value
      tileCache.delete(oldest)
    }
    return buf
  }
  return null
}

export function registerGfsRasterRoutes(app) {
  app.get('/api/weather/gfs/meta', async (req, res) => {
    try {
      const force = req.query.refresh === '1'
      const body = await loadGfsMeta(force)
      res.set('Cache-Control', 'public, max-age=120')
      res.json(body)
    } catch (e) {
      res.status(502).json({
        error: e instanceof Error ? e.message : 'GFS metadata unavailable',
      })
    }
  })

  app.get('/api/weather/gfs/tiles/:variable/:z/:x/:y.png', async (req, res) => {
    try {
      const { variable, z, x, y } = req.params
      const time = req.query.time ? String(req.query.time) : undefined
      const model = await resolveGfsModel()
      const buf = await fetchGfsTile(model, variable, z, x, y, time)
      if (!buf) {
        res.status(404).end()
        return
      }
      res.set('Content-Type', 'image/png')
      res.set('Cache-Control', 'public, max-age=600')
      res.send(buf)
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : 'GFS tile proxy failed' })
    }
  })
}
