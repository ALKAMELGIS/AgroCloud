/**
 * Applies backend/database/migrations/*.sql in name order, each in its own transaction, and records
 * them in schema_migrations. Safe to run on every start (already-applied files are skipped).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDatabase } from './connection.js'

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'migrations')

let generation = 0
/** Bumped whenever a migration is applied, so in-process caches of seeded data can invalidate. */
export function getMigrationGeneration() {
  return generation
}

export function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return []
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f))
    .sort()
}

/** @returns {string[]} names of migrations applied in this call */
export function runMigrations() {
  const db = getDatabase()
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name        TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`)
  const applied = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name))
  const done = []
  for (const file of listMigrationFiles()) {
    if (applied.has(file)) continue
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file)
    })()
    generation++
    done.push(file)
    console.info('[database] applied migration', file)
  }
  return done
}
