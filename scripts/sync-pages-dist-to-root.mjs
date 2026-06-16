/**
 * Copies frontend/dist into the repository root for GitHub Pages (main / root).
 * Removes known prior deploy outputs before copy. With --git-add, stages paths using -f
 * so files under .gitignore (ignored to block accidental local commits) still commit in CI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

const root = process.cwd()
const dist = path.join(root, 'frontend', 'dist')

const managedTopLevel = [
  'assets',
  'avatars',
  'index.html',
  '404.html',
  '.nojekyll',
  'vite.svg',
  'robots.txt',
  'manifest.webmanifest',
  'registerSW.js',
  'sw.js',
  'agrocloud-logo.png',
  'agrocloud-logo-core.png',
  'agrocloud-mark-leaves.png',
  'elite-agro-logo-white.png',
  'favicon.png',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'apple-touch-icon-152.png',
  'apple-touch-icon-167.png',
  'pwa-192x192.png',
  'pwa-512x512.png',
  'maskable-512x512.png',
]

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function rootWorkboxBundles() {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root).filter((n) => /^workbox-[a-f0-9]+\.js$/i.test(n))
}

if (!fs.existsSync(dist)) {
  console.error('sync-pages-dist-to-root: frontend/dist not found. Run npm run build first.')
  process.exit(1)
}

for (const name of managedTopLevel) {
  const target = path.join(root, name)
  if (fs.existsSync(target)) rmrf(target)
}
for (const name of rootWorkboxBundles()) {
  rmrf(path.join(root, name))
}

const entries = fs.readdirSync(dist, { withFileTypes: true })
for (const ent of entries) {
  const from = path.join(dist, ent.name)
  const to = path.join(root, ent.name)
  fs.cpSync(from, to, { recursive: true })
}

console.log('sync-pages-dist-to-root: copied', entries.map((e) => e.name).join(', '))

function gitStageDeploy() {
  const dirs = ['assets', 'avatars']
  for (const name of dirs) {
    try {
      execSync(`git add -f -A -- "${name}"`, { cwd: root, stdio: 'inherit' })
    } catch {
      execSync(`git rm -rf --cached --ignore-unmatch -- "${name}"`, { cwd: root, stdio: 'inherit' })
    }
  }
  const files = managedTopLevel.filter((n) => !dirs.includes(n) && n !== '.nojekyll')
  for (const name of files) {
    const p = path.join(root, name)
    if (fs.existsSync(p)) {
      execSync(`git add -f -A -- "${name}"`, { cwd: root, stdio: 'inherit' })
    } else {
      execSync(`git rm --cached --ignore-unmatch -f -- "${name}"`, { cwd: root, stdio: 'inherit' })
    }
  }
  const nojekyll = path.join(root, '.nojekyll')
  if (fs.existsSync(nojekyll)) {
    execSync('git add -f -- .nojekyll', { cwd: root, stdio: 'inherit' })
  } else {
    execSync('git rm --cached --ignore-unmatch -f -- .nojekyll', { cwd: root, stdio: 'inherit' })
  }
  const workboxNames = rootWorkboxBundles()
  const workboxSet = new Set(workboxNames)
  try {
    const tracked = execSync('git ls-files "workbox-*.js"', { cwd: root, encoding: 'utf8' }).trim()
    if (tracked) {
      for (const line of tracked.split(/\r?\n/)) {
        const base = path.basename(line.trim())
        if (base && !workboxSet.has(base)) {
          execSync(`git rm --cached --ignore-unmatch -f -- "${base}"`, { cwd: root, stdio: 'inherit' })
        }
      }
    }
  } catch {
    // no tracked workbox bundles yet
  }
  for (const name of workboxNames) {
    execSync(`git add -f -- "${name}"`, { cwd: root, stdio: 'inherit' })
  }
}

if (process.argv.includes('--git-add')) {
  gitStageDeploy()
}
