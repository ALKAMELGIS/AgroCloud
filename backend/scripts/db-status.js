/**
 * Overview of the SQLite database: file, applied migrations, rows per table, document stores.
 *   npm run db:status -w backend
 */
import fs from 'node:fs'
import { loadProductionEnv } from '../server/loadProductionEnv.js'
import { closeDatabase, getDatabase, getDatabaseFile } from '../server/database/connection.js'
import { runMigrations } from '../server/database/migrate.js'
import { listDocuments } from '../server/database/documentStore.js'

loadProductionEnv()
try {
  runMigrations()
  const db = getDatabase()
  const file = getDatabaseFile()
  const size = file !== ':memory:' && fs.existsSync(file) ? `${(fs.statSync(file).size / 1024).toFixed(0)} KB` : '—'
  console.info(`Database   ${file} (${size})`)
  console.info(`Migrations ${db.prepare('SELECT name FROM schema_migrations ORDER BY name').all().map((r) => r.name).join(', ')}`)
  console.info('\nTables')
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
    .all()
  for (const { name } of tables) {
    console.info(`  ${name.padEnd(28)} ${db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n}`)
  }
  console.info('\nDocuments')
  for (const d of listDocuments()) {
    const from = d.imported_at ? `imported from ${d.legacy_path}` : ''
    console.info(`  ${d.store.padEnd(28)} ${String(d.bytes).padStart(8)} B  updated ${d.updated_at}  ${from}`)
  }
} finally {
  closeDatabase()
}
