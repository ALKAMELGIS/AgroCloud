import path from 'path'
import { fileURLToPath } from 'url'
import { loadProductionEnv, resolveAgriDataPaths } from '../server/loadProductionEnv.js'
import { importAdminDirectory } from '../server/identity/importDirectory.js'
import { closePool } from '../server/identity/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '../server')

loadProductionEnv()

const dryRun = process.argv.includes('--dry-run')

async function main() {
  const { adminDirectoryFile } = resolveAgriDataPaths(SERVER_DIR)
  const result = await importAdminDirectory(adminDirectoryFile, { dryRun })
  console.info(result)
  await closePool()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
