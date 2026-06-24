#!/usr/bin/env node
/**
 * Hostinger production build: reuse prebuilt `frontend/dist` from the deploy archive
 * when present (avoids EACCES on shared hosting when Vite/PostCSS scans src trees).
 * Falls back to full production build locally or when dist is missing.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const distIndex = path.join(repoRoot, 'frontend', 'dist', 'index.html')

if (fs.existsSync(distIndex)) {
  console.log('Prebuilt frontend/dist found — skipping Vite build on server.')
  process.exit(0)
}

console.log('No prebuilt dist — running full production build…')
const result = spawnSync('node', ['scripts/build-production.mjs'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
