/**
 * Fallback geocoding for Geo Explorer when the model omits MAP_QUERY but the user asked for a place.
 * Mapbox Geocoding when a token exists; otherwise Nominatim (identifying User-Agent per usage policy).
 */

import { parseLatLngQuery } from './openMeteoWeather'

const PLACE_VERB_PREFIX =
  /^(?:open|show|go to|goto|navigate to|find|where is|where's|locate|map of|center on|fly to|zoom to)\s+/i

export function simplifyGeoExplorerUserQuery(raw: string): string {
  let s = raw.trim()
  s = s.replace(PLACE_VERB_PREFIX, '').trim()
  return s
}

/** Remove trailing "from … layer" so geocoders do not treat dataset names as place names. */
export function stripLayerReferenceForGeocode(raw: string): string {
  return raw
    .replace(/\bfrom\s+['"]?[\w\s-]+['"]?\s*layers?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type GeocodeCandidate = {
  lng: number
  lat: number
  label: string
  /** Normalized confidence score in ~[0,1] — provider-dependent. */
  score: number
}

/** Minimum gap between #1 and #2 normalized scores to auto-select without ambiguity. */
const GEOCODE_AMBIGUITY_MARGIN = 0.11

function isUsableMapboxGeocodeToken(token: string): boolean {
  const t = token.trim()
  if (!t || t === 'pk.si-raster-fallback-token') return false
  return t.startsWith('pk.')
}

async function fetchMapboxGeocodeCandidates(
  q: string,
  token: string,
  lim: number,
): Promise<GeocodeCandidate[]> {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${encodeURIComponent(token)}&limit=${lim}`,
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    features?: { center?: number[]; place_name?: string; text?: string; relevance?: number }[]
  }
  const feats = Array.isArray(data?.features) ? data.features : []
  const out: GeocodeCandidate[] = []
  for (const f of feats) {
    const center = f?.center
    if (
      !Array.isArray(center) ||
      center.length < 2 ||
      !Number.isFinite(center[0]) ||
      !Number.isFinite(center[1])
    )
      continue
    const rel = typeof f.relevance === 'number' && Number.isFinite(f.relevance) ? f.relevance : 0.65
    const label =
      typeof f.place_name === 'string' && f.place_name.trim()
        ? f.place_name.trim()
        : typeof f.text === 'string'
          ? f.text.trim()
          : q
    out.push({ lng: center[0], lat: center[1], label, score: Math.max(0, Math.min(1, rel)) })
  }
  return out
}

async function fetchNominatimGeocodeCandidates(q: string, lim: number): Promise<GeocodeCandidate[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=geojson&limit=${lim}&q=${encodeURIComponent(q)}`,
    { headers: { Accept: 'application/json', 'Accept-Language': 'en' } },
  )
  if (!res.ok) return []
  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] }
      properties?: { display_name?: string; name?: string; importance?: number }
    }>
  }
  const feats = Array.isArray(data?.features) ? data.features : []
  let maxImp = 0
  for (const row of feats) {
    const imp = typeof row.properties?.importance === 'number' ? row.properties.importance : 0
    if (imp > maxImp) maxImp = imp
  }
  const denom = maxImp > 0 ? maxImp : 1
  const out: GeocodeCandidate[] = []
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

function mayUseGeocodeServerProxy(): boolean {
  if (import.meta.env.DEV) return true
  if (typeof window !== 'undefined' && /github\.io$/i.test(window.location.hostname)) return false
  return true
}

/** Free OSM search via AgroCloud backend (no Mapbox token). */
async function fetchServerGeocodeCandidates(
  q: string,
  lim: number,
  language?: string,
): Promise<GeocodeCandidate[]> {
  if (!mayUseGeocodeServerProxy()) return []
  const params = new URLSearchParams({ q, limit: String(lim) })
  if (language) params.set('lang', language === 'ar' ? 'ar' : 'en')
  const res = await fetch(`/api/geocode/search?${params.toString()}`)
  if (!res.ok) return []
  const data = (await res.json()) as { candidates?: GeocodeCandidate[]; results?: GeocodeCandidate[] }
  if (Array.isArray(data.candidates) && data.candidates.length) return data.candidates
  if (Array.isArray(data.results) && data.results.length) return data.results
  return []
}

export async function geocodePlaceCandidates(
  query: string,
  opts: { mapboxAccessToken?: string; limit?: number; language?: 'en' | 'ar' },
): Promise<GeocodeCandidate[]> {
  const q = simplifyGeoExplorerUserQuery(query)
  const lim = Math.min(8, Math.max(2, opts.limit ?? 5))
  if (!q || q.length > 280) return []

  const direct = parseLatLngQuery(q)
  if (direct) {
    return [
      {
        lng: direct.lng,
        lat: direct.lat,
        label: `${direct.lat.toFixed(4)}, ${direct.lng.toFixed(4)}`,
        score: 1,
      },
    ]
  }

  try {
    const fromServer = await fetchServerGeocodeCandidates(q, lim, opts.language)
    if (fromServer.length) return fromServer

    const token = (opts.mapboxAccessToken || '').trim()
    if (isUsableMapboxGeocodeToken(token)) {
      const fromMapbox = await fetchMapboxGeocodeCandidates(q, token, lim)
      if (fromMapbox.length) return fromMapbox
    }

    return await fetchNominatimGeocodeCandidates(q, lim)
  } catch {
    return []
  }
}

/** Pick one candidate only when score is high enough and not ambiguous vs runner-up. */
export function pickConfidentGeocode(candidates: GeocodeCandidate[]): {
  chosen: GeocodeCandidate | null
  ambiguous: boolean
} {
  if (!candidates.length) return { chosen: null, ambiguous: false }
  const sorted = [...candidates].sort((a, b) => b.score - a.score)
  const top = sorted[0]!
  const second = sorted[1]
  const ambiguous = Boolean(second && top.score - second.score < GEOCODE_AMBIGUITY_MARGIN)
  const strongEnough = top.score >= 0.62
  if (!strongEnough || ambiguous) return { chosen: null, ambiguous: ambiguous || !strongEnough }
  return { chosen: top, ambiguous: false }
}

export async function geocodePlaceToLngLat(
  query: string,
  opts: { mapboxAccessToken?: string },
): Promise<[number, number] | null> {
  const candidates = await geocodePlaceCandidates(query, opts)
  const { chosen } = pickConfidentGeocode(candidates)
  return chosen ? [chosen.lng, chosen.lat] : null
}

export type ReverseGeocodeResult = {
  /** Short place / locality label (city, town, suburb, etc.). */
  place: string
  country: string
  /** Full line suitable for subtitles (Mapbox place_name or Nominatim display_name). */
  fullDescription: string
}

function nominatimPlaceFromAddress(addr: Record<string, unknown> | null | undefined): string {
  if (!addr || typeof addr !== 'object') return ''
  const keys = [
    'village',
    'town',
    'city',
    'municipality',
    'suburb',
    'hamlet',
    'neighbourhood',
    'quarter',
    'county',
    'state',
    'region',
  ] as const
  for (const k of keys) {
    const v = addr[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/**
 * Reverse geocode for Geo Explorer map popups (place + country).
 * Prefers Mapbox when a token exists; otherwise OpenStreetMap Nominatim.
 */
export async function reverseGeocodeLngLat(
  lng: number,
  lat: number,
  opts: { mapboxAccessToken?: string },
): Promise<ReverseGeocodeResult | null> {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  try {
    const token = (opts.mapboxAccessToken || '').trim()
    if (token) {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${lng},${lat}`)}.json?access_token=${encodeURIComponent(token)}&limit=1`,
      )
      if (!res.ok) return null
      const data = (await res.json()) as {
        features?: { text?: string; place_name?: string; context?: { id?: string; text?: string }[] }[]
      }
      const primary = data?.features?.[0]
      if (!primary) return null
      const placeName =
        typeof primary.place_name === 'string'
          ? primary.place_name
          : typeof primary.text === 'string'
            ? primary.text
            : ''
      let country = ''
      const ctx = Array.isArray(primary.context) ? primary.context : []
      for (const c of ctx) {
        if (typeof c?.id === 'string' && c.id.startsWith('country.')) {
          country = (typeof c.text === 'string' && c.text.trim()) || ''
          break
        }
      }
      const place =
        (typeof primary.text === 'string' && primary.text.trim()) ||
        placeName.split(',')[0]?.trim() ||
        '—'
      return {
        place,
        country: country || '—',
        fullDescription: placeName || `${place}, ${country}`.trim(),
      }
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}`,
      {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'AgroCloud-SatelliteIntelligence/1.0 (Geo Explorer reverse)',
        },
      },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      display_name?: string
      address?: Record<string, unknown>
    }
    const display =
      typeof data?.display_name === 'string' && data.display_name.trim()
        ? data.display_name.trim()
        : ''
    const addr = data?.address
    const area = nominatimPlaceFromAddress(addr)
    const countryRaw = addr && typeof addr.country === 'string' ? addr.country.trim() : ''
    const displayParts = display ? display.split(',').map(s => s.trim()).filter(Boolean) : []
    const place = area || displayParts[0] || '—'
    return {
      place,
      country: countryRaw || '—',
      fullDescription: display || `${place}, ${countryRaw}`.trim(),
    }
  } catch {
    return null
  }
}
