/**
 * One-time migration helper: removes the SPA build that older deploys copied into the repository root
 * (index.html, sw.js, assets/, icons …). Pages now serves main:/docs, so these files are dead weight.
 *
 * Only run AFTER Pages has been switched to /docs (scripts/ensure-pages-branch-source.mjs) — the deploy
 * workflow does exactly that, so the live site never points at an empty location. Safe to re-run:
 * it does nothing once the root is clean. Removes only the generated names below — never source files.
 *
 * Usage: node scripts/remove-legacy-pages-root.mjs [--git]   (--git uses `git rm`; default deletes files)
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const TAG = 'remove-legacy-pages-root'

const GENERATED = [
  'assets',
  'avatars',
  'dashboard-themes',
  'schemas',
  'index.html',
  '404.html',
  '.nojekyll',
  'CNAME',
  'vite.svg',
  'robots.txt',
  'manifest.webmanifest',
  'registerSW.js',
  'sw.js',
  'favicon.svg',
  'favicon.png',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'apple-touch-icon-152.png',
  'apple-touch-icon-167.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'maskable-192x192.png',
  'maskable-512x512.png',
  'agrocloud-logo.png',
  'agrocloud-logo-core.png',
  'agrocloud-pwa-logo.png',
  'agrocloud-mark-leaves.png',
  'elite-agro-logo-white.png',
  'elite-agro-projects-logo.png',
  'AgroCloud-Plan-Model-Sentinel-v3-EN.pdf',
]

// Safety: refuse to run outside the repo root, or if docs/ (the new Pages source) is not in place.
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, 'frontend'))) {
  console.error(`${TAG}: run from the repository root`)
  process.exit(1)
}
if (!fs.existsSync(path.join(root, 'docs', 'index.html'))) {
  console.error(`${TAG}: docs/index.html missing — publish to docs/ before removing the root build`)
  process.exit(1)
}

const workbox = fs.readdirSync(root).filter((n) => /^workbox-[a-f0-9]+\.js$/i.test(n))
const targets = [...GENERATED, ...workbox].filter((n) => fs.existsSync(path.join(root, n)))

if (!targets.length) {
  console.log(`${TAG}: root is already clean`)
  process.exit(0)
}

const useGit = process.argv.includes('--git')
for (const name of targets) {
  if (useGit) execFileSync('git', ['rm', '-r', '-q', '--ignore-unmatch', '--', name], { cwd: root, stdio: 'inherit' })
  fs.rmSync(path.join(root, name), { recursive: true, force: true })
}
console.log(`${TAG}: removed ${targets.length} generated root entries: ${targets.join(', ')}`)
