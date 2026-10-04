import { fetchArcGisFeatureLayerGeoJson } from '@/modules/gis/layers/arcgisFeatureLayerGeoJson'
import { sanitizeArcgisDrawingInfoForClient } from '@/modules/gis/layers/arcgisDrawingInfoMapbox'
import { WORLD_COUNTRIES_FS51_URL } from '@/modules/gis/map/worldCountriesLayer'

function appendToken(url: string, token?: string): string {
  if (!token?.trim()) return url
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token.trim())}`
}

export async function fetchWorldCountriesCountryDomain(
  layerUrl: string = WORLD_COUNTRIES_FS51_URL,
  token?: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const endpoint = layerUrl.trim().replace(/\/+$/, '') || WORLD_COUNTRIES_FS51_URL
  try {
    const res = await fetch(appendToken(`${endpoint}?f=pjson`, token))
    if (!res.ok) return map
    const data = (await res.json()) as {
      fields?: Array<{
        name?: string
        domain?: { codedValues?: Array<{ code: number | string; name: string }> }
      }>
    }
    const fields = data.fields ?? []
    const countryField =
      fields.find(f => String(f.name ?? '').toLowerCase() === 'country') ??
      fields.find(f => /country/i.test(String(f.name ?? '')) && f.domain?.codedValues?.length)
    const coded = countryField?.domain?.codedValues
    if (!Array.isArray(coded)) return map
    for (const cv of coded) {
      map.set(String(cv.code), String(cv.name))
    }
  } catch {
    /* optional */
  }
  return map
}

export async function fetchWorldCountriesDrawingInfo(
  layerUrl: string = WORLD_COUNTRIES_FS51_URL,
  token?: string,
): Promise<Record<string, unknown> | null> {
  const endpoint = layerUrl.trim().replace(/\/+$/, '') || WORLD_COUNTRIES_FS51_URL
  try {
    const res = await fetch(appendToken(`${endpoint}?f=pjson`, token))
    if (!res.ok) return null
    const data = (await res.json()) as { drawingInfo?: unknown; error?: { message?: string } }
    if (data?.error?.message || !data?.drawingInfo) return null
    return sanitizeArcgisDrawingInfoForClient(data.drawingInfo)
  } catch {
    return null
  }
}

export async function fetchDevelopEliteWorldCountriesGeoJson(
  layerUrl: string = WORLD_COUNTRIES_FS51_URL,
  token?: string,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  const endpoint = layerUrl.trim().replace(/\/+$/, '') || WORLD_COUNTRIES_FS51_URL
  const fc = await fetchArcGisFeatureLayerGeoJson(endpoint, {
    token,
    signal,
  })
  return fc as GeoJSON.FeatureCollection
}
