/**
 * IndexedDB mirror for `BROWSER_API_SECRETS_VAULT_KEY` so a vault snapshot can be
 * restored when localStorage was cleared but IDB still holds the last write.
 */
import { BROWSER_API_SECRETS_VAULT_KEY } from '../services/persistedStorageKeys'

const IDB_NAME = 'agri_api_secrets_mirror_v1'
const IDB_VERSION = 1
const IDB_STORE = 'vault'
const IDB_RECORD_KEY = 'browser_api_secrets_vault_json'

function openMirrorDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'))
      return
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE)
    }
  })
}

export async function mirrorWriteVaultJson(json: string): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return
  const db = await openMirrorDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.onerror = () => reject(tx.error ?? new Error('idb tx failed'))
      tx.oncomplete = () => resolve()
      tx.objectStore(IDB_STORE).put(json, IDB_RECORD_KEY)
    })
  } finally {
    db.close()
  }
}

export async function restoreBrowserApiVaultFromIdbIfLocalMissing(): Promise<void> {
  if (typeof window === 'undefined' || !window.localStorage || typeof indexedDB === 'undefined') return
  try {
    if (window.localStorage.getItem(BROWSER_API_SECRETS_VAULT_KEY)?.trim()) return
  } catch {
    return
  }
  let json: string | undefined
  try {
    const db = await openMirrorDb()
    try {
      json = await new Promise<string | undefined>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly')
        tx.onerror = () => reject(tx.error ?? new Error('idb read tx failed'))
        const req = tx.objectStore(IDB_STORE).get(IDB_RECORD_KEY)
        req.onerror = () => reject(req.error ?? new Error('idb get failed'))
        req.onsuccess = () => {
          const v = req.result
          resolve(typeof v === 'string' ? v : undefined)
        }
      })
    } finally {
      db.close()
    }
  } catch {
    return
  }
  if (!json?.trim()) return
  try {
    const o = JSON.parse(json) as { v?: unknown }
    if (!o || typeof o !== 'object' || o.v !== 1) return
    window.localStorage.setItem(BROWSER_API_SECRETS_VAULT_KEY, json)
  } catch {
    // ignore corrupt mirror
  }
}
