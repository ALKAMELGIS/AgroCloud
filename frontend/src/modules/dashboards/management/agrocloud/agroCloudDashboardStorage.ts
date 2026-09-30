/** Embedded ArcGIS Dashboard URL for Agro Cloud — stored in localStorage (browser-only). */

export const AGRO_CLOUD_DASHBOARD_STORAGE_KEY = 'agroCloudDashboardEmbedUrl_v1'

export const DEFAULT_AGRO_CLOUD_DASHBOARD_URL =
  'https://eap.maps.arcgis.com/apps/dashboards/dc80932dd15e40bba4d5f3fcca829a98'

export const AGRO_CLOUD_EMBED_CHANGED_EVENT = 'agroCloudDashboardEmbedChanged'

export function readAgroCloudDashboardUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_AGRO_CLOUD_DASHBOARD_URL
  try {
    const raw = localStorage.getItem(AGRO_CLOUD_DASHBOARD_STORAGE_KEY)
    if (!raw?.trim()) return DEFAULT_AGRO_CLOUD_DASHBOARD_URL
    const u = new URL(raw.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return DEFAULT_AGRO_CLOUD_DASHBOARD_URL
    return raw.trim()
  } catch {
    return DEFAULT_AGRO_CLOUD_DASHBOARD_URL
  }
}

export function isValidEmbedUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

export function writeAgroCloudDashboardUrl(url: string): void {
  localStorage.setItem(AGRO_CLOUD_DASHBOARD_STORAGE_KEY, url.trim())
  window.dispatchEvent(new CustomEvent(AGRO_CLOUD_EMBED_CHANGED_EVENT))
}

export function resetAgroCloudDashboardUrl(): void {
  try {
    localStorage.removeItem(AGRO_CLOUD_DASHBOARD_STORAGE_KEY)
  } catch {
    //
  }
  window.dispatchEvent(new CustomEvent(AGRO_CLOUD_EMBED_CHANGED_EVENT))
}

/** When true (default), iframe stays mounted between navigations — no reload when returning. */
export const AGRO_CLOUD_KEEP_ALIVE_KEY = 'agroCloudDashboardKeepAlive_v1'

export const AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT = 'agroCloudDashboardKeepAliveChanged'

export function readAgroCloudKeepAlive(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = localStorage.getItem(AGRO_CLOUD_KEEP_ALIVE_KEY)
    if (raw === null || raw === '') return true
    return raw === '1' || raw === 'true'
  } catch {
    return true
  }
}

export function writeAgroCloudKeepAlive(enabled: boolean): void {
  try {
    localStorage.setItem(AGRO_CLOUD_KEEP_ALIVE_KEY, enabled ? '1' : '0')
  } catch {
    //
  }
  window.dispatchEvent(new CustomEvent(AGRO_CLOUD_KEEP_ALIVE_CHANGED_EVENT))
}
