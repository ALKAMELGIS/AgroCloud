#!/usr/bin/env node
/**
 * Build deploy zip then upload to Hostinger via API (requires Hostinger MCP / API token).
 * Usage: npm run deploy:hostinger && npm run upload:hostinger
 * Env: HOSTINGER_DOMAIN=geosyntra.org HOSTINGER_USERNAME=u245840661
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const archivePath =
  process.platform === 'win32'
    ? 'C:\\temp\\hostinger-deploy.zip'
    : path.join(repoRoot, 'hostinger-deploy.zip')

const domain = String(process.env.HOSTINGER_DOMAIN || 'geosyntra.org').trim()
const username = String(process.env.HOSTINGER_USERNAME || 'u245840661').trim()

if (!fs.existsSync(archivePath)) {
  console.log('Archive missing — running deploy:hostinger…')
  const build = spawnSync('npm', ['run', 'deploy:hostinger'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

if (!fs.existsSync(archivePath)) {
  console.error(`Archive not found: ${archivePath}`)
  process.exit(1)
}

const sizeMb = (fs.statSync(archivePath).size / (1024 * 1024)).toFixed(2)
console.log(`Uploading ${archivePath} (${sizeMb} MB) to ${domain}…`)
console.log('')
console.log('Run via Hostinger MCP tool hosting_deployJsApplication with:')
console.log(JSON.stringify({ domain, archivePath, removeArchive: false }, null, 2))
console.log('')
console.log('Or upload manually in hPanel → Node.js → Deploy → Upload ZIP.')
