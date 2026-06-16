import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  bulkUpdateGisContentRows,
  createGisContentPortalFolder,
  deleteGisContentPortalFolder,
  filterGisContentRowsForFolder,
  getGisContentPortalFolders,
  getGisContentPortalRows,
  moveGisContentRowsToFolder,
  moveGisContentRowsToRecycleBin,
  moveGisContentToRecycleBin,
  permanentlyDeleteGisContentRows,
  resetGisContentPortalForTests,
  seedGisContentPortalFixtureRowsForTests,
  reloadGisContentPortalFromStorageForTests,
  restoreGisContentFromRecycleBin,
  subscribeGisContentPortal,
  updateGisContentPortalFolder,
  upsertGisContentPortalApp,
  upsertGisContentPortalWebMap,
  upsertGisContentPortalHostedFeatureLayer,
  publishHostedFeatureLayerFromWizard,
  getGisContentItemDetails,
  getGisContentMapRegistry,
  registerGisContentMapLayer,
  updateGisContentMapLayerConfig,
} from './gisContentPortalStore'
import { buildGisWebMapSnapshot, readGisWebMapSnapshot } from './gisWebMapPortal'
import { readGisHostedFeatureLayerSnapshot } from './gisHostedFeatureLayerPortal'

describe('gisContentPortalStore', () => {
  beforeEach(() => {
    resetGisContentPortalForTests()
    seedGisContentPortalFixtureRowsForTests()
  })

  afterEach(() => {
    resetGisContentPortalForTests()
  })

  it('starts with no legacy demo rows after reset', () => {
    resetGisContentPortalForTests()
    expect(getGisContentPortalRows()).toEqual([])
  })

  it('starts with only All my content and Recycle bin folders after reset', () => {
    resetGisContentPortalForTests()
    const folders = getGisContentPortalFolders()
    expect(folders.map(f => f.id)).toEqual(['all', 'recycle'])
  })

  it('excludes recycle bin items from All my content', () => {
    moveGisContentToRecycleBin('3')
    const all = filterGisContentRowsForFolder(getGisContentPortalRows(), 'all')
    expect(all.some(r => r.id === '3')).toBe(false)
    const recycle = filterGisContentRowsForFolder(getGisContentPortalRows(), 'recycle')
    expect(recycle.some(r => r.id === '3')).toBe(true)
  })

  it('moves delete targets to recycle bin and can restore', () => {
    const moved = moveGisContentToRecycleBin('7')
    expect(moved?.folderId).toBe('recycle')
    const restored = restoreGisContentFromRecycleBin('7')
    expect(restored?.folderId).toBe('all')
  })

  it('creates a custom folder and persists in folder list', () => {
    const result = createGisContentPortalFolder('Saved map layers', 'green')
    expect('folder' in result).toBe(true)
    if (!('folder' in result)) return
    expect(result.folder.color).toBe('green')
    expect(getGisContentPortalFolders().some(f => f.id === result.folder.id)).toBe(true)
    expect(createGisContentPortalFolder('Saved map layers')).toEqual({
      error: 'A folder with this name already exists.',
    })
  })

  it('updates and deletes custom folders', () => {
    const created = createGisContentPortalFolder('Temp folder', 'blue')
    if (!('folder' in created)) return
    const updated = updateGisContentPortalFolder(created.folder.id, { name: 'Renamed folder', color: 'green' })
    expect('folder' in updated).toBe(true)
    if ('folder' in updated) expect(updated.folder.name).toBe('Renamed folder')
    expect(updateGisContentPortalFolder('all', { name: 'X' })).toEqual({
      error: 'This folder cannot be edited.',
    })
    moveGisContentRowsToFolder(['2'], created.folder.id)
    const deleted = deleteGisContentPortalFolder(created.folder.id)
    expect(deleted).toEqual({ ok: true })
    expect(getGisContentPortalRows().find(r => r.id === '2')?.folderId).toBe('all')
  })

  it('bulk updates sharing and skips delete-protected rows on bulk recycle', () => {
    const created = createGisContentPortalFolder('Analysis outputs')
    if (!('folder' in created)) throw new Error('folder create failed')
    bulkUpdateGisContentRows(['2', '3'], { sharing: 'public' })
    expect(getGisContentPortalRows().find(r => r.id === '2')?.sharing).toBe('public')
    bulkUpdateGisContentRows(['3'], { deleteProtected: true })
    const { moved, skippedProtected } = moveGisContentRowsToRecycleBin(['2', '3'])
    expect(moved).toBe(1)
    expect(skippedProtected).toBe(1)
    expect(moveGisContentRowsToFolder(['2'], created.folder.id)).toBe(1)
    expect(getGisContentPortalRows().find(r => r.id === '2')?.folderId).toBe(created.folder.id)
  })

  it('permanently deletes recycle items and keeps them removed after reload', () => {
    expect(getGisContentPortalRows().some(r => r.id === '19')).toBe(true)
    expect(permanentlyDeleteGisContentRows(['19'])).toBe(1)
    expect(getGisContentPortalRows().some(r => r.id === '19')).toBe(false)

    let rowsAfterReload = getGisContentPortalRows()
    const unsub = subscribeGisContentPortal(() => {
      rowsAfterReload = getGisContentPortalRows()
    })
    window.dispatchEvent(new CustomEvent('gis-content-portal-changed'))
    unsub()
    expect(rowsAfterReload.some(r => r.id === '19')).toBe(false)

    reloadGisContentPortalFromStorageForTests()
    expect(getGisContentPortalRows().some(r => r.id === '19')).toBe(false)
  })

  it('never restores seed demo rows after permanent delete even when stale rows remain in storage', () => {
    moveGisContentToRecycleBin('2')
    expect(permanentlyDeleteGisContentRows(['2'])).toBe(1)

    const raw = localStorage.getItem('geosyntra.gisContent.portal.v1')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as { permanentlyDeletedIds?: string[]; rows?: Array<{ id: string }> }
    expect(parsed.permanentlyDeletedIds).toContain('2')
    expect(parsed.rows?.some(r => r.id === '2')).toBe(false)

    parsed.rows = [{ id: '2', title: 'Stale copy', type: 'web-map', typeLabel: 'Web Map', modified: 'Jun 7, 2026', created: 'Mar 10, 2026', sharing: 'shared', folderId: 'recycle' }]
    localStorage.setItem('geosyntra.gisContent.portal.v1', JSON.stringify(parsed))

    reloadGisContentPortalFromStorageForTests()
    expect(getGisContentPortalRows().some(r => r.id === '2')).toBe(false)
  })

  it('permanently deletes user-created portal rows and blocks resurrection on reload', () => {
    const row = upsertGisContentPortalApp({ title: 'Temp dashboard to delete' })
    moveGisContentToRecycleBin(row.id)
    expect(permanentlyDeleteGisContentRows([row.id])).toBe(1)
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(false)

    reloadGisContentPortalFromStorageForTests()
    expect(getGisContentPortalRows().some(r => r.id === row.id)).toBe(false)
    expect(getGisContentItemDetails(row.id)).toEqual({})
  })

  it('moves items out of recycle bin into a folder', () => {
    const created = createGisContentPortalFolder('Field operations')
    if (!('folder' in created)) throw new Error('folder create failed')
    moveGisContentToRecycleBin('7')
    expect(moveGisContentRowsToFolder(['7'], created.folder.id)).toBe(1)
    expect(getGisContentPortalRows().find(r => r.id === '7')?.folderId).toBe(created.folder.id)
    const recycle = filterGisContentRowsForFolder(getGisContentPortalRows(), 'recycle')
    expect(recycle.some(r => r.id === '7')).toBe(false)
  })

  it('upserts Dashboard rows for GIS Content portal table', () => {
    const row = upsertGisContentPortalApp({ title: 'Elite AgroCloud Test Dashboard' })
    expect(row.type).toBe('dashboard')
    expect(row.typeLabel).toBe('Dashboard')
    const rows = getGisContentPortalRows()
    expect(rows.some(r => r.id === row.id && r.title === 'Elite AgroCloud Test Dashboard')).toBe(true)
    const updated = upsertGisContentPortalApp({ id: row.id, title: 'Elite AgroCloud Renamed' })
    expect(updated.id).toBe(row.id)
    expect(getGisContentPortalRows().find(r => r.id === row.id)?.title).toBe('Elite AgroCloud Renamed')
  })

  it('upserts Web Map rows with snapshot in GIS Content portal', () => {
    const snapshot = buildGisWebMapSnapshot({
      basemap: 'osm-standard',
      projection: '2d',
      mapCenterZoom: { lat: 25, lng: 55, zoom: 10 },
      layers: [],
    })
    const row = upsertGisContentPortalWebMap({ title: 'Field survey map', snapshot })
    expect(row.type).toBe('web-map')
    expect(row.typeLabel).toBe('Web Map')
    const details = getGisContentItemDetails(row.id)
    expect(readGisWebMapSnapshot(details)?.center).toEqual({ lat: 25, lng: 55 })
    const updated = upsertGisContentPortalWebMap({
      id: row.id,
      title: 'Field survey map (2026)',
      snapshot: { ...snapshot, zoom: 11 },
    })
    expect(updated.title).toBe('Field survey map (2026)')
    expect(readGisWebMapSnapshot(getGisContentItemDetails(row.id))?.zoom).toBe(11)
  })

  it('upserts hosted feature layers with FeatureServer metadata in GIS Content', () => {
    const geojson = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: { name: 'Field A' },
          geometry: { type: 'Polygon', coordinates: [[[46.7, 24.7], [46.75, 24.7], [46.75, 24.75], [46.7, 24.75], [46.7, 24.7]]] },
        },
      ],
    }
    const row = upsertGisContentPortalHostedFeatureLayer({
      title: 'Irrigation zones',
      geojson,
      sourceMethod: 'upload',
      sourceFileName: 'zones.zip',
    })
    expect(row.type).toBe('feature-layer')
    expect(row.typeLabel).toBe('Feature layer (hosted)')
    expect(row.folderId).toBe('all')
    const snap = readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(row.id))
    expect(snap?.hosted).toBe(true)
    expect(snap?.featureCount).toBe(1)
    expect(snap?.featureServiceUrl).toContain('/FeatureServer/0')

    const fromWizard = publishHostedFeatureLayerFromWizard({
      method: 'define-own',
      title: 'Sensor points',
      geometryType: 'point',
    })
    expect(fromWizard.type).toBe('feature-layer')
    expect(readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(fromWizard.id))?.geometryType).toBe('point')
  })

  it('registers map layers in the central repository registry', () => {
    const row = getGisContentPortalRows().find(r => r.type === 'feature-layer')
    expect(row).toBeTruthy()
    if (!row) return

    registerGisContentMapLayer(row.id)
    const registry = getGisContentMapRegistry()
    expect(registry.activeItemIds).toContain(row.id)

    updateGisContentMapLayerConfig(row.id, { opacity: 0.4, visible: false })
    const updated = getGisContentMapRegistry()
    expect(updated.configs[row.id]?.opacity).toBe(0.4)
    expect(updated.configs[row.id]?.visible).toBe(false)
    expect(updated.activeItemIds).toContain(row.id)
  })
})
