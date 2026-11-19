/**
 * Consistent copy of the live database (safe while the server runs — SQLite online backup).
 *   npm run db:backup -w backend [-- <target file>]
 * Default target: <data dir>/backups/agrocloud-<timestamp>.sqlite
 */
import path from 'node:path'
import fs from 'node:fs'
import { loadProductionEnv } from '../server/loadProductionEnv.js'
import { closeDatabase, getDatabase, getDatabaseFile } from '../server/database/connection.js'

loadProductionEnv()
const source = getDatabaseFile()
if (source === ':memory:') {
  console.error('The database is in memory (AGROCLOUD_DB_FILE=:memory:) — nothing to back up.')
  process.exit(1)
}
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const target = path.resolve(process.argv[2] || path.join(path.dirname(source), 'backups', `agrocloud-${stamp}.sqlite`))
fs.mkdirSync(path.dirname(target), { recursive: true })
try {
  await getDatabase().backup(target)
  console.info(`Backed up ${source} → ${target}`)
} finally {
  closeDatabase()
}
