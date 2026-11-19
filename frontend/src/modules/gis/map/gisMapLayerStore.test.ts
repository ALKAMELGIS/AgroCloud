import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  GIS_MAP_DB_NAME,
  GIS_MAP_STORE_NAME,
  loadGisMapSavedLayers,
  openGisMapDb,
  resetGisMapDbForTests,
  saveGisMapSavedLayers,
} from './gisMapLayerStore'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetGisMapDbForTests()
})

/** What data-entry pages used to leave behind: version 1, no object store. */
function createBrokenV1Database() {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(GIS_MAP_DB_NAME, 1)
    req.onsuccess = () => {
      req.result.close()
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

describe('gisMapLayerStore', () => {
  it('saves and loads layers on a fresh browser', async () => {
    expect(await loadGisMapSavedLayers()).toEqual([])
    await saveGisMapSavedLayers([{ id: 'a', name: 'Fields' }])
    resetGisMapDbForTests()
    expect(await loadGisMapSavedLayers()).toEqual([{ id: 'a', name: 'Fields' }])
  })

  it('repairs a version-1 database that was created without the layers store', async () => {
    await createBrokenV1Database()
    const db = await openGisMapDb()
    expect(db.version).toBe(2)
    expect(db.objectStoreNames.contains(GIS_MAP_STORE_NAME)).toBe(true)
    await saveGisMapSavedLayers([{ id: 'b' }])
    expect(await loadGisMapSavedLayers()).toEqual([{ id: 'b' }])
  })

  it('reuses one connection and steps aside for deleteDatabase (sign-out)', async () => {
    const a = await openGisMapDb()
    expect(await openGisMapDb()).toBe(a)
    await new Promise<void>((resolve, reject) => {
      const del = indexedDB.deleteDatabase(GIS_MAP_DB_NAME)
      del.onsuccess = () => resolve()
      del.onerror = () => reject(del.error)
      del.onblocked = () => reject(new Error('blocked'))
    })
    expect(await loadGisMapSavedLayers()).toEqual([])
  })
})
