/**
 * Move an existing PostgreSQL identity database into the SQLite database.
 *
 *   DATABASE_URL=postgres://… npm run db:import-postgres -w backend [-- --force]
 *
 * The PostgreSQL database is only read. Afterwards remove DATABASE_URL and set AGROCLOUD_IDENTITY=on.
 */
import pg from 'pg'
import { loadProductionEnv } from '../server/loadProductionEnv.js'
import { closeDatabase, getDatabaseFile } from '../server/database/connection.js'
import { importFromPostgres } from '../server/database/importPostgres.js'

loadProductionEnv()

const url = String(process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('Set DATABASE_URL to the PostgreSQL database to import from.')
  process.exit(1)
}

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
})

try {
  await client.connect()
  console.info(`Importing PostgreSQL identity data → ${getDatabaseFile()}`)
  const counts = await importFromPostgres(client, {
    force: process.argv.includes('--force'),
    log: (m) => console.info(`  ${m}`),
  })
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  console.info(`Done: ${total} rows. Now remove DATABASE_URL and set AGROCLOUD_IDENTITY=on.`)
} catch (e) {
  console.error(e.message || e)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
  closeDatabase()
}
