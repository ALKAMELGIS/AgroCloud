export type ArcGisDiscoveredLayer = {
  id: number
  name: string
  kind: 'layer' | 'table'
  url: string
  geometryType?: string
}

export function buildArcGisUrl(baseUrl: string, params: Record<string, string>): string {
  const url = new URL(baseUrl.replace(/\/+$/, ''))
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  return url.toString()
}

export function normalizeArcGisServiceUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    if (!url.protocol.startsWith('http')) return ''
  } catch {
    return ''
  }
  const parts = trimmed.split('/')
  const last = parts[parts.length - 1] ?? ''
  const prev = parts[parts.length - 2] ?? ''
  if (/^\d+$/.test(last) && (prev === 'FeatureServer' || prev === 'MapServer')) {
    return parts.slice(0, -1).join('/')
  }
  return trimmed
}

export async function discoverArcGisServiceLayers(
  serviceUrl: string,
  token = '',
): Promise<ArcGisDiscoveredLayer[]> {
  const base = normalizeArcGisServiceUrl(serviceUrl)
  if (!base) throw new Error('Enter a valid ArcGIS FeatureServer or MapServer URL.')

  const url = buildArcGisUrl(base, { f: 'json', token: token.trim() })
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json()
  if (json?.error?.message) {
    const details = Array.isArray(json?.error?.details) ? json.error.details.join(' ') : ''
    throw new Error([json.error.message, details].filter(Boolean).join(' '))
  }

  const layersArr = Array.isArray(json?.layers) ? json.layers : []
  const tablesArr = Array.isArray(json?.tables) ? json.tables : []
  const discovered = [
    ...layersArr.map((l: { id?: number; name?: string; geometryType?: string }) => ({
      ...l,
      kind: 'layer' as const,
    })),
    ...tablesArr.map((t: { id?: number; name?: string }) => ({ ...t, kind: 'table' as const })),
  ]
    .filter((l): l is { id: number; name: string; kind: 'layer' | 'table'; geometryType?: string } =>
      typeof l.id === 'number' && typeof l.name === 'string',
    )
    .map(l => ({
      id: l.id,
      name: l.name,
      kind: l.kind,
      url: `${base.replace(/\/+$/, '')}/${l.id}`,
      geometryType: typeof l.geometryType === 'string' ? l.geometryType : undefined,
    }))

  if (!discovered.length) throw new Error('No layers or tables found in this service.')
  return discovered
}
