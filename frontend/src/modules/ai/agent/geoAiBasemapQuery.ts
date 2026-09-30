/**
 * Basemap feature reader for Geo AI.
 *
 * The assistant historically could only "see" user-added vector layers. This
 * module lets it also read what the **basemap** itself renders — places, POIs,
 * roads, transit, water and natural labels — by tapping Mapbox GL's
 * `queryRenderedFeatures`. The result is a compact, de-duplicated list of named
 * features (with category + distance from a reference point) that we fold into
 * the LIVE MAP STATE context block and expose to the `identifyBasemap` action.
 *
 * Only **vector** Mapbox basemaps expose queryable label features. Raster
 * basemaps (Esri / Google / OSM tiles) return nothing — callers degrade
 * gracefully (the place-search geocoder remains the fallback for those).
 */

export type GeoAiBasemapFeatureKind =
  | 'poi'
  | 'place'
  | 'road'
  | 'transit'
  | 'water'
  | 'natural'
  | 'admin'
  | 'building'
  | 'other'

export type GeoAiBasemapFeature = {
  name: string
  /** Human-readable category, e.g. "Restaurant", "City", "Park". */
  category?: string | null
  kind: GeoAiBasemapFeatureKind
  lng?: number | null
  lat?: number | null
  /** Straight-line distance (m) from the query reference point. */
  distanceM?: number | null
}

/** Minimal structural type for the Mapbox GL map we depend on (avoids a hard dep). */
type QueryableMap = {
  project?: (lngLat: [number, number]) => { x: number; y: number }
  getCenter?: () => { lng: number; lat: number }
  getCanvas?: () => { width: number; height: number }
  queryRenderedFeatures?: (
    geometry?: [number, number] | [[number, number], [number, number]],
    opts?: { layers?: string[] },
  ) => Array<MapboxRenderedFeature>
}

type MapboxRenderedFeature = {
  layer?: { id?: string; type?: string }
  sourceLayer?: string
  properties?: Record<string, unknown>
  geometry?: { type?: string; coordinates?: unknown }
}

/**
 * Source-layer names that carry named basemap features across the common Mapbox
 * vector schemas (Streets v8 + the Standard style "basemap" fragment).
 */
const BASEMAP_SOURCE_LAYER_KIND: Record<string, GeoAiBasemapFeatureKind> = {
  poi_label: 'poi',
  poi: 'poi',
  place_label: 'place',
  place: 'place',
  settlement_label: 'place',
  settlement_subdivision_label: 'place',
  natural_label: 'natural',
  natural_point_label: 'natural',
  water_label: 'water',
  waterway_label: 'water',
  water: 'water',
  airport_label: 'transit',
  transit_stop_label: 'transit',
  transit: 'transit',
  road_label: 'road',
  road: 'road',
  motorway_junction: 'road',
  admin: 'admin',
  admin_label: 'admin',
  state_label: 'admin',
  country_label: 'place',
  building: 'building',
  building_label: 'building',
}

/** Maki / class → friendly category label for POIs. */
const MAKI_CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant',
  fast_food: 'Fast food',
  cafe: 'Café',
  bar: 'Bar',
  lodging: 'Hotel',
  hotel: 'Hotel',
  hospital: 'Hospital',
  pharmacy: 'Pharmacy',
  doctor: 'Clinic',
  school: 'School',
  college: 'College',
  university: 'University',
  bank: 'Bank',
  atm: 'ATM',
  fuel: 'Gas station',
  parking: 'Parking',
  grocery: 'Grocery',
  shop: 'Shop',
  mall: 'Mall',
  marketplace: 'Market',
  park: 'Park',
  garden: 'Garden',
  stadium: 'Stadium',
  museum: 'Museum',
  place_of_worship: 'Place of worship',
  religious_muslim: 'Mosque',
  mosque: 'Mosque',
  airport: 'Airport',
  bus: 'Bus stop',
  rail: 'Station',
  ferry: 'Ferry',
  cemetery: 'Cemetery',
  golf: 'Golf course',
  farm: 'Farm',
}

const EARTH_R = 6371000

function haversineM(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function firstString(props: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!props) return null
  for (const k of keys) {
    const v = props[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return null
}

/** Prefer the user's language label, then English, then the generic name. */
function readFeatureName(props: Record<string, unknown> | undefined, language: 'ar' | 'en'): string | null {
  if (!props) return null
  const order =
    language === 'ar'
      ? ['name_ar', 'name:ar', 'name_en', 'name:en', 'name', 'name_int']
      : ['name_en', 'name:en', 'name', 'name_int', 'name_ar', 'name:ar']
  return firstString(props, order)
}

function pointFromGeometry(geom: MapboxRenderedFeature['geometry']): [number, number] | null {
  if (!geom) return null
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    const c = geom.coordinates as number[]
    if (c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) return [c[0], c[1]]
  }
  // For line/polygon labels, average the first ring of coordinates.
  const flat: number[][] = []
  const walk = (v: unknown) => {
    if (!Array.isArray(v)) return
    if (typeof v[0] === 'number' && typeof v[1] === 'number') {
      flat.push(v as number[])
      return
    }
    for (const c of v) walk(c)
  }
  walk(geom.coordinates)
  if (!flat.length) return null
  let sx = 0
  let sy = 0
  for (const p of flat) {
    sx += p[0]!
    sy += p[1]!
  }
  return [sx / flat.length, sy / flat.length]
}

function deriveCategory(kind: GeoAiBasemapFeatureKind, props: Record<string, unknown> | undefined): string | null {
  if (!props) return null
  if (kind === 'poi') {
    const explicit = firstString(props, ['category_en', 'category', 'subclass'])
    if (explicit) return explicit.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
    const maki = firstString(props, ['maki', 'class', 'type'])
    if (maki) return MAKI_CATEGORY_LABEL[maki.toLowerCase()] ?? maki.replace(/_/g, ' ')
    return 'Point of interest'
  }
  if (kind === 'place') {
    const t = firstString(props, ['type', 'class'])
    return t ? t.replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : 'Place'
  }
  if (kind === 'road') return 'Road'
  if (kind === 'transit') return firstString(props, ['maki', 'class']) ?? 'Transit'
  if (kind === 'water') return 'Water'
  if (kind === 'natural') return firstString(props, ['class', 'maki']) ?? 'Natural feature'
  if (kind === 'admin') return 'Administrative area'
  if (kind === 'building') return 'Building'
  return null
}

export type QueryBasemapOptions = {
  /** Reference point for distance sorting (defaults to map center). */
  center?: [number, number] | null
  /** Half-size (px) of the square query box around the point. Default 240. */
  radiusPx?: number
  /** Max features returned. Default 14. */
  limit?: number
  language?: 'ar' | 'en'
  /** Restrict to these kinds (default: all named kinds except buildings/roads when not asked). */
  kinds?: GeoAiBasemapFeatureKind[]
}

function collectFromRendered(
  feats: MapboxRenderedFeature[],
  ref: [number, number] | null,
  language: 'ar' | 'en',
  allowKinds: Set<GeoAiBasemapFeatureKind> | null,
): GeoAiBasemapFeature[] {
  const byKey = new Map<string, GeoAiBasemapFeature>()
  for (const f of feats) {
    const sourceLayer = (f.sourceLayer || '').toLowerCase()
    let kind = BASEMAP_SOURCE_LAYER_KIND[sourceLayer]
    if (!kind) {
      // Standard style layer ids often embed the semantic group.
      const lid = (f.layer?.id || '').toLowerCase()
      if (lid.includes('poi')) kind = 'poi'
      else if (lid.includes('place') || lid.includes('settlement')) kind = 'place'
      else if (lid.includes('transit') || lid.includes('airport')) kind = 'transit'
      else if (lid.includes('water')) kind = 'water'
      else if (lid.includes('natural')) kind = 'natural'
      else if (lid.includes('road')) kind = 'road'
      else continue
    }
    if (allowKinds && !allowKinds.has(kind)) continue
    const name = readFeatureName(f.properties, language)
    if (!name) continue
    const pt = pointFromGeometry(f.geometry)
    const distanceM = ref && pt ? Math.round(haversineM(ref, pt)) : null
    const key = `${kind}:${name.toLowerCase()}`
    const existing = byKey.get(key)
    if (existing) {
      if (distanceM != null && (existing.distanceM == null || distanceM < existing.distanceM)) {
        existing.distanceM = distanceM
        if (pt) {
          existing.lng = pt[0]
          existing.lat = pt[1]
        }
      }
      continue
    }
    byKey.set(key, {
      name,
      category: deriveCategory(kind, f.properties),
      kind,
      lng: pt?.[0] ?? null,
      lat: pt?.[1] ?? null,
      distanceM,
    })
  }
  return Array.from(byKey.values())
}

function sortAndLimit(list: GeoAiBasemapFeature[], limit: number): GeoAiBasemapFeature[] {
  // Rank: places/POIs first, then by distance (named & close beats far).
  const kindRank: Record<GeoAiBasemapFeatureKind, number> = {
    place: 0,
    poi: 1,
    transit: 2,
    natural: 3,
    water: 4,
    admin: 5,
    road: 6,
    building: 7,
    other: 8,
  }
  return list
    .sort((a, b) => {
      const da = a.distanceM ?? Number.POSITIVE_INFINITY
      const db = b.distanceM ?? Number.POSITIVE_INFINITY
      if (Math.abs(da - db) > 1) return da - db
      return kindRank[a.kind] - kindRank[b.kind]
    })
    .slice(0, limit)
}

function asQueryable(map: unknown): QueryableMap | null {
  const m = map as QueryableMap | null
  if (!m || typeof m.queryRenderedFeatures !== 'function') return null
  return m
}

/**
 * Read named basemap features around a point (defaults to map center). Returns
 * `[]` for raster basemaps or when nothing named is rendered nearby.
 */
export function queryBasemapFeaturesNear(map: unknown, options: QueryBasemapOptions = {}): GeoAiBasemapFeature[] {
  const m = asQueryable(map)
  if (!m || !m.project) return []
  const center = options.center ?? (m.getCenter ? [m.getCenter().lng, m.getCenter().lat] : null)
  if (!center) return []
  const radius = options.radiusPx ?? 240
  const language = options.language ?? 'en'
  const limit = options.limit ?? 14
  try {
    const p = m.project(center)
    const box: [[number, number], [number, number]] = [
      [p.x - radius, p.y - radius],
      [p.x + radius, p.y + radius],
    ]
    const feats = m.queryRenderedFeatures(box) ?? []
    const allow = options.kinds ? new Set(options.kinds) : null
    return sortAndLimit(collectFromRendered(feats, center, language, allow), limit)
  } catch {
    return []
  }
}

/** Read named basemap features across the entire current viewport. */
export function queryBasemapFeaturesInView(map: unknown, options: QueryBasemapOptions = {}): GeoAiBasemapFeature[] {
  const m = asQueryable(map)
  if (!m) return []
  const center = options.center ?? (m.getCenter ? [m.getCenter().lng, m.getCenter().lat] : null)
  const language = options.language ?? 'en'
  const limit = options.limit ?? 14
  try {
    const feats = m.queryRenderedFeatures() ?? []
    const allow = options.kinds ? new Set(options.kinds) : null
    return sortAndLimit(collectFromRendered(feats, center, language, allow), limit)
  } catch {
    return []
  }
}

function fmtDistance(distanceM: number | null | undefined): string {
  if (typeof distanceM !== 'number' || !Number.isFinite(distanceM)) return ''
  if (distanceM < 950) return ` (~${Math.round(distanceM / 10) * 10} m)`
  return ` (~${(distanceM / 1000).toFixed(distanceM < 9500 ? 1 : 0)} km)`
}

/** One-line human summary of nearby basemap features (for the `identifyBasemap` reply). */
export function summarizeBasemapFeatures(features: GeoAiBasemapFeature[], max = 8): string {
  if (!features.length) return 'No named basemap places or POIs are rendered near here (the current basemap may be raster imagery).'
  return features
    .slice(0, max)
    .map(f => {
      const cat = f.category ? ` — ${f.category}` : ''
      return `• ${f.name}${cat}${fmtDistance(f.distanceM)}`
    })
    .join('\n')
}
