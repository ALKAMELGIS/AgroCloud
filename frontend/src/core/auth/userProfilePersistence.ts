/**
 * Profile extras (avatar, address, etc.) — browser cache plus optional Node persistence
 * so the same account can hydrate on another device when the API is available.
 */
import { normalizeEmail } from './auth'

export const USER_PROFILES_STORAGE_KEY = 'user_profiles_v1'

export type ProfileExtra = {
  avatarDataUrl?: string
  coverDataUrl?: string
  firstName?: string
  lastName?: string
  phone?: string
  dateOfBirth?: string
  country?: string
  city?: string
  postalCode?: string
  profileTheme?: 'auto' | 'light' | 'dark'
  profileIsPrivate?: boolean
  hideEmailOnProfile?: boolean
  hidePhoneOnProfile?: boolean
  allowActivityStatus?: boolean
}

export function profileStorageKey(email: string): string {
  return normalizeEmail(email)
}

export function readProfileExtra(email: string): ProfileExtra {
  try {
    const raw = localStorage.getItem(USER_PROFILES_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>
    const row = parsed[profileStorageKey(email)]
    if (!row || typeof row !== 'object') return {}
    return row as ProfileExtra
  } catch {
    return {}
  }
}

function mergeProfilePatch(prev: ProfileExtra, patch: Partial<ProfileExtra>): ProfileExtra {
  return { ...prev, ...patch }
}

export function writeProfileExtra(email: string, patch: Partial<ProfileExtra>): ProfileExtra {
  const key = profileStorageKey(email)
  let merged: ProfileExtra = {}
  try {
    const raw = localStorage.getItem(USER_PROFILES_STORAGE_KEY)
    const all: Record<string, Record<string, unknown>> = raw ? JSON.parse(raw) : {}
    const prev = all[key] && typeof all[key] === 'object' ? (all[key] as ProfileExtra) : {}
    merged = mergeProfilePatch(prev, patch)
    all[key] = { ...merged }
    localStorage.setItem(USER_PROFILES_STORAGE_KEY, JSON.stringify(all))
    window.dispatchEvent(new Event('storage'))
  } catch {
    /* ignore */
  }
  try {
    syncProfileExtraToAdminDirectory(key, merged)
  } catch {
    /* ignore */
  }
  void pushProfileExtraToServer(key, merged)
  return merged
}

/** Merge server/admin snapshot into local cache (local keys win on conflict). */
export function mergeExternalProfileIntoCache(email: string, remote: Partial<ProfileExtra> | null | undefined): void {
  if (!remote || typeof remote !== 'object') return
  const key = profileStorageKey(email)
  try {
    const raw = localStorage.getItem(USER_PROFILES_STORAGE_KEY)
    const all: Record<string, Record<string, unknown>> = raw ? JSON.parse(raw) : {}
    const local = all[key] && typeof all[key] === 'object' ? (all[key] as ProfileExtra) : {}
    // Keep the user's latest local saved profile as source of truth.
    // Remote snapshot is used only to backfill missing keys.
    all[key] = { ...remote, ...local }
    localStorage.setItem(USER_PROFILES_STORAGE_KEY, JSON.stringify(all))
    window.dispatchEvent(new Event('storage'))
  } catch {
    /* ignore */
  }
}

export function hydrateProfileFromAdminUserRecord(adminUser: Record<string, unknown> | null | undefined): void {
  if (!adminUser || typeof adminUser !== 'object') return
  const email = typeof adminUser.email === 'string' ? adminUser.email : ''
  if (!email.trim()) return
  const pe = adminUser.profileExtra
  if (pe && typeof pe === 'object') {
    mergeExternalProfileIntoCache(email, pe as ProfileExtra)
  }
}

function syncProfileExtraToAdminDirectory(normalizedEmailKey: string, profile: ProfileExtra): void {
  const raw = localStorage.getItem('adminUsers')
  if (!raw) return
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) return
  let changed = false
  const next = parsed.map((u: Record<string, unknown>) => {
    if (!u || typeof u !== 'object') return u
    const em = typeof u.email === 'string' ? u.email : ''
    if (normalizeEmail(em) !== normalizedEmailKey) return u
    changed = true
    return { ...u, profileExtra: { ...profile } }
  })
  if (changed) {
    localStorage.setItem('adminUsers', JSON.stringify(next))
    window.dispatchEvent(new Event('storage'))
  }
}

const DEFAULT_PROFILE_API = '/api/v1/account/profile-extra'

function profileApiBase(): string {
  const raw = import.meta.env.VITE_AGRI_USER_PROFILE_URL
  const u = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
  return u || DEFAULT_PROFILE_API
}

function profileAuthHeaders(): HeadersInit {
  const raw = import.meta.env.VITE_AGRI_USER_PROFILE_TOKEN
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return {}
  return { 'X-Agri-User-Profile-Token': t, Authorization: `Bearer ${t}` }
}

export async function pullProfileExtraFromServer(email: string): Promise<ProfileExtra | null> {
  const key = profileStorageKey(email)
  if (!key) return null
  try {
    const url = `${profileApiBase()}?email=${encodeURIComponent(key)}`
    const res = await fetch(url, { method: 'GET', headers: { ...profileAuthHeaders() } })
    if (!res.ok) return null
    const data = (await res.json()) as { ok?: boolean; profile?: ProfileExtra }
    if (!data || data.ok === false || !data.profile || typeof data.profile !== 'object') return null
    return data.profile as ProfileExtra
  } catch {
    return null
  }
}

export async function hydrateProfileFromServer(email: string): Promise<void> {
  const remote = await pullProfileExtraFromServer(email)
  if (remote && Object.keys(remote).length) {
    mergeExternalProfileIntoCache(email, remote)
    syncProfileExtraToAdminDirectory(profileStorageKey(email), readProfileExtra(email))
  }
}

async function pushProfileExtraToServer(normalizedEmailKey: string, full: ProfileExtra): Promise<void> {
  if (!normalizedEmailKey) return
  try {
    const res = await fetch(profileApiBase(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...profileAuthHeaders() },
      body: JSON.stringify({ email: normalizedEmailKey, profile: full }),
    })
    if (!res.ok && res.status !== 404) {
      /* 404 = static host without API — expected */
    }
  } catch {
    /* offline / static hosting */
  }
}
