/**
 * Persist API token overrides on the Node server (survives frontend rebuilds / image updates
 * when `agri_api_secrets.json` is on a persistent path or volume).
 * Only keys the user has saved appear under `builtin` / `customSlots` so hydration never wipes unrelated browser overrides.
 * @see frontend/src/lib/apiSecretsServerPersistence.ts
 */

import fs from 'fs'
import path from 'path'

const BUILTIN_KEYS = [
  'mapboxToken',
  'arcgisPortalToken',
  'openWeatherMapApiKey',
  'sentinelHubAccessToken',
  'sentinelHubWmsInstanceId',
  'geminiApiKey',
  'claudeApiKey',
  'deepseekApiKey',
]

function emptyStore() {
  return { version: 3, builtin: {}, customSlots: {} }
}

function migrateRaw(raw) {
  if (!raw || typeof raw !== 'object') return emptyStore()
  if (raw.version === 3 && raw.builtin && typeof raw.builtin === 'object') {
    return {
      version: 3,
      builtin: { ...raw.builtin },
      customSlots: typeof raw.customSlots === 'object' && raw.customSlots ? { ...raw.customSlots } : {},
    }
  }
  const builtin = {}
  for (const k of BUILTIN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, k) && typeof raw[k] === 'string') {
      builtin[k] = raw[k]
    }
  }
  return {
    version: 3,
    builtin,
    customSlots: typeof raw.customSlots === 'object' && raw.customSlots ? { ...raw.customSlots } : {},
  }
}

export function readApiSecretsFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { persisted: false, secrets: null }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return { persisted: true, secrets: migrateRaw(raw) }
  } catch (e) {
    console.error('[api-secrets] read failed', e)
    return { persisted: false, secrets: null }
  }
}

export function mergeAndWriteApiSecrets(filePath, patch) {
  const prevState = readApiSecretsFile(filePath)
  const prev = prevState.persisted && prevState.secrets ? prevState.secrets : emptyStore()
  const builtin = { ...prev.builtin }
  const customSlots = { ...prev.customSlots }

  for (const k of BUILTIN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, k) && typeof patch[k] === 'string') {
      if (!patch[k].trim()) delete builtin[k]
      else builtin[k] = patch[k]
    }
  }

  if (patch.customSlots && typeof patch.customSlots === 'object') {
    for (const [slotId, val] of Object.entries(patch.customSlots)) {
      if (!slotId) continue
      const s = val === null || val === undefined ? '' : String(val)
      if (!s.trim()) delete customSlots[slotId]
      else customSlots[slotId] = s
    }
  }

  const next = { version: 3, builtin, customSlots }
  const dir = path.dirname(filePath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    // ignore
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
  return { persisted: true, secrets: next }
}

/**
 * @param {import('express').Express} app
 * @param {{ secretsFilePath: string, accessToken?: string }} opts
 */
export function registerApiSecretsRoutes(app, opts) {
  const { secretsFilePath, accessToken } = opts
  const token = String(accessToken || '').trim()

  function guard(req, res, next) {
    if (!token) return next()
    const hdr = String(req.headers['x-agri-api-secrets-token'] || '').trim()
    const auth = String(req.headers.authorization || '')
      .replace(/^Bearer\s+/i, '')
      .trim()
    if (hdr === token || auth === token) return next()
    return res.status(401).json({ error: 'Invalid or missing X-Agri-Api-Secrets-Token / Authorization.' })
  }

  app.get('/api/system/api-secrets', guard, (req, res) => {
    const { persisted, secrets } = readApiSecretsFile(secretsFilePath)
    if (!persisted || !secrets) {
      return res.json({ ok: true, persisted: false })
    }
    return res.json({ ok: true, persisted: true, secrets })
  })

  app.put('/api/system/api-secrets', guard, (req, res) => {
    try {
      const patch = req.body && typeof req.body === 'object' ? req.body : {}
      const { secrets } = mergeAndWriteApiSecrets(secretsFilePath, patch)
      return res.json({ ok: true, persisted: true, secrets })
    } catch (e) {
      console.error('[api-secrets] write failed', e)
      return res.status(500).json({ error: 'Failed to persist API secrets.' })
    }
  })
}
