/**
 * Seed `agri_api_secrets.json` from server env on first boot (production VPS / Hostinger).
 * Never overwrites keys the user already saved via System Settings.
 */

import { mergeAndWriteApiSecrets, readApiSecretsFile } from './apiSecretsPersistence.js'

/**
 * @type {Record<string, string>} env var → builtin secret key.
 * Multiple aliases per secret are accepted so the value can be set with whichever
 * name the hosting panel / .env already uses. The first non-empty match wins.
 */
const ENV_TO_BUILTIN = {
  MAPBOX_TOKEN: 'mapboxToken',
  VITE_MAPBOX_TOKEN: 'mapboxToken',
  MAPBOX_ACCESS_TOKEN: 'mapboxToken',
  ARCGIS_PORTAL_TOKEN: 'arcgisPortalToken',
  VITE_ARCGIS_PORTAL_TOKEN: 'arcgisPortalToken',
  ARCGIS_TOKEN: 'arcgisPortalToken',
  OPENWEATHERMAP_API_KEY: 'openWeatherMapApiKey',
  OPENWEATHER_API_KEY: 'openWeatherMapApiKey',
  SENTINEL_HUB_ACCESS_TOKEN: 'sentinelHubAccessToken',
  SENTINELHUB_ACCESS_TOKEN: 'sentinelHubAccessToken',
  SENTINEL_HUB_WMS_INSTANCE_ID: 'sentinelHubWmsInstanceId',
  SENTINELHUB_WMS_INSTANCE_ID: 'sentinelHubWmsInstanceId',
  GEMINI_API_KEY: 'geminiApiKey',
  CLAUDE_API_KEY: 'claudeApiKey',
  ANTHROPIC_API_KEY: 'claudeApiKey',
  DEEPSEEK_API_KEY: 'deepseekApiKey',
}

function pickEnvValue(envKey) {
  return String(process.env[envKey] || '').trim()
}

/**
 * @param {string} secretsFilePath
 * @returns {boolean} true when at least one key was written
 */
export function bootstrapApiSecretsFromEnv(secretsFilePath) {
  const patch = {}
  for (const [envKey, builtinKey] of Object.entries(ENV_TO_BUILTIN)) {
    if (patch[builtinKey]) continue // first non-empty alias wins
    const value = pickEnvValue(envKey)
    if (value) patch[builtinKey] = value
  }

  if (!Object.keys(patch).length) return false

  const { persisted, secrets } = readApiSecretsFile(secretsFilePath)
  const existing = persisted && secrets?.builtin && typeof secrets.builtin === 'object' ? secrets.builtin : {}
  const toWrite = {}

  for (const [builtinKey, value] of Object.entries(patch)) {
    const prev = String(existing[builtinKey] || '').trim()
    if (!prev) toWrite[builtinKey] = value
  }

  if (!Object.keys(toWrite).length) return false

  mergeAndWriteApiSecrets(secretsFilePath, toWrite)
  console.info('[api-secrets] bootstrapped from env:', Object.keys(toWrite).join(', '))
  return true
}
