import type { SentinelHubDailyIndexMeans } from './sentinelHubStatisticsApi'
import { simplifyGeometryForSentinelStats } from './sentinelHubStatisticsApi'

export const IMAGERY_TS_CACHE_TTL_MS = 15 * 60_000
export const IMAGERY_TS_STALE_MS = 24 * 60 * 60_000

const IDB_NAME = 'agrocloud_imagery_ts_cache'
const IDB_STORE = 'series'
const IDB_VERSION = 1
const CACHE_API_NAME = 'agrocloud-imagery-ts-v5'

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
  statsMode?: string
}): string {
  return [
    params.fieldKey,
    params.geometryHash,
    params.fromIso,
    params.toIso,
    params.cloudFilter,
    params.statsMode ?? 'multi',
    'v5',
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

export function buildImageryTsChunkCacheKey(
  geometryHash: string,
  fromIso: string,
  toIso: string,
  cloudFilter: number,
  statsMode = 'multi',
): string {
  return ['chunk', geometryHash, fromIso.trim().slice(0, 10), toIso.trim().slice(0, 10), cloudFilter, statsMode, 'v5'].join('|')
}

type ImageryTsChunkCacheRecord = {
  cacheKey: string
  daily: SentinelHubDailyIndexMeans[]
  savedAt: number
  expiresAt: number
}

const chunkMemoryCache = new Map<string, ImageryTsChunkCacheRecord>()

function isChunkCacheUsable(record: ImageryTsChunkCacheRecord | null): boolean {
  if (!record?.daily?.length) return false
  return Date.now() - record.savedAt < IMAGERY_TS_STALE_MS
}

export function getImageryTsChunkMemoryCache(chunkKey: string): ImageryTsChunkCacheRecord | null {
  const hit = chunkMemoryCache.get(chunkKey)
  return hit?.daily?.length ? hit : null
}

export async function readImageryTsChunkCache(chunkKey: string): Promise<SentinelHubDailyIndexMeans[] | null> {
  const mem = getImageryTsChunkMemoryCache(chunkKey)
  if (mem && isChunkCacheUsable(mem)) return mem.daily

  try {
    const db = await openImageryTsIdb()
    const record = await new Promise<ImageryTsChunkCacheRecord | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(chunkKey)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve((req.result as ImageryTsChunkCacheRecord | undefined) ?? null)
    })
    db.close()
    if (record?.daily?.length && isChunkCacheUsable(record)) {
      chunkMemoryCache.set(chunkKey, record)
      return record.daily
    }
  } catch {
    /* idb unavailable */
  }
  return null
}

export async function writeImageryTsChunkCache(
  chunkKey: string,
  daily: SentinelHubDailyIndexMeans[],
): Promise<void> {
  if (!daily.length) return
  const now = Date.now()
  const record: ImageryTsChunkCacheRecord = {
    cacheKey: chunkKey,
    daily,
    savedAt: now,
    expiresAt: now + IMAGERY_TS_CACHE_TTL_MS,
  }
  chunkMemoryCache.set(chunkKey, record)
  try {
    const db = await openImageryTsIdb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const req = tx.objectStore(IDB_STORE).put(record)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idb chunk write failed'))
    })
    db.close()
  } catch {
    /* idb unavailable */
  }
}

/** Merge any in-memory range caches that overlap the requested window (instant Apply). */
export function findImageryTsOverlappingDaily(params: {
  fieldKey: string
  geometryHash: string
  fromIso: string
  toIso: string
  cloudFilter: number
  statsMode?: string
}): SentinelHubDailyIndexMeans[] {
  const from = params.fromIso.trim().slice(0, 10)
  const to = params.toIso.trim().slice(0, 10)
  if (!from || !to || from >= to) return []
  const wantStatsMode = params.statsMode ?? 'multi'

  const byDate = new Map<string, SentinelHubDailyIndexMeans>()

  const ingest = (daily: SentinelHubDailyIndexMeans[]) => {
    for (const row of daily) {
      if (row.date < from || row.date > to) continue
      byDate.set(row.date, row)
    }
  }

  for (const record of memoryCache.values()) {
    if (record.fieldKey !== params.fieldKey) continue
    if (record.cloudFilter !== params.cloudFilter) continue
    const parts = record.cacheKey.split('|')
    if (parts[1] !== params.geometryHash) continue
    if ((parts[5] ?? 'multi') !== wantStatsMode) continue
    if (record.toIso < from || record.fromIso > to) continue
    if (!isImageryTsCacheStaleButUsable(record) && !isImageryTsCacheFresh(record)) continue
    ingest(record.daily)
  }

  for (const record of chunkMemoryCache.values()) {
    if (!isChunkCacheUsable(record)) continue
    const parts = record.cacheKey.split('|')
    if (parts[1] !== params.geometryHash) continue
    if ((parts[5] ?? 'multi') !== wantStatsMode) continue
    const chunkFrom = parts[2]
    const chunkTo = parts[3]
    const chunkCloud = Number(parts[4])
    if (chunkCloud !== params.cloudFilter) continue
    if (!chunkFrom || !chunkTo || chunkTo < from || chunkFrom > to) continue
    ingest(record.daily)
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
