export type ArcGisDiscoveredLayer = {
  id: number
  name: string
  kind: 'layer' | 'table'
  url: string
  geometryType?: string
}

export type ArcGisLayerDefinition = {
  id?: number
  name?: string
  type?: string
  geometryType?: string
  error?: { message?: string; details?: string[] }
}

export function sanitizeArcGisRestUrl(raw: string): string {
  let clean = raw.trim()
  if (!clean) return ''
  if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`
  return clean.replace(/[?#].*$/, '').replace(/\/+$/, '')
}

export function parseArcGisDirectLayerUrl(
  raw: string,
): { layerUrl: string; layerId: number; serviceBase: string } | null {
  const clean = sanitizeArcGisRestUrl(raw)
  const match = clean.match(/^(.*\/(?:MapServer|FeatureServer))\/(\d+)$/i)
  if (!match) return null
  return { serviceBase: match[1], layerId: Number(match[2]), layerUrl: clean }
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

export async function fetchArcGisLayerDefinition(
  layerUrl: string,
  token = '',
): Promise<
  | { ok: true; def: ArcGisLayerDefinition }
  | { ok: false; status: number; error?: ArcGisLayerDefinition['error'] }
> {
  const base = sanitizeArcGisRestUrl(layerUrl)
  if (!base) {
    return { ok: false, status: 400, error: { message: 'Layer URL is required.' } }
  }
  const url = buildArcGisUrl(base, { f: 'json', token: token.trim() })
  const res = await fetch(url, { method: 'GET' })
  const def = (await res.json()) as ArcGisLayerDefinition
  if (!res.ok || def?.error) {
    return { ok: false, status: res.status, error: def?.error }
  }
  return { ok: true, def }
}

function discoveredLayerFromDefinition(
  layerUrl: string,
  layerId: number,
  def: ArcGisLayerDefinition,
): ArcGisDiscoveredLayer {
  const isTable = typeof def.type === 'string' && /table/i.test(def.type)
  const id = typeof def.id === 'number' ? def.id : layerId
  const name =
    typeof def.name === 'string' && def.name.trim() ? def.name.trim() : `Layer ${id}`
  return {
    id,
    name,
    kind: isTable ? 'table' : 'layer',
    url: layerUrl,
    geometryType: typeof def.geometryType === 'string' ? def.geometryType : undefined,
  }
}

function pickDiscoveredLayer(
  layers: ArcGisDiscoveredLayer[],
  preferredLayerId?: number,
): ArcGisDiscoveredLayer {
  if (!layers.length) throw new Error('No layers or tables found in this service.')
  if (preferredLayerId != null) {
    const exact = layers.find(layer => layer.id === preferredLayerId)
    if (exact) return exact
  }
  return layers.find(layer => layer.kind === 'layer') ?? layers[0]
}

/** Connect to a FeatureServer root or direct layer URL; falls back to service discovery when layer id is invalid. */
export async function connectArcGisFeatureServiceUrl(
  rawUrl: string,
  token = '',
  options?: { resolveUrl?: (url: string) => string },
): Promise<{ layers: ArcGisDiscoveredLayer[]; selected: ArcGisDiscoveredLayer }> {
  let clean = sanitizeArcGisRestUrl(rawUrl)
  if (!clean) throw new Error('Enter a valid ArcGIS FeatureServer or MapServer URL.')
  if (options?.resolveUrl) clean = sanitizeArcGisRestUrl(options.resolveUrl(clean))

  const direct = parseArcGisDirectLayerUrl(clean)
  if (direct) {
    const loaded = await fetchArcGisLayerDefinition(direct.layerUrl, token)
    if (loaded.ok) {
      const single = discoveredLayerFromDefinition(direct.layerUrl, direct.layerId, loaded.def)
      return { layers: [single], selected: single }
    }

    const layers = await discoverArcGisServiceLayers(direct.serviceBase, token)
    const selected = pickDiscoveredLayer(layers, direct.layerId)
    return { layers, selected }
  }

  const serviceBase = /\/(?:MapServer|FeatureServer)$/i.test(clean) ? clean : `${clean}/FeatureServer`
  const layers = await discoverArcGisServiceLayers(serviceBase, token)
  return { layers, selected: pickDiscoveredLayer(layers) }
}
