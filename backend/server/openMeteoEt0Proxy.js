/**
 * Open-Meteo ERA5 ET0 batch proxy for Field Summary / water requirement exports.
 * POST /api/open-meteo/et0/batch — deduplicated grid×date requests with server cache.
 */

const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FETCH_CONCURRENCY = 4
const ARCHIVE_MIN_DATE = '1950-01-01'

const et0Cache = new Map()

function gridKey(lat, lon) {
  return `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`
}

function cacheKey(lat, lon, fromDate, toDate, observationDate) {
  return `${gridKey(lat, lon)}|${fromDate}|${toDate}|${observationDate}`
}

function parseIsoDate(s) {
  const m = String(s || '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function meanEt0ForObservation(hourly, observationDate) {
  if (!hourly?.time?.length) return null
  const dayPoints = []
  for (let i = 0; i < hourly.time.length; i++) {
    const day = String(hourly.time[i] || '').slice(0, 10)
    if (day !== observationDate) continue
    const v = hourly.et0_fao_evapotranspiration?.[i]
    if (v != null && Number.isFinite(v)) dayPoints.push(v)
  }
  if (dayPoints.length) {
    return Number((dayPoints.reduce((a, b) => a + b, 0) / dayPoints.length).toFixed(3))
  }
  const all = (hourly.et0_fao_evapotranspiration || []).filter(v => v != null && Number.isFinite(v))
  if (!all.length) return null
  const days = new Set(hourly.time.map(t => String(t).slice(0, 10))).size || 1
  return Number((all.reduce((a, b) => a + b, 0) / days).toFixed(3))
}

async function fetchArchiveEt0MmDay(lat, lon, fromDate, toDate, observationDate) {
  let start = fromDate < ARCHIVE_MIN_DATE ? ARCHIVE_MIN_DATE : fromDate
  let end = toDate
  if (start > end) {
    const tmp = start
    start = end
    end = tmp
  }

  const ck = cacheKey(lat, lon, start, end, observationDate)
  const hit = et0Cache.get(ck)
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.et0MmDay
  }

  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.searchParams.set('latitude', String(lat))
  url.searchParams.set('longitude', String(lon))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('start_date', start)
  url.searchParams.set('end_date', end)
  url.searchParams.set(
    'hourly',
    'et0_fao_evapotranspiration',
  )

  const resp = await fetch(url.toString())
  if (!resp.ok) {
    throw new Error(`Open-Meteo archive HTTP ${resp.status}`)
  }
  const data = await resp.json()
  const et0MmDay = meanEt0ForObservation(data.hourly, observationDate)
  if (et0MmDay != null) {
    et0Cache.set(ck, { et0MmDay, fetchedAt: Date.now() })
  }
  return et0MmDay
}

export function registerOpenMeteoEt0Routes(app) {
  app.post('/api/open-meteo/et0/batch', async (req, res) => {
    try {
      const body = req.body || {}
      const fromDate = parseIsoDate(body.fromDate)
      const toDate = parseIsoDate(body.toDate)
      const entries = Array.isArray(body.entries) ? body.entries : []

      if (!fromDate || !toDate) {
        return res.status(400).json({ error: 'fromDate and toDate required (YYYY-MM-DD)' })
      }
      if (!entries.length) {
        return res.json({ results: {} })
      }

      const unique = new Map()
      const fieldToReq = new Map()

      for (const entry of entries.slice(0, 500)) {
        const fieldKey = String(entry.fieldKey || '').trim()
        const lat = Number(entry.lat)
        const lon = Number(entry.lon)
        const obs = parseIsoDate(entry.observationDate)
        if (!fieldKey || !obs || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
        if (Math.abs(lat) < 0.001 && Math.abs(lon) < 0.001) continue
        const reqKey = `${gridKey(lat, lon)}|${obs}`
        if (!unique.has(reqKey)) unique.set(reqKey, { lat, lon, observationDate: obs })
        fieldToReq.set(fieldKey, reqKey)
      }

      const results = {}
      const jobs = [...unique.entries()]

      for (let i = 0; i < jobs.length; i += FETCH_CONCURRENCY) {
        const batch = jobs.slice(i, i + FETCH_CONCURRENCY)
        const settled = await Promise.all(
          batch.map(async ([reqKey, job]) => {
            try {
              const et0MmDay = await fetchArchiveEt0MmDay(
                job.lat,
                job.lon,
                fromDate,
                toDate,
                job.observationDate,
              )
              return { reqKey, et0MmDay }
            } catch {
              return { reqKey, et0MmDay: null }
            }
          }),
        )
        for (const { reqKey, et0MmDay } of settled) {
          if (et0MmDay != null) results[reqKey] = et0MmDay
        }
      }

      const byFieldKey = {}
      for (const [fieldKey, reqKey] of fieldToReq) {
        const et0 = results[reqKey]
        if (et0 != null) byFieldKey[fieldKey] = et0
      }

      res.json({ results: byFieldKey, gridResults: results })
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Open-Meteo ET0 batch failed',
      })
    }
  })
}
