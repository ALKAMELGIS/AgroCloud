/**
 * One-time move of an existing PostgreSQL identity database into SQLite.
 *
 * Copies every identity table row for row (ids, password hashes, sessions, wallets and ledgers
 * included), converting values the way the SQLite layer stores them. The SQLite identity tables are
 * cleared first — they only hold the default seed on a fresh install — so the PostgreSQL ids win.
 * It refuses to run when SQLite already has users unless `force` is set.
 */
import { getDatabase } from './connection.js'
import { runMigrations } from './migrate.js'

/** Parent tables before children, so the foreign-key check at the end passes. */
export const IDENTITY_TABLES = [
  'organizations',
  'permissions',
  'roles',
  'role_permissions',
  'users',
  'sessions',
  'password_reset_tokens',
  'manpower_allocations',
  'manpower_transactions',
  'audit_logs',
  'user_resource_assignments',
  'wallets',
  'credit_transactions',
]

function toSqlite(v) {
  if (v === undefined || v === null) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'bigint') return v.toString()
  if (Buffer.isBuffer(v)) return v
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

/**
 * @param {{ query: (sql: string) => Promise<{ rows: object[] }> }} source connected pg client
 * @param {{ force?: boolean, log?: (msg: string) => void }} [opts]
 * @returns {Promise<Record<string, number>>} rows copied per table
 */
export async function importFromPostgres(source, { force = false, log = () => {} } = {}) {
  runMigrations()
  const db = getDatabase()
  const existing = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  if (existing > 0 && !force) {
    throw new Error(`SQLite already has ${existing} identity user(s). Re-run with --force to replace them.`)
  }

  // Read everything first, so a PostgreSQL error leaves SQLite untouched.
  const data = {}
  for (const table of IDENTITY_TABLES) {
    const exists = await source.query(`SELECT to_regclass('public.${table}') AS t`)
    data[table] = exists.rows[0]?.t ? (await source.query(`SELECT * FROM ${table}`)).rows : []
  }

  const counts = {}
  db.pragma('foreign_keys = OFF') // self-references (users.parent_user_id) are inserted in any order
  try {
    db.transaction(() => {
      for (const table of [...IDENTITY_TABLES].reverse()) db.prepare(`DELETE FROM ${table}`).run()
      for (const table of IDENTITY_TABLES) {
        const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name))
        let n = 0
        for (const row of data[table]) {
          const keys = Object.keys(row).filter((k) => columns.has(k))
          const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
          db.prepare(sql).run(...keys.map((k) => toSqlite(row[k])))
          n++
        }
        counts[table] = n
        log(`${table}: ${n}`)
      }
      const problems = db.prepare('PRAGMA foreign_key_check').all()
      if (problems.length) {
        throw new Error(`foreign key check failed after import: ${JSON.stringify(problems.slice(0, 5))}`)
      }
    })()
  } finally {
    db.pragma('foreign_keys = ON')
  }
  return counts
}
