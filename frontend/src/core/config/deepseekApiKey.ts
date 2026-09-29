/**
 * DeepSeek API key: build-time env and/or browser override (System Settings → API Tokens).
 * Used by AI Agro-Chat. Never commit real keys.
 */

export const DEEPSEEK_API_KEY_LS_KEY = 'agri_deepseek_api_key_v1'

const DEEPSEEK_API_KEY_EVENT = 'agri-deepseek-api-key-changed'

function envDeepseekKey(): string {
  const raw = import.meta.env.VITE_DEEPSEEK_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

export function getDeepseekApiKeyBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(DEEPSEEK_API_KEY_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function getDeepseekApiKey(): string {
  const fromLs = getDeepseekApiKeyBrowserOverride()
  if (fromLs) return fromLs
  return envDeepseekKey()
}

export function persistDeepseekApiKeyInBrowser(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const k = key.trim()
  try {
    if (!k) window.localStorage.removeItem(DEEPSEEK_API_KEY_LS_KEY)
    else window.localStorage.setItem(DEEPSEEK_API_KEY_LS_KEY, k)
  } catch {
    console.warn('[deepseek] Could not persist API key in localStorage')
  }
  window.dispatchEvent(new Event(DEEPSEEK_API_KEY_EVENT))
}

export function subscribeDeepseekApiKey(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === DEEPSEEK_API_KEY_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(DEEPSEEK_API_KEY_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(DEEPSEEK_API_KEY_EVENT, onCustom)
  }
}
