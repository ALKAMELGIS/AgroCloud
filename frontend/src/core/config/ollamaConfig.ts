/**
 * Ollama connection config: base URL + model. Resolved from a browser override
 * (System Settings → API Tokens → Ollama) first, then build-time env, then a
 * sensible local default. Ollama runs locally and needs no API key — only the
 * base URL of the running server (default http://localhost:11434) and a model
 * name that is already pulled (e.g. `ollama pull llama3.1`).
 */

export const OLLAMA_BASE_URL_LS_KEY = 'agri_ollama_base_url_v1'
export const OLLAMA_MODEL_LS_KEY = 'agri_ollama_model_v1'

const OLLAMA_CONFIG_EVENT = 'agri-ollama-config-changed'

export const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434'
export const DEFAULT_OLLAMA_MODEL = 'llama3.1'

function envBaseUrl(): string {
  const raw = import.meta.env.VITE_OLLAMA_BASE_URL
  return typeof raw === 'string' ? raw.trim() : ''
}

function envModel(): string {
  const raw = import.meta.env.VITE_OLLAMA_MODEL
  return typeof raw === 'string' ? raw.trim() : ''
}

function readLs(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(key)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

export function getOllamaBaseUrlBrowserOverride(): string {
  return readLs(OLLAMA_BASE_URL_LS_KEY)
}

export function getOllamaModelBrowserOverride(): string {
  return readLs(OLLAMA_MODEL_LS_KEY)
}

export function getOllamaBaseUrl(): string {
  return getOllamaBaseUrlBrowserOverride() || envBaseUrl() || DEFAULT_OLLAMA_BASE_URL
}

export function getOllamaModel(): string {
  return getOllamaModelBrowserOverride() || envModel() || DEFAULT_OLLAMA_MODEL
}

function persistLs(key: string, value: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const v = value.trim()
  try {
    if (!v) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, v)
  } catch {
    console.warn('[ollama] Could not persist config in localStorage')
  }
  window.dispatchEvent(new Event(OLLAMA_CONFIG_EVENT))
}

export function persistOllamaBaseUrlInBrowser(value: string): void {
  persistLs(OLLAMA_BASE_URL_LS_KEY, value)
}

export function persistOllamaModelInBrowser(value: string): void {
  persistLs(OLLAMA_MODEL_LS_KEY, value)
}

export function subscribeOllamaConfig(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === OLLAMA_BASE_URL_LS_KEY || e.key === OLLAMA_MODEL_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(OLLAMA_CONFIG_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(OLLAMA_CONFIG_EVENT, onCustom)
  }
}
