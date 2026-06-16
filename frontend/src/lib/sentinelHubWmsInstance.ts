/**
 * Sentinel Hub OGC WMS instance UUID: build-time env and/or browser override
 * (System Settings → API Tokens). Used for Sentinel-2 WMS in Satellite Intelligence.
 */

export const SENTINEL_HUB_WMS_INSTANCE_LS_KEY = 'agri_sentinel_hub_wms_instance_id_v1'

const SENTINEL_HUB_WMS_INSTANCE_EVENT = 'agri-sentinel-hub-wms-instance-changed'

/** Default OGC WMS instance (public featured collections); replace via env or System Settings. */
export const SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID = '60de79ca-16a7-4afd-bcbd-0261bf0156fa'

function envInstanceId(): string {
  const raw = import.meta.env.VITE_SENTINEL_HUB_WMS_INSTANCE_ID
  return typeof raw === 'string' ? raw.trim() : ''
}

export function getSentinelHubWmsInstanceIdBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/** Effective instance: saved browser value, then env, then built-in default. */
export function getSentinelHubWmsInstanceId(): string {
  const fromLs = getSentinelHubWmsInstanceIdBrowserOverride()
  if (fromLs) return fromLs
  const fromEnv = envInstanceId()
  if (fromEnv) return fromEnv
  return SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID
}

export function getSentinelHubWmsBaseUrl(): string {
  return `https://services.sentinel-hub.com/ogc/wms/${getSentinelHubWmsInstanceId()}`
}

export function persistSentinelHubWmsInstanceIdInBrowser(instanceId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const t = instanceId.trim()
  try {
    if (!t) window.localStorage.removeItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY)
    else window.localStorage.setItem(SENTINEL_HUB_WMS_INSTANCE_LS_KEY, t)
  } catch {
    console.warn('[sentinel-hub] Could not persist WMS instance id in localStorage')
  }
  window.dispatchEvent(new Event(SENTINEL_HUB_WMS_INSTANCE_EVENT))
}

export function subscribeSentinelHubWmsInstance(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === SENTINEL_HUB_WMS_INSTANCE_LS_KEY || e.key === null) listener()
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(SENTINEL_HUB_WMS_INSTANCE_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(SENTINEL_HUB_WMS_INSTANCE_EVENT, onCustom)
  }
}
