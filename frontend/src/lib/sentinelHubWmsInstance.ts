/**
 * Sentinel Hub / CDSE OGC WMS instance UUID: build-time env and/or browser override
 * (System Settings → API Tokens). Used for Sentinel-2 WMS in Satellite Intelligence.
 */

import type { RemoteSensingMapBackend } from './remoteSensingProviders'

export const SENTINEL_HUB_WMS_INSTANCE_LS_KEY = 'agri_sentinel_hub_wms_instance_id_v1'
export const CDSE_WMS_INSTANCE_LS_KEY = 'agri_cdse_wms_instance_id_v1'

const SENTINEL_HUB_WMS_INSTANCE_EVENT = 'agri-sentinel-hub-wms-instance-changed'
const CDSE_WMS_INSTANCE_EVENT = 'agri-cdse-wms-instance-changed'

/** Default OGC WMS instance (public featured collections); replace via env or System Settings. */
export const SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID = '60de79ca-16a7-4afd-bcbd-0261bf0156fa'

export const SENTINEL_HUB_WMS_HOST_COMMERCIAL = 'https://services.sentinel-hub.com/ogc/wms'
export const SENTINEL_HUB_WMS_HOST_CDSE = 'https://sh.dataspace.copernicus.eu/ogc/wms'

function envInstanceId(): string {
  const raw = import.meta.env.VITE_SENTINEL_HUB_WMS_INSTANCE_ID
  return typeof raw === 'string' ? raw.trim() : ''
}

function envCdseInstanceId(): string {
  const raw = import.meta.env.VITE_CDSE_WMS_INSTANCE_ID
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

export function getCdseWmsInstanceIdBrowserOverride(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = window.localStorage.getItem(CDSE_WMS_INSTANCE_LS_KEY)
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/** Effective commercial SH instance: saved browser value, then env, then built-in default. */
export function getSentinelHubWmsInstanceId(): string {
  const fromLs = getSentinelHubWmsInstanceIdBrowserOverride()
  if (fromLs) return fromLs
  const fromEnv = envInstanceId()
  if (fromEnv) return fromEnv
  return SENTINEL_HUB_WMS_DEFAULT_INSTANCE_ID
}

/**
 * CDSE configuration instance from Dashboard → Configuration Utility.
 * Empty when unset — callers should fall back to the commercial SH host.
 */
export function getCdseWmsInstanceId(): string {
  const fromLs = getCdseWmsInstanceIdBrowserOverride()
  if (fromLs) return fromLs
  return envCdseInstanceId()
}

export function resolveWmsHost(backend: RemoteSensingMapBackend = 'sentinel-hub'): string {
  return backend === 'cdse' ? SENTINEL_HUB_WMS_HOST_CDSE : SENTINEL_HUB_WMS_HOST_COMMERCIAL
}

/**
 * Effective WMS base URL for Layer Live / AOI tiles.
 * ESA / CDSE uses dataspace.eu when a CDSE instance id is configured; otherwise falls back
 * to the commercial Sentinel Hub host so the map canvas still receives imagery.
 */
export function getSentinelHubWmsBaseUrl(backend: RemoteSensingMapBackend = 'sentinel-hub'): string {
  if (backend === 'cdse') {
    const cdseId = getCdseWmsInstanceId()
    if (cdseId) return `${SENTINEL_HUB_WMS_HOST_CDSE}/${cdseId}`
    // No CDSE config yet — keep map working via open SH collections.
    return `${SENTINEL_HUB_WMS_HOST_COMMERCIAL}/${getSentinelHubWmsInstanceId()}`
  }
  return `${SENTINEL_HUB_WMS_HOST_COMMERCIAL}/${getSentinelHubWmsInstanceId()}`
}

/** True when ESA provider can hit the real CDSE WMS host (instance configured). */
export function isCdseWmsConfigured(): boolean {
  return Boolean(getCdseWmsInstanceId())
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

export function persistCdseWmsInstanceIdInBrowser(instanceId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  const t = instanceId.trim()
  try {
    if (!t) window.localStorage.removeItem(CDSE_WMS_INSTANCE_LS_KEY)
    else window.localStorage.setItem(CDSE_WMS_INSTANCE_LS_KEY, t)
  } catch {
    console.warn('[cdse] Could not persist WMS instance id in localStorage')
  }
  window.dispatchEvent(new Event(CDSE_WMS_INSTANCE_EVENT))
}

export function subscribeSentinelHubWmsInstance(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === SENTINEL_HUB_WMS_INSTANCE_LS_KEY ||
      e.key === CDSE_WMS_INSTANCE_LS_KEY ||
      e.key === null
    ) {
      listener()
    }
  }
  const onCustom = () => listener()
  window.addEventListener('storage', onStorage)
  window.addEventListener(SENTINEL_HUB_WMS_INSTANCE_EVENT, onCustom)
  window.addEventListener(CDSE_WMS_INSTANCE_EVENT, onCustom)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(SENTINEL_HUB_WMS_INSTANCE_EVENT, onCustom)
    window.removeEventListener(CDSE_WMS_INSTANCE_EVENT, onCustom)
  }
}
