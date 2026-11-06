/**
 * Publishes the SPA build (frontend/dist) to docs/ for GitHub Pages ("Deploy from a branch" → main → /docs).
 *
 * docs/ is fully generated: it is recreated from frontend/dist on every deploy, so nothing in the build is
 * ever left out (the old root sync only staged a fixed file list, so new files such as schemas/ never
 * reached the live site) and nothing stale survives. Pre-compressed .br/.gz copies are skipped (Pages
 * compresses on its own). CNAME comes from frontend/public so the custom domain is always present.
 *
 * Usage: node scripts/publish-pages-docs.mjs [--git-add]
 *   --git-add  stage docs/ with -f (docs/ is gitignored so it is never committed from a local machine,
 *              where a local .env could leak into the build).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()
const dist = path.join(root, 'frontend', 'dist')
const out = path.join(root, 'docs')
const TAG = 'publish-pages-docs'

const fail = (msg) => {
  console.error(`${TAG}: ${msg}`)
  process.exit(1)
}

if (!fs.existsSync(path.join(dist, 'index.html'))) fail('frontend/dist/index.html not found. Run the build (and scripts/pages-dist-check.mjs) first.')

const skip = (name) => /\.(br|gz)$/i.test(name)

fs.rmSync(out, { recursive: true, force: true })
fs.cpSync(dist, out, { recursive: true, filter: (src) => !skip(path.basename(src)) })

// Required for GitHub Pages: SPA fallback, no Jekyll processing, custom domain.
const required = ['index.html', '404.html', '.nojekyll', 'CNAME']
const missing = required.filter((f) => !fs.existsSync(path.join(out, f)))
if (missing.length) fail(`docs/ is missing ${missing.join(', ')} (run scripts/pages-dist-check.mjs; CNAME lives in frontend/public).`)

let files = 0
let bytes = 0
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else {
      files++
      bytes += fs.statSync(p).size
    }
  }
}
walk(out)
console.log(`${TAG}: docs/ ← frontend/dist (${files} files, ${(bytes / 1048576).toFixed(1)} MB, domain ${fs.readFileSync(path.join(out, 'CNAME'), 'utf8').trim()})`)

if (process.argv.includes('--git-add')) {
  // -A also stages deletions of files that are no longer in the build.
  execSync('git add -f -A -- docs', { cwd: root, stdio: 'inherit' })
}
