/**
 * ArcGIS Portal / REST token: build-time env and/or browser override (System Settings → API Tokens).
 * Do not commit real tokens.
 */

export const ARCGIS_PORTAL_TOKEN_LS_KEY = 'agri_arcgis_portal_token_v1'

const ARCGIS_TOKEN_EVENT = 'agri-arcgis-portal-token-changed'

function envToken(): string {
  const raw = import.meta.env.VITE_ARCGIS_PORTAL_TOKEN
  return typeof raw === 'string' ? raw.trim() : ''
}

/** Value saved only in this browser (admin API Tokens tab). */
export function getArcgisPortalTokenBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(ARCGIS_PORTAL_TOKEN_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/** Effective token: saved browser value first, then VITE_ARCGIS_PORTAL_TOKEN. */
export function getArcgisPortalToken(): string {
  const fromLs = getArcgisPortalTokenBrowserOverride()
  if (fromLs) return fromLs
  return envToken()
}

export function persistArcgisPortalTokenInBrowser(token: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const t = token.trim()
  try {
    if (!t) window.localStorage.removeItem(ARCGIS_PORTAL_TOKEN_LS_KEY)
    else window.localStorage.setItem(ARCGIS_PORTAL_TOKEN_LS_KEY, t)
  } catch {
    console.warn('[arcgis] Could not persist token in localStorage')
  }
  window.dispatchEvent(new Event(ARCGIS_TOKEN_EVENT))
}

export function subscribeArcgisPortalToken(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === ARCGIS_PORTAL_TOKEN_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(ARCGIS_TOKEN_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(ARCGIS_TOKEN_EVENT, onCustom)
  }
}
