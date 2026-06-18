import type { AcpWmsTileEntry } from './acpWmsViewportEngine'

export const ACP_WMS_SPEC_CACHE_LS_KEY = 'acp_wms_spec_cache_v2'
export const ACP_WMS_SPEC_CACHE_TTL_MS = 45 * 60_000

/** Persisted WMS layer snapshot — stable across pan/zoom. */
export type AcpWmsPersistentLayerRecord = {
  cacheKey: string
  layerId: string
  startDate: string
  endDate: string
  evalscript: string | null
  cloudCoverage: number
  aoiFeatureCount: number
  entries: AcpWmsTileEntry[]
  savedAt: number
}

export type AcpWmsSpecCacheEntry = AcpWmsPersistentLayerRecord

const IDB_NAME = 'acp_wms_layer_cache'
const IDB_STORE = 'layers'
const IDB_VERSION = 1

const memoryCache = new Map<string, AcpWmsPersistentLayerRecord>()

export function buildAcpWmsSpecCacheKey(params: {
  wmsLayer: string
  startDate: string
  endDate: string
  cloudCoverage: number
  clipSignature: string
}): string {
  return [
    params.wmsLayer,
    params.startDate,
    params.endDate,
    params.cloudCoverage,
    params.clipSignature,
    'persist-v11-field-clip',
  ].join('|')
}

export function getAcpWmsMemoryCache(cacheKey: string): AcpWmsPersistentLayerRecord | null {
  const hit = memoryCache.get(cacheKey)
  if (!hit?.entries?.length) return null
  return hit
}

export function setAcpWmsMemoryCache(record: AcpWmsPersistentLayerRecord): void {
  memoryCache.set(record.cacheKey, record)
}

export function loadAcpWmsSpecCache(cacheKey: string): AcpWmsPersistentLayerRecord | null {
  const mem = getAcpWmsMemoryCache(cacheKey)
  if (mem) return mem

  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(ACP_WMS_SPEC_CACHE_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AcpWmsPersistentLayerRecord
    if (!parsed?.cacheKey || parsed.cacheKey !== cacheKey) return null
    if (!Array.isArray(parsed.entries) || !parsed.entries.length) return null
    memoryCache.set(cacheKey, parsed)
    return parsed
  } catch {
    return null
  }
}

export function persistAcpWmsSpecCache(record: AcpWmsPersistentLayerRecord): void {
  setAcpWmsMemoryCache(record)
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(ACP_WMS_SPEC_CACHE_LS_KEY, JSON.stringify(record))
  } catch {
    /* quota */
  }
  void persistAcpWmsIdbCache(record)
}

export function clearAcpWmsSessionStorageCache(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(ACP_WMS_SPEC_CACHE_LS_KEY)
  } catch {
    /* quota */
  }
}

export function purgeAcpWmsMemoryCachesNotMatchingDate(referenceDate: string): void {
  const date = referenceDate.slice(0, 10)
  for (const [key, record] of memoryCache) {
    if (record.startDate !== date || record.endDate !== date) {
      memoryCache.delete(key)
    }
  }
}

export async function purgeAcpWmsIdbCachesNotMatchingDate(referenceDate: string): Promise<void> {
  const date = referenceDate.slice(0, 10)
  try {
    const db = await openAcpWmsIdb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      const req = store.openCursor()
      req.onerror = () => reject(req.error ?? new Error('idb cursor failed'))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        const record = cursor.value as AcpWmsPersistentLayerRecord
        if (record.startDate !== date || record.endDate !== date) {
          memoryCache.delete(record.cacheKey)
          cursor.delete()
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('idb purge failed'))
    })
    db.close()
  } catch {
    /* idb unavailable */
  }
}

export function purgeAcpWmsCachesForReferenceDate(referenceDate: string): void {
  clearAcpWmsSessionStorageCache()
  purgeAcpWmsMemoryCachesNotMatchingDate(referenceDate)
  void purgeAcpWmsIdbCachesNotMatchingDate(referenceDate)
}

export function isAcpWmsSpecCacheFresh(
  entry: AcpWmsPersistentLayerRecord | null,
  maxAgeMs = ACP_WMS_SPEC_CACHE_TTL_MS,
): boolean {
  if (!entry?.entries.length) return false
  return Date.now() - entry.savedAt < maxAgeMs
}

function openAcpWmsIdb(): Promise<IDBDatabase> {
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

export async function loadAcpWmsIdbCache(cacheKey: string): Promise<AcpWmsPersistentLayerRecord | null> {
  const mem = getAcpWmsMemoryCache(cacheKey)
  if (mem) return mem

  try {
    const db = await openAcpWmsIdb()
    const record = await new Promise<AcpWmsPersistentLayerRecord | null>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(cacheKey)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve((req.result as AcpWmsPersistentLayerRecord | undefined) ?? null)
    })
    db.close()
    if (record?.entries?.length) {
      memoryCache.set(cacheKey, record)
      persistAcpWmsSpecCache(record)
      return record
    }
  } catch {
    /* idb unavailable */
  }
  return null
}

async function persistAcpWmsIdbCache(record: AcpWmsPersistentLayerRecord): Promise<void> {
  try {
    const db = await openAcpWmsIdb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.objectStore(IDB_STORE).put(record)
    })
    db.close()
  } catch {
    /* idb unavailable */
  }
}

function extractEvalscriptFromRasterUrl(url: string): string | null {
  try {
    const idx = url.indexOf('EVALSCRIPT=')
    if (idx < 0) return null
    const raw = url.slice(idx + 'EVALSCRIPT='.length).split('&')[0] ?? ''
    return decodeURIComponent(raw) || null
  } catch {
    return null
  }
}

export function buildAcpWmsPersistentRecord(params: {
  cacheKey: string
  wmsLayer: string
  startDate: string
  endDate: string
  cloudCoverage: number
  aoiFeatureCount: number
  entries: AcpWmsTileEntry[]
}): AcpWmsPersistentLayerRecord {
  const startDate = params.startDate.slice(0, 10)
  const endDate = params.endDate.slice(0, 10)
  const firstUrl = params.entries[0]?.rasterUrl ?? params.entries[0]?.spec.url ?? ''
  return {
    cacheKey: params.cacheKey,
    layerId: params.wmsLayer,
    startDate,
    endDate,
    evalscript: extractEvalscriptFromRasterUrl(firstUrl),
    cloudCoverage: params.cloudCoverage,
    aoiFeatureCount: params.aoiFeatureCount,
    entries: params.entries,
    savedAt: Date.now(),
  }
}
