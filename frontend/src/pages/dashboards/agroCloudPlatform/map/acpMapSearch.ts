import { resolveAgroStructuresFieldDisplayName } from '../../../../lib/agroStructuresPrimaryAoi'
import { getMapboxAccessToken } from '../../../../lib/mapboxAccessToken'
import { geocodePlaceQuery } from '../../../../lib/openMeteoWeather'
import { extractCropAlertFieldsFromMask } from '../../../../lib/siCropAlertEngine'

export type AcpMapSearchFieldHit = {
  kind: 'field'
  id: string
  label: string
  meta: string
  fieldKey: string
}

export type AcpMapSearchLayerHit = {
  kind: 'layer'
  id: string
  label: string
  meta: string
  layerId: string
  layerTitle: string
}

export type AcpMapSearchPlaceHit = {
  kind: 'place'
  id: string
  label: string
  meta: string
  lat: number
  lng: number
}

export type AcpMapSearchHit = AcpMapSearchFieldHit | AcpMapSearchLayerHit | AcpMapSearchPlaceHit

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function scoreTextMatch(query: string, text: string): number {
  const q = normalizeSearchText(query)
  const t = normalizeSearchText(text)
  if (!q || !t) return 0
  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (t.includes(q)) return 55
  const tokens = q.split(' ').filter(Boolean)
  if (tokens.length > 1 && tokens.every(token => t.includes(token))) return 42
  return 0
}

export function searchAcpStructureFields(
  query: string,
  mask: GeoJSON.FeatureCollection | null | undefined,
  countryDescriptionMap?: Map<string, string>,
  limit = 8,
): AcpMapSearchFieldHit[] {
  const q = query.trim()
  if (!q) return []

  const fields = extractCropAlertFieldsFromMask(mask as { features?: unknown[] })
  const ranked: Array<{ hit: AcpMapSearchFieldHit; score: number }> = []

  for (const field of fields) {
    const displayName = resolveAgroStructuresFieldDisplayName({
      farmName: field.farmName,
      farmCode: field.farmCode,
      objectId: field.objectId,
      structureType: field.structureType,
    })
    const countryLabel = countryDescriptionMap?.get(field.country) ?? field.country
    const searchable = [
      displayName,
      field.farmName,
      field.farmCode,
      field.objectId,
      field.city,
      countryLabel,
      field.structureType,
      'agro_structures',
      'agro structures',
    ]
      .filter(Boolean)
      .join(' ')

    const score = Math.max(
      scoreTextMatch(q, displayName),
      scoreTextMatch(q, field.objectId),
      scoreTextMatch(q, field.farmName),
      scoreTextMatch(q, field.farmCode),
      scoreTextMatch(q, searchable),
    )
    if (score <= 0) continue

    ranked.push({
      score,
      hit: {
        kind: 'field',
        id: `field:${field.fieldKey}`,
        fieldKey: field.fieldKey,
        label: displayName,
        meta: [field.objectId, countryLabel, field.city].filter(Boolean).join(' · '),
      },
    })
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.hit.label.localeCompare(b.hit.label, undefined, { sensitivity: 'base' }))
    .slice(0, limit)
    .map(entry => entry.hit)
}

export function searchAcpPortalLayers(
  query: string,
  rows: Array<{ id: string; title: string }>,
  limit = 5,
): AcpMapSearchLayerHit[] {
  const q = query.trim()
  if (q.length < 2) return []

  const ranked: Array<{ hit: AcpMapSearchLayerHit; score: number }> = []
  for (const row of rows) {
    const score = Math.max(scoreTextMatch(q, row.title), scoreTextMatch(q, row.id))
    if (score <= 0) continue
    ranked.push({
      score,
      hit: {
        kind: 'layer',
        id: `layer:${row.id}`,
        layerId: row.id,
        layerTitle: row.title,
        label: row.title,
        meta: 'GIS layer',
      },
    })
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.hit.label.localeCompare(b.hit.label, undefined, { sensitivity: 'base' }))
    .slice(0, limit)
    .map(entry => entry.hit)
}

export async function searchAcpPlaces(query: string, limit = 5): Promise<AcpMapSearchPlaceHit[]> {
  const q = query.trim()
  if (q.length < 1) return []

  const token = getMapboxAccessToken()
  const results = await geocodePlaceQuery(q, token)
  return results.slice(0, limit).map((result, index) => ({
    kind: 'place' as const,
    id: `place:${result.lat},${result.lng}:${index}`,
    label: result.label,
    meta: 'Place',
    lat: result.lat,
    lng: result.lng,
  }))
}
