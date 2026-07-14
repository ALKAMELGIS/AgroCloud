export type WfsLayerInfo = {
  name: string
  title: string
}

export type WfsCapabilities = {
  layers: WfsLayerInfo[]
}

export type WfsGetFeatureOpts = {
  count?: number
  outputFormat?: string
}

const GEOJSON_FORMATS = [
  'application/json',
  'application/geo+json',
  'geojson',
  'json',
] as const

function textContent(el: Element | null): string {
  return (el?.textContent ?? '').trim()
}

function localName(el: Element): string {
  return (el.localName || el.nodeName || '').replace(/^.*:/, '').toLowerCase()
}

/**
 * Parse a WFS GetCapabilities XML document into layer name/title pairs.
 */
export function parseWfsGetCapabilities(xml: string): WfsCapabilities {
  const layers: WfsLayerInfo[] = []
  if (typeof DOMParser === 'undefined') {
    return { layers }
  }
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) return { layers }

    const featureTypes = Array.from(doc.getElementsByTagName('*')).filter(
      el => localName(el) === 'featuretype',
    )

    for (const ft of featureTypes) {
      let name = ''
      let title = ''
      for (const child of Array.from(ft.children)) {
        const ln = localName(child)
        if (ln === 'name' && !name) name = textContent(child)
        if (ln === 'title' && !title) title = textContent(child)
      }
      if (!name) continue
      layers.push({ name, title: title || name })
    }
  } catch {
    return { layers: [] }
  }
  return { layers }
}

/**
 * Build a WFS GetFeature URL. Prefers GeoJSON / JSON output formats.
 */
export function buildWfsGetFeatureUrl(
  baseUrl: string,
  typeName: string,
  opts?: WfsGetFeatureOpts,
): string {
  const trimmed = baseUrl.trim()
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    url = new URL(trimmed, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  }

  const params = url.searchParams
  const hasService = [...params.keys()].some(k => k.toLowerCase() === 'service')
  const hasRequest = [...params.keys()].some(k => k.toLowerCase() === 'request')
  const hasTypeName = [...params.keys()].some(k => {
    const lk = k.toLowerCase()
    return lk === 'typename' || lk === 'typenames'
  })
  const hasOutput = [...params.keys()].some(k => k.toLowerCase() === 'outputformat')
  const hasCount = [...params.keys()].some(k => {
    const lk = k.toLowerCase()
    return lk === 'count' || lk === 'maxfeatures'
  })

  if (!hasService) params.set('service', 'WFS')
  if (!hasRequest) params.set('request', 'GetFeature')
  if (!params.has('version') && !params.has('VERSION')) params.set('version', '2.0.0')
  if (!hasTypeName) params.set('typeNames', typeName)
  else if (!params.get('typeNames') && !params.get('typeName') && !params.get('TYPENAME')) {
    params.set('typeNames', typeName)
  }

  const outputFormat = opts?.outputFormat?.trim() || GEOJSON_FORMATS[0]
  if (!hasOutput) params.set('outputFormat', outputFormat)

  if (typeof opts?.count === 'number' && Number.isFinite(opts.count) && !hasCount) {
    params.set('count', String(Math.max(1, Math.floor(opts.count))))
  }

  return url.toString()
}

function isFeatureCollection(value: unknown): value is GeoJSON.FeatureCollection {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return v.type === 'FeatureCollection' && Array.isArray(v.features)
}

/**
 * Fetch WFS GetFeature as GeoJSON FeatureCollection.
 */
export async function fetchWfsGeoJson(
  baseUrl: string,
  typeName: string,
  token?: string,
): Promise<GeoJSON.FeatureCollection> {
  const featureUrl = buildWfsGetFeatureUrl(baseUrl, typeName, {
    outputFormat: 'application/json',
  })

  const headers: Record<string, string> = {
    Accept: 'application/geo+json, application/json, */*',
  }
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`
  }

  const res = await fetch(featureUrl, { headers })
  if (!res.ok) {
    throw new Error(`WFS GetFeature failed (${res.status} ${res.statusText})`)
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('xml') || contentType.includes('gml')) {
    const text = await res.text()
    throw new Error(
      `WFS returned XML/GML instead of GeoJSON. Try a server that supports application/json. Preview: ${text.slice(0, 120)}`,
    )
  }

  const data: unknown = await res.json()
  if (isFeatureCollection(data)) return data

  if (data && typeof data === 'object' && (data as { type?: string }).type === 'Feature') {
    return {
      type: 'FeatureCollection',
      features: [data as GeoJSON.Feature],
    }
  }

  throw new Error('WFS response was not a GeoJSON FeatureCollection')
}
