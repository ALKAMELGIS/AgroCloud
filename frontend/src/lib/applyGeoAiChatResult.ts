import type { GeoAiChatAction, GeoAiChatResponse } from './geoAiChatService'
import { formatGeoAiMarkdownTable } from './geoAiMarkdownTable'
import type { GeoExplorerDataTablePayload } from './geoExplorerGemini'

export type GeoAiChatMapHost = {
  addGeoJsonResultLayer?: (input: {
    name: string
    geojson: GeoJSON.FeatureCollection
    fit?: boolean
  }) => string
  flyTo?: (lng: number, lat: number, zoom?: number) => void
}

function statsToTable(stats: Record<string, unknown>): GeoExplorerDataTablePayload | null {
  const flat: Array<{ key: string; value: string }> = []
  for (const [k, v] of Object.entries(stats)) {
    if (v == null) continue
    if (typeof v === 'object' && !Array.isArray(v)) {
      flat.push({ key: k, value: JSON.stringify(v) })
    } else {
      flat.push({ key: k, value: String(v) })
    }
  }
  if (!flat.length) return null
  return {
    title: 'GIS Statistics',
    columns: ['Metric', 'Value'],
    rows: flat.map(r => [r.key, r.value]),
  }
}

function toFeatureCollection(
  geojson: GeoJSON.FeatureCollection | GeoJSON.Geometry,
): GeoJSON.FeatureCollection | null {
  if ((geojson as GeoJSON.FeatureCollection).type === 'FeatureCollection') {
    return geojson as GeoJSON.FeatureCollection
  }
  if ((geojson as GeoJSON.Geometry).type) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: geojson as GeoJSON.Geometry }],
    }
  }
  return null
}

export type ApplyGeoAiChatResult = {
  replyText: string
  table?: GeoExplorerDataTablePayload
  mapQueryLngLat?: [number, number]
}

export function applyGeoAiChatResult(
  response: GeoAiChatResponse,
  host: GeoAiChatMapHost,
): ApplyGeoAiChatResult {
  let replyText = response.answer?.trim() || ''
  const stats = response.statistics ?? {}
  const table = statsToTable(stats)

  if (table && Object.keys(stats).length) {
    const md = formatGeoAiMarkdownTable(table.columns, table.rows)
    if (md && !replyText.includes(md)) {
      replyText = replyText ? `${replyText}\n\n${md}` : md
    }
  }

  const action = response.action as GeoAiChatAction | null | undefined
  let mapQueryLngLat: [number, number] | undefined

  if (action?.type === 'FLY_TO' && host.flyTo) {
    host.flyTo(action.lng, action.lat, action.zoom ?? 12)
    mapQueryLngLat = [action.lng, action.lat]
  }

  if (response.geojson && action?.type === 'ADD_GEOJSON_LAYER' && host.addGeoJsonResultLayer) {
    const fc = toFeatureCollection(response.geojson)
    if (fc) {
      host.addGeoJsonResultLayer({
        name: action.layerId || 'GeoAI Result',
        geojson: fc,
        fit: true,
      })
    }
  }

  return { replyText, table: table ?? undefined, mapQueryLngLat }
}
