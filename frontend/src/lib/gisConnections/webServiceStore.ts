import type { GisWebServiceKind, GisWebServiceProfile } from './types'

export const GIS_WEB_SERVICES_LS_KEY = 'agrocloud.gis.webServices'

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `gis-ws-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function readRaw(): unknown {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(GIS_WEB_SERVICES_LS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as unknown
  } catch {
    return []
  }
}

function isProfile(value: unknown): value is GisWebServiceProfile {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.url === 'string' &&
    typeof v.savedAt === 'string'
  )
}

function writeAll(profiles: GisWebServiceProfile[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(GIS_WEB_SERVICES_LS_KEY, JSON.stringify(profiles))
  } catch {
    console.warn('[gisConnections] Could not persist web services')
  }
}

export function listWebServices(): GisWebServiceProfile[] {
  const raw = readRaw()
  if (!Array.isArray(raw)) return []
  return raw.filter(isProfile)
}

export function saveWebService(
  profile: Omit<GisWebServiceProfile, 'id' | 'savedAt'> &
    Partial<Pick<GisWebServiceProfile, 'id' | 'savedAt'>>,
): GisWebServiceProfile {
  const all = listWebServices()
  const id = profile.id?.trim() || newId()
  const next: GisWebServiceProfile = {
    ...profile,
    id,
    name: profile.name.trim(),
    url: profile.url.trim(),
    token: profile.token,
    savedAt: profile.savedAt ?? nowIso(),
  }
  const idx = all.findIndex(p => p.id === id)
  if (idx >= 0) all[idx] = next
  else all.unshift(next)
  writeAll(all)
  return next
}

export function deleteWebService(id: string): boolean {
  const all = listWebServices()
  const next = all.filter(p => p.id !== id)
  if (next.length === all.length) return false
  writeAll(next)
  return true
}

/**
 * Heuristic service-kind suggestion from a URL (ArcGIS / OGC / tile / STAC / PMTiles).
 */
export function suggestServiceKindFromUrl(url: string): GisWebServiceKind {
  const u = url.trim().toLowerCase()
  if (!u) return 'arcgis'

  if (u.includes('.pmtiles') || u.endsWith('pmtiles') || u.includes('/pmtiles')) {
    return 'pmtiles'
  }
  if (u.includes('/stac') || u.includes('stac.') || /\/collections\/[^/]+\/items/.test(u)) {
    return 'stac'
  }
  if (
    u.includes('{z}') ||
    u.includes('{x}') ||
    u.includes('{y}') ||
    u.includes('/tile/') ||
    u.includes('/tiles/')
  ) {
    return 'xyz'
  }
  if (u.includes('wmts') || u.includes('service=wmts')) {
    return 'wmts'
  }
  if (u.includes('wfs') || u.includes('service=wfs') || u.includes('request=getfeature')) {
    return 'wfs'
  }
  if (u.includes('wms') || u.includes('service=wms') || u.includes('request=getmap')) {
    return 'wms'
  }
  if (
    u.includes('/ogcapi') ||
    u.includes('/ogc/features') ||
    u.includes('/collections') ||
    u.includes('features?f=json')
  ) {
    return 'ogc-features'
  }
  if (
    u.includes('arcgisonline') ||
    u.includes('arcgis') ||
    u.includes('/rest/services') ||
    u.includes('featureserver') ||
    u.includes('mapserver') ||
    u.includes('imageserver')
  ) {
    return 'arcgis'
  }

  return 'arcgis'
}
