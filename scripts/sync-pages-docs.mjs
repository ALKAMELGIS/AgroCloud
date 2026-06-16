/**
 * Copy frontend/dist → docs/ for optional "Deploy from branch" at /docs.
 * Run after build; ensures .nojekyll / 404 via pages-dist-check first.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

execSync('node scripts/pages-dist-check.mjs', { stdio: 'inherit', cwd: root })

const src = path.join(root, 'frontend', 'dist')
const dest = path.join(root, 'docs')

if (!fs.existsSync(src)) {
  console.error('sync-pages-docs: frontend/dist not found. Run npm run build first.')
  process.exit(1)
}

fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(src, dest, { recursive: true })

console.log('sync-pages-docs: copied frontend/dist → docs/ (folder is gitignored; do not commit dist — use GitHub Actions Pages).')
