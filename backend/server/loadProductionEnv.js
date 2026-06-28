/**
 * Normalize production env vars before the API server reads paths and keys.
 * Supports Hostinger-style names (AgroCloud_ENV, AGRI_DATA_DIR, OPENAI, DEEPSEEK, MAPBOX_TOKEN, …).
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(SERVER_DIR, '..', '..')

/** Dev ports from repo `.env` must win over shell (Geosyntra often exports 3001/5173). */
const DEV_PORT_KEYS = new Set(['PORT', 'WS_PORT', 'VITE_DEV_PORT'])
const PRODUCTION_PORT_KEYS = new Set(['PORT', 'WS_PORT'])

function parseEnvFile(content) {
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key) continue
    if (
      !DEV_PORT_KEYS.has(key) &&
      Object.prototype.hasOwnProperty.call(process.env, key) &&
      String(process.env[key] ?? '').trim()
    ) {
      continue
    }
    // Never let .env files override hosting panel PORT (Hostinger/LiteSpeed proxy).
    if (PRODUCTION_PORT_KEYS.has(key) && String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
      continue
    }
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function loadEnvFiles() {
  const candidates = [
    path.join(REPO_ROOT, '.env.production'),
    path.join(REPO_ROOT, 'hostinger-production.env'),
    path.join(process.cwd(), '.env.production'),
    path.join(process.cwd(), 'hostinger-production.env'),
    path.join(REPO_ROOT, '.env'),
    path.join(process.cwd(), '.env'),
  ]
  const seen = new Set()
  for (const filePath of candidates) {
    if (seen.has(filePath) || !fs.existsSync(filePath)) continue
    seen.add(filePath)
    try {
      parseEnvFile(fs.readFileSync(filePath, 'utf8'))
    } catch {
      // ignore unreadable env files
    }
  }
}

function pickEnv(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim()
    if (value) return value
  }
  return ''
}

function setEnvIfEmpty(key, value) {
  if (!value) return
  if (!String(process.env[key] || '').trim()) process.env[key] = value
}

function aliasEnv(primary, fallbacks) {
  if (String(process.env[primary] || '').trim()) return
  const value = pickEnv(...fallbacks)
  if (value) process.env[primary] = value
}

function mirrorViteFrom(sourceKeys, viteKey) {
  if (String(process.env[viteKey] || '').trim()) return
  const value = pickEnv(...sourceKeys)
  if (value) process.env[viteKey] = value
}

/** Apply Hostinger / panel aliases and VITE_* mirrors for production builds. */
export function normalizeProductionEnv() {
  const agroEnv = pickEnv('AgroCloud_ENV', 'AGROCLOUD_ENV')
  if (agroEnv) setEnvIfEmpty('NODE_ENV', agroEnv)

  aliasEnv('OPENAI_API_KEY', ['OPENAI'])
  aliasEnv('DEEPSEEK_API_KEY', ['DEEPSEEK'])
  aliasEnv('MAPBOX_TOKEN', ['VITE_MAPBOX_TOKEN', 'VITE_MAPBOX_ACCESS_TOKEN'])
  aliasEnv('ARCGIS_PORTAL_TOKEN', ['ARCGIS_TOKEN', 'VITE_ARCGIS_PORTAL_TOKEN'])

  mirrorViteFrom(['GEMINI_API_KEY'], 'VITE_GEMINI_API_KEY')
  mirrorViteFrom(['OPENAI_API_KEY', 'OPENAI'], 'VITE_OPENAI_API_KEY')
  mirrorViteFrom(['DEEPSEEK_API_KEY', 'DEEPSEEK'], 'VITE_DEEPSEEK_API_KEY')
  mirrorViteFrom(['OPENROUTESERVICE'], 'VITE_OPENROUTESERVICE')
  mirrorViteFrom(['SENTINEL_HUB_ACCESS_TOKEN'], 'VITE_SENTINEL_HUB_ACCESS_TOKEN')
  mirrorViteFrom(['SENTINEL_HUB_WMS_INSTANCE_ID'], 'VITE_SENTINEL_HUB_WMS_INSTANCE_ID')
  mirrorViteFrom(['SENTINEL_HUB_CLIENT_ID'], 'VITE_SENTINEL_HUB_CLIENT_ID')
  mirrorViteFrom(['SENTINEL_HUB_CLIENT_SECRET'], 'VITE_SENTINEL_HUB_CLIENT_SECRET')
  mirrorViteFrom(['CDSE_CLIENT_ID', 'COPERNICUS_CLIENT_ID'], 'VITE_CDSE_CLIENT_ID')
  mirrorViteFrom(['CDSE_CLIENT_SECRET', 'COPERNICUS_CLIENT_SECRET'], 'VITE_CDSE_CLIENT_SECRET')
  mirrorViteFrom(['OPENWEATHERMAP_API_KEY'], 'VITE_OPENWEATHER_API_KEY')
  mirrorViteFrom(
    ['GOOGLE_MAPS_SERVER_API_KEY', 'GOOGLE_MAPS_API_KEY'],
    'VITE_GOOGLE_MAPS_SERVER_API_KEY',
  )
  mirrorViteFrom(['GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_SERVER_API_KEY'], 'VITE_GOOGLE_MAPS_API_KEY')
  mirrorViteFrom(['MAPBOX_TOKEN'], 'VITE_MAPBOX_TOKEN')
  mirrorViteFrom(['MAPBOX_TOKEN'], 'VITE_MAPBOX_ACCESS_TOKEN')
  mirrorViteFrom(['ARCGIS_PORTAL_TOKEN'], 'VITE_ARCGIS_PORTAL_TOKEN')
  mirrorViteFrom(['APP_ORIGIN'], 'VITE_APP_CANONICAL_URL')
  if (!String(process.env.VITE_BASE_PATH || process.env.AGRO_BASE_PATH || '').trim()) {
    const origin = pickEnv('APP_ORIGIN')
    if (origin && !origin.includes('github.io')) {
      process.env.VITE_BASE_PATH = '/'
    }
  }

  const dataDir = pickEnv('AGRI_DATA_DIR')
  if (dataDir) {
    setEnvIfEmpty('AGRI_API_SECRETS_FILE', path.join(dataDir, 'agri_api_secrets.json'))
    setEnvIfEmpty('AGRI_ADMIN_DIRECTORY_FILE', path.join(dataDir, 'agri_admin_directory.json'))
    setEnvIfEmpty('AGRI_USER_PROFILES_FILE', path.join(dataDir, 'agri_user_profiles.json'))
  }

  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  if (isProd) {
    setEnvIfEmpty('AGRI_API_SECRETS_TOKEN', pickEnv('JWT_SECRET', 'AGRI_API_VAULT_MASTER_KEY'))
    mirrorViteFrom(['AGRI_API_SECRETS_TOKEN', 'JWT_SECRET'], 'VITE_AGRI_API_SECRETS_TOKEN')
  }
}

export function loadProductionEnv() {
  loadEnvFiles()
  normalizeProductionEnv()
}

/**
 * @param {string} serverDir `backend/server`
 */
export function resolveAgriDataPaths(serverDir) {
  const resolvePath = (envKey, defaultName) => {
    const raw = String(process.env[envKey] || '').trim()
    if (!raw) return path.join(serverDir, defaultName)
    return path.isAbsolute(raw) ? raw : path.join(serverDir, raw)
  }

  return {
    apiSecretsFile: resolvePath('AGRI_API_SECRETS_FILE', 'agri_api_secrets.json'),
    userProfilesFile: resolvePath('AGRI_USER_PROFILES_FILE', 'agri_user_profiles.json'),
    adminDirectoryFile: resolvePath('AGRI_ADMIN_DIRECTORY_FILE', 'agri_admin_directory.json'),
  }
}
