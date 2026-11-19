/**
 * Identity / RBAC / manpower / credits storage — backed by the shared SQLite database
 * (server/database). Kept as the identity module's single entry point so the services keep one
 * import; it no longer needs a separate database server.
 *
 * Identity is opt-in, as it was with PostgreSQL: set AGROCLOUD_IDENTITY=on. Deployments that had it
 * on through DATABASE_URL keep it on (import their data with `npm run db:import-postgres`).
 * When it is off the API uses the admin-directory document for auth; the identity tables still exist.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDatabase, getDatabase, pool } from '../database/connection.js'
import { getMigrationGeneration, runMigrations as applyMigrations } from '../database/migrate.js'

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let identityReady = false

export { getMigrationGeneration }

export function isIdentityConfigured() {
  const flag = String(process.env.AGROCLOUD_IDENTITY || '').trim().toLowerCase()
  if (['on', 'true', '1', 'yes'].includes(flag)) return true
  if (['off', 'false', '0', 'no'].includes(flag)) return false
  return Boolean(String(process.env.DATABASE_URL || '').trim())
}

export function getPool() {
  return isIdentityConfigured() ? pool : null
}

export function isIdentityReady() {
  return identityReady
}

export function setIdentityReady(value) {
  identityReady = Boolean(value)
}

export async function closePool() {
  closeDatabase()
  identityReady = false
}

/** Applies pending migrations. The optional client argument is accepted for older callers. */
export async function runMigrations(_client) {
  return applyMigrations()
}

export async function initIdentityDatabase() {
  if (!isIdentityConfigured()) {
    setIdentityReady(false)
    return false
  }
  // Schema migrations are part of startup: SQLite lives with the app, so there is no separate
  // migration step to forget. IDENTITY_AUTO_MIGRATE=false opts out (schema must then exist).
  if (String(process.env.IDENTITY_AUTO_MIGRATE || '').toLowerCase() !== 'false') applyMigrations()
  const hasUsers = getDatabase()
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users' LIMIT 1`)
    .get()
  setIdentityReady(Boolean(hasUsers))
  if (identityReady) await importDirectoryIfEmpty()
  return identityReady
}

/**
 * First start with identity on and no users: carry existing data over so nobody is locked out —
 * from the old PostgreSQL database when DATABASE_URL is still set, otherwise from the admin directory.
 */
async function importDirectoryIfEmpty() {
  const { rows } = await pool.query('SELECT COUNT(*) AS n FROM users')
  if (rows[0].n > 0) return
  if (String(process.env.DATABASE_URL || '').trim() && (await importPostgresOnce())) return
  const [{ importAdminDirectory }, { resolveAgriDataPaths }] = await Promise.all([
    import('./importDirectory.js'),
    import('../loadProductionEnv.js'),
  ])
  const { adminDirectoryFile } = resolveAgriDataPaths(SERVER_DIR)
  try {
    const result = await importAdminDirectory(adminDirectoryFile)
    if (result.imported) console.info(`[identity] imported ${result.imported} admin-directory user(s) into identity`)
  } catch (e) {
    console.error('[identity] admin-directory import failed — identity starts without those users', e)
  }
}

async function importPostgresOnce() {
  const [{ default: pg }, { importFromPostgres }] = await Promise.all([import('pg'), import('../database/importPostgres.js')])
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
  })
  try {
    await client.connect()
    const counts = await importFromPostgres(client)
    console.info(`[identity] imported PostgreSQL identity data into SQLite (${counts.users} users). DATABASE_URL can now be removed.`)
    return counts.users > 0
  } catch (e) {
    console.error('[identity] PostgreSQL import failed — falling back to the admin directory', e.message || e)
    return false
  } finally {
    await client.end().catch(() => {})
  }
}
