/** GPS Vehicle Tracking embed entry URL — stored in localStorage (browser-only). */

import { apiUrl } from './apiOrigin'
import {
  JOHN_DEERE_GPS_DEFAULT_ENTRY_URL,
  johnDeereGpsInAppEmbedSrcForUrl,
  johnDeereGpsInAppEntryUrl,
} from './johnDeereGpsMap'

export const GPS_VEHICLE_TRACKING_URL_STORAGE_KEY = 'gpsVehicleTrackingEmbedUrl_v1'

export const DEFAULT_GPS_VEHICLE_TRACKING_URL = JOHN_DEERE_GPS_DEFAULT_ENTRY_URL

export const GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT = 'gpsVehicleTrackingEmbedChanged'

const ALLOWED_GPS_HOSTS = new Set(['map.deere.com', 'signin.johndeere.com', 'signin.deere.com'])

export function isValidGpsVehicleTrackingUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return ALLOWED_GPS_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

export function readGpsVehicleTrackingUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_GPS_VEHICLE_TRACKING_URL
  try {
    const raw = localStorage.getItem(GPS_VEHICLE_TRACKING_URL_STORAGE_KEY)
    if (!raw?.trim()) return DEFAULT_GPS_VEHICLE_TRACKING_URL
    if (!isValidGpsVehicleTrackingUrl(raw)) return DEFAULT_GPS_VEHICLE_TRACKING_URL
    return raw.trim()
  } catch {
    return DEFAULT_GPS_VEHICLE_TRACKING_URL
  }
}

export function writeGpsVehicleTrackingUrl(url: string): void {
  localStorage.setItem(GPS_VEHICLE_TRACKING_URL_STORAGE_KEY, url.trim())
  window.dispatchEvent(new CustomEvent(GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT))
}

export function resetGpsVehicleTrackingUrl(): void {
  try {
    localStorage.removeItem(GPS_VEHICLE_TRACKING_URL_STORAGE_KEY)
  } catch {
    //
  }
  window.dispatchEvent(new CustomEvent(GPS_VEHICLE_TRACKING_EMBED_CHANGED_EVENT))
}

function proxiedEmbedSrc(externalUrl: string): string {
  return apiUrl(johnDeereGpsInAppEmbedSrcForUrl(externalUrl))
}

/** Proxied iframe `src` for the URL saved in Dashboard Settings. */
export function readGpsVehicleTrackingEmbedSrc(): string {
  return proxiedEmbedSrc(readGpsVehicleTrackingUrl())
}

/**
 * John Deere Tracking page — prefers map.deere.com when settings hold OAuth (sign-in often fails in iframe).
 */
export function readJohnDeereTrackingEmbedSrc(): string {
  const configured = readGpsVehicleTrackingUrl()
  const isOAuthSignIn =
    configured.includes('signin.johndeere.com') && configured.includes('/oauth2/')
  const entry = isOAuthSignIn
    ? johnDeereGpsInAppEntryUrl(JOHN_DEERE_GPS_DEFAULT_ENTRY_URL)
    : configured
  return proxiedEmbedSrc(entry)
}
