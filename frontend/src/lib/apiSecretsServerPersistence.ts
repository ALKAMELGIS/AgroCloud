/**
 * Sync API token overrides with the Node backend (`backend/server/agri_api_secrets.json`)
 * so secrets survive frontend rebuilds and full app updates when the server data directory persists.
 */

import { getArcgisPortalTokenBrowserOverride, persistArcgisPortalTokenInBrowser } from './arcgisPortalToken'
import { getClaudeApiKeyBrowserOverride, persistClaudeApiKeyInBrowser } from './claudeApiKey'
import { getUserApiTokenValue, persistUserApiTokenValue } from './customUserApiTokens'
import { getDeepseekApiKeyBrowserOverride, persistDeepseekApiKeyInBrowser } from './deepseekApiKey'
import { getGeminiApiKeyBrowserOverride, persistGeminiApiKeyInBrowser } from './geminiApiKey'
import { getMapboxAccessTokenBrowserOverride, persistMapboxAccessTokenInBrowser } from './mapboxAccessToken'
import { getOpenWeatherMapApiKeyBrowserOverride, persistOpenWeatherMapApiKeyInBrowser } from './openWeatherMapApiKey'
import {
  getSentinelHubAccessTokenBrowserOverride,
  persistSentinelHubAccessTokenInBrowser,
} from './sentinelHubAccessToken'
import {
  getSentinelHubWmsInstanceIdBrowserOverride,
  persistSentinelHubWmsInstanceIdInBrowser,
} from './sentinelHubWmsInstance'
import { scheduleBrowserApiSecretsVaultSnapshot } from './browserApiSecretsVault'

export type BuiltinSecretKey =
  | 'mapboxToken'
  | 'arcgisPortalToken'
  | 'openWeatherMapApiKey'
  | 'sentinelHubAccessToken'
  | 'sentinelHubWmsInstanceId'
  | 'geminiApiKey'
  | 'claudeApiKey'
  | 'deepseekApiKey'

export type ApiSecretsClientPatch = Partial<Record<BuiltinSecretKey, string>> & {
  customSlots?: Record<string, string>
}

export type ServerApiSecretsV3 = {
  version: 3
  builtin: Partial<Record<BuiltinSecretKey, string>>
  customSlots: Record<string, string>
}

const BUILTIN_PERSIST: Record<BuiltinSecretKey, (v: string) => void> = {
  mapboxToken: persistMapboxAccessTokenInBrowser,
  arcgisPortalToken: persistArcgisPortalTokenInBrowser,
  openWeatherMapApiKey: persistOpenWeatherMapApiKeyInBrowser,
  sentinelHubAccessToken: persistSentinelHubAccessTokenInBrowser,
  sentinelHubWmsInstanceId: persistSentinelHubWmsInstanceIdInBrowser,
  geminiApiKey: persistGeminiApiKeyInBrowser,
  claudeApiKey: persistClaudeApiKeyInBrowser,
  deepseekApiKey: persistDeepseekApiKeyInBrowser,
}

/** Current browser-only values (never clobber these with an empty server response). */
const BUILTIN_BROWSER_GET: Record<BuiltinSecretKey, () => string> = {
  mapboxToken: getMapboxAccessTokenBrowserOverride,
  arcgisPortalToken: getArcgisPortalTokenBrowserOverride,
  openWeatherMapApiKey: getOpenWeatherMapApiKeyBrowserOverride,
  sentinelHubAccessToken: getSentinelHubAccessTokenBrowserOverride,
  sentinelHubWmsInstanceId: getSentinelHubWmsInstanceIdBrowserOverride,
  geminiApiKey: getGeminiApiKeyBrowserOverride,
  claudeApiKey: getClaudeApiKeyBrowserOverride,
  deepseekApiKey: getDeepseekApiKeyBrowserOverride,
}

function optionalAuthHeaders(): HeadersInit {
  const raw = import.meta.env.VITE_AGRI_API_SECRETS_TOKEN
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return {}
  return { 'X-Agri-Api-Secrets-Token': t }
}

/** Same-origin default when the app is served behind the Node API; override for static hosts (e.g. GitHub Pages) + remote API. */
const DEFAULT_API_SECRETS_PATH = '/api/system/api-secrets'

export function getApiSecretsEndpoint(): string {
  const raw = import.meta.env.VITE_AGRI_API_SECRETS_URL
  const u = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
  if (!u) return DEFAULT_API_SECRETS_PATH
  // Accept either the full endpoint URL or just the backend origin/base path:
  // when the configured value doesn't already end in the canonical path, append
  // it. Lets users set VITE_AGRI_API_SECRETS_URL=https://api.example.com.
  if (/\/api\/system\/api-secrets$/i.test(u)) return u
  return `${u}${DEFAULT_API_SECRETS_PATH}`
}

export function applyPersistedApiSecretsToBrowser(secrets: ServerApiSecretsV3): void {
  const builtin = secrets.builtin && typeof secrets.builtin === 'object' ? secrets.builtin : {}
  for (const [k, v] of Object.entries(builtin)) {
    const key = k as BuiltinSecretKey
    const fn = BUILTIN_PERSIST[key]
    if (!fn) continue
    const nextValue = typeof v === 'string' ? v : ''
    /**
     * Never wipe an existing browser token with an empty/missing server value.
     * Applies after deploys when `agri_api_secrets.json` is missing, reset, or not yet synced,
     * and for static/GitHub Pages builds without a reachable secrets API.
     */
    const getBrowser = BUILTIN_BROWSER_GET[key]
    if (!nextValue.trim() && getBrowser?.().trim()) {
      continue
    }
    fn(nextValue)
  }
  const slots = secrets.customSlots && typeof secrets.customSlots === 'object' ? secrets.customSlots : {}
  for (const [slotId, v] of Object.entries(slots)) {
    const nextValue = typeof v === 'string' ? v : ''
    if (!nextValue.trim() && getUserApiTokenValue(slotId).trim()) {
      continue
    }
    persistUserApiTokenValue(slotId, nextValue)
  }
  scheduleBrowserApiSecretsVaultSnapshot()
}

/** Load server-stored tokens into this browser (no-op if API unavailable or no file yet). */
export async function hydrateBrowserApiSecretsFromServer(): Promise<boolean> {
  try {
    const res = await fetch(getApiSecretsEndpoint(), {
      method: 'GET',
      credentials: 'same-origin',
      headers: { ...optionalAuthHeaders() },
    })
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean; persisted?: boolean; secrets?: ServerApiSecretsV3 }
    if (!data?.ok || !data.persisted || !data.secrets) return false
    applyPersistedApiSecretsToBrowser(data.secrets)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('agri-api-secrets-hydrated'))
    }
    return true
  } catch {
    return false
  }
}

let hydrationPromise: Promise<boolean> | null = null

/**
 * Run the server→browser secrets hydration exactly once per page load and share the
 * in-flight promise across every caller.
 *
 * Why this matters for "works on every device / shared link":
 * the WMS instance id, Sentinel access token and Mapbox token resolve from
 * `localStorage` first — values that only exist on the machine where they were saved
 * via System Settings. They never travel with a shared URL or to a fresh browser.
 * Kicking this off as early as possible (from `main.tsx`, before the first map mounts)
 * lets a configured backend (`VITE_AGRI_API_SECRETS_URL`) populate those tokens up
 * front, so the globe and Sentinel-2 layers initialise with the real credentials
 * instead of the public/placeholder fallbacks. Deduping avoids a redundant second
 * fetch from `SystemSettingsContext`.
 */
export function ensureBrowserApiSecretsHydrated(): Promise<boolean> {
  if (!hydrationPromise) {
    hydrationPromise = hydrateBrowserApiSecretsFromServer().catch(() => false)
  }
  return hydrationPromise
}

export type PersistApiSecretsResult = { ok: true } | { ok: false; error: string }

export async function persistApiSecretsPatchToServer(patch: ApiSecretsClientPatch): Promise<PersistApiSecretsResult> {
  try {
    const res = await fetch(getApiSecretsEndpoint(), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...optionalAuthHeaders() },
      body: JSON.stringify(patch),
    })
    let data: { ok?: boolean; persisted?: boolean; secrets?: ServerApiSecretsV3; error?: string } = {}
    try {
      data = (await res.json()) as typeof data
    } catch {
      // non-JSON error body
    }
    if (!res.ok) {
      return { ok: false, error: data?.error || res.statusText }
    }
    /**
     * Authoritative copy lives on disk (`agri_api_secrets.json` or `AGRI_API_SECRETS_FILE`);
     * merge the returned snapshot into this browser so tokens match the server for any device/browser.
     */
    if (data?.ok && data.persisted && data.secrets) {
      applyPersistedApiSecretsToBrowser(data.secrets)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('agri-api-secrets-hydrated'))
      }
    }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network'
    return { ok: false, error: msg }
  }
}
