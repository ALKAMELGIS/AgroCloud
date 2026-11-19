#!/usr/bin/env node
/**
 * Production SPA build: load `.env.production` / `.env`, mirror VITE_* from server keys, then `npm run build`.
 * Use on VPS / Hostinger before `npm run start -w backend`.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const { loadProductionEnv } = await import(
  pathToFileURL(path.join(repoRoot, 'backend/server/loadProductionEnv.js')).href
)
loadProductionEnv()

process.env.ENABLE_PWA = process.env.ENABLE_PWA || 'true'
process.env.NODE_ENV = process.env.NODE_ENV || 'production'

const result = spawnSync('npm', ['run', 'build', '-w', 'frontend'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

process.exit(result.status ?? 1)
