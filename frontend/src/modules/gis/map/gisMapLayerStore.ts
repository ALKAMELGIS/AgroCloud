import type { LayerData } from '../layers/LayerManager'

/**
 * The browser-side store of GIS Map layers (IndexedDB `GisMapStore`, object store `layers`, key
 * `savedLayers`). GIS Map writes it; data-entry pages, forms and reports read layer names from it.
 *
 * Every module must open the database through `openGisMapDb()`. Several used to open it themselves
 * at version 1 without an upgrade handler: whichever page ran first created the database with no
 * object store, and from then on GIS Map could neither save nor load layers ("One of the specified
 * object stores was not found"). Version 2 repairs such databases on the next open.
 */
export const GIS_MAP_DB_NAME = 'GisMapStore'
export const GIS_MAP_STORE_NAME = 'layers'
export const GIS_MAP_DB_VERSION = 2
const SAVED_LAYERS_KEY = 'savedLayers'

let dbPromise: Promise<IDBDatabase> | null = null

/** Open (once per page) the GIS Map database, creating or repairing the `layers` store. */
export function openGisMapDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'))
      return
    }
    const req = indexedDB.open(GIS_MAP_DB_NAME, GIS_MAP_DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(GIS_MAP_STORE_NAME)) {
        req.result.createObjectStore(GIS_MAP_STORE_NAME)
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // Another tab upgrading the schema: step aside so it is not blocked; reopen on next use.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('GIS layer store is open in an older tab; reload that tab.'))
  }).catch((e) => {
    dbPromise = null
    throw e
  })
  return dbPromise
}

/** Layers persisted by GIS Map; `[]` when none are saved or storage is unavailable. */
export async function loadGisMapSavedLayers<T = LayerData>(): Promise<T[]> {
  try {
    const db = await openGisMapDb()
    const req = db.transaction(GIS_MAP_STORE_NAME, 'readonly').objectStore(GIS_MAP_STORE_NAME).get(SAVED_LAYERS_KEY)
    return await new Promise<T[]>((resolve, reject) => {
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as T[]) : [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

/** Replace the saved GIS Map layers. Resolves when the write is committed. */
export async function saveGisMapSavedLayers(layers: unknown[]): Promise<void> {
  const db = await openGisMapDb()
  const tx = db.transaction(GIS_MAP_STORE_NAME, 'readwrite')
  tx.objectStore(GIS_MAP_STORE_NAME).put(layers, SAVED_LAYERS_KEY)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

/** Test hook: forget the cached connection. */
export function resetGisMapDbForTests() {
  dbPromise = null
}
