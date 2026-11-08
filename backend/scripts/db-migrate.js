import { loadProductionEnv } from '../server/loadProductionEnv.js'
import { getDatabaseFile } from '../server/database/connection.js'
import { runMigrations } from '../server/database/migrate.js'
import { closePool } from '../server/identity/db.js'

loadProductionEnv()

// Applies pending SQLite migrations (the server also does this on start).
try {
  const applied = runMigrations()
  console.info(`Database: ${getDatabaseFile()} — ${applied.length ? 'applied ' + applied.join(', ') : 'already up to date'}`)
} finally {
  await closePool()
}
