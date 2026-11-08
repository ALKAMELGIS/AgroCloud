/**
 * Named JSON documents in the `documents` table — replaces the loose JSON files the API used to
 * keep next to the code (API secrets, admin directory, user profiles, EC/pH entries, Esri dashboards,
 * weather-layer config).
 *
 * Each store is one row: `store` (key) → `value` (JSON). The first time a store is read, an existing
 * legacy JSON file is imported into the database (the file itself is left untouched as a backup), so
 * upgrading never loses data.
 *
 * Reads are synchronous (served from an in-process cache, filled from SQLite on first use), so the
 * callers' APIs did not change. Writes update the cache immediately and are persisted through the
 * shared `query()` path, which waits for any open identity transaction instead of writing inside it.
 * `flushDocuments()` resolves once every pending write is on disk.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDatabase, onDatabaseClose, query } from './connection.js'
import { runMigrations } from './migrate.js'

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** store → { value } (value is a plain JSON-compatible object/array, or undefined when absent) */
const cache = new Map()
/** store → promise of the last queued write */
const pending = new Map()
let schemaReady = false

function ensureSchema() {
  if (schemaReady) return
  const db = getDatabase()
  // Migrations normally run at startup; when a transaction is open they already have.
  if (!db.inTransaction) runMigrations()
  schemaReady = true
}

/**
 * Store key for a legacy file path: its base name (`agri_api_secrets`). Files outside the standard
 * data locations get their directory appended, so two different configured files never share a row.
 */
export function documentKeyForFile(filePath) {
  const abs = path.resolve(filePath)
  const base = path.basename(abs, '.json')
  const dir = path.dirname(abs)
  const standardDirs = [SERVER_DIR, path.join(SERVER_DIR, 'data')]
  const dataDir = String(process.env.AGRI_DATA_DIR || '').trim()
  if (dataDir) standardDirs.push(path.resolve(dataDir))
  return standardDirs.includes(dir) ? base : `${base}@${dir}`
}

function importLegacyFile(legacyFile) {
  if (!legacyFile || !fs.existsSync(legacyFile)) return undefined
  try {
    return JSON.parse(fs.readFileSync(legacyFile, 'utf8'))
  } catch (e) {
    console.error(`[documents] legacy file ${legacyFile} is not valid JSON — not imported`, e.message)
    return undefined
  }
}

function persist(store, { legacyFile = null, imported = false } = {}) {
  const prev = pending.get(store) || Promise.resolve()
  const next = prev
    .then(() => {
      const entry = cache.get(store)
      if (!entry || entry.value === undefined) return
      const now = new Date().toISOString()
      return query(
        `INSERT INTO documents (store, value, legacy_path, imported_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (store) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [store, JSON.stringify(entry.value), legacyFile, imported ? now : null, now],
      )
    })
    .catch((e) => console.error(`[documents] failed to save "${store}"`, e))
  pending.set(store, next)
  return next
}

/**
 * Read a document. Returns `{ exists, value }`; `value` is undefined when the store is empty.
 * @param {string} store
 * @param {{ legacyFile?: string }} [opts] JSON file to import on first read
 */
export function readDocument(store, { legacyFile } = {}) {
  const hit = cache.get(store)
  if (hit) return { exists: hit.value !== undefined, value: clone(hit.value) }
  ensureSchema()
  const row = getDatabase().prepare('SELECT value FROM documents WHERE store = ?').get(store)
  if (row) {
    const value = JSON.parse(row.value)
    cache.set(store, { value })
    return { exists: true, value: clone(value) }
  }
  const legacy = importLegacyFile(legacyFile)
  cache.set(store, { value: legacy })
  if (legacy !== undefined) {
    console.info(`[documents] imported ${legacyFile} → documents("${store}")`)
    persist(store, { legacyFile: path.resolve(legacyFile), imported: true })
  }
  return { exists: legacy !== undefined, value: clone(legacy) }
}

/** Replace a document's value. Returns a promise that resolves when it is saved. */
export function writeDocument(store, value, { legacyFile } = {}) {
  ensureSchema()
  cache.set(store, { value: clone(value) })
  return persist(store, { legacyFile: legacyFile ? path.resolve(legacyFile) : null })
}

/** Convenience wrappers for modules that are configured with a legacy file path. */
export function readFileDocument(filePath) {
  return readDocument(documentKeyForFile(filePath), { legacyFile: filePath })
}
export function writeFileDocument(filePath, value) {
  return writeDocument(documentKeyForFile(filePath), value, { legacyFile: filePath })
}

/** Wait for all queued writes. */
export async function flushDocuments() {
  await Promise.all([...pending.values()])
}

/** Drop the in-process cache (tests, or after closing the database). */
export function resetDocumentCache() {
  cache.clear()
  pending.clear()
  schemaReady = false
}

/** List stores (for diagnostics / the db:status script). */
export function listDocuments() {
  ensureSchema()
  return getDatabase()
    .prepare('SELECT store, legacy_path, imported_at, updated_at, length(value) AS bytes FROM documents ORDER BY store')
    .all()
}

onDatabaseClose(resetDocumentCache)

function clone(v) {
  return v === undefined ? undefined : structuredClone(v)
}
