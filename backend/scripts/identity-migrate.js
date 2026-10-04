import { loadProductionEnv } from '../server/loadProductionEnv.js'
import { getPool, runMigrations, closePool, isIdentityConfigured } from '../server/identity/db.js'

loadProductionEnv()

async function main() {
  if (!isIdentityConfigured()) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }
  const pool = getPool()
  const client = await pool.connect()
  try {
    await runMigrations(client)
    console.info('Identity migrations complete')
  } finally {
    client.release()
    await closePool()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
