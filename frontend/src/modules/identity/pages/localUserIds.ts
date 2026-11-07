/**
 * Numeric ids for the user-directory page.
 *
 * Directory users have numeric ids, but users created through the identity API only have a UUID.
 * They used to fall back to `Date.now()` — the same value for every such user in one render —
 * so rows shared React keys and edits/selection could hit the wrong user.
 */

/** Ids derived from UUIDs live above this, clear of real directory ids and of `Date.now()` values. */
const DERIVED_ID_BASE = 9_000_000_000_000

/** Same UUID → same id on every load (FNV-1a, 32-bit). */
export function stableIdFromString(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return DERIVED_ID_BASE + h
}

let lastIssued = 0

/** A new id for a user created on this page: time-based, never repeated within the session. */
export function newLocalUserId(): number {
  const now = Date.now()
  lastIssued = now > lastIssued ? now : lastIssued + 1
  return lastIssued
}

/** Id for a stored/server user: its numeric id, else one derived from its UUID, else a new one. */
export function resolveLocalUserId(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (/^\d+$/.test(text) && Number(text) > 0) return Number(text)
  if (text) return stableIdFromString(text)
  return newLocalUserId()
}
