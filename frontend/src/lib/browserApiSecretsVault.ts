/**
 * Browser-only backup for API secrets (separate from `agri_system_settings_v1`).
 * Survives partial localStorage loss, app updates, and empty server hydration:
 * restores values into the per-key stores and can recover custom token *cards*
 * when metadata was dropped but secrets (or vault copy) still exist.
 */

import type { BuiltinSecretKey } from './apiSecretsServerPersistence'
import { getArcgisPortalTokenBrowserOverride, persistArcgisPortalTokenInBrowser } from './arcgisPortalToken'
import { getClaudeApiKeyBrowserOverride, persistClaudeApiKeyInBrowser } from './claudeApiKey'
import { clearUserApiTokenValue, getUserApiTokenValue, persistUserApiTokenValue } from './customUserApiTokens'
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
import { sanitizeCustomApiTokenSlot } from './customApiTokenSlotSanitize'
import { SETTINGS_STORAGE_KEY } from '../services/persistedStorageKeys'
import type { CustomApiTokenSlot } from '../types/systemSettings'

export const BROWSER_API_SECRETS_VAULT_KEY = 'agri_browser_api_secrets_vault_v1'

type VaultV1 = {
  v: 1
  savedAt: string
  builtin: Partial<Record<BuiltinSecretKey, string>>
  customSlots: Record<string, string>
  customApiTokenSlotsMeta?: CustomApiTokenSlot[]
}

const BUILTIN_ORDER: BuiltinSecretKey[] = [
  'mapboxToken',
  'arcgisPortalToken',
  'openWeatherMapApiKey',
  'sentinelHubAccessToken',
  'sentinelHubWmsInstanceId',
  'geminiApiKey',
  'claudeApiKey',
  'deepseekApiKey',
]

const BUILTIN_GET: Record<BuiltinSecretKey, () => string> = {
  mapboxToken: getMapboxAccessTokenBrowserOverride,
  arcgisPortalToken: getArcgisPortalTokenBrowserOverride,
  openWeatherMapApiKey: getOpenWeatherMapApiKeyBrowserOverride,
  sentinelHubAccessToken: getSentinelHubAccessTokenBrowserOverride,
  sentinelHubWmsInstanceId: getSentinelHubWmsInstanceIdBrowserOverride,
  geminiApiKey: getGeminiApiKeyBrowserOverride,
  claudeApiKey: getClaudeApiKeyBrowserOverride,
  deepseekApiKey: getDeepseekApiKeyBrowserOverride,
}

const BUILTIN_SET: Record<BuiltinSecretKey, (v: string) => void> = {
  mapboxToken: persistMapboxAccessTokenInBrowser,
  arcgisPortalToken: persistArcgisPortalTokenInBrowser,
  openWeatherMapApiKey: persistOpenWeatherMapApiKeyInBrowser,
  sentinelHubAccessToken: persistSentinelHubAccessTokenInBrowser,
  sentinelHubWmsInstanceId: persistSentinelHubWmsInstanceIdInBrowser,
  geminiApiKey: persistGeminiApiKeyInBrowser,
  claudeApiKey: persistClaudeApiKeyInBrowser,
  deepseekApiKey: persistDeepseekApiKeyInBrowser,
}

function readRawVault(): VaultV1 | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(BROWSER_API_SECRETS_VAULT_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as unknown
    if (!o || typeof o !== 'object') return null
    const r = o as Record<string, unknown>
    if (r.v !== 1) return null
    const builtin = r.builtin && typeof r.builtin === 'object' ? (r.builtin as Partial<Record<BuiltinSecretKey, string>>) : {}
    const customSlots =
      r.customSlots && typeof r.customSlots === 'object' ? (r.customSlots as Record<string, string>) : {}
    const metaRaw = r.customApiTokenSlotsMeta
    let customApiTokenSlotsMeta: CustomApiTokenSlot[] | undefined
    if (Array.isArray(metaRaw)) {
      customApiTokenSlotsMeta = metaRaw
        .map(x => sanitizeCustomApiTokenSlot(x))
        .filter((s): s is CustomApiTokenSlot => s != null)
    }
    return {
      v: 1,
      savedAt: typeof r.savedAt === 'string' ? r.savedAt : new Date(0).toISOString(),
      builtin: { ...builtin },
      customSlots: { ...customSlots },
      ...(customApiTokenSlotsMeta?.length ? { customApiTokenSlotsMeta } : {}),
    }
  } catch {
    return null
  }
}

function mergeMetaPreferSettingsThenVault(
  metaFromSettings: CustomApiTokenSlot[],
  prevMeta: CustomApiTokenSlot[] | undefined,
): CustomApiTokenSlot[] {
  if (metaFromSettings.length > 0) return metaFromSettings
  return prevMeta?.length ? prevMeta : []
}

function readCustomSlotsMetaFromSystemSettingsJson(): CustomApiTokenSlot[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return []
    const o = JSON.parse(raw) as Record<string, unknown>
    const arr = o.customApiTokenSlots
    if (!Array.isArray(arr)) return []
    return arr.map(x => sanitizeCustomApiTokenSlot(x)).filter((s): s is CustomApiTokenSlot => s != null)
  } catch {
    return []
  }
}

/** Fill empty per-key localStorage entries from the last merged vault snapshot. */
export function restoreBrowserApiSecretsFromVaultIntoLocalStorage(): void {
  const vault = readRawVault()
  if (!vault) return
  for (const k of BUILTIN_ORDER) {
    const fromVault = typeof vault.builtin[k] === 'string' ? vault.builtin[k]!.trim() : ''
    if (!fromVault) continue
    if (BUILTIN_GET[k]().trim()) continue
    BUILTIN_SET[k](fromVault)
  }
  for (const [slotId, val] of Object.entries(vault.customSlots || {})) {
    const v = typeof val === 'string' ? val.trim() : ''
    if (!v) continue
    if (getUserApiTokenValue(slotId).trim()) continue
    persistUserApiTokenValue(slotId, v)
  }
}

/**
 * Re-attach custom API token cards when settings list was cleared but vault (or browser) still holds secrets.
 */
export function augmentCustomApiTokenSlotsFromVault(slots: CustomApiTokenSlot[]): CustomApiTokenSlot[] {
  const vault = readRawVault()
  const meta = vault?.customApiTokenSlotsMeta ?? []
  if (!meta.length) return slots
  const byId = new Map(slots.map(s => [s.id, s]))
  for (const raw of meta) {
    const s = sanitizeCustomApiTokenSlot(raw)
    if (!s || byId.has(s.id)) continue
    const inLs = getUserApiTokenValue(s.id).trim()
    const inVault = typeof vault?.customSlots[s.id] === 'string' ? vault.customSlots[s.id].trim() : ''
    if (inLs || inVault) byId.set(s.id, s)
  }
  return Array.from(byId.values())
}

function collectCurrentBuiltinForVault(): Partial<Record<BuiltinSecretKey, string>> {
  const out: Partial<Record<BuiltinSecretKey, string>> = {}
  for (const k of BUILTIN_ORDER) {
    const v = BUILTIN_GET[k]().trim()
    if (v) out[k] = v
  }
  return out
}

function collectCustomSlotsForVault(metaSlots: CustomApiTokenSlot[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of metaSlots) {
    const v = getUserApiTokenValue(s.id).trim()
    if (v) out[s.id] = v
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const prefix = 'agri_user_api_token_v1_'
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)
        if (!key || !key.startsWith(prefix)) continue
        const id = key.slice(prefix.length)
        if (!id || out[id]) continue
        const v = getUserApiTokenValue(id).trim()
        if (v) out[id] = v
      }
    }
  } catch {
    // ignore
  }
  return out
}

export function snapshotBrowserApiSecretsVaultNow(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const prev = readRawVault()
  const metaFromSettings = readCustomSlotsMetaFromSystemSettingsJson()
  const effectiveMeta = mergeMetaPreferSettingsThenVault(metaFromSettings, prev?.customApiTokenSlotsMeta)
  const next: VaultV1 = {
    v: 1,
    savedAt: new Date().toISOString(),
    /** Always mirror current browser overrides so user clears are not resurrected from an old vault. */
    builtin: collectCurrentBuiltinForVault(),
    customSlots: collectCustomSlotsForVault(effectiveMeta),
    ...(effectiveMeta.length ? { customApiTokenSlotsMeta: effectiveMeta } : {}),
  }
  try {
    window.localStorage.setItem(BROWSER_API_SECRETS_VAULT_KEY, JSON.stringify(next))
  } catch {
    console.warn('[api-vault] Could not persist browser API secrets vault')
  }
}

let snapTimer: number | null = null

export function scheduleBrowserApiSecretsVaultSnapshot(): void {
  if (typeof window === 'undefined') return
  if (snapTimer != null) window.clearTimeout(snapTimer)
  snapTimer = window.setTimeout(() => {
    snapTimer = null
    snapshotBrowserApiSecretsVaultNow()
  }, 450)
}

/**
 * Wipe vault custom slot entries for ids no longer present in settings (after user removes a card).
 * Does not remove builtin backup lines.
 */
export function pruneVaultCustomEntriesForRemovedSlots(remainingSlotIds: Set<string>): void {
  const prev = readRawVault()
  if (!prev) return
  const customSlots: Record<string, string> = {}
  for (const [id, v] of Object.entries(prev.customSlots || {})) {
    if (remainingSlotIds.has(id) && typeof v === 'string' && v.trim()) customSlots[id] = v
  }
  let customApiTokenSlotsMeta = prev.customApiTokenSlotsMeta?.filter(s => remainingSlotIds.has(s.id))
  if (customApiTokenSlotsMeta?.length === 0) customApiTokenSlotsMeta = undefined
  const next: VaultV1 = {
    v: 1,
    savedAt: new Date().toISOString(),
    builtin: collectCurrentBuiltinForVault(),
    customSlots,
    ...(customApiTokenSlotsMeta?.length ? { customApiTokenSlotsMeta } : {}),
  }
  try {
    window.localStorage.setItem(BROWSER_API_SECRETS_VAULT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

/** Explicit clear of a custom slot everywhere (browser keys + vault). */
export function clearCustomUserApiTokenEverywhere(slotId: string): void {
  clearUserApiTokenValue(slotId)
  const prev = readRawVault()
  if (!prev) return
  const customSlots = { ...prev.customSlots }
  delete customSlots[slotId]
  const meta = prev.customApiTokenSlotsMeta?.filter(s => s.id !== slotId)
  const next: VaultV1 = {
    v: 1,
    savedAt: new Date().toISOString(),
    builtin: collectCurrentBuiltinForVault(),
    customSlots,
    ...(meta?.length ? { customApiTokenSlotsMeta: meta } : {}),
  }
  try {
    window.localStorage.setItem(BROWSER_API_SECRETS_VAULT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

/** After full settings reset: drop custom slot backup so removed cards are not auto-restored. */
export function clearBrowserApiVaultCustomSection(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const next: VaultV1 = {
    v: 1,
    savedAt: new Date().toISOString(),
    builtin: collectCurrentBuiltinForVault(),
    customSlots: {},
  }
  try {
    window.localStorage.setItem(BROWSER_API_SECRETS_VAULT_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}
