/**
 * OpenWeatherMap API key: build-time env and/or browser override (System Settings → API Tokens).
 * Used for Geo AI weather context (current + short forecast). Never commit real keys.
 *
 * getSnapshot must stay cheap and side-effect free (useSyncExternalStore): do not read full system
 * settings here. Use the dedicated OpenWeather card (or paste the same key there if it lived under “Add API Tokens”).
 */

export const OPENWEATHER_MAP_API_KEY_LS_KEY = 'agri_openweathermap_api_key_v1'

const OPENWEATHER_MAP_API_KEY_EVENT = 'agri-openweathermap-api-key-changed'

function envOpenWeatherKey(): string {
  const raw = import.meta.env.VITE_OPENWEATHER_API_KEY
  return typeof raw === 'string' ? raw.trim() : ''
}

export function getOpenWeatherMapApiKeyBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(OPENWEATHER_MAP_API_KEY_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/** Effective key: dedicated browser value first, then VITE_OPENWEATHER_API_KEY. */
export function getOpenWeatherMapApiKey(): string {
  const fromLs = getOpenWeatherMapApiKeyBrowserOverride()
  if (fromLs) return fromLs
  return envOpenWeatherKey()
}

export function persistOpenWeatherMapApiKeyInBrowser(key: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const k = key.trim()
  try {
    if (!k) window.localStorage.removeItem(OPENWEATHER_MAP_API_KEY_LS_KEY)
    else window.localStorage.setItem(OPENWEATHER_MAP_API_KEY_LS_KEY, k)
  } catch {
    console.warn('[openweathermap] Could not persist API key in localStorage')
  }
  window.dispatchEvent(new Event(OPENWEATHER_MAP_API_KEY_EVENT))
}

export function subscribeOpenWeatherMapApiKey(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === OPENWEATHER_MAP_API_KEY_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(OPENWEATHER_MAP_API_KEY_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(OPENWEATHER_MAP_API_KEY_EVENT, onCustom)
  }
}
