import {
  fetchArcgisLayerDrawingInfoExact,
  fetchFeatureLayerGeoJson,
} from '@/modules/dashboard/develop-elite/developEliteArcgisFetch'
import {
  DEFAULT_DEVELOP_ELITE_AGRI_LOCATION_LAYER_URL,
  DEFAULT_DEVELOP_ELITE_STRUCTURES_URL,
} from '@/modules/dashboard/develop-elite/developEliteDashboardConfig'
import { getArcgisPortalToken } from '@/modules/gis/layers/arcgisPortalToken'
import { comparePortfolioCountryListLabels } from '@/modules/dashboard/develop-elite/developEliteCountryListSort'
import {
  resolveAgroStructuresCountryDisplayName,
} from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'
import {
  readAgriLocationDisplayName,
  structureBelongsToAgriLocation,
  type WeatherLocationId,
  weatherLocationIdFromFeature,
} from '../config/weatherFarmIds'

function readAgriLocationCountryLabel(
  location: GeoJSON.Feature,
  structureFeatures: GeoJSON.Feature[],
): string {
  const props = (location.properties ?? {}) as Record<string, unknown>
  const portfolio = String(
    props.ALL_COUNTRY ?? props.Country_Name ?? props.COUNTRY ?? props.Country ?? props.country ?? '',
  ).trim()
  if (portfolio) return portfolio
  const matched = structureFeatures.filter(s => structureBelongsToAgriLocation(s, location))
  for (const s of matched) {
    const label = resolveAgroStructuresCountryDisplayName(
      (s.properties ?? {}) as Record<string, unknown>,
      undefined,
    )
    if (label && label !== 'Unknown') return label
  }
  return ''
}

export type WeatherFarmSite = {
  id: WeatherLocationId
  label: string
  /** Portfolio country for list grouping (e.g. UAE, Serbia). */
  countryLabel: string
  lat: number
  lng: number
  featureCollection: GeoJSON.FeatureCollection
  farmNames: string[]
  /** Agri_Location point for map context */
  locationFeature: GeoJSON.Feature | null
}

export type WeatherFarmCatalog = {
  sites: WeatherFarmSite[]
  portfolio: GeoJSON.FeatureCollection
  agriLocations: GeoJSON.FeatureCollection
  agriLocationDrawingInfo: Record<string, unknown> | null
  loadedAt: number
}

function readFarmName(props: GeoJSON.GeoJsonProperties): string {
  if (!props || typeof props !== 'object') return ''
  const p = props as Record<string, unknown>
  return String(p.Farm_Name ?? p.FARM_NAME ?? p.farm_name ?? '').trim()
}

function featureCentroid(feature: GeoJSON.Feature): { lat: number; lng: number } | null {
  const g = feature.geometry
  if (!g) return null
  const coords: number[][] = []
  const pushCoord = (lng: number, lat: number) => {
    if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat])
  }
  if (g.type === 'Point') {
    pushCoord(g.coordinates[0], g.coordinates[1])
  } else if (g.type === 'MultiPoint') {
    for (const c of g.coordinates) pushCoord(c[0], c[1])
  } else if (g.type === 'Polygon') {
    for (const ring of g.coordinates) for (const c of ring) pushCoord(c[0], c[1])
  } else if (g.type === 'MultiPolygon') {
    for (const poly of g.coordinates) for (const ring of poly) for (const c of ring) pushCoord(c[0], c[1])
  }
  if (!coords.length) return null
  const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length
  const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length
  return { lat, lng }
}

function mergeFeatures(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features }
}

export function buildWeatherFarmCatalog(
  structures: GeoJSON.FeatureCollection,
  agriLocations: GeoJSON.FeatureCollection,
): WeatherFarmCatalog {
  const structureFeatures = structures.features ?? []
  const locationFeatures = (agriLocations.features ?? []).filter(f => {
    const label = readAgriLocationDisplayName(f.properties)
    return Boolean(label && weatherLocationIdFromFeature(f))
  })

  locationFeatures.sort((a, b) => {
    const countryCmp = comparePortfolioCountryListLabels(
      readAgriLocationCountryLabel(a, structureFeatures),
      readAgriLocationCountryLabel(b, structureFeatures),
    )
    if (countryCmp !== 0) return countryCmp
    return readAgriLocationDisplayName(a.properties).localeCompare(
      readAgriLocationDisplayName(b.properties),
    )
  })

  const sites: WeatherFarmSite[] = []

  for (const loc of locationFeatures) {
    const id = weatherLocationIdFromFeature(loc)
    if (!id || id === 'all') continue
    const label = readAgriLocationDisplayName(loc.properties)
    const matched = structureFeatures.filter(s => structureBelongsToAgriLocation(s, loc))
    const fc = mergeFeatures(matched.length ? matched : [])
    const centroid = featureCentroid(loc) ?? featureCentroidFromStructures(matched)
    if (!centroid) continue
    const names = new Set<string>()
    for (const f of matched) {
      const n = readFarmName(f.properties)
      if (n) names.add(n)
    }
    sites.push({
      id,
      label,
      countryLabel: readAgriLocationCountryLabel(loc, structureFeatures),
      lat: centroid.lat,
      lng: centroid.lng,
      featureCollection: fc,
      farmNames: [...names],
      locationFeature: loc,
    })
  }

  let pLat = 0
  let pLng = 0
  let pN = 0
  for (const loc of locationFeatures) {
    const c = featureCentroid(loc)
    if (!c) continue
    pLat += c.lat
    pLng += c.lng
    pN += 1
  }
  if (!pN) {
    for (const f of structureFeatures) {
      const c = featureCentroid(f)
      if (!c) continue
      pLat += c.lat
      pLng += c.lng
      pN += 1
    }
  }
  const portfolioCentroid = pN > 0 ? { lat: pLat / pN, lng: pLng / pN } : { lat: 44.0, lng: 20.0 }

  sites.unshift({
    id: 'all',
    label: 'All locations',
    countryLabel: '',
    lat: portfolioCentroid.lat,
    lng: portfolioCentroid.lng,
    featureCollection: mergeFeatures(structureFeatures),
    farmNames: [],
    locationFeature: null,
  })

  return {
    sites,
    portfolio: mergeFeatures(structureFeatures),
    agriLocations: mergeFeatures(locationFeatures),
    agriLocationDrawingInfo: null,
    loadedAt: Date.now(),
  }
}

function featureCentroidFromStructures(features: GeoJSON.Feature[]): { lat: number; lng: number } | null {
  let latSum = 0
  let lngSum = 0
  let n = 0
  for (const f of features) {
    const c = featureCentroid(f)
    if (!c) continue
    latSum += c.lat
    lngSum += c.lng
    n += 1
  }
  if (!n) return null
  return { lat: latSum / n, lng: lngSum / n }
}

let catalogCache: WeatherFarmCatalog | null = null

export async function loadWeatherFarmCatalog(): Promise<WeatherFarmCatalog> {
  if (catalogCache) return catalogCache
  const token = getArcgisPortalToken() || undefined
  const [structures, agriLocations, agriLocationDrawingInfo] = await Promise.all([
    fetchFeatureLayerGeoJson(DEFAULT_DEVELOP_ELITE_STRUCTURES_URL, token),
    fetchFeatureLayerGeoJson(DEFAULT_DEVELOP_ELITE_AGRI_LOCATION_LAYER_URL, token),
    fetchArcgisLayerDrawingInfoExact(DEFAULT_DEVELOP_ELITE_AGRI_LOCATION_LAYER_URL, token).catch(() => null),
  ])
  catalogCache = {
    ...buildWeatherFarmCatalog(structures, agriLocations),
    agriLocationDrawingInfo,
  }
  return catalogCache
}

export function getWeatherFarmSite(catalog: WeatherFarmCatalog, farmId: WeatherLocationId): WeatherFarmSite {
  return catalog.sites.find(s => s.id === farmId) ?? catalog.sites[0]!
}

/** Test-only */
export function clearWeatherFarmCatalogCacheForTests(): void {
  catalogCache = null
}
