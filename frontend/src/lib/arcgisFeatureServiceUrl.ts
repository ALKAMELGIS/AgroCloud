/** Strip query, hash, trailing slash, and layer/table id suffix from ArcGIS REST URLs. */
export function normalizeArcGisFeatureServiceUrl(raw: string): string {
  const trimmed = raw.trim().replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '')
  const parts = trimmed.split('/')
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  if (/^\d+$/.test(last) && (prev === 'FeatureServer' || prev === 'MapServer')) {
    return parts.slice(0, -1).join('/')
  }
  return trimmed
}

/** Service folder name immediately before FeatureServer/MapServer (e.g. Agro_Structures). */
export function resolveArcGisFeatureServiceNameFromUrl(raw: string): string | null {
  const normalized = normalizeArcGisFeatureServiceUrl(raw)
  const parts = normalized.split('/').filter(Boolean)
  const serverIdx = parts.findIndex(p => p === 'FeatureServer' || p === 'MapServer')
  if (serverIdx <= 0) return null
  const serviceName = parts[serverIdx - 1]
  if (!serviceName || serviceName.toLowerCase() === 'services') return null
  try {
    return decodeURIComponent(serviceName)
  } catch {
    return serviceName
  }
}

/**
 * Human title for GIS Content from an ArcGIS feature service URL.
 * Uses the source service name — never a bare layer id like "21".
 */
export function resolveArcGisLayerTitleFromUrl(raw: string, preferredName?: string): string {
  const preferred = String(preferredName ?? '').trim()
  if (preferred && !/^\d+$/.test(preferred) && preferred !== 'FeatureServer' && preferred !== 'MapServer') {
    return preferred
  }

  const trimmed = raw.trim()
  if (!trimmed) return preferred || 'Feature layer'

  const serviceName = resolveArcGisFeatureServiceNameFromUrl(trimmed)
  if (serviceName) return serviceName

  const parts = trimmed.replace(/#.*$/, '').replace(/\?.*$/, '').replace(/\/+$/, '').split('/').filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  if (last && last !== 'FeatureServer' && last !== 'MapServer' && !/^\d+$/.test(last)) {
    try {
      return decodeURIComponent(last)
    } catch {
      return last
    }
  }

  return preferred || 'Feature layer'
}

export function shouldReplaceNumericArcGisLayerTitle(title: string, serviceUrl?: string): boolean {
  const t = title.trim()
  if (!t || !serviceUrl?.trim()) return false
  if (/^\d+$/.test(t)) return true
  if (t === 'FeatureServer' || t === 'MapServer') return true
  const fromUrl = resolveArcGisFeatureServiceNameFromUrl(serviceUrl)
  return Boolean(fromUrl && t !== fromUrl)
}

export function resolveHostedFeatureLayerPortalTitle(input: {
  title: string
  url?: string
  sourceMethod?: string
}): string {
  const title = input.title.trim()
  const url = input.url?.trim()
  if (
    url &&
    (input.sourceMethod === 'arcgis-url' || shouldReplaceNumericArcGisLayerTitle(title, url))
  ) {
    return resolveArcGisLayerTitleFromUrl(url, title)
  }
  return title || 'Feature layer'
}
