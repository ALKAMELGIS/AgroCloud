/**
 * Discover latest Sentinel-2 L2A scene dates for an AOI via Planetary Computer STAC.
 * Used to drive auto imagery date (latest − 1 day) and fetch-date fallback.
 */

import { getDrawnGeometry } from './sentinelHubWmsAoiClip'
import { filterSentinelSceneDatesByAoiCloud } from './siSentinelAoiSceneCloudFilter'
import { localIsoDate, subtractDaysFromIso } from './siSentinelImageryDate'

export const PC_SENTINEL_STAC_SEARCH_URL = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'

export const SI_SENTINEL_SCENE_CATALOG_LOOKBACK_DAYS = 120

const SCENE_CATALOG_CACHE_TTL_MS = 20 * 60_000
const sceneCatalogCache = new Map<string, { catalog: SentinelSceneCatalog; expiresAt: number }>()
const sceneCatalogInFlight = new Map<string, Promise<SentinelSceneCatalog>>()

function sceneCatalogCacheKey(
  body: Record<string, unknown>,
  extras?: { cloudCoverMax?: number; geomKey?: string },
): string {
  return JSON.stringify({ body, ...extras })
}

function geometryCacheKey(aoi: unknown): string {
  const geom = getDrawnGeometry(aoi as Parameters<typeof getDrawnGeometry>[0])
  if (!geom) return ''
  try {
    return JSON.stringify(geom)
  } catch {
    return String(geom.type || '')
  }
}

export type SentinelSceneCatalog = {
  latestSceneIso: string | null
  sceneIsos: string[]
  /** AOI cloud cover % per scene date (CLP/CLM/SCL inside clip). */
  sceneCloudByDate?: Record<string, number>
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
  options?: {
    cloudCoverMax?: number
    limit?: number
    lookbackDays?: number
    /** Planetary Computer STAC collection ids (default: sentinel-2-l2a). */
    collections?: string[]
  },
): Record<string, unknown> | null {
  const geom = getDrawnGeometry(aoi as Parameters<typeof getDrawnGeometry>[0])
  const bbox = bboxFromGeoJsonLike(aoi)
  if (!geom && !bbox) return null

  const lookback = options?.lookbackDays ?? SI_SENTINEL_SCENE_CATALOG_LOOKBACK_DAYS
  const end = localIsoDate()
  const start = subtractDaysFromIso(end, lookback)
  const collections =
    options?.collections?.map(c => c.trim()).filter(Boolean) ?? ['sentinel-2-l2a']

  const body: Record<string, unknown> = {
    collections: collections.length ? collections : ['sentinel-2-l2a'],
    datetime: `${start}T00:00:00Z/${end}T23:59:59Z`,
    limit: Math.min(500, Math.max(1, options?.limit ?? 250)),
    sortby: [{ field: 'datetime', direction: 'desc' }],
  }

  if (geom) body.intersects = geom
  else if (bbox) body.bbox = bbox

  // Do not filter STAC by eo:cloud_cover — it is granule-level (~100 km tile), not AOI cloud.
  // AOI cloud gating runs after catalog fetch via Sentinel Hub WMS CLP/CLM masking.

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
  options?: {
    cloudCoverMax?: number
    signal?: AbortSignal
    collections?: string[]
    lookbackDays?: number
  },
): Promise<SentinelSceneCatalog> {
  const body = buildStacSearchBodyForAoi(aoi, {
    collections: options?.collections,
    lookbackDays: options?.lookbackDays,
  })
  if (!body) {
    return { latestSceneIso: null, sceneIsos: [], fetchedAt: Date.now() }
  }

  const cloudCoverMax = options?.cloudCoverMax
  const cacheKey = sceneCatalogCacheKey(body, {
    cloudCoverMax,
    geomKey: geometryCacheKey(aoi),
  })
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
      const stacCatalog = parseSentinelSceneCatalogFromStacFeatures(
        Array.isArray(data?.features) ? data.features : [],
      )

      let sceneIsos = stacCatalog.sceneIsos
      let sceneCloudByDate: Record<string, number> | undefined
      if (
        typeof cloudCoverMax === 'number' &&
        Number.isFinite(cloudCoverMax) &&
        cloudCoverMax < 100 &&
        stacCatalog.sceneIsos.length
      ) {
        const filtered = await filterSentinelSceneDatesByAoiCloud(
          aoi,
          stacCatalog.sceneIsos,
          cloudCoverMax,
          { signal: options?.signal },
        )
        sceneIsos = filtered.sceneIsos
        sceneCloudByDate = Object.keys(filtered.sceneCloudByDate).length
          ? filtered.sceneCloudByDate
          : undefined
      }

      const catalog: SentinelSceneCatalog = {
        latestSceneIso: sceneIsos[0] ?? null,
        sceneIsos,
        sceneCloudByDate,
        fetchedAt: Date.now(),
      }
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
