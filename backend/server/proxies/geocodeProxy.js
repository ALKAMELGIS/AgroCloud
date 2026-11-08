/**
 * Free place search via OpenStreetMap Nominatim (no API key).
 * Browser calls cannot reach Nominatim reliably (CORS / User-Agent), so proxy server-side.
 * @see https://operations.osmfoundation.org/policies/nominatim/
 */

const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'AgroCloud/1.0 (map place search; local dev server)'

let lastNominatimAt = 0

async function throttleNominatim() {
  const now = Date.now()
  const wait = Math.max(0, 1100 - (now - lastNominatimAt))
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
  lastNominatimAt = Date.now()
}

function parseLatLngQuery(raw) {
  const t = String(raw || '').trim()
  if (!t) return null
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b }
  if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a }
  return null
}

async function nominatimSearch(q, limit, lang) {
  await throttleNominatim()
  const url = new URL(NOMINATIM_SEARCH)
  url.searchParams.set('format', 'geojson')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('addressdetails', '0')

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': lang || 'en',
      'User-Agent': USER_AGENT,
    },
  })
  if (!res.ok) return []

  const data = await res.json()
  const feats = Array.isArray(data?.features) ? data.features : []
  let maxImp = 0
  for (const row of feats) {
    const imp = typeof row.properties?.importance === 'number' ? row.properties.importance : 0
    if (imp > maxImp) maxImp = imp
  }
  const denom = maxImp > 0 ? maxImp : 1
  const out = []
  for (const row of feats) {
    const coords = row.geometry?.coordinates
    if (!Array.isArray(coords) || coords.length < 2) continue
    const lng = Number(coords[0])
    const lat = Number(coords[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const label =
      typeof row.properties?.display_name === 'string' && row.properties.display_name.trim()
        ? row.properties.display_name.trim()
        : typeof row.properties?.name === 'string' && row.properties.name.trim()
          ? row.properties.name.trim()
          : q
    const imp = typeof row.properties?.importance === 'number' ? row.properties.importance : 0.35
    const score = Math.max(0.2, Math.min(1, imp / denom))
    out.push({ lng, lat, label, score })
  }
  return out
}

export function registerGeocodeRoutes(app) {
  app.get('/api/geocode/search', async (req, res) => {
    const q = String(req.query.q || '').trim()
    const limit = Math.min(8, Math.max(1, Number.parseInt(String(req.query.limit || '6'), 10) || 6))
    const lang = String(req.query.lang || 'en').slice(0, 12)

    if (!q || q.length < 2) return res.json({ candidates: [] })
    if (q.length > 280) return res.status(400).json({ error: 'Query too long', candidates: [] })

    const direct = parseLatLngQuery(q)
    if (direct) {
      return res.json({
        candidates: [
          {
            lng: direct.lng,
            lat: direct.lat,
            label: `${direct.lat.toFixed(4)}, ${direct.lng.toFixed(4)}`,
            score: 1,
          },
        ],
      })
    }

    try {
      const candidates = await nominatimSearch(q, limit, lang)
      return res.json({ candidates })
    } catch (error) {
      return res.status(502).json({
        error: 'Geocode upstream failed',
        details: String(error?.message || error),
        candidates: [],
      })
    }
  })
}
