#!/usr/bin/env node
/**
 * Public GitHub Pages build — mirrors deploy-pages.yml (empty VITE_*; no secrets in bundles).
 * Usage: node scripts/build-pages-public.mjs
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {string[]} */
const EMPTY_VITE_KEYS = [
  'VITE_MAPBOX_TOKEN',
  'VITE_MAPBOX_ACCESS_TOKEN',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_SERVER_API_KEY',
  'VITE_ARCGIS_PORTAL_TOKEN',
  'VITE_SENTINEL_HUB_WMS_INSTANCE_ID',
  'VITE_SENTINEL_HUB_ACCESS_TOKEN',
  'VITE_SENTINEL_HUB_CLIENT_ID',
  'VITE_SENTINEL_HUB_CLIENT_SECRET',
  'VITE_CDSE_CLIENT_ID',
  'VITE_CDSE_CLIENT_SECRET',
  'VITE_GEMINI_API_KEY',
  'VITE_OPENAI_API_KEY',
  'VITE_CLAUDE_API_KEY',
  'VITE_DEEPSEEK_API_KEY',
  'VITE_OPENWEATHER_API_KEY',
  'VITE_OPENROUTESERVICE',
  'VITE_DROPBOX_APP_KEY',
  'VITE_ONEDRIVE_CLIENT_ID',
  'VITE_GOOGLE_DRIVE_CLIENT_ID',
  'VITE_GOOGLE_DRIVE_API_KEY',
  'VITE_AGRI_API_SECRETS_TOKEN',
]

const env = { ...process.env, ENABLE_PWA: 'true', NODE_ENV: 'production' }
for (const key of EMPTY_VITE_KEYS) {
  env[key] = ''
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  })
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
}

run('npm', ['run', 'build'])
run('node', ['scripts/pages-dist-check.mjs'])
console.log('build-pages-public: OK — safe to sync with scripts/sync-pages-dist-to-root.mjs')
