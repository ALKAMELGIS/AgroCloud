/**
 * Clears `localStorage` while keeping known API secret keys (vault, built-in overrides, custom token slots).
 * Used by the app error boundary "Reset App Storage" action.
 */
import { BROWSER_API_SECRETS_VAULT_KEY } from '../services/persistedStorageKeys'
import { ARCGIS_PORTAL_TOKEN_LS_KEY } from './arcgisPortalToken'
import { CLAUDE_API_KEY_LS_KEY } from './claudeApiKey'
import { USER_API_TOKEN_LS_PREFIX } from './customUserApiTokens'
import { DEEPSEEK_API_KEY_LS_KEY } from './deepseekApiKey'
import { GEMINI_API_KEY_LS_KEY } from './geminiApiKey'
import { MAPBOX_TOKEN_LS_KEY } from './mapboxAccessToken'
import { OPENWEATHER_MAP_API_KEY_LS_KEY } from './openWeatherMapApiKey'
import { SENTINEL_HUB_ACCESS_TOKEN_LS_KEY } from './sentinelHubAccessToken'
import { SENTINEL_HUB_WMS_INSTANCE_LS_KEY } from './sentinelHubWmsInstance'

const EXACT_PRESERVE_KEYS = new Set<string>([
  BROWSER_API_SECRETS_VAULT_KEY,
  MAPBOX_TOKEN_LS_KEY,
  ARCGIS_PORTAL_TOKEN_LS_KEY,
  OPENWEATHER_MAP_API_KEY_LS_KEY,
  SENTINEL_HUB_ACCESS_TOKEN_LS_KEY,
  SENTINEL_HUB_WMS_INSTANCE_LS_KEY,
  GEMINI_API_KEY_LS_KEY,
  CLAUDE_API_KEY_LS_KEY,
  DEEPSEEK_API_KEY_LS_KEY,
])

function shouldPreserveKey(key: string): boolean {
  if (EXACT_PRESERVE_KEYS.has(key)) return true
  if (key.startsWith(USER_API_TOKEN_LS_PREFIX)) return true
  return false
}

export function clearLocalStoragePreservingApiSecrets(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const preserved: Array<[string, string]> = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (!k || !shouldPreserveKey(k)) continue
      const v = window.localStorage.getItem(k)
      if (v != null) preserved.push([k, v])
    }
  } catch {
    return
  }
  try {
    window.localStorage.clear()
  } catch {
    return
  }
  for (const [k, v] of preserved) {
    try {
      window.localStorage.setItem(k, v)
    } catch {
      // ignore individual restore failures
    }
  }
}
