#!/usr/bin/env node
/**
 * Create a Hostinger Node.js deploy archive (max ~50MB).
 * Includes source + production env + optional prebuilt frontend/dist.
 * Excludes node_modules, .git, and dev artifacts.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const outZip =
  process.platform === 'win32'
    ? 'C:\\temp\\hostinger-deploy.zip'
    : path.join(repoRoot, 'hostinger-deploy.zip')

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  '.cursor',
  'agent-transcripts',
  'terminals',
  'mcps',
  'playwright-report',
  'test-results',
  'coverage',
  '.vite',
  // Python tree-detection microservice runs separately (not on Hostinger Node);
  // never bundle its multi-GB venv / model cache / logs into the deploy archive.
  '.venv',
  'lightning_logs',
])

const EXCLUDE_FILES = new Set(['hostinger-deploy.zip', 'hostinger-deploy.tar.gz', '.env'])

function shouldSkip(rel) {
  const parts = rel.split(/[/\\]/).filter(Boolean)
  if (parts.some(p => EXCLUDE_DIRS.has(p))) return true
  const base = parts[parts.length - 1] || ''
  if (EXCLUDE_FILES.has(base)) return true
  if (base.endsWith('.log')) return true
  if (rel.endsWith('.br') || rel.endsWith('.gz')) return true
  if (rel.startsWith('frontend/dist/') && (rel.endsWith('.br') || rel.endsWith('.gz'))) return true
  return false
}

function collectFiles(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    const rel = path.relative(base, abs).replace(/\\/g, '/')
    if (shouldSkip(rel)) continue
    const st = fs.statSync(abs)
    if (st.isDirectory()) collectFiles(abs, base, out)
    else out.push({ abs, rel })
  }
  return out
}

console.log('Running production build…')
const build = spawnSync('npm', ['run', 'build:production'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
if (build.status !== 0) {
  console.error('Production build failed.')
  process.exit(build.status ?? 1)
}

if (!fs.existsSync(path.join(repoRoot, 'frontend', 'dist', 'index.html'))) {
  console.error('Missing frontend/dist/index.html after build.')
  process.exit(1)
}

if (fs.existsSync(outZip)) fs.unlinkSync(outZip)

const staging =
  process.platform === 'win32'
    ? 'C:\\temp\\hostinger-staging'
    : path.join(repoRoot, '.hostinger-staging')
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true })
fs.mkdirSync(staging, { recursive: true })

const files = collectFiles(repoRoot)
for (const { abs, rel } of files) {
  const dest = path.join(staging, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(abs, dest)
}

const prodEnvPath = path.join(repoRoot, '.env.production')
if (fs.existsSync(prodEnvPath)) {
  const hostingerEnvDest = path.join(staging, 'hostinger-production.env')
  fs.copyFileSync(prodEnvPath, hostingerEnvDest)
  console.log('Included hostinger-production.env for Hostinger runtime.')
}

console.log(`Staging ${files.length} files…`)

const zipCmd =
  process.platform === 'win32'
    ? `powershell -NoProfile -Command "Compress-Archive -Path '${staging.replace(/'/g, "''")}\\*' -DestinationPath '${outZip.replace(/'/g, "''")}' -Force"`
    : `cd "${staging}" && zip -r "${outZip}" . -x "**/node_modules/**"`

const zip = spawnSync(zipCmd, { stdio: 'inherit', shell: true })
fs.rmSync(staging, { recursive: true, force: true })

if (zip.status !== 0) {
  console.error('Archive creation failed.')
  process.exit(zip.status ?? 1)
}

const sizeMb = (fs.statSync(outZip).size / (1024 * 1024)).toFixed(2)
console.log(`Created ${outZip} (${sizeMb} MB)`)
if (fs.statSync(outZip).size > 50 * 1024 * 1024) {
  console.warn('WARNING: archive exceeds Hostinger 50MB limit — remove frontend/dist from staging or trim assets.')
  process.exit(2)
}

if (fs.existsSync(prodEnvPath)) {
  const prodEnv = fs.readFileSync(prodEnvPath, 'utf8')
  const smtpPassSet = /^SMTP_PASS=(.+)$/m.test(prodEnv) && !/^SMTP_PASS=\s*$/m.test(prodEnv)
  if (!smtpPassSet) {
    console.warn('')
    console.warn('SMTP_PASS is empty in .env.production.')
    console.warn('Before emails work, set in Hostinger Node.js → Environment variables:')
    console.warn('  SMTP_HOST=smtp.hostinger.com')
    console.warn('  SMTP_PORT=465')
    console.warn('  SMTP_SECURE=true')
    console.warn('  SMTP_PASS = email password for admin@eliteagrocloud.com')
    console.warn('  Titan: https://app.titan.email → Settings → Enable Titan on other apps')
    console.warn('')
  }
  if (!/AUTH_REQUIRE_EMAIL_VERIFICATION=true/m.test(prodEnv)) {
    console.warn('AUTH_REQUIRE_EMAIL_VERIFICATION is not true — signup will not send verification emails.')
  }
}
