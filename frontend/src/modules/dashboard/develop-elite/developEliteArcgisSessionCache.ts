import type { ArcGisTableRow, DevelopEliteLayerMeta } from './developEliteArcgisFetch'
import {
  loadDevelopEliteDashboardConfig,
  normalizeDevelopEliteStructuresLayerUrl,
  type DevelopEliteDashboardConfig,
} from './developEliteDashboardConfig'

export type DevelopEliteArcgisDataSnapshot = {
  structures: GeoJSON.FeatureCollection
  zoneLayerStructures: GeoJSON.FeatureCollection | null
  structuresDrawingInfo: Record<string, unknown> | null
  cropRows: ArcGisTableRow[]
  treeFeatures: GeoJSON.Feature[]
  treesDrawingInfo: Record<string, unknown> | null
  agriLocationFeatures: GeoJSON.Feature[]
  agriLocationDrawingInfo: Record<string, unknown> | null
  irrigationValveFeatures: GeoJSON.Feature[]
  irrigationValvesDrawingInfo: Record<string, unknown> | null
  irrigationMainPipeFeatures: GeoJSON.Feature[]
  irrigationMainPipeDrawingInfo: Record<string, unknown> | null
  cropMeta: DevelopEliteLayerMeta
  countryLabels: Map<string, string>
  worldCountries: GeoJSON.FeatureCollection | null
  worldCountryDomain: Map<string, string>
  worldCountriesDrawingInfo: Record<string, unknown> | null
  fetchedAt: number
}

const sessionCache = new Map<string, DevelopEliteArcgisDataSnapshot>()

export function developEliteArcgisCacheKey(config: DevelopEliteDashboardConfig): string {
  return [
    normalizeDevelopEliteStructuresLayerUrl(config.structuresLayerUrl),
    config.zonesLayerUrl,
    config.cropsTableUrl,
    config.treesLayerUrl,
    config.agriLocationLayerUrl,
    config.irrigationValvesLayerUrl,
    config.irrigationMainPipeLayerUrl,
    config.worldCountriesLayerUrl,
    'wc-map-v5',
    'irr-valves-sym-v1',
    'irr-main-pipe-arrows-v1',
    'map-point-layers-v2',
  ].join('|')
}

export function developEliteArcgisLayerUrlsChanged(
  prev: DevelopEliteDashboardConfig,
  next: DevelopEliteDashboardConfig,
): boolean {
  return developEliteArcgisCacheKey(prev) !== developEliteArcgisCacheKey(next)
}

export function getDevelopEliteArcgisSessionCache(
  key: string,
): DevelopEliteArcgisDataSnapshot | undefined {
  return sessionCache.get(key)
}

export function setDevelopEliteArcgisSessionCache(
  key: string,
  snapshot: DevelopEliteArcgisDataSnapshot,
): void {
  sessionCache.set(key, snapshot)
}

/** Hydrate React state from session cache on each dashboard mount. */
export function developEliteArcgisBoot() {
  const config = loadDevelopEliteDashboardConfig()
  const snapshot = getDevelopEliteArcgisSessionCache(developEliteArcgisCacheKey(config))
  return { config, snapshot }
}
