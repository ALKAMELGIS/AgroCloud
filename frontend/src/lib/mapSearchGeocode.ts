/**
 * Google-Maps-style place search engine for the satellite map search box.
 *
 * Goals: fast forward geocoding with autocomplete-as-you-type, proximity-biased
 * ranking (results near the current map view float to the top), bounding boxes
 * for smart zoom, and graceful provider fallback. Every call is abortable so a
 * fresh keystroke cancels the in-flight request (smooth, responsive typing).
 *
 * Providers, in order of preference:
 *   1. Mapbox Geocoding  — best relevance + native `autocomplete` + `proximity`.
 *   2. OpenStreetMap Nominatim — token-free fallback (no autocomplete, importance-ranked).
 */

export type MapSearchResult = {
  id: string
  /** Short primary label (place name). */
  label: string
  /** Remaining context line (region, country…). */
  subtitle: string
  lng: number
  lat: number
  /** [west, south, east, north] when the provider returns an extent. */
  bbox?: [number, number, number, number]
  /** Provider place type — drives the default zoom level. */
  kind?: string
  /** Combined relevance + proximity score in ~[0,1] (higher is better). */
  score: number
  /** Layer-feature hits may carry attributes shown when the pin is clicked. */
  properties?: Record<string, unknown>
}

export type SearchPlacesOptions = {
  mapboxToken?: string
  /** Current map center [lng, lat] — biases ranking toward nearby results. */
  proximity?: [number, number] | null
  /** UI language for returned labels. */
  language?: 'ar' | 'en'
  limit?: number
  /** Mapbox autocomplete (partial token) matching. Defaults to true. */
  autocomplete?: boolean
  signal?: AbortSignal
}

function isUsableMapboxToken(token: string | undefined): token is string {
  const t = (token ?? '').trim()
  return !!t && t !== 'pk.si-raster-fallback-token' && t.startsWith('pk.')
}

/** Detect Arabic script so we can request Arabic labels automatically. */
export function detectQueryLanguage(query: string): 'ar' | 'en' {
  return /[\u0600-\u06ff]/.test(query) ? 'ar' : 'en'
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Blend provider relevance with proximity to the current view. Proximity adds a
 * small bonus that decays with distance (~half bonus at 400 km), so a nearby
 * match outranks a far one of equal textual relevance — exactly like Maps.
 */
function proximityScore(base: number, lngLat: [number, number], proximity?: [number, number] | null): number {
  if (!proximity) return base
  const km = haversineKm(proximity, lngLat)
  const bonus = 0.25 / (1 + km / 400)
  return Math.min(1, base + bonus)
}

function splitLabel(full: string, short: string): { label: string; subtitle: string } {
  const trimmed = full.trim()
  if (!short) {
    const parts = trimmed.split(',')
    return { label: parts[0]?.trim() || trimmed, subtitle: parts.slice(1).join(',').trim() }
  }
  const sub = trimmed.startsWith(short)
    ? trimmed.slice(short.length).replace(/^[,\s]+/, '').trim()
    : trimmed.replace(short, '').replace(/^[,\s]+/, '').trim()
  return { label: short, subtitle: sub }
}

async function searchMapbox(query: string, opts: SearchPlacesOptions): Promise<MapSearchResult[]> {
  const token = opts.mapboxToken!
  const params = new URLSearchParams({
    access_token: token,
    limit: String(opts.limit ?? 6),
    autocomplete: String(opts.autocomplete !== false),
    language: opts.language ?? 'en',
  })
  if (opts.proximity) params.set('proximity', `${opts.proximity[0]},${opts.proximity[1]}`)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`
  const res = await fetch(url, { signal: opts.signal })
  if (!res.ok) return []
  const data = (await res.json()) as {
    features?: Array<{
      id?: string
      text?: string
      place_name?: string
      center?: number[]
      bbox?: number[]
      relevance?: number
      place_type?: string[]
    }>
  }
  const feats = Array.isArray(data.features) ? data.features : []
  const out: MapSearchResult[] = []
  for (const f of feats) {
    const c = f.center
    if (!Array.isArray(c) || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue
    const lngLat: [number, number] = [c[0], c[1]]
    const base = typeof f.relevance === 'number' ? f.relevance : 0.7
    const { label, subtitle } = splitLabel(f.place_name ?? f.text ?? query, f.text ?? '')
    out.push({
      id: String(f.id ?? `${label}-${c[0]},${c[1]}`),
      label,
      subtitle,
      lng: lngLat[0],
      lat: lngLat[1],
      bbox:
        Array.isArray(f.bbox) && f.bbox.length === 4
          ? [f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]]
          : undefined,
      kind: f.place_type?.[0],
      score: proximityScore(base, lngLat, opts.proximity),
    })
  }
  return out
}

async function searchNominatim(query: string, opts: SearchPlacesOptions): Promise<MapSearchResult[]> {
  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '0',
    limit: String(opts.limit ?? 6),
    q: query,
    'accept-language': opts.language ?? 'en',
  })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: opts.signal,
  })
  if (!res.ok) return []
  const rows = (await res.json()) as Array<{
    place_id?: number
    lat?: string
    lon?: string
    display_name?: string
    type?: string
    class?: string
    importance?: number
    boundingbox?: string[]
  }>
  if (!Array.isArray(rows)) return []
  let maxImp = 0
  for (const r of rows) if (typeof r.importance === 'number' && r.importance > maxImp) maxImp = r.importance
  const denom = maxImp > 0 ? maxImp : 1
  const out: MapSearchResult[] = []
  for (const r of rows) {
    const lng = Number(r.lon)
    const lat = Number(r.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
    const lngLat: [number, number] = [lng, lat]
    const { label, subtitle } = splitLabel(r.display_name ?? query, '')
    // Nominatim boundingbox = [south, north, west, east] (strings).
    let bbox: [number, number, number, number] | undefined
    if (Array.isArray(r.boundingbox) && r.boundingbox.length === 4) {
      const [s, n, w, e] = r.boundingbox.map(Number)
      if ([s, n, w, e].every(Number.isFinite)) bbox = [w, s, e, n]
    }
    const base = Math.max(0.2, Math.min(1, (typeof r.importance === 'number' ? r.importance : 0.35) / denom))
    out.push({
      id: String(r.place_id ?? `${label}-${lng},${lat}`),
      label,
      subtitle,
      lng,
      lat,
      bbox,
      kind: r.type ?? r.class,
      score: proximityScore(base, lngLat, opts.proximity),
    })
  }
  return out
}

/**
 * Forward geocode `query`, returning proximity-ranked place results. Mapbox is
 * used when a token is available (autocomplete + proximity), otherwise Nominatim.
 */
export async function searchPlaces(query: string, opts: SearchPlacesOptions): Promise<MapSearchResult[]> {
  const q = query.trim()
  if (q.length < 2 || q.length > 200) return []
  try {
    let results: MapSearchResult[] = []
    if (isUsableMapboxToken(opts.mapboxToken)) {
      results = await searchMapbox(q, opts)
    }
    if (!results.length) {
      results = await searchNominatim(q, opts)
    }
    return results.sort((a, b) => b.score - a.score)
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    return []
  }
}

/** Sensible target zoom for a fly-to when the result has no bounding box. */
export function zoomForPlaceKind(kind?: string): number {
  switch ((kind ?? '').toLowerCase()) {
    case 'country':
      return 5
    case 'region':
    case 'state':
    case 'administrative':
      return 7
    case 'postcode':
    case 'district':
    case 'county':
      return 10
    case 'place':
    case 'city':
    case 'town':
      return 11
    case 'locality':
    case 'village':
    case 'neighborhood':
    case 'neighbourhood':
    case 'suburb':
      return 13
    case 'address':
    case 'street':
      return 16
    case 'poi':
    case 'amenity':
    case 'shop':
      return 17
    default:
      return 12
  }
}
