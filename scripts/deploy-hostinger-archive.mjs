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
  'agrocloud-ai',
  'dev-dist',
  '.hostinger-staging',
  '.deploy-staging',
  '.chirps-cache',
  'cache',
  '__pycache__',
  '.pytest_cache',
  'uploads',
  // Python microservices + model weights run on VPS or locally — not on Hostinger Node.
  '.venv',
  '.venv312',
  'venv',
  'lightning_logs',
  'checkpoints',
  'weights',
  'models',
])

/** Paths never shipped to Hostinger (Python services, dev uploads, large rasters). */
const EXCLUDE_PREFIXES = [
  'backend/services/',
  'backend/uploads/',
  'backend/tests/',
  'frontend/src/',
  'frontend/public/',
]

const EXCLUDE_FILES = new Set(['hostinger-deploy.zip', 'hostinger-deploy.tar.gz', '.env'])

function normalizeRel(rel) {
  return String(rel || '').replace(/\\/g, '/')
}

function shouldSkip(rel) {
  const norm = normalizeRel(rel)
  if (EXCLUDE_PREFIXES.some(p => norm.startsWith(p))) return true
  const parts = norm.split('/').filter(Boolean)
  if (parts.some(p => EXCLUDE_DIRS.has(p))) return true
  const base = parts[parts.length - 1] || ''
  if (EXCLUDE_FILES.has(base)) return true
  if (base.endsWith('.log')) return true
  if (/\.(pth|ckpt|dlpk|zip|pyc|tif|tiff|safetensors|pt|onnx)$/i.test(base)) return true
  if (norm.startsWith('backend/data/crop-classification-jobs/')) return true
  if (norm.endsWith('.br') || norm.endsWith('.gz')) return true
  // Hostinger only needs the Vite build output from frontend (not dev sources/config).
  if (
    norm.startsWith('frontend/') &&
    norm !== 'frontend/package.json' &&
    norm !== 'frontend/dist' &&
    !norm.startsWith('frontend/dist/')
  ) {
    return true
  }
  return false
}

const DEPLOY_DIRS = new Set(['frontend', 'backend', 'scripts'])
const DEPLOY_ROOT_FILES = new Set(['server.js', 'package.json', 'package-lock.json'])

function collectDeployFiles() {
  const out = []
  for (const name of fs.readdirSync(repoRoot)) {
    const abs = path.join(repoRoot, name)
    if (DEPLOY_DIRS.has(name) && fs.statSync(abs).isDirectory()) {
      collectFiles(abs, abs, out)
    } else if (DEPLOY_ROOT_FILES.has(name) && fs.statSync(abs).isFile()) {
      out.push({ abs, rel: name.replace(/\\/g, '/') })
    }
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

const staging = process.env.DEPLOY_STAGING_DIR
  ? path.resolve(process.env.DEPLOY_STAGING_DIR)
  : process.platform === 'win32'
    ? 'C:\\temp\\hostinger-staging'
    : path.join(repoRoot, '.deploy-staging')
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true })
fs.mkdirSync(staging, { recursive: true })

function collectFiles(dir, base = dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    const rel = path.relative(repoRoot, abs).replace(/\\/g, '/')
    if (shouldSkip(rel)) continue
    const st = fs.statSync(abs)
    if (st.isDirectory()) collectFiles(abs, base, out)
    else out.push({ abs, rel })
  }
  return out
}

const files = collectDeployFiles()
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
