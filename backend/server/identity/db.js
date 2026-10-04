/**
 * PostgreSQL pool for identity / manpower (optional when DATABASE_URL unset).
 */
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(__dirname, '../../migrations')

let pool = null
let identityReady = false

export function isIdentityConfigured() {
  return Boolean(String(process.env.DATABASE_URL || '').trim())
}

export function getPool() {
  if (!isIdentityConfigured()) return null
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.IDENTITY_PG_POOL_MAX || 10),
    })
  }
  return pool
}

export function isIdentityReady() {
  return identityReady
}

export function setIdentityReady(value) {
  identityReady = Boolean(value)
}

export async function closePool() {
  if (pool) {
    await pool.end()
    pool = null
  }
  identityReady = false
}

async function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

export async function runMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS identity_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  const files = await migrationFiles()
  for (const file of files) {
    const { rows } = await client.query('SELECT 1 FROM identity_migrations WHERE name = $1', [file])
    if (rows.length) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    await client.query('BEGIN')
    try {
      await client.query(sql)
      await client.query('INSERT INTO identity_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.info('[identity] applied migration', file)
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    }
  }
}

export async function initIdentityDatabase() {
  if (!isIdentityConfigured()) {
    setIdentityReady(false)
    return false
  }
  const p = getPool()
  const client = await p.connect()
  try {
    const auto = String(process.env.IDENTITY_AUTO_MIGRATE || '').toLowerCase()
    const shouldMigrate =
      auto === 'true' || (auto !== 'false' && process.env.NODE_ENV !== 'production')
    if (shouldMigrate) {
      await runMigrations(client)
    }
    const { rows } = await client.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1`,
    )
    setIdentityReady(rows.length > 0)
    return identityReady
  } finally {
    client.release()
  }
}
