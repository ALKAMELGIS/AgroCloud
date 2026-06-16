/**
 * Google Gemini API key: build-time env and/or browser override (System Settings → API Tokens).
 * Used by Satellite Intelligence → Table Geo AI (Geo Explorer). Never commit real keys.
 */

export const GEMINI_API_KEY_LS_KEY = 'agri_gemini_api_key_v1'

const GEMINI_API_KEY_EVENT = 'agri-gemini-api-key-changed'

function envGeminiKey(): string {
  const raw = import.meta.env.VITE_GEMINI_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

/** Value saved only in this browser (admin API Tokens → Gemini API). */
export function getGeminiApiKeyBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(GEMINI_API_KEY_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/** Effective key: saved browser value first, then VITE_GEMINI_API_KEY. */
export function getGeminiApiKey(): string {
  const fromLs = getGeminiApiKeyBrowserOverride()
  if (fromLs) return fromLs
  return envGeminiKey()
}

export function persistGeminiApiKeyInBrowser(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const k = key.trim()
  try {
    if (!k) window.localStorage.removeItem(GEMINI_API_KEY_LS_KEY)
    else window.localStorage.setItem(GEMINI_API_KEY_LS_KEY, k)
  } catch {
    console.warn('[gemini] Could not persist API key in localStorage')
  }
  window.dispatchEvent(new Event(GEMINI_API_KEY_EVENT))
}

export function subscribeGeminiApiKey(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === GEMINI_API_KEY_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(GEMINI_API_KEY_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(GEMINI_API_KEY_EVENT, onCustom)
  }
}
