/**
 * Fails CI if GitHub Pages would ship a stub index.html instead of the Vite app shell
 * (e.g. the old "Opening Agri Cloud…" bootstrap page without React bundles).
 * Also rejects builds that embed API keys (see pages-dist-secrets-check.mjs).
 */
import fs from 'node:fs'
import path from 'node:path'
import { scanDistForSecrets } from './pages-dist-secrets-check.mjs'

const root = process.cwd()

const indexPath = path.join(root, 'frontend', 'dist', 'index.html')
const html = fs.readFileSync(indexPath, 'utf8')

const errors = []
if (html.includes('/src/main.tsx')) {
  errors.push('dist/index.html still points to Vite dev entry (/src/main.tsx).')
}
const hasBundle = /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(html)
if (!hasBundle) {
  errors.push('dist/index.html does not reference a built assets/index-*.js bundle.')
}
if (!/id=["']root["']/.test(html)) {
  errors.push('dist/index.html must include <div id="root"> (Vite app shell).')
}
const stubMarkers = [
  'boot-card',
  'Opening Agri Cloud',
  'boot-open-app',
  'published from the Vite build',
  'not this file',
]
for (const m of stubMarkers) {
  if (html.includes(m)) {
    errors.push(`dist/index.html must not contain bootstrap stub marker: ${m}`)
  }
}

if (errors.length) {
  console.error('Pages dist check failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}

const distDir = path.join(root, 'frontend', 'dist')
const notFoundPath = path.join(distDir, '404.html')
if (!fs.existsSync(notFoundPath)) {
  fs.copyFileSync(indexPath, notFoundPath)
  console.log('pages-dist-check: created frontend/dist/404.html from index.html (SPA fallback).')
}
const nojekyllPath = path.join(distDir, '.nojekyll')
if (!fs.existsSync(nojekyllPath)) {
  fs.writeFileSync(nojekyllPath, '')
  console.log('pages-dist-check: created frontend/dist/.nojekyll')
}

const secretScan = scanDistForSecrets(distDir)
if (!secretScan.ok) {
  console.error('Pages dist secrets check failed:\n- ' + secretScan.errors.join('\n- '))
  process.exit(1)
}

console.log('Pages dist check OK.')
