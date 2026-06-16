import { useEffect, useMemo, useState } from 'react'
import {
  GIS_CONTENT_ROWS,
  GIS_CONTENT_FOLDERS,
  GIS_CONTENT_DEFAULT_OWNER,
  GIS_CONTENT_LEGACY_SEED_ROW_IDS,
  GIS_CONTENT_LEGACY_SEED_FOLDER_IDS,
  GIS_CONTENT_TEST_FIXTURE_ROWS,
  gisContentAppFormatRowMeta,
  gisPortalRowDemoGeoJson,
  isGisContentPortalCustomFolderId,
  type GisContentAppFormat,
  type GisContentFolder,
  type GisContentFolderColor,
  type GisContentRow,
} from '../pages/master/gisContentPortalData'
import { mergeGisWebMapPortalRow } from './gisWebMapPortal'
import { mergeGisHostedFeatureLayerPortalRow, hostedFeatureLayerGeoJsonForRow, emptyHostedFeatureLayerGeoJson, fetchHostedFeatureLayerLiveGeoJson, hasHostedFeatureLayerLiveSource, readGisHostedFeatureLayerSnapshot } from './gisHostedFeatureLayerPortal'
import { resolveHostedFeatureLayerPortalTitle, shouldReplaceNumericArcGisLayerTitle } from './arcgisFeatureServiceUrl'
import {
  emptyGisContentMapRegistry,
  defaultGisContentMapLayerConfig,
  mergeGisContentMapLayerConfig,
  resolveGisContentMapLayerConfig,
  type GisContentDataFormat,
  type GisContentItemStatus,
  type GisContentItemVersion,
  type GisContentMapLayerConfig,
  type GisContentMapRegistry,
  type GisContentRepositoryChangeDetail,
  GIS_CONTENT_REPOSITORY_EVENT,
} from './gisContentRepository'

const STORAGE_KEY = 'geosyntra.gisContent.portal.v1'
export const GIS_CONTENT_RECYCLE_FOLDER = 'recycle'
const SYSTEM_FOLDER_IDS = new Set(['all', GIS_CONTENT_RECYCLE_FOLDER])
const LEGACY_SEED_ROW_ID_SET = new Set(GIS_CONTENT_LEGACY_SEED_ROW_IDS)
const LEGACY_SEED_FOLDER_ID_SET = new Set<string>(GIS_CONTENT_LEGACY_SEED_FOLDER_IDS)

export type GisContentItemComment = {
  id: string
  text: string
  at: string
}

export type GisContentItemDetails = {
  description?: string
  tags?: string[]
  comments?: GisContentItemComment[]
  schemaUpdated?: string
  viewCount?: number
  termsOfUse?: string
  acknowledgments?: string
  /** Custom item thumbnail (data URL or remote URL). */
  thumbnailDataUrl?: string
  /** AgroCloud Dashboard builder state (saved App items). */
  agroCloudDashboard?: import('../pages/dashboards/agrocloud/agroCloudDashboardData').AgroCloudDashboardConfig
  /** ArcGIS-style format when item is saved as an app (Dashboard, Web Map, StoryMap). */
  appFormat?: GisContentAppFormat
  /** Saved Web Map state from Map Viewer (extent, basemap, portal layers). */
  webMap?: import('./gisWebMapPortal').GisWebMapSnapshotV1
  /** Hosted feature layer service payload (GeoJSON + FeatureServer metadata). */
  hostedFeatureLayer?: import('./gisHostedFeatureLayerPortal').GisHostedFeatureLayerSnapshotV1
  /** How the item was created (New item modal, map viewer, etc.). */
  portalSource?: {
    kind: string
    fileName?: string
    externalUrl?: string
    threeDLayerKind?: string
  }
  /** Canonical data format for repository filters and map routing. */
  dataFormat?: GisContentDataFormat
  /** Content categories (folder-style taxonomy). */
  categories?: string[]
  /** Arbitrary metadata key/value pairs. */
  metadata?: Record<string, string>
  /** Publication lifecycle status. */
  status?: GisContentItemStatus
  /** Version history snapshots (labels + timestamps). */
  versions?: GisContentItemVersion[]
  /** Per-item map display overrides (mirrors map registry entry). */
  mapLayerConfig?: GisContentMapLayerConfig
}

type PortalPersist = {
  rows: GisContentRow[]
  favoriteIds: string[]
  /** Folder id before item was moved to recycle (for restore). */
  recycleOrigin: Record<string, string>
  /** User-created folders (persisted). */
  customFolders: GisContentFolder[]
  /** Renamed/recolored built-in folders (seed ids). */
  folderOverrides?: Record<string, { name?: string; color?: GisContentFolderColor }>
  /** Built-in folder ids removed by the user. */
  deletedFolderIds?: string[]
  itemDetails: Record<string, GisContentItemDetails>
  /** Seed demo row ids the user permanently deleted (excluded on reload). */
  permanentlyDeletedIds?: string[]
  /** Central map registry — layers active on Map Canvas and dashboards. */
  mapRegistry?: GisContentMapRegistry
}

type Listener = () => void
const listeners = new Set<Listener>()

function emitRepositoryChange(detail?: GisContentRepositoryChangeDetail) {
  listeners.forEach(fn => fn())
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GIS_CONTENT_REPOSITORY_EVENT, { detail }))
  }
}

function emit() {
  emitRepositoryChange({ scope: 'refresh', action: 'update' })
}

function emptyPersist(): PortalPersist {
  return applyLegacyFolderPurge({
    rows: [...GIS_CONTENT_ROWS],
    favoriteIds: [],
    recycleOrigin: {},
    customFolders: [],
    itemDetails: {},
    permanentlyDeletedIds: [...GIS_CONTENT_LEGACY_SEED_ROW_IDS],
    mapRegistry: emptyGisContentMapRegistry(),
  })
}

function applyLegacyFolderPurge(persist: PortalPersist): PortalPersist {
  const deletedFolderIds = new Set([
    ...(persist.deletedFolderIds ?? []),
    ...GIS_CONTENT_LEGACY_SEED_FOLDER_IDS,
  ])
  const folderOverrides = { ...(persist.folderOverrides ?? {}) }
  for (const id of GIS_CONTENT_LEGACY_SEED_FOLDER_IDS) {
    delete folderOverrides[id]
  }
  const rows = persist.rows.map(row =>
    LEGACY_SEED_FOLDER_ID_SET.has(row.folderId) && row.folderId !== GIS_CONTENT_RECYCLE_FOLDER
      ? { ...row, folderId: 'all' }
      : row,
  )
  const recycleOrigin = { ...persist.recycleOrigin }
  for (const [itemId, origin] of Object.entries(recycleOrigin)) {
    if (LEGACY_SEED_FOLDER_ID_SET.has(origin)) recycleOrigin[itemId] = 'all'
  }
  return {
    ...persist,
    rows,
    recycleOrigin,
    folderOverrides,
    deletedFolderIds: Array.from(deletedFolderIds),
  }
}

function applyLegacySeedPurge(persist: PortalPersist): PortalPersist {
  const permanentlyDeleted = new Set([
    ...(persist.permanentlyDeletedIds ?? []),
    ...GIS_CONTENT_LEGACY_SEED_ROW_IDS,
  ])
  const rows = persist.rows.filter(r => !LEGACY_SEED_ROW_ID_SET.has(r.id))
  const favoriteIds = persist.favoriteIds.filter(id => !LEGACY_SEED_ROW_ID_SET.has(id))
  const recycleOrigin = { ...persist.recycleOrigin }
  const itemDetails = { ...persist.itemDetails }
  for (const id of LEGACY_SEED_ROW_ID_SET) {
    delete recycleOrigin[id]
    delete itemDetails[id]
  }
  return {
    ...persist,
    rows,
    favoriteIds,
    recycleOrigin,
    itemDetails,
    permanentlyDeletedIds: Array.from(permanentlyDeleted),
  }
}

function persistLegacySeedMigrationIfNeeded(storedRows: GisContentRow[], migrated: PortalPersist): void {
  if (typeof window === 'undefined') return
  const hadLegacyRows = storedRows.some(row => LEGACY_SEED_ROW_ID_SET.has(row.id))
  const legacyRowIdsMarked = GIS_CONTENT_LEGACY_SEED_ROW_IDS.every(id =>
    migrated.permanentlyDeletedIds?.includes(id),
  )
  const legacyFolderIdsMarked = GIS_CONTENT_LEGACY_SEED_FOLDER_IDS.every(id =>
    migrated.deletedFolderIds?.includes(id),
  )
  const hadLegacyFolderRows = storedRows.some(row => LEGACY_SEED_FOLDER_ID_SET.has(row.folderId))
  if (!hadLegacyRows && legacyRowIdsMarked && legacyFolderIdsMarked && !hadLegacyFolderRows) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
  } catch {
    /* ignore quota */
  }
}

function parseStoredPermanentlyDeletedIds(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw) as Partial<PortalPersist>
    if (!Array.isArray(parsed.permanentlyDeletedIds)) return new Set()
    return new Set(parsed.permanentlyDeletedIds.filter((id): id is string => typeof id === 'string' && id.length > 0))
  } catch {
    return new Set()
  }
}

function prunePersistForPermanentDeletes(persist: PortalPersist): PortalPersist {
  const permanentlyDeleted = new Set(persist.permanentlyDeletedIds ?? [])
  if (!permanentlyDeleted.size) return persist

  const rows = persist.rows.filter(r => !permanentlyDeleted.has(r.id))
  const favoriteIds = persist.favoriteIds.filter(id => !permanentlyDeleted.has(id))
  const recycleOrigin = { ...persist.recycleOrigin }
  const itemDetails = { ...persist.itemDetails }
  for (const id of permanentlyDeleted) {
    delete recycleOrigin[id]
    delete itemDetails[id]
  }

  return {
    ...persist,
    rows,
    favoriteIds,
    recycleOrigin,
    itemDetails,
    permanentlyDeletedIds: Array.from(permanentlyDeleted),
  }
}

function migratePortalPersist(persist: PortalPersist): PortalPersist {
  const itemDetails = persist.itemDetails ?? {}
  let changed = false
  const rows = persist.rows.map(row => {
    const details = itemDetails[row.id]
    if (row.type === 'app' && row.typeLabel === 'App' && details?.agroCloudDashboard) {
      changed = true
      return { ...row, ...gisContentAppFormatRowMeta('dashboard') }
    }
    if (details?.appFormat) {
      const meta = gisContentAppFormatRowMeta(details.appFormat)
      if (row.type !== meta.type || row.typeLabel !== meta.typeLabel) {
        changed = true
        return { ...row, ...meta }
      }
    }
    if (row.type === 'web-map' && row.typeLabel === 'Web map') {
      changed = true
      return { ...row, typeLabel: 'Web Map' }
    }
    if (row.type === 'feature-layer') {
      const snap = details?.hostedFeatureLayer
      const externalUrl = snap?.externalServiceUrl
      if (shouldReplaceNumericArcGisLayerTitle(row.title, externalUrl)) {
        const nextTitle = resolveHostedFeatureLayerPortalTitle({
          title: row.title,
          url: externalUrl,
          sourceMethod: snap?.sourceMethod,
        })
        if (nextTitle !== row.title) {
          changed = true
          return { ...row, title: nextTitle }
        }
      }
    }
    return row
  })
  return changed ? { ...persist, rows } : persist
}

function readPersist(): PortalPersist {
  if (typeof window === 'undefined') {
    return emptyPersist()
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return emptyPersist()
    }
    const parsed = JSON.parse(raw) as Partial<PortalPersist>
    const permanentlyDeleted = new Set(
      Array.isArray(parsed.permanentlyDeletedIds)
        ? parsed.permanentlyDeletedIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
        : [],
    )
    const storedRows = Array.isArray(parsed.rows) ? parsed.rows : []
    const byId = new Map<string, GisContentRow>()
    for (const seed of GIS_CONTENT_ROWS) {
      if (!permanentlyDeleted.has(seed.id)) byId.set(seed.id, { ...seed })
    }
    for (const row of storedRows) {
      if (!row?.id || permanentlyDeleted.has(row.id)) continue
      if (byId.has(row.id)) byId.set(row.id, { ...byId.get(row.id)!, ...row })
      else byId.set(row.id, row)
    }
    const customFolders = Array.isArray(parsed.customFolders)
      ? parsed.customFolders.filter(
          (f): f is GisContentFolder =>
            Boolean(f?.id && f?.name && !SYSTEM_FOLDER_IDS.has(f.id)),
        )
      : []
    const favoriteIds = Array.isArray(parsed.favoriteIds)
      ? parsed.favoriteIds.filter(id => !permanentlyDeleted.has(id))
      : []
    const itemDetails =
      parsed.itemDetails && typeof parsed.itemDetails === 'object' ? { ...parsed.itemDetails } : {}
    for (const id of permanentlyDeleted) delete itemDetails[id]
    const recycleOrigin =
      parsed.recycleOrigin && typeof parsed.recycleOrigin === 'object' ? { ...parsed.recycleOrigin } : {}
    for (const id of permanentlyDeleted) delete recycleOrigin[id]

    const merged = applyLegacyFolderPurge(
      applyLegacySeedPurge(
        migratePortalPersist(
          prunePersistForPermanentDeletes({
            rows: Array.from(byId.values()),
            favoriteIds,
            recycleOrigin,
            customFolders,
            folderOverrides:
              parsed.folderOverrides && typeof parsed.folderOverrides === 'object' ? parsed.folderOverrides : {},
            deletedFolderIds: Array.isArray(parsed.deletedFolderIds)
              ? parsed.deletedFolderIds.filter(
                  id =>
                    GIS_CONTENT_FOLDERS.some(f => f.id === id) ||
                    GIS_CONTENT_LEGACY_SEED_FOLDER_IDS.includes(
                      id as (typeof GIS_CONTENT_LEGACY_SEED_FOLDER_IDS)[number],
                    ),
                )
              : [],
            itemDetails,
            permanentlyDeletedIds: Array.from(permanentlyDeleted),
            mapRegistry:
              parsed.mapRegistry && typeof parsed.mapRegistry === 'object'
                ? normalizeGisContentMapRegistry(parsed.mapRegistry)
                : emptyGisContentMapRegistry(),
          }),
        ),
      ),
    )
    persistLegacySeedMigrationIfNeeded(storedRows, merged)
    return merged
  } catch {
    return emptyPersist()
  }
}

function writePersist(state: PortalPersist, changeDetail?: GisContentRepositoryChangeDetail) {
  if (typeof window === 'undefined') return
  try {
    const mergedDeleted = parseStoredPermanentlyDeletedIds(localStorage.getItem(STORAGE_KEY))
    for (const id of state.permanentlyDeletedIds ?? []) mergedDeleted.add(id)
    const next = prunePersistForPermanentDeletes({
      ...state,
      permanentlyDeletedIds: Array.from(mergedDeleted),
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    cache = next
  } catch {
    /* ignore quota */
  }
  if (changeDetail) emitRepositoryChange(changeDetail)
  else emit()
}

let cache = readPersist()

/** Test-only: reset in-memory portal state after localStorage is cleared. */
export function resetGisContentPortalForTests(): void {
  cache = emptyPersist()
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

/** Test-only: load legacy demo rows into portal for unit tests. */
export function seedGisContentPortalFixtureRowsForTests(): void {
  cache = {
    ...emptyPersist(),
    rows: GIS_CONTENT_TEST_FIXTURE_ROWS.map(row => ({ ...row })),
    favoriteIds: ['4'],
    permanentlyDeletedIds: [],
  }
  emit()
}

/** Test-only: reload portal cache from localStorage (simulates page refresh). */
export function reloadGisContentPortalFromStorageForTests(): void {
  cache = readPersist()
}

function refreshCache() {
  cache = readPersist()
}

export function subscribeGisContentPortal(listener: Listener): () => void {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      refreshCache()
      listener()
    }
  }
  const onCustom = () => {
    refreshCache()
    listener()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage)
    window.addEventListener(GIS_CONTENT_REPOSITORY_EVENT, onCustom)
  }
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(GIS_CONTENT_REPOSITORY_EVENT, onCustom)
    }
  }
}

function normalizeGisContentMapRegistry(raw: Partial<GisContentMapRegistry>): GisContentMapRegistry {
  const activeItemIds = Array.isArray(raw.activeItemIds)
    ? raw.activeItemIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  const configs =
    raw.configs && typeof raw.configs === 'object' ? { ...raw.configs } : {}
  const groups = Array.isArray(raw.groups)
    ? raw.groups.filter(
        (g): g is GisContentMapRegistry['groups'][number] =>
          Boolean(g && typeof g.id === 'string' && typeof g.name === 'string'),
      )
    : []
  return { activeItemIds, configs, groups }
}

function ensureMapRegistry(): GisContentMapRegistry {
  if (!cache.mapRegistry) cache = { ...cache, mapRegistry: emptyGisContentMapRegistry() }
  return cache.mapRegistry!
}

export function getGisContentMapRegistry(): GisContentMapRegistry {
  const registry = ensureMapRegistry()
  return { ...registry, configs: { ...registry.configs }, groups: [...registry.groups] }
}

export function getGisContentPortalItemDetailsMap(): Record<string, GisContentItemDetails> {
  return { ...cache.itemDetails }
}

export function getGisContentMapLayerConfig(itemId: string): GisContentMapLayerConfig {
  const registry = ensureMapRegistry()
  const index = registry.activeItemIds.indexOf(itemId)
  return resolveGisContentMapLayerConfig(itemId, registry, index >= 0 ? index : registry.activeItemIds.length)
}

export function registerGisContentMapLayer(
  itemId: string,
  patch?: Partial<GisContentMapLayerConfig>,
): GisContentMapLayerConfig {
  const row = getGisContentRowById(itemId)
  if (!row || isGisContentRowInRecycle(row)) {
    return defaultGisContentMapLayerConfig()
  }
  const registry = ensureMapRegistry()
  const nextIds = registry.activeItemIds.includes(itemId)
    ? [...registry.activeItemIds]
    : [...registry.activeItemIds, itemId]
  const order = nextIds.indexOf(itemId)
  const base = resolveGisContentMapLayerConfig(itemId, registry, order)
  const config = mergeGisContentMapLayerConfig(base, { ...patch, visible: true, order })
  const configs = { ...registry.configs, [itemId]: config }
  const itemDetails = {
    ...cache.itemDetails,
    [itemId]: {
      ...(cache.itemDetails[itemId] ?? {}),
      mapLayerConfig: config,
    },
  }
  cache = {
    ...cache,
    mapRegistry: { ...registry, activeItemIds: nextIds, configs },
    itemDetails,
  }
  writePersist(cache, { scope: 'map-registry', action: 'add', itemIds: [itemId] })
  return config
}

export function unregisterGisContentMapLayer(itemId: string): void {
  const registry = ensureMapRegistry()
  if (!registry.activeItemIds.includes(itemId)) return
  const activeItemIds = registry.activeItemIds.filter(id => id !== itemId)
  const configs = { ...registry.configs }
  if (configs[itemId]) {
    configs[itemId] = { ...configs[itemId], visible: false }
  }
  cache = { ...cache, mapRegistry: { ...registry, activeItemIds, configs } }
  writePersist(cache, { scope: 'map-registry', action: 'delete', itemIds: [itemId] })
}

export function updateGisContentMapLayerConfig(
  itemId: string,
  patch: Partial<GisContentMapLayerConfig>,
): GisContentMapLayerConfig {
  const registry = ensureMapRegistry()
  const order = registry.activeItemIds.indexOf(itemId)
  const base = resolveGisContentMapLayerConfig(itemId, registry, order >= 0 ? order : registry.activeItemIds.length)
  const config = mergeGisContentMapLayerConfig(base, patch)
  const configs = { ...registry.configs, [itemId]: config }
  const activeItemIds = registry.activeItemIds.includes(itemId)
    ? registry.activeItemIds
    : config.visible
      ? [...registry.activeItemIds, itemId]
      : registry.activeItemIds
  const itemDetails = {
    ...cache.itemDetails,
    [itemId]: {
      ...(cache.itemDetails[itemId] ?? {}),
      mapLayerConfig: config,
    },
  }
  cache = {
    ...cache,
    mapRegistry: { ...registry, activeItemIds, configs },
    itemDetails,
  }
  writePersist(cache, { scope: 'map-registry', action: 'update', itemIds: [itemId] })
  return config
}

export function reorderGisContentMapLayers(orderedIds: string[]): void {
  const registry = ensureMapRegistry()
  const seen = new Set<string>()
  const activeItemIds: string[] = []
  for (const id of orderedIds) {
    if (!registry.activeItemIds.includes(id) || seen.has(id)) continue
    seen.add(id)
    activeItemIds.push(id)
  }
  for (const id of registry.activeItemIds) {
    if (!seen.has(id)) activeItemIds.push(id)
  }
  const configs = { ...registry.configs }
  activeItemIds.forEach((id, index) => {
    const prev = resolveGisContentMapLayerConfig(id, registry, index)
    configs[id] = { ...prev, order: index }
  })
  cache = { ...cache, mapRegistry: { ...registry, activeItemIds, configs } }
  writePersist(cache, { scope: 'map-registry', action: 'reorder', itemIds: activeItemIds })
}

function pruneMapRegistryForDeletedIds(deletedIds: Set<string>): GisContentMapRegistry | undefined {
  const registry = cache.mapRegistry
  if (!registry) return undefined
  const activeItemIds = registry.activeItemIds.filter(id => !deletedIds.has(id))
  const configs = { ...registry.configs }
  for (const id of deletedIds) delete configs[id]
  return { ...registry, activeItemIds, configs }
}

export function getGisContentPortalRows(): GisContentRow[] {
  return cache.rows.map(r => ({ ...r }))
}

export function getGisContentRowById(id: string): GisContentRow | undefined {
  return cache.rows.find(r => r.id === id)
}

export function getGisContentPortalFavorites(): Set<string> {
  return new Set(cache.favoriteIds)
}

export function isGisContentRowInRecycle(row: GisContentRow): boolean {
  return row.folderId === GIS_CONTENT_RECYCLE_FOLDER
}

export function filterGisContentRowsForFolder(
  rows: GisContentRow[],
  folderId: string,
): GisContentRow[] {
  if (folderId === GIS_CONTENT_RECYCLE_FOLDER) {
    return rows.filter(r => r.folderId === GIS_CONTENT_RECYCLE_FOLDER)
  }
  if (folderId === 'all') {
    return rows.filter(r => r.folderId !== GIS_CONTENT_RECYCLE_FOLDER)
  }
  return rows.filter(r => r.folderId === folderId)
}

export function getGisContentPortalFolders(): GisContentFolder[] {
  const seedIds = new Set(GIS_CONTENT_FOLDERS.map(f => f.id))
  const custom = (cache.customFolders ?? []).filter(f => !seedIds.has(f.id))
  const deleted = new Set(cache.deletedFolderIds ?? [])
  const overrides = cache.folderOverrides ?? {}
  const all = GIS_CONTENT_FOLDERS.find(f => f.id === 'all')!
  const recycle = GIS_CONTENT_FOLDERS.find(f => f.id === 'recycle')!
  const builtIn = GIS_CONTENT_FOLDERS.filter(f => f.id !== 'all' && f.id !== 'recycle' && !deleted.has(f.id)).map(
    folder => {
      const patch = overrides[folder.id]
      if (!patch) return { ...folder }
      return {
        ...folder,
        ...patch,
        id: folder.id,
        parentId: folder.parentId,
      }
    },
  )
  return [all, ...builtIn, ...custom, recycle]
}

function resolveFolderById(id: string): GisContentFolder | undefined {
  return getGisContentPortalFolders().find(f => f.id === id)
}

export function createGisContentPortalFolder(
  name: string,
  color: GisContentFolderColor = 'default',
): { folder: GisContentFolder } | { error: string } {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Enter a folder name.' }

  const existing = getGisContentPortalFolders()
  if (existing.some(f => f.name.localeCompare(trimmed, undefined, { sensitivity: 'accent' }) === 0)) {
    return { error: 'A folder with this name already exists.' }
  }

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const id = `custom-${slug || 'folder'}-${Date.now()}`
  const folder: GisContentFolder = { id, name: trimmed, parentId: null, color }
  cache = { ...cache, customFolders: [...(cache.customFolders ?? []), folder] }
  writePersist(cache)
  return { folder }
}

export function updateGisContentPortalFolder(
  id: string,
  patch: { name?: string; color?: GisContentFolderColor },
): { folder: GisContentFolder } | { error: string } {
  if (SYSTEM_FOLDER_IDS.has(id)) {
    return { error: 'This folder cannot be edited.' }
  }

  if (isGisContentPortalCustomFolderId(id)) {
    const idx = (cache.customFolders ?? []).findIndex(f => f.id === id)
    if (idx < 0) return { error: 'Folder not found.' }

    const current = cache.customFolders[idx]
    const nextName = patch.name !== undefined ? patch.name.trim() : current.name
    if (!nextName) return { error: 'Enter a folder name.' }

    if (patch.name !== undefined) {
      const duplicate = getGisContentPortalFolders().some(
        f => f.id !== id && f.name.localeCompare(nextName, undefined, { sensitivity: 'accent' }) === 0,
      )
      if (duplicate) return { error: 'A folder with this name already exists.' }
    }

    const folder: GisContentFolder = {
      ...current,
      name: nextName,
      color: patch.color ?? current.color ?? 'default',
    }
    const customFolders = [...cache.customFolders]
    customFolders[idx] = folder
    cache = { ...cache, customFolders }
    writePersist(cache)
    return { folder }
  }

  const seed = GIS_CONTENT_FOLDERS.find(f => f.id === id)
  if (!seed || (cache.deletedFolderIds ?? []).includes(id)) {
    return { error: 'Folder not found.' }
  }

  const current = resolveFolderById(id) ?? seed
  const nextName = patch.name !== undefined ? patch.name.trim() : current.name
  if (!nextName) return { error: 'Enter a folder name.' }

  if (patch.name !== undefined) {
    const duplicate = getGisContentPortalFolders().some(
      f => f.id !== id && f.name.localeCompare(nextName, undefined, { sensitivity: 'accent' }) === 0,
    )
    if (duplicate) return { error: 'A folder with this name already exists.' }
  }

  const folder: GisContentFolder = {
    ...seed,
    name: nextName,
    color: patch.color ?? current.color ?? 'default',
  }
  cache = {
    ...cache,
    folderOverrides: {
      ...(cache.folderOverrides ?? {}),
      [id]: { name: folder.name, color: folder.color },
    },
  }
  writePersist(cache)
  return { folder }
}

export function deleteGisContentPortalFolder(id: string): { ok: true } | { error: string } {
  if (SYSTEM_FOLDER_IDS.has(id)) {
    return { error: 'This folder cannot be deleted.' }
  }

  if (isGisContentPortalCustomFolderId(id)) {
    if (!(cache.customFolders ?? []).some(f => f.id === id)) {
      return { error: 'Folder not found.' }
    }
    const rows = cache.rows.map(r => (r.folderId === id ? { ...r, folderId: 'all' } : r))
    const customFolders = (cache.customFolders ?? []).filter(f => f.id !== id)
    cache = { ...cache, rows, customFolders }
    writePersist(cache)
    return { ok: true }
  }

  const seed = GIS_CONTENT_FOLDERS.find(f => f.id === id)
  if (!seed || (cache.deletedFolderIds ?? []).includes(id)) {
    return { error: 'Folder not found.' }
  }

  const rows = cache.rows.map(r => (r.folderId === id ? { ...r, folderId: 'all' } : r))
  const deletedFolderIds = [...(cache.deletedFolderIds ?? []), id]
  cache = { ...cache, rows, deletedFolderIds }
  writePersist(cache)
  return { ok: true }
}

export function moveGisContentRowsToFolder(rowIds: string[], folderId: string): number {
  if (folderId === 'all' || folderId === GIS_CONTENT_RECYCLE_FOLDER) return 0
  const validFolder = getGisContentPortalFolders().some(f => f.id === folderId)
  if (!validFolder) return 0

  let moved = 0
  const idSet = new Set(rowIds)
  const recycleOrigin = { ...cache.recycleOrigin }
  const rows = cache.rows.map(r => {
    if (!idSet.has(r.id) || r.folderId === folderId) return r
    moved += 1
    if (r.folderId === GIS_CONTENT_RECYCLE_FOLDER) delete recycleOrigin[r.id]
    return {
      ...r,
      folderId,
      modified: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }
  })
  if (moved > 0) {
    cache = { ...cache, rows, recycleOrigin }
    writePersist(cache)
  }
  return moved
}

export function getGisContentItemDetails(id: string): GisContentItemDetails {
  return { ...(cache.itemDetails?.[id] ?? {}) }
}

export function updateGisContentItemDetails(
  id: string,
  patch: Partial<GisContentItemDetails>,
): GisContentItemDetails {
  const next = { ...(cache.itemDetails?.[id] ?? {}), ...patch }
  cache = { ...cache, itemDetails: { ...cache.itemDetails, [id]: next } }
  writePersist(cache)
  return next
}

export function incrementGisContentItemViewCount(id: string): number {
  const current = cache.itemDetails?.[id]?.viewCount ?? 1200 + Number.parseInt(id, 10) * 47
  const viewCount = current + 1
  updateGisContentItemDetails(id, { viewCount })
  return viewCount
}

export function addGisContentItemComment(id: string, text: string): GisContentItemComment | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const comment: GisContentItemComment = {
    id: `c-${Date.now()}`,
    text: trimmed,
    at: new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
  }
  const prev = cache.itemDetails?.[id]?.comments ?? []
  updateGisContentItemDetails(id, { comments: [...prev, comment] })
  return comment
}

export function updateGisContentRow(id: string, patch: Partial<GisContentRow>): GisContentRow | null {
  const row = cache.rows.find(r => r.id === id)
  if (!row) return null
  const rows = cache.rows.map(r => (r.id === id ? { ...r, ...patch } : r))
  cache = { ...cache, rows }
  writePersist(cache)
  return rows.find(r => r.id === id) ?? null
}

export function upsertGisContentPortalApp(input: {
  id?: string
  title: string
  sharing?: GisContentRow['sharing']
  folderId?: string
  format?: GisContentAppFormat
}): GisContentRow {
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const id = input.id?.trim() || `app-${Date.now()}`
  const existing = cache.rows.find(r => r.id === id)
  const format = input.format ?? 'dashboard'
  const typeMeta = gisContentAppFormatRowMeta(format)
  const row: GisContentRow = {
    id,
    title: input.title.trim() || 'Untitled dashboard',
    ...typeMeta,
    modified: now,
    created: existing?.created ?? now,
    sharing: input.sharing ?? existing?.sharing ?? 'organization',
    folderId: input.folderId ?? existing?.folderId ?? 'all',
    owner: existing?.owner ?? GIS_CONTENT_DEFAULT_OWNER,
  }
  const rows = existing ? cache.rows.map(r => (r.id === id ? row : r)) : [...cache.rows, row]
  const itemDetails = {
    ...cache.itemDetails,
    [id]: { ...(cache.itemDetails[id] ?? {}), appFormat: format },
  }
  cache = { ...cache, rows, itemDetails }
  writePersist(cache)
  return row
}

export function upsertGisContentPortalWebMap(input: {
  id?: string
  title: string
  snapshot: import('./gisWebMapPortal').GisWebMapSnapshotV1
  sharing?: GisContentRow['sharing']
  folderId?: string
}): GisContentRow {
  const merged = mergeGisWebMapPortalRow(cache.rows, cache.itemDetails, input)
  cache = { ...cache, rows: merged.rows, itemDetails: merged.itemDetails }
  writePersist(cache)
  emit()
  return merged.row
}

export function upsertGisContentPortalHostedFeatureLayer(input: {
  id?: string
  title: string
  geojson: import('./gisHostedFeatureLayerPortal').GisHostedFeatureLayerGeoJson
  sourceMethod: import('./gisHostedFeatureLayerPortal').GisHostedFeatureLayerSourceMethod
  geometryType?: import('./gisHostedFeatureLayerPortal').GisHostedFeatureLayerGeometryType
  sourceFileName?: string
  externalServiceUrl?: string
  sharing?: GisContentRow['sharing']
  folderId?: string
}): GisContentRow {
  const title = resolveHostedFeatureLayerPortalTitle({
    title: input.title,
    url: input.externalServiceUrl,
    sourceMethod: input.sourceMethod,
  })
  const merged = mergeGisHostedFeatureLayerPortalRow(cache.rows, cache.itemDetails, {
    ...input,
    title,
  })
  cache = { ...cache, rows: merged.rows, itemDetails: merged.itemDetails }
  writePersist(cache)
  emit()
  return merged.row
}

/** Persist a portal catalog item (ArcGIS Content–style; survives refresh until user deletes). */
export function upsertGisContentPortalItem(input: {
  id?: string
  title: string
  type: import('../pages/master/gisContentPortalData').GisContentItemType
  typeLabel: string
  sharing?: GisContentRow['sharing']
  folderId?: string
  details?: Partial<GisContentItemDetails>
}): GisContentRow {
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const slug = input.type.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'item'
  const id = input.id?.trim() || `${slug}-${Date.now()}`
  const existing = cache.rows.find(r => r.id === id)
  const row: GisContentRow = {
    id,
    title: input.title.trim() || 'Untitled item',
    type: input.type,
    typeLabel: input.typeLabel,
    modified: now,
    created: existing?.created ?? now,
    sharing: input.sharing ?? existing?.sharing ?? 'organization',
    folderId: input.folderId ?? existing?.folderId ?? 'all',
    owner: existing?.owner ?? GIS_CONTENT_DEFAULT_OWNER,
  }
  const rows = existing ? cache.rows.map(r => (r.id === id ? row : r)) : [...cache.rows, row]
  const itemDetails = {
    ...cache.itemDetails,
    [id]: {
      ...(cache.itemDetails[id] ?? {}),
      ...(input.details ?? {}),
      description:
        input.details?.description ??
        `Published to My content on ${now}. Items remain here until you move them to the Recycle bin and delete permanently.`,
    },
  }
  cache = { ...cache, rows, itemDetails }
  writePersist(cache)
  return row
}

export function publishHostedFeatureLayerFromWizard(result: {
  method: import('./gisHostedFeatureLayerPortal').GisHostedFeatureLayerSourceMethod
  title: string
  geometryType?: import('./gisHostedFeatureLayerPortal').GisHostedFeatureLayerGeometryType
  url?: string
  fileName?: string
  geojson?: import('./gisHostedFeatureLayerPortal').GisHostedFeatureLayerGeoJson
}): GisContentRow {
  const geojson =
    result.geojson ??
    emptyHostedFeatureLayerGeoJson(result.geometryType ?? 'polygon')
  const title = resolveHostedFeatureLayerPortalTitle({
    title: result.title,
    url: result.url,
    sourceMethod: result.method,
  })
  return upsertGisContentPortalHostedFeatureLayer({
    title,
    geojson,
    sourceMethod: result.method,
    geometryType: result.geometryType,
    sourceFileName: result.fileName,
    externalServiceUrl: result.url,
  })
}

export function setGisContentFavorite(id: string, favorite: boolean): void {
  const next = new Set(cache.favoriteIds)
  if (favorite) next.add(id)
  else next.delete(id)
  cache = { ...cache, favoriteIds: Array.from(next) }
  writePersist(cache)
}

function touchModified(row: GisContentRow): GisContentRow {
  return {
    ...row,
    modified: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  }
}

export function bulkUpdateGisContentRows(rowIds: string[], patch: Partial<GisContentRow>): number {
  const idSet = new Set(rowIds)
  let updated = 0
  const rows = cache.rows.map(r => {
    if (!idSet.has(r.id)) return r
    updated += 1
    return touchModified({ ...r, ...patch })
  })
  if (updated > 0) {
    cache = { ...cache, rows }
    writePersist(cache)
  }
  return updated
}

export function moveGisContentRowsToRecycleBin(rowIds: string[]): { moved: number; skippedProtected: number } {
  let moved = 0
  let skippedProtected = 0
  for (const id of rowIds) {
    const row = cache.rows.find(r => r.id === id)
    if (!row || row.folderId === GIS_CONTENT_RECYCLE_FOLDER) continue
    if (row.deleteProtected) {
      skippedProtected += 1
      continue
    }
    if (moveGisContentToRecycleBin(id)) moved += 1
  }
  return { moved, skippedProtected }
}

export function permanentlyDeleteGisContentRows(rowIds: string[]): number {
  const idSet = new Set(rowIds)
  const toDelete = cache.rows.filter(
    r => idSet.has(r.id) && r.folderId === GIS_CONTENT_RECYCLE_FOLDER,
  )
  if (!toDelete.length) return 0

  const deletedIds = new Set(toDelete.map(r => r.id))
  const permanentlyDeletedIds = new Set(cache.permanentlyDeletedIds ?? [])
  for (const id of deletedIds) permanentlyDeletedIds.add(id)

  const rows = cache.rows.filter(r => !deletedIds.has(r.id))
  const recycleOrigin = { ...cache.recycleOrigin }
  for (const id of deletedIds) delete recycleOrigin[id]
  const favoriteIds = cache.favoriteIds.filter(id => !deletedIds.has(id))
  const itemDetails = { ...cache.itemDetails }
  for (const id of deletedIds) delete itemDetails[id]

  const mapRegistry = pruneMapRegistryForDeletedIds(deletedIds)

  cache = {
    ...cache,
    rows,
    recycleOrigin,
    favoriteIds,
    itemDetails,
    permanentlyDeletedIds: Array.from(permanentlyDeletedIds),
    ...(mapRegistry ? { mapRegistry } : {}),
  }
  writePersist(cache)
  return toDelete.length
}

function resolveGisContentFolderId(folderId: string): string {
  if (folderId === GIS_CONTENT_RECYCLE_FOLDER || LEGACY_SEED_FOLDER_ID_SET.has(folderId)) return 'all'
  return folderId
}

/** Soft-delete: always moves to Recycle bin (also used for Delete menu action). */
export function moveGisContentToRecycleBin(id: string): GisContentRow | null {
  const row = cache.rows.find(r => r.id === id)
  if (!row || row.folderId === GIS_CONTENT_RECYCLE_FOLDER || row.deleteProtected) return null
  const recycleOrigin = { ...cache.recycleOrigin, [id]: resolveGisContentFolderId(row.folderId) }
  const rows = cache.rows.map(r =>
    r.id === id
      ? {
          ...r,
          folderId: GIS_CONTENT_RECYCLE_FOLDER,
          modified: new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        }
      : r,
  )
  cache = { ...cache, rows, recycleOrigin }
  writePersist(cache)
  return rows.find(r => r.id === id) ?? null
}

export function restoreGisContentFromRecycleBin(id: string): GisContentRow | null {
  const row = cache.rows.find(r => r.id === id)
  if (!row || row.folderId !== GIS_CONTENT_RECYCLE_FOLDER) return null
  const origin = resolveGisContentFolderId(cache.recycleOrigin[id] ?? 'all')
  const recycleOrigin = { ...cache.recycleOrigin }
  delete recycleOrigin[id]
  const rows = cache.rows.map(r =>
    r.id === id ? { ...r, folderId: origin } : r,
  )
  cache = { ...cache, rows, recycleOrigin }
  writePersist(cache)
  return rows.find(r => r.id === id) ?? null
}

export type GisContentMapLayerPayload = {
  id: string
  name: string
  geojson: ReturnType<typeof gisPortalRowDemoGeoJson>
  sourceUrl: string
  portalRowId: string
  mapLayerConfig?: GisContentMapLayerConfig
}

export function buildGisContentMapLayerPayload(row: GisContentRow): GisContentMapLayerPayload {
  const geojson = hostedFeatureLayerGeoJsonForRow(row)
  const mapLayerConfig = getGisContentMapLayerConfig(row.id)
  return {
    id: `portal-${row.id}-${Date.now()}`,
    name: row.title,
    geojson,
    sourceUrl: `gis-content://${row.id}`,
    portalRowId: row.id,
    mapLayerConfig,
  }
}

/** Refresh hosted layer snapshot from its external ArcGIS service, then build map payload. */
export async function refreshGisContentHostedFeatureLayerFromSource(rowId: string): Promise<GisContentRow | null> {
  const row = getGisContentRowById(rowId)
  if (!row || isGisContentRowInRecycle(row)) return null
  if (!hasHostedFeatureLayerLiveSource(row)) return row
  const { geojson, externalServiceUrl } = await fetchHostedFeatureLayerLiveGeoJson(row)
  if (!externalServiceUrl || !geojson.features.length) return row
  const snap = readGisHostedFeatureLayerSnapshot(getGisContentItemDetails(rowId))
  const cachedGeojson = snap?.geojson
  if (
    cachedGeojson?.features?.length &&
    snap?.externalServiceUrl === externalServiceUrl &&
    JSON.stringify(cachedGeojson) === JSON.stringify(geojson)
  ) {
    return row
  }
  return upsertGisContentPortalHostedFeatureLayer({
    id: rowId,
    title: row.title,
    geojson,
    sourceMethod: snap?.sourceMethod ?? 'arcgis-url',
    geometryType: snap?.geometryType,
    sourceFileName: snap?.sourceFileName,
    externalServiceUrl,
  })
}

export async function buildGisContentMapLayerPayloadAsync(
  row: GisContentRow,
  options?: { refreshFromSource?: boolean },
): Promise<GisContentMapLayerPayload> {
  const refreshFromSource = options?.refreshFromSource !== false
  let resolvedRow = row
  if (refreshFromSource && hasHostedFeatureLayerLiveSource(row)) {
    try {
      const refreshed = await refreshGisContentHostedFeatureLayerFromSource(row.id)
      if (refreshed) resolvedRow = refreshed
    } catch {
      /* keep cached snapshot */
    }
  }
  const geojson = hostedFeatureLayerGeoJsonForRow(resolvedRow)
  return {
    id: `portal-${row.id}-${Date.now()}`,
    name: resolvedRow.title,
    geojson,
    sourceUrl: `gis-content://${row.id}`,
    portalRowId: row.id,
  }
}

export function useGisContentPortal() {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeGisContentPortal(() => setVersion(v => v + 1)), [])
  return useMemo(
    () => ({
      version,
      rows: getGisContentPortalRows(),
      folders: getGisContentPortalFolders(),
      favorites: getGisContentPortalFavorites(),
      moveToRecycleBin: moveGisContentToRecycleBin,
      restoreFromRecycleBin: restoreGisContentFromRecycleBin,
      createFolder: createGisContentPortalFolder,
      updateFolder: updateGisContentPortalFolder,
      deleteFolder: deleteGisContentPortalFolder,
      isCustomFolder: isGisContentPortalCustomFolderId,
      moveRowsToFolder: moveGisContentRowsToFolder,
      moveRowsToRecycleBin: moveGisContentRowsToRecycleBin,
      permanentlyDeleteRows: permanentlyDeleteGisContentRows,
      bulkUpdateRows: bulkUpdateGisContentRows,
      setFavorite: setGisContentFavorite,
      getRowById: getGisContentRowById,
      getItemDetails: getGisContentItemDetails,
      updateItemDetails: updateGisContentItemDetails,
      incrementViewCount: incrementGisContentItemViewCount,
      addItemComment: addGisContentItemComment,
      updateRow: updateGisContentRow,
      upsertApp: upsertGisContentPortalApp,
      getMapRegistry: getGisContentMapRegistry,
      registerMapLayer: registerGisContentMapLayer,
      unregisterMapLayer: unregisterGisContentMapLayer,
      updateMapLayerConfig: updateGisContentMapLayerConfig,
      reorderMapLayers: reorderGisContentMapLayers,
      getMapLayerConfig: getGisContentMapLayerConfig,
      itemDetailsMap: getGisContentPortalItemDetailsMap(),
    }),
    [version],
  )
}
