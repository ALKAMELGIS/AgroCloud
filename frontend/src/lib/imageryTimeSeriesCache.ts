import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'
import { simplifyGeometryForSentinelStats } from './sentinelHubStatisticsApi'

export const IMAGERY_TS_CACHE_TTL_MS = 15 * 60_000
export const IMAGERY_TS_STALE_MS = 24 * 60 * 60_000

const IDB_NAME = 'agrocloud_imagery_ts_cache'
const IDB_STORE = 'series'
const IDB_VERSION = 1
const CACHE_API_NAME = 'agrocloud-imagery-ts-v1'

export type ImageryTimeSeriesCacheRecord = {
  cacheKey: string
  fieldKey: string
  fromIso: string
  toIso: string
  cloudFilter: number
  daily: SentinelHubDailyIndexMeans[]
  savedAt: number
  expiresAt: number
}

const memoryCache = new Map<string, ImageryTimeSeriesCacheRecord>()

function fnv1a(str: string): string {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function geometryHashForImageryCache(geometry: GeoJSON.Geometry | null | undefined): string {
  const simplified = simplifyGeometryForSentinelStats(geometry)
  if (!simplified) return 'none'
  try {
    return fnv1a(JSON.stringify(simplified))
  } catch {
    return 'err'
  }
}

export function buildImageryTsCacheKey(params: {
  fieldKey: string
  geometryHash: string
  fromIso: string
  toIso: string
  cloudFilter: number
}): string {
  return [
    params.fieldKey,
    params.geometryHash,
    params.fromIso,
    params.toIso,
    params.cloudFilter,
    'v1',
  ].join('|')
}

export function getImageryTsMemoryCache(cacheKey: string): ImageryTimeSeriesCacheRecord | null {
  const hit = memoryCache.get(cacheKey)
  if (!hit?.daily?.length) return null
  return hit
}

export function setImageryTsMemoryCache(record: ImageryTimeSeriesCacheRecord): void {
  memoryCache.set(record.cacheKey, record)
}

function openImageryTsIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'))
      return
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('idb open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'cacheKey' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

async function readImageryTsIdb(cacheKey: string): Promise<ImageryTimeSeriesCacheRecord | null> {
  try {
    const db = await openImageryTsIdb()
    const record = await new Promise<ImageryTimeSeriesCacheRecord | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(cacheKey)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve((req.result as ImageryTimeSeriesCacheRecord | undefined) ?? null)
    })
    db.close()
    return record?.daily?.length ? record : null
  } catch {
    return null
  }
}

async function writeImageryTsIdb(record: ImageryTimeSeriesCacheRecord): Promise<void> {
  try {
    const db = await openImageryTsIdb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const req = tx.objectStore(IDB_STORE).put(record)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idb write failed'))
    })
    db.close()
  } catch {
    /* idb unavailable */
  }
}

async function readImageryTsCacheApi(cacheKey: string): Promise<ImageryTimeSeriesCacheRecord | null> {
  if (typeof caches === 'undefined') return null
  try {
    const cache = await caches.open(CACHE_API_NAME)
    const res = await cache.match(`imagery-ts://${encodeURIComponent(cacheKey)}`)
    if (!res) return null
    const record = (await res.json()) as ImageryTimeSeriesCacheRecord
    return record?.daily?.length ? record : null
  } catch {
    return null
  }
}

async function writeImageryTsCacheApi(record: ImageryTimeSeriesCacheRecord): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const cache = await caches.open(CACHE_API_NAME)
    const body = JSON.stringify(record)
    await cache.put(
      `imagery-ts://${encodeURIComponent(record.cacheKey)}`,
      new Response(body, { headers: { 'Content-Type': 'application/json' } }),
    )
  } catch {
    /* quota */
  }
}

export async function readImageryTsCache(cacheKey: string): Promise<ImageryTimeSeriesCacheRecord | null> {
  const mem = getImageryTsMemoryCache(cacheKey)
  if (mem) return mem

  const idb = await readImageryTsIdb(cacheKey)
  if (idb) {
    setImageryTsMemoryCache(idb)
    return idb
  }

  const api = await readImageryTsCacheApi(cacheKey)
  if (api) {
    setImageryTsMemoryCache(api)
    void writeImageryTsIdb(api)
    return api
  }

  return null
}

export async function writeImageryTsCache(
  cacheKey: string,
  params: {
    fieldKey: string
    fromIso: string
    toIso: string
    cloudFilter: number
    daily: SentinelHubDailyIndexMeans[]
  },
): Promise<void> {
  if (!params.daily.length) return
  const now = Date.now()
  const record: ImageryTimeSeriesCacheRecord = {
    cacheKey,
    fieldKey: params.fieldKey,
    fromIso: params.fromIso,
    toIso: params.toIso,
    cloudFilter: params.cloudFilter,
    daily: params.daily,
    savedAt: now,
    expiresAt: now + IMAGERY_TS_CACHE_TTL_MS,
  }
  setImageryTsMemoryCache(record)
  void writeImageryTsIdb(record)
  void writeImageryTsCacheApi(record)
}

export function isImageryTsCacheFresh(record: ImageryTimeSeriesCacheRecord | null): boolean {
  if (!record?.daily?.length) return false
  return Date.now() < record.expiresAt
}

export function isImageryTsCacheStaleButUsable(record: ImageryTimeSeriesCacheRecord | null): boolean {
  if (!record?.daily?.length) return false
  return Date.now() - record.savedAt < IMAGERY_TS_STALE_MS
}
