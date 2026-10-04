import {
  scoreTextMatch,
  searchAcpPortalLayers,
  searchAcpStructureFields,
  type AcpMapSearchHit,
} from '@/modules/dashboards/gis/agroCloudPlatform/map/acpMapSearch'
import {
  DEVELOP_ELITE_MAP_DATA_LAYERS,
  type DevelopEliteMapDataLayerId,
} from './developEliteMapDataLayers'

export type DevelopEliteMapFeatureHit = {
  kind: 'map-feature'
  id: string
  label: string
  meta: string
  sourceLayerId: DevelopEliteMapDataLayerId
  featureIndex: number
}

export type DevelopEliteMapSearchHit = AcpMapSearchHit | DevelopEliteMapFeatureHit

const FEATURE_NAME_KEYS = [
  'Name',
  'NAME',
  'Farm_Name',
  'Farm_Code',
  'COUNTRY',
  'Country',
  'Country_Name',
  'Subtype',
  'ZONE_ID',
  'Zone_ID',
  'OBJECTID',
  'ObjectID',
]

function readProp(props: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(props, key)) return props[key]
  const lower = key.toLowerCase()
  for (const k of Object.keys(props)) {
    if (k.toLowerCase() === lower) return props[k]
  }
  return undefined
}

function stringProp(value: unknown): string {
  if (value == null) return ''
  const s = String(value).trim()
  return s
}

export function resolveDevelopEliteMapFeatureLabel(
  props: Record<string, unknown>,
  countryLabels?: Map<string, string>,
): { label: string; metaParts: string[] } {
  const name =
    stringProp(readProp(props, 'Name')) ||
    stringProp(readProp(props, 'Farm_Name')) ||
    stringProp(readProp(props, 'Farm_Code'))
  const countryCode = stringProp(readProp(props, 'COUNTRY') ?? readProp(props, 'Country'))
  const country =
    (countryCode && countryLabels?.get(countryCode)) || countryCode || stringProp(readProp(props, 'Country_Name'))
  const subtype = stringProp(readProp(props, 'Subtype'))
  const zone = stringProp(readProp(props, 'ZONE_ID') ?? readProp(props, 'Zone_ID'))
  const label = name || country || subtype || zone || 'Feature'
  const metaParts = [subtype, zone, country].filter(Boolean)
  return { label, metaParts }
}

function scoreFeatureProps(query: string, props: Record<string, unknown>, countryLabels?: Map<string, string>): number {
  const { label, metaParts } = resolveDevelopEliteMapFeatureLabel(props, countryLabels)
  let score = scoreTextMatch(query, label)
  for (const key of FEATURE_NAME_KEYS) {
    const v = stringProp(readProp(props, key))
    if (v) score = Math.max(score, scoreTextMatch(query, v))
  }
  for (const part of metaParts) {
    score = Math.max(score, scoreTextMatch(query, part))
  }
  return score
}

function searchGeoJsonLayerFeatures(
  query: string,
  sourceLayerId: DevelopEliteMapDataLayerId,
  layerLabel: string,
  collection: GeoJSON.FeatureCollection | null | undefined,
  countryLabels?: Map<string, string>,
  limit = 6,
): Array<{ hit: DevelopEliteMapFeatureHit; score: number }> {
  const q = query.trim()
  if (!q || !collection?.features?.length) return []

  const ranked: Array<{ hit: DevelopEliteMapFeatureHit; score: number }> = []
  collection.features.forEach((feature, featureIndex) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>
    const score = scoreFeatureProps(q, props, countryLabels)
    if (score <= 0) return
    const { label, metaParts } = resolveDevelopEliteMapFeatureLabel(props, countryLabels)
    ranked.push({
      score,
      hit: {
        kind: 'map-feature',
        id: `map-feature:${sourceLayerId}:${featureIndex}`,
        sourceLayerId,
        featureIndex,
        label,
        meta: [layerLabel, ...metaParts].filter(Boolean).join(' · '),
      },
    })
  })

  return ranked
    .sort((a, b) => b.score - a.score || a.hit.label.localeCompare(b.hit.label, undefined, { sensitivity: 'base' }))
    .slice(0, limit)
}

type ScoredHit = { hit: DevelopEliteMapSearchHit; score: number }

function scoreAcpHit(query: string, hit: AcpMapSearchHit): number {
  const base = Math.max(scoreTextMatch(query, hit.label), scoreTextMatch(query, hit.meta))
  if (hit.kind === 'layer') {
    return Math.max(base, scoreTextMatch(query, hit.layerTitle), scoreTextMatch(query, hit.layerId))
  }
  return base
}

export type DevelopEliteMapSearchSources = {
  structures: GeoJSON.FeatureCollection
  trees?: GeoJSON.FeatureCollection | null
  agriLocation?: GeoJSON.FeatureCollection | null
  worldCountries?: GeoJSON.FeatureCollection | null
  countryLabels?: Map<string, string> | null
  mapLayerVisibility: Record<DevelopEliteMapDataLayerId, boolean>
}

export function searchDevelopEliteMapLocal(
  query: string,
  sources: DevelopEliteMapSearchSources,
  options?: { limit?: number },
): DevelopEliteMapSearchHit[] {
  const q = query.trim()
  if (!q) return []

  const limit = options?.limit ?? 16
  const countryLabels = sources.countryLabels ?? undefined
  const visible = (id: DevelopEliteMapDataLayerId) => sources.mapLayerVisibility[id] !== false

  const merged: ScoredHit[] = []

  for (const hit of searchAcpStructureFields(q, sources.structures, countryLabels, 8)) {
    merged.push({ hit, score: scoreAcpHit(q, hit) })
  }

  const layerRows = DEVELOP_ELITE_MAP_DATA_LAYERS.map(layer => ({ id: layer.id, title: layer.label }))
  for (const hit of searchAcpPortalLayers(q, layerRows, 5)) {
    merged.push({ hit, score: scoreAcpHit(q, hit) })
  }

  const featureBuckets: Array<{ hit: DevelopEliteMapFeatureHit; score: number }> = []
  if (visible('trees')) {
    featureBuckets.push(
      ...searchGeoJsonLayerFeatures(q, 'trees', 'Tree', sources.trees, countryLabels, 6),
    )
  }
  if (visible('agri-location')) {
    featureBuckets.push(
      ...searchGeoJsonLayerFeatures(q, 'agri-location', 'AgroLocation', sources.agriLocation, countryLabels, 6),
    )
  }
  if (visible('world-countries')) {
    featureBuckets.push(
      ...searchGeoJsonLayerFeatures(
        q,
        'world-countries',
        'World Countries',
        sources.worldCountries,
        countryLabels,
        6,
      ),
    )
  }

  for (const entry of featureBuckets) {
    merged.push({ hit: entry.hit, score: entry.score })
  }

  return merged
    .sort((a, b) => b.score - a.score || a.hit.label.localeCompare(b.hit.label, undefined, { sensitivity: 'base' }))
    .slice(0, limit)
    .map(entry => entry.hit)
}

export function developEliteMapGeoJsonForLayer(
  sources: DevelopEliteMapSearchSources,
  layerId: DevelopEliteMapDataLayerId,
): GeoJSON.FeatureCollection | null {
  switch (layerId) {
    case 'agro-structures':
      return sources.structures
    case 'trees':
      return sources.trees ?? null
    case 'agri-location':
      return sources.agriLocation ?? null
    case 'world-countries':
      return sources.worldCountries ?? null
    default:
      return null
  }
}
