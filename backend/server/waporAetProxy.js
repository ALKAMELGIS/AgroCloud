/**
 * FAO WaPOR v2/v3 AET (Actual Evapotranspiration) proxy.
 * POST /api/wapor/aet/batch — pixel timeseries, deduplicated server-side.
 *
 * @see https://www.fao.org/in-action/remote-sensing-for-water-productivity/wapor-data-access/en
 * L1_AETI_D: dekadal AETI (mm/day), raw values × 0.1 scale factor.
 */

const WAPOR_QUERY_URL = 'https://io.apps.fao.org/gismgr/api/v1/query/'
const WAPOR_SCALE = 0.1
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** Prefer v3 catalog when available; fall back to v2. */
const WAPOR_CUBE_CANDIDATES = [
  { workspace: 'WAPOR_3', cube: 'L1_AETI_D', dimension: 'DEKAD' },
  { workspace: 'WAPOR_2', cube: 'L1_AETI_D', dimension: 'DEKAD' },
  { workspace: 'WAPOR_2', cube: 'L1_AETI_M', dimension: 'MONTH' },
]

const aetCache = new Map()

function cacheKey(lon, lat, date) {
  return `${lon.toFixed(4)}_${lat.toFixed(4)}_${date}`
}

function parseIsoDate(s) {
  const m = String(s || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function dateRangeAround(iso, padDays = 40) {
  const d = parseIsoDate(iso)
  if (!d) return null
  const t = new Date(`${d}T12:00:00Z`).getTime()
  if (!Number.isFinite(t)) return null
  const start = new Date(t - padDays * 86_400_000).toISOString().slice(0, 10)
  const end = new Date(t + padDays * 86_400_000).toISOString().slice(0, 10)
  return { start, end, target: d }
}

async function fetchMeasure(workspace, cube) {
  const url = `https://io.apps.fao.org/gismgr/api/v1/catalog/workspaces/${workspace}/cubes/${cube}/measures`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`WaPOR measures ${resp.status}`)
  const json = await resp.json()
  const items = json?.response?.items
  if (!Array.isArray(items) || !items.length) throw new Error('WaPOR measures empty')
  return items[0].code
}

async function queryPixelTimeSeries(input) {
  const { workspace, cube, dimension, measure, lon, lat, start, end } = input
  const body = {
    type: 'PixelTimeSeries',
    params: {
      cube: { code: cube, workspaceCode: workspace, language: 'en' },
      dimensions: [{ code: dimension, range: `[${start},${end})` }],
      measures: [measure],
      point: { crs: 'EPSG:4326', x: lon, y: lat },
    },
  }
  const resp = await fetch(WAPOR_QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`WaPOR query ${resp.status}: ${text.slice(0, 200)}`)
  }
  const json = await resp.json()
  if (json?.status !== 200 || !json?.response) {
    throw new Error(json?.message || 'WaPOR query failed')
  }
  return json.response
}

function pickClosestAetMmDay(response, targetDate) {
  const header = response?.header
  const items = response?.items
  if (!Array.isArray(header) || !Array.isArray(items) || items.length < 2) return null

  const dateIdx = header.findIndex(h => /date|dekad|time|day|month/i.test(String(h)))
  const valIdx = header.findIndex(h => /water|aeti|mm/i.test(String(h)))
  const di = dateIdx >= 0 ? dateIdx : 0
  const vi = valIdx >= 0 ? valIdx : header.length - 1

  let bestDate = ''
  let bestVal = null
  let bestDist = Infinity
  const target = parseIsoDate(targetDate)
  if (!target) return null
  const targetMs = new Date(`${target}T12:00:00Z`).getTime()

  for (const row of items) {
    if (!Array.isArray(row) || row.length <= Math.max(di, vi)) continue
    const rawDate = String(row[di] ?? '').slice(0, 10)
    const rawVal = Number(row[vi])
    if (!rawDate || !Number.isFinite(rawVal) || rawVal < 0) continue
    const ms = new Date(`${rawDate}T12:00:00Z`).getTime()
    if (!Number.isFinite(ms)) continue
    const dist = Math.abs(ms - targetMs)
    if (dist < bestDist) {
      bestDist = dist
      bestDate = rawDate
      bestVal = rawVal * WAPOR_SCALE
    }
  }

  if (bestVal == null) return null
  return {
    aetMmDay: Number(bestVal.toFixed(3)),
    waporDate: bestDate,
  }
}

async function fetchAetForPoint(lon, lat, observationDate) {
  const range = dateRangeAround(observationDate)
  if (!range) return null

  const ck = cacheKey(lon, lat, range.target)
  const cached = aetCache.get(ck)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.result
  }

  for (const cand of WAPOR_CUBE_CANDIDATES) {
    try {
      const measure = await fetchMeasure(cand.workspace, cand.cube)
      const response = await queryPixelTimeSeries({
        workspace: cand.workspace,
        cube: cand.cube,
        dimension: cand.dimension,
        measure,
        lon,
        lat,
        start: range.start,
        end: range.end,
      })
      const picked = pickClosestAetMmDay(response, range.target)
      if (picked) {
        const result = {
          aetMmDay: picked.aetMmDay,
          observationDate: range.target,
          waporDate: picked.waporDate,
          source: `WaPOR ${cand.workspace}/${cand.cube}`,
        }
        aetCache.set(ck, { at: Date.now(), result })
        return result
      }
    } catch {
      continue
    }
  }
  return null
}

export function registerWaporAetRoutes(app) {
  app.post('/api/wapor/aet/batch', async (req, res) => {
    try {
      const entries = Array.isArray(req.body?.entries) ? req.body.entries : []
      if (!entries.length) {
        return res.status(400).json({ error: 'entries array required' })
      }
      if (entries.length > 500) {
        return res.status(400).json({ error: 'Max 500 entries per batch' })
      }

      const unique = new Map()
      for (const e of entries) {
        const lon = Number(e.lon)
        const lat = Number(e.lat)
        const obs = parseIsoDate(e.observationDate)
        const fieldKey = String(e.fieldKey || '').trim()
        if (!fieldKey || !Number.isFinite(lon) || !Number.isFinite(lat) || !obs) continue
        const key = `${lon.toFixed(4)}_${lat.toFixed(4)}_${obs}`
        if (!unique.has(key)) unique.set(key, { lon, lat, observationDate: obs, fieldKeys: [fieldKey] })
        else unique.get(key).fieldKeys.push(fieldKey)
      }

      const results = {}
      await Promise.all(
        [...unique.values()].map(async entry => {
          const aet = await fetchAetForPoint(entry.lon, entry.lat, entry.observationDate)
          for (const fk of entry.fieldKeys) {
            results[fk] = aet
              ? {
                  aetMmDay: aet.aetMmDay,
                  source: aet.source,
                  waporDate: aet.waporDate,
                  observationDate: aet.observationDate,
                }
              : null
          }
        }),
      )

      res.json({
        source: 'FAO WaPOR AETI',
        count: Object.keys(results).length,
        results,
      })
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })
}
