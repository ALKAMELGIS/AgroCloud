/** John Deere Okta sign-in embed — separate from map.deere.com / GPS vehicle tracking. */

import { apiUrl } from './apiOrigin'
import {
  findPageLinkByPath,
  JOHN_DEERE_SIGN_IN_EMBED_URL,
  JOHN_DEERE_SIGN_IN_PAGE_PATH,
} from './defaultPageLinks'
import { johnDeereGpsEmbedSrcForUrl } from './johnDeereGpsMap'
import type { CustomPageRecord } from '../types/systemSettings'

export { JOHN_DEERE_SIGN_IN_PAGE_PATH, JOHN_DEERE_SIGN_IN_EMBED_URL }

const ALLOWED_SIGN_IN_HOSTS = new Set(['signin.johndeere.com', 'signin.deere.com'])

export function isValidJohnDeereSignInEmbedUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return ALLOWED_SIGN_IN_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

function normalizeSignInEmbedUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed || !isValidJohnDeereSignInEmbedUrl(trimmed)) return JOHN_DEERE_SIGN_IN_EMBED_URL
  try {
    const u = new URL(trimmed)
    // Saved /authorize?... links (PKCE) time out in iframes — use portal home so Okta starts a fresh session.
    if (u.pathname.includes('/authorize') && u.search.includes('code_challenge=')) {
      return JOHN_DEERE_SIGN_IN_EMBED_URL
    }
    return trimmed
  } catch {
    return JOHN_DEERE_SIGN_IN_EMBED_URL
  }
}

export function resolveJohnDeereSignInEmbedUrl(pages: CustomPageRecord[]): string {
  const link = findPageLinkByPath(pages, JOHN_DEERE_SIGN_IN_PAGE_PATH)
  const fromSettings = link?.externalUrl?.trim()
  if (fromSettings) return normalizeSignInEmbedUrl(fromSettings)
  return JOHN_DEERE_SIGN_IN_EMBED_URL
}

/** Same-origin proxy path (backend strips X-Frame-Options on signin.johndeere.com). */
export function readJohnDeereSignInEmbedSrc(pages: CustomPageRecord[]): string {
  return apiUrl(johnDeereGpsEmbedSrcForUrl(resolveJohnDeereSignInEmbedUrl(pages)))
}
