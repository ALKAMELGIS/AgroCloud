/**
 * Country AOI helpers for Crop Classification —
 * World_Countries droplist (all countries) + national boundary as AOI data mask.
 */
import { WORLD_COUNTRIES_FS51_URL } from './worldCountriesLayer'

export type CropCountryOption = {
  code: string
  name: string
}

/** Priority crop-profile countries (shown first in the droplist). */
export const CROP_COUNTRY_OPTIONS: CropCountryOption[] = [
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'EG', name: 'Egypt' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'JO', name: 'Jordan' },
  { code: 'MA', name: 'Morocco' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'SD', name: 'Sudan' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'OM', name: 'Oman' },
  { code: 'QA', name: 'Qatar' },
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
]

const COUNTRY_BBOX_FALLBACK: Record<string, [number, number, number, number]> = {
  SA: [34.5, 16.0, 55.7, 32.2],
  EG: [24.7, 22.0, 36.9, 31.7],
  IQ: [38.8, 29.0, 48.6, 37.4],
  AE: [51.0, 22.6, 56.4, 26.1],
  JO: [34.9, 29.2, 39.3, 33.4],
  MA: [-13.2, 27.7, -1.0, 35.9],
  DZ: [-8.7, 18.9, 12.0, 37.1],
  SD: [21.8, 8.7, 38.6, 22.2],
  KW: [46.5, 28.5, 48.5, 30.1],
  QA: [50.7, 24.5, 51.7, 26.2],
  OM: [52.0, 16.6, 59.9, 26.4],
  IN: [68.1, 6.7, 97.4, 35.5],
  US: [-125.0, 24.5, -66.9, 49.4],
}

let worldCountryOptionsCache: CropCountryOption[] | null = null
let worldCountryOptionsPromise: Promise<CropCountryOption[]> | null = null

function bboxToPolygon(bbox: [number, number, number, number]): GeoJSON.Polygon {
  const [w, s, e, n] = bbox
  return {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  }
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function normalizeIso(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
}

function normalizeName(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Unique select value: ISO2/3 when present, else name-based key. */
export function cropCountryOptionKey(iso: string, name: string): string {
  const code = normalizeIso(iso)
  if (/^[A-Z]{2,3}$/.test(code)) return code
  return `N:${normalizeName(name)}`
}

function mergeCountryPolygons(
  features: GeoJSON.Feature[],
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const polys: number[][][][] = []
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') polys.push(g.coordinates as number[][][])
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) polys.push(poly)
    }
  }
  if (!polys.length) return null
  if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0]! }
  return { type: 'MultiPolygon', coordinates: polys }
}

export function geometryBbox(
  geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): [number, number, number, number] | null {
  const pts: number[][] = []
  const walk = (c: unknown): void => {
    if (!c) return
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      pts.push(c as number[])
      return
    }
    if (Array.isArray(c)) c.forEach(walk)
  }
  walk(geom.coordinates)
  if (!pts.length) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  if (![w, s, e, n].every(Number.isFinite)) return null
  return [w, s, e, n]
}

/** Build a GeoJSON Feature for map display / AOI data mask. */
export function countryAoiFeature(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  option: CropCountryOption,
): GeoJSON.Feature {
  return {
    type: 'Feature',
    properties: {
      name: option.name,
      countryCode: option.code,
      aoiSource: 'country-mask',
      aoiMask: true,
    },
    geometry,
  }
}

function mergePriorityOptions(world: CropCountryOption[]): CropCountryOption[] {
  const byKey = new Map<string, CropCountryOption>()
  for (const opt of world) byKey.set(opt.code, opt)
  // Ensure priority crop countries exist (overwrite name if service differs).
  for (const opt of CROP_COUNTRY_OPTIONS) {
    byKey.set(opt.code, opt)
  }
  const priority = new Set(CROP_COUNTRY_OPTIONS.map(o => o.code))
  const rest = [...byKey.values()]
    .filter(o => !priority.has(o.code))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return [...CROP_COUNTRY_OPTIONS, ...rest]
}

/**
 * Load all World_Countries names for the Country AOI droplist (attributes only).
 * Cached after first successful fetch.
 */
export async function loadWorldCountryOptions(signal?: AbortSignal): Promise<CropCountryOption[]> {
  if (worldCountryOptionsCache?.length) return worldCountryOptionsCache
  if (worldCountryOptionsPromise) return worldCountryOptionsPromise

  worldCountryOptionsPromise = (async () => {
    const byKey = new Map<string, CropCountryOption>()
    let offset = 0
    const pageSize = 500
    for (let page = 0; page < 20; page += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const params = new URLSearchParams({
        where: '1=1',
        outFields: 'COUNTRY,ISO_CC',
        returnGeometry: 'false',
        outSR: '4326',
        f: 'json',
        resultRecordCount: String(pageSize),
        resultOffset: String(offset),
      })
      const res = await fetch(`${WORLD_COUNTRIES_FS51_URL}/query?${params.toString()}`, {
        signal,
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) break
      const json = (await res.json()) as {
        features?: Array<{ attributes?: Record<string, unknown> }>
        exceededTransferLimit?: boolean
      }
      const rows = json.features ?? []
      for (const row of rows) {
        const attrs = row.attributes ?? {}
        const name = normalizeName(attrs.COUNTRY ?? attrs.Country ?? attrs.country)
        if (!name) continue
        const iso = normalizeIso(attrs.ISO_CC ?? attrs.ISO ?? attrs.iso_cc)
        const code = cropCountryOptionKey(iso, name)
        if (!byKey.has(code)) byKey.set(code, { code, name })
      }
      offset += rows.length
      if (!rows.length || rows.length < pageSize) break
      if (json.exceededTransferLimit === false) break
    }

    const merged = mergePriorityOptions([...byKey.values()])
    if (merged.length > CROP_COUNTRY_OPTIONS.length) {
      worldCountryOptionsCache = merged
    }
    return merged.length ? merged : [...CROP_COUNTRY_OPTIONS]
  })()

  try {
    return await worldCountryOptionsPromise
  } catch (err) {
    worldCountryOptionsPromise = null
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    return [...CROP_COUNTRY_OPTIONS]
  }
}

async function queryCountryFeatures(
  where: string,
  signal?: AbortSignal,
): Promise<GeoJSON.Feature[]> {
  const features: GeoJSON.Feature[] = []
  let offset = 0
  const pageSize = 50
  for (let page = 0; page < 10; page += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const params = new URLSearchParams({
      where,
      outFields: 'OBJECTID,COUNTRY,ISO_CC',
      returnGeometry: 'true',
      outSR: '4326',
      f: 'geojson',
      maxAllowableOffset: '0.02',
      geometryPrecision: '5',
      resultRecordCount: String(pageSize),
      resultOffset: String(offset),
    })
    const res = await fetch(`${WORLD_COUNTRIES_FS51_URL}/query?${params.toString()}`, {
      signal,
      headers: { Accept: 'application/geo+json,application/json' },
    })
    if (!res.ok) break
    const json = (await res.json()) as GeoJSON.FeatureCollection & { exceededTransferLimit?: boolean }
    const batch = json.features ?? []
    features.push(...batch)
    offset += batch.length
    if (!batch.length || batch.length < pageSize) break
    if (json.exceededTransferLimit === false) break
  }
  return features
}

/**
 * Fetch full national boundary (all polygons) as AOI data mask.
 * Falls back to a coarse bbox for known crop-profile countries when offline.
 */
export async function fetchCropCountryAoiGeometry(
  option: CropCountryOption,
  signal?: AbortSignal,
): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  const nameWhere = `COUNTRY='${escapeSqlLiteral(option.name)}'`
  const isoWhere =
    option.code && !option.code.startsWith('N:') && /^[A-Z0-9]{2,3}$/i.test(option.code)
      ? `ISO_CC='${escapeSqlLiteral(option.code)}'`
      : null

  let features: GeoJSON.Feature[] = []
  if (isoWhere) {
    try {
      features = await queryCountryFeatures(isoWhere, signal)
    } catch {
      features = []
    }
  }
  if (!features.length) {
    try {
      features = await queryCountryFeatures(nameWhere, signal)
    } catch {
      features = []
    }
  }

  const geom = mergeCountryPolygons(features)
  if (geom) return geom

  const bbox = COUNTRY_BBOX_FALLBACK[option.code]
  if (bbox) return bboxToPolygon(bbox)
  throw new Error(`Could not load country boundary (AOI data mask) for ${option.name}`)
}

/**
 * High-resolution crop inference window (~3 m target GSD).
 * At 3072 px targeting ~3 m, span ≈ 9 km. Larger AOIs are clamped for WMS reliability.
 */
export const CROP_HIGHRES_MAX_DEG = 0.08

/**
 * Clamp a large national bbox to a ~maxDeg window around the centroid for
 * Sentinel-2 sampling (full-country WMS often fails cloud/coverage checks).
 */
export function clampBboxForCropImagery(
  bbox: [number, number, number, number],
  maxDeg = CROP_HIGHRES_MAX_DEG,
): [number, number, number, number] {
  const [w, s, e, n] = bbox
  const spanLng = e - w
  const spanLat = n - s
  if (spanLng <= maxDeg && spanLat <= maxDeg) return bbox
  const cx = (w + e) / 2
  const cy = (s + n) / 2
  const half = maxDeg / 2
  return [cx - half, cy - half, cx + half, cy + half]
}

/** Square polygon from a WGS84 bbox (for inference AOI when country is huge). */
export function bboxToAoiPolygon(bbox: [number, number, number, number]): GeoJSON.Polygon {
  return bboxToPolygon(bbox)
}

/**
 * If the AOI is larger than maxDeg in either axis, return a clamped square
 * around the centroid for high-res crop inference; otherwise the original.
 */
export function aoiForCropInference(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  maxDeg = CROP_HIGHRES_MAX_DEG,
): GeoJSON.Polygon | GeoJSON.MultiPolygon {
  const bbox = geometryBbox(geometry)
  if (!bbox) return geometry
  const [w, s, e, n] = bbox
  if (e - w <= maxDeg && n - s <= maxDeg) return geometry
  return bboxToPolygon(clampBboxForCropImagery(bbox, maxDeg))
}

/**
 * Grid size aiming for ~targetGsdM meters/pixel (default 10 m = Sentinel-2).
 * Caps at 512 for WMS practicality.
 */
export function resolveCropGridSize(
  bbox: [number, number, number, number],
  targetGsdM = 10,
  maxPx = 512,
): number {
  const [w, s, e, n] = bbox
  const midLat = ((s + n) / 2) * (Math.PI / 180)
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos(midLat)
  const spanM = Math.max((e - w) * mPerDegLng, (n - s) * mPerDegLat)
  const size = Math.round(spanM / Math.max(1, targetGsdM))
  return Math.max(256, Math.min(maxPx, size))
}

/** True when AOI spans much more than the prediction georef window (clip would go black). */
export function aoiSpansFarBeyondPredictionBounds(
  aoi: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  bounds: [number, number, number, number],
  factor = 2.5,
): boolean {
  const aoiBox = geometryBbox(aoi)
  if (!aoiBox) return false
  const aoiSpan = Math.max(aoiBox[2] - aoiBox[0], aoiBox[3] - aoiBox[1])
  const predSpan = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1])
  if (!(predSpan > 0) || !(aoiSpan > 0)) return false
  return aoiSpan > predSpan * factor
}
