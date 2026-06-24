/**
 * Discover latest Sentinel-2 L2A scene dates for an AOI via Planetary Computer STAC.
 * Used to drive auto imagery date (latest − 1 day) and fetch-date fallback.
 */

import { getDrawnGeometry } from './sentinelHubWmsAoiClip'
import { localIsoDate, subtractDaysFromIso } from './siSentinelImageryDate'

export const PC_SENTINEL_STAC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'

export const SI_SENTINEL_SCENE_CATALOG_LOOKBACK_DAYS = 120

const SCENE_CATALOG_CACHE_TTL_MS = 20 * 60_000
const sceneCatalogCache = new Map<string, { catalog: SentinelSceneCatalog; expiresAt: number }>()
const sceneCatalogInFlight = new Map<string, Promise<SentinelSceneCatalog>>()

function sceneCatalogCacheKey(body: Record<string, unknown>): string {
  return JSON.stringify(body)
}

export type SentinelSceneCatalog = {
  latestSceneIso: string | null
  sceneIsos: string[]
  fetchedAt: number
}

function stacFeatureCalendarIso(feature: { properties?: { datetime?: string } }): string | null {
  const dt = feature?.properties?.datetime
  if (typeof dt !== 'string' || dt.length < 10) return null
  return dt.slice(0, 10)
}

function walkLngLat(coords: unknown, points: [number, number][]) {
  if (!coords) return
  if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    points.push([coords[0], coords[1]])
    return
  }
  if (Array.isArray(coords)) coords.forEach(c => walkLngLat(c, points))
}

export function bboxFromGeoJsonLike(aoi: unknown): [number, number, number, number] | null {
  const geom = getDrawnGeometry(aoi as Parameters<typeof getDrawnGeometry>[0])
  if (!geom) return null
  const points: [number, number][] = []
  walkLngLat(geom.coordinates, points)
  if (!points.length) return null
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng
    if (lat < minLat) minLat = lat
    if (lng > maxLng) maxLng = lng
    if (lat > maxLat) maxLat = lat
  }
  if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null
  return [minLng, minLat, maxLng, maxLat]
}

export function buildStacSearchBodyForAoi(
  aoi: unknown,
  options?: { cloudCoverMax?: number; limit?: number; lookbackDays?: number },
): Record<string, unknown> | null {
  const geom = getDrawnGeometry(aoi as Parameters<typeof getDrawnGeometry>[0])
  const bbox = bboxFromGeoJsonLike(aoi)
  if (!geom && !bbox) return null

  const lookback = options?.lookbackDays ?? SI_SENTINEL_SCENE_CATALOG_LOOKBACK_DAYS
  const end = localIsoDate()
  const start = subtractDaysFromIso(end, lookback)

  const body: Record<string, unknown> = {
    collections: ['sentinel-2-l2a'],
    datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
    limit: Math.min(500, Math.max(1, options?.limit ?? 250)),
    sortby: [{ field: 'datetime', direction: 'desc' }],
  }

  if (geom) body.intersects = geom
  else if (bbox) body.bbox = bbox

  const maxCc = options?.cloudCoverMax
  if (typeof maxCc === 'number' && Number.isFinite(maxCc)) {
    body.query = { 'eo:cloud_cover': { lt: maxCc } }
  }

  return body
}

export function parseSentinelSceneCatalogFromStacFeatures(
  features: Array<{ properties?: { datetime?: string } }>,
): SentinelSceneCatalog {
  const sceneIsos = [
    ...new Set(
      features.map(stacFeatureCalendarIso).filter((d): d is string => typeof d === 'string' && d.length >= 10),
    ),
  ].sort((a, b) => b.localeCompare(a))

  return {
    latestSceneIso: sceneIsos[0] ?? null,
    sceneIsos,
    fetchedAt: Date.now(),
  }
}

export async function fetchSentinelSceneCatalogForAoi(
  aoi: unknown,
  options?: { cloudCoverMax?: number; signal?: AbortSignal },
): Promise<SentinelSceneCatalog> {
  const body = buildStacSearchBodyForAoi(aoi, { cloudCoverMax: options?.cloudCoverMax })
  if (!body) {
    return { latestSceneIso: null, sceneIsos: [], fetchedAt: Date.now() }
  }

  const cacheKey = sceneCatalogCacheKey(body)
  const cached = sceneCatalogCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.catalog
  }

  const inFlight = sceneCatalogInFlight.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  const promise = (async (): Promise<SentinelSceneCatalog> => {
    try {
      const response = await fetch(PC_SENTINEL_STAC_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json' },
        body: JSON.stringify(body),
        signal: options?.signal,
      })
      if (!response.ok) {
        return { latestSceneIso: null, sceneIsos: [], fetchedAt: Date.now() }
      }
      const data = (await response.json()) as { features?: Array<{ properties?: { datetime?: string } }> }
      const catalog = parseSentinelSceneCatalogFromStacFeatures(
        Array.isArray(data?.features) ? data.features : [],
      )
      sceneCatalogCache.set(cacheKey, {
        catalog,
        expiresAt: Date.now() + SCENE_CATALOG_CACHE_TTL_MS,
      })
      return catalog
    } catch {
      return { latestSceneIso: null, sceneIsos: [], fetchedAt: Date.now() }
    }
  })()

  sceneCatalogInFlight.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    sceneCatalogInFlight.delete(cacheKey)
  }
}
