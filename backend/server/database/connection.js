/**
 * AgroCloud database: one SQLite file for the whole API (identity, RBAC, credits, document stores).
 *
 * File location (first match wins):
 *   AGROCLOUD_DB_FILE   explicit path, or ':memory:'
 *   AGROCLOUD_DATA_DIR  directory → <dir>/agrocloud.sqlite  (AGRI_DATA_DIR is accepted too)
 *   default             backend/data/agrocloud.sqlite  (mount backend/data as a volume in Docker)
 * Under `node --test` (NODE_TEST_CONTEXT set) the default is an in-memory database per test process.
 *
 * Query API: `query(sql, params)` → `{ rows, rowCount }`, accepting PostgreSQL-style `$1, $2…`
 * placeholders (rewritten to `?` in occurrence order, so a reused `$1` works). Values are mapped both
 * ways the way the pg driver did: Date ⇄ ISO-8601 text, boolean ⇄ 0/1, JSON columns ⇄ objects.
 * SQL functions `now()` and `gen_random_uuid()` are provided so timestamps/ids match the defaults.
 *
 * Transactions: SQLite has one connection, so `connect()` hands out a client that holds an async lock
 * until `release()`. While a transaction is open, other callers' queries wait instead of running
 * inside it (which an interleaved `await` would otherwise allow).
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Columns returned as booleans (stored as 0/1). */
const BOOLEAN_COLUMNS = new Set(['is_system_role', 'email_verified'])
/** Columns returned as parsed JSON (stored as TEXT). */
const JSON_COLUMNS = new Set(['settings', 'metadata'])
/** Timestamp columns end with `_at` or are named `expires`; returned as Date like pg did. */
const isTimestampColumn = (name) => name.endsWith('_at') || name === 'expires'
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

let db = null
let dbFile = null

export function resolveDatabaseFile() {
  const explicit = String(process.env.AGROCLOUD_DB_FILE || '').trim()
  if (explicit) return explicit
  // AGRI_DATA_DIR is the older (Hostinger) name for the same persistent data directory.
  const dir = String(process.env.AGROCLOUD_DATA_DIR || process.env.AGRI_DATA_DIR || '').trim()
  if (dir) return path.join(path.resolve(dir), 'agrocloud.sqlite')
  if (process.env.NODE_TEST_CONTEXT) return ':memory:'
  return path.join(BACKEND_ROOT, 'data', 'agrocloud.sqlite')
}

/** Open (once) and return the better-sqlite3 handle. */
export function getDatabase() {
  if (db) return db
  dbFile = resolveDatabaseFile()
  if (dbFile !== ':memory:') fs.mkdirSync(path.dirname(dbFile), { recursive: true })
  db = new Database(dbFile)
  if (dbFile !== ':memory:') db.pragma('journal_mode = WAL') // readers never block the writer
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  db.function('now', { deterministic: false }, () => new Date().toISOString())
  db.function('gen_random_uuid', { deterministic: false }, () => randomUUID())
  return db
}

export function getDatabaseFile() {
  return dbFile ?? resolveDatabaseFile()
}

const closeHooks = new Set()
/** Register a callback run after the database is closed (caches keyed to the old handle). */
export function onDatabaseClose(fn) {
  closeHooks.add(fn)
}

export function closeDatabase() {
  if (db) db.close()
  db = null
  dbFile = null
  for (const fn of closeHooks) fn()
}

/** Rewrite `$n` placeholders (outside quoted strings) to `?` and order the values to match. */
export function translatePlaceholders(sql, params = []) {
  const values = []
  let out = ''
  let quote = null
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (quote) {
      out += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"') {
      quote = ch
      out += ch
      continue
    }
    if (ch === '$' && /\d/.test(sql[i + 1] || '')) {
      let j = i + 1
      while (/\d/.test(sql[j] || '')) j++
      const n = Number(sql.slice(i + 1, j))
      if (n < 1 || n > params.length) throw new Error(`SQL placeholder $${n} has no value (got ${params.length} params)`)
      values.push(toSqlValue(params[n - 1]))
      out += '?'
      i = j - 1
      continue
    }
    out += ch
  }
  return { sql: out, values }
}

function toSqlValue(v) {
  if (v === undefined || v === null) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'bigint') return v
  if (Buffer.isBuffer(v)) return v
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

function fromSqlRow(row) {
  for (const key of Object.keys(row)) {
    const v = row[key]
    if (v === null) continue
    if (BOOLEAN_COLUMNS.has(key)) row[key] = v === 1 || v === true
    else if (JSON_COLUMNS.has(key) && typeof v === 'string') {
      try {
        row[key] = JSON.parse(v)
      } catch {
        /* leave as text */
      }
    } else if (typeof v === 'string' && isTimestampColumn(key) && ISO_RE.test(v)) row[key] = new Date(v)
  }
  return row
}

/** Run one statement. Returns `{ rows, rowCount }` like pg. */
function runStatement(sql, params) {
  const conn = getDatabase()
  const { sql: text, values } = translatePlaceholders(sql, params)
  const stmt = conn.prepare(text)
  if (stmt.reader) {
    const rows = stmt.all(...values).map(fromSqlRow)
    return { rows, rowCount: rows.length }
  }
  const info = stmt.run(...values)
  return { rows: [], rowCount: info.changes }
}

/* ---------- transaction lock ---------- */
let lockTail = Promise.resolve()
let lockHeld = false

function acquireLock() {
  let release
  const next = new Promise((resolve) => (release = resolve))
  const ready = lockTail.then(() => {
    lockHeld = true
  })
  lockTail = ready.then(() => next)
  return ready.then(() => () => {
    lockHeld = false
    release()
  })
}

/** Pool-style query: waits while another caller holds a transaction. */
const LOCK_WAIT_MS = Number(process.env.AGROCLOUD_DB_LOCK_WAIT_MS || 10_000)

export async function query(sql, params = []) {
  if (lockHeld) {
    let timer
    let timedOut = false
    const acquiring = acquireLock()
    // If we give up waiting, still release the lock once our turn comes, or the queue would stall.
    acquiring.then((rel) => timedOut && rel())
    const release = await Promise.race([
      acquiring,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => {
            timedOut = true
            reject(
              new Error(
                `database: query waited ${LOCK_WAIT_MS}ms for an open transaction. If this runs inside a transaction, ` +
                  'pass the transaction client instead of using the global pool (that would wait for itself).',
              ),
            )
          },
          LOCK_WAIT_MS,
        )
      }),
    ]).finally(() => clearTimeout(timer))
    try {
      return runStatement(sql, params)
    } finally {
      release()
    }
  }
  return runStatement(sql, params)
}

/** Dedicated client for a transaction (BEGIN … COMMIT/ROLLBACK). Always call `release()`. */
export async function connect() {
  const release = await acquireLock()
  let released = false
  return {
    query: async (sql, params = []) => runStatement(sql, params),
    release: () => {
      if (released) return
      released = true
      // Never leave a transaction open on the shared connection.
      if (getDatabase().inTransaction) getDatabase().exec('ROLLBACK')
      release()
    },
  }
}

/** pg.Pool-compatible facade used by the identity services. */
export const pool = { query, connect }

/** Run `fn(client)` inside BEGIN/COMMIT, rolling back on error. */
export async function withTransaction(fn) {
  const client = await connect()
  try {
    await client.query('BEGIN IMMEDIATE')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    if (getDatabase().inTransaction) getDatabase().exec('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
