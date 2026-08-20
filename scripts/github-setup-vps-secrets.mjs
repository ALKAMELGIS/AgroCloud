#!/usr/bin/env node
/**
 * Set GitHub Actions secrets and dispatch VPS deploy (no gh CLI required).
 * Usage: GITHUB_TOKEN=... node scripts/github-setup-vps-secrets.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = 'ALKAMELGIS/AgroCloud'
const TOKEN = process.env.GITHUB_TOKEN?.trim()
if (!TOKEN) {
  console.error('GITHUB_TOKEN required')
  process.exit(1)
}

const keyPath = path.join(os.homedir(), '.ssh', 'agrocloud-vps')
if (!fs.existsSync(keyPath)) {
  console.error(`Missing SSH key: ${keyPath}`)
  process.exit(1)
}

const secrets = {
  VPS_HOST: '2.24.11.216',
  VPS_USER: 'root',
  VPS_DEPLOY_PATH: '/opt/AgroCloud',
  VPS_SSH_KEY: fs.readFileSync(keyPath, 'utf8'),
}

async function gh(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  return json
}

async function ensureSodium() {
  const modPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'libsodium-wrappers')
  if (!fs.existsSync(modPath)) {
    console.log('Installing libsodium-wrappers…')
    const r = spawnSync('npm', ['install', '--no-save', 'libsodium-wrappers'], {
      cwd: path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
  const mod = await import('libsodium-wrappers')
  const sodium = mod.default ?? mod
  await sodium.ready
  return sodium
}

async function setSecret(name, value, keyId, publicKeyB64) {
  const sodium = await ensureSodium()
  const messageBytes = sodium.from_string(value)
  const keyBytes = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL)
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes)
  const encrypted = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL)
  await gh(`/repos/${REPO}/actions/secrets/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: { encrypted_value: encrypted, key_id: keyId },
  })
}

async function main() {
  const { key_id, key } = await gh(`/repos/${REPO}/actions/secrets/public-key`)
  for (const [name, value] of Object.entries(secrets)) {
    console.log(`Setting secret ${name}…`)
    await setSecret(name, value, key_id, key)
  }
  console.log('Dispatching deploy-agri-field-boundary-vps workflow…')
  await gh(`/repos/${REPO}/actions/workflows/deploy-agri-field-boundary-vps.yml/dispatches`, {
    method: 'POST',
    body: { ref: 'main' },
  })
  console.log('Done — check GitHub Actions for deploy progress.')
}

main().catch(err => {
  console.error(err.message || err)
  process.exit(1)
})
