import type { DevelopEliteMapDataLayerId } from './developEliteMapDataLayers'
import {
  DEFAULT_DEVELOP_ELITE_AGRI_LOCATION_LAYER_URL,
  DEFAULT_DEVELOP_ELITE_CROPS_TABLE_URL,
  DEFAULT_DEVELOP_ELITE_IRRIGATION_MAIN_PIPE_LAYER_URL,
  DEFAULT_DEVELOP_ELITE_IRRIGATION_VALVES_LAYER_URL,
  DEFAULT_DEVELOP_ELITE_STRUCTURES_URL,
  DEFAULT_DEVELOP_ELITE_TREES_LAYER_URL,
  DEFAULT_DEVELOP_ELITE_WORLD_COUNTRIES_LAYER_URL,
  DEFAULT_DEVELOP_ELITE_ZONES_LAYER_URL,
  normalizeDevelopEliteAgriLocationLayerUrl,
  normalizeDevelopEliteIrrigationMainPipeLayerUrl,
  normalizeDevelopEliteIrrigationValvesLayerUrl,
  normalizeDevelopEliteStructuresLayerUrl,
  normalizeDevelopEliteTreesLayerUrl,
  normalizeDevelopEliteWorldCountriesLayerUrl,
  normalizeDevelopEliteZonesLayerUrl,
  repairDevelopEliteCropsTableUrl,
  type DevelopEliteDashboardConfig,
} from './developEliteDashboardConfig'

/**
 * Single registry for Settings → Data (display order, groups, defaults).
 * To add a layer: extend `DevelopEliteDashboardConfig`, map data loaders/cache,
 * `developEliteMapDataLayers`, then append one entry to `DEVELOP_ELITE_DATA_SOURCES`.
 */

/** Config keys that store ArcGIS layer / table REST URLs. */
export type DevelopEliteDataSourceUrlKey = keyof Pick<
  DevelopEliteDashboardConfig,
  | 'structuresLayerUrl'
  | 'zonesLayerUrl'
  | 'cropsTableUrl'
  | 'treesLayerUrl'
  | 'agriLocationLayerUrl'
  | 'irrigationValvesLayerUrl'
  | 'irrigationMainPipeLayerUrl'
  | 'worldCountriesLayerUrl'
>

export type DevelopEliteDataSourceKind = 'map' | 'table' | 'kpi' | 'sidebar' | 'overlay'

export type DevelopEliteDataSourceGeometry = 'polygon' | 'polyline' | 'point' | 'table' | 'mixed'

export type DevelopEliteDataSourceGroupId =
  | 'core'
  | 'map-assets'
  | 'irrigation'
  | 'portfolio'

export type DevelopEliteDataSourceGroup = {
  id: DevelopEliteDataSourceGroupId
  title: string
  description: string
  defaultOpen?: boolean
}

export type DevelopEliteDataSourceDef = {
  key: DevelopEliteDataSourceUrlKey
  group: DevelopEliteDataSourceGroupId
  title: string
  description: string
  defaultUrl: string
  kind: DevelopEliteDataSourceKind
  geometry: DevelopEliteDataSourceGeometry
  /** Linked map layer id (Layers panel), when applicable. */
  mapLayerId?: DevelopEliteMapDataLayerId
  order: number
}

export const DEVELOP_ELITE_DATA_SOURCE_GROUPS: DevelopEliteDataSourceGroup[] = [
  {
    id: 'core',
    title: 'Core portfolio',
    description: 'Structures drive the map, KPIs, charts, and farm lists. Zones and crops table join here.',
    defaultOpen: true,
  },
  {
    id: 'map-assets',
    title: 'Map — assets & locations',
    description: 'Point and polygon overlays drawn above the basemap (visibility in Map → Layers).',
    defaultOpen: true,
  },
  {
    id: 'irrigation',
    title: 'Map — irrigation network',
    description: 'Valves (points) and pressure mains (lines) from ArcGIS utility layers.',
    defaultOpen: true,
  },
  {
    id: 'portfolio',
    title: 'Map — portfolio extent',
    description: 'Country outlines for sidebar, fly-to, and green portfolio borders.',
    defaultOpen: false,
  },
]

export const DEVELOP_ELITE_DATA_SOURCES: DevelopEliteDataSourceDef[] = [
  {
    key: 'structuresLayerUrl',
    group: 'core',
    title: 'Agro Structures',
    description: 'Primary farm polygons — map symbology, structure KPIs, and chart joins.',
    defaultUrl: DEFAULT_DEVELOP_ELITE_STRUCTURES_URL,
    kind: 'map',
    geometry: 'polygon',
    mapLayerId: 'agro-structures',
    order: 10,
  },
  {
    key: 'zonesLayerUrl',
    group: 'core',
    title: 'Zones catalog',
    description: 'Zone sidebar (Name field). Portal /27 resolves to REST /21 when needed.',
    defaultUrl: DEFAULT_DEVELOP_ELITE_ZONES_LAYER_URL,
    kind: 'sidebar',
    geometry: 'polygon',
    order: 20,
  },
  {
    key: 'cropsTableUrl',
    group: 'core',
    title: 'Crops table',
    description: 'Attribute table for charts and the crops grid (joined via Farm_Code).',
    defaultUrl: DEFAULT_DEVELOP_ELITE_CROPS_TABLE_URL,
    kind: 'table',
    geometry: 'table',
    order: 30,
  },
  {
    key: 'treesLayerUrl',
    group: 'map-assets',
    title: 'Tree inventory',
    description: 'Tree KPI count and map points (FeatureServer /24).',
    defaultUrl: DEFAULT_DEVELOP_ELITE_TREES_LAYER_URL,
    kind: 'kpi',
    geometry: 'point',
    mapLayerId: 'trees',
    order: 40,
  },
  {
    key: 'agriLocationLayerUrl',
    group: 'map-assets',
    title: 'AgroLocation',
    description: 'Farm plots / agri location polygons on the map.',
    defaultUrl: DEFAULT_DEVELOP_ELITE_AGRI_LOCATION_LAYER_URL,
    kind: 'map',
    geometry: 'polygon',
    mapLayerId: 'agri-location',
    order: 50,
  },
  {
    key: 'irrigationValvesLayerUrl',
    group: 'irrigation',
    title: 'Irrigation system valves',
    description: 'Valve points — Irrigation_System_Valve FeatureServer /0.',
    defaultUrl: DEFAULT_DEVELOP_ELITE_IRRIGATION_VALVES_LAYER_URL,
    kind: 'map',
    geometry: 'point',
    mapLayerId: 'irrigation-valves',
    order: 60,
  },
  {
    key: 'irrigationMainPipeLayerUrl',
    group: 'irrigation',
    title: 'Irrigation pressure main pipe',
    description: 'Transmission & distribution lines — SUBTYPE symbology.',
    defaultUrl: DEFAULT_DEVELOP_ELITE_IRRIGATION_MAIN_PIPE_LAYER_URL,
    kind: 'map',
    geometry: 'polyline',
    mapLayerId: 'irrigation-main-pipe',
    order: 70,
  },
  {
    key: 'worldCountriesLayerUrl',
    group: 'portfolio',
    title: 'World Countries',
    description: 'Portfolio country outlines (FeatureServer /51, Status 1–3).',
    defaultUrl: DEFAULT_DEVELOP_ELITE_WORLD_COUNTRIES_LAYER_URL,
    kind: 'overlay',
    geometry: 'polygon',
    mapLayerId: 'world-countries',
    order: 80,
  },
]

export function developEliteDataSourcesByGroup(
  groupId: DevelopEliteDataSourceGroupId,
): DevelopEliteDataSourceDef[] {
  return DEVELOP_ELITE_DATA_SOURCES.filter(s => s.group === groupId).sort((a, b) => a.order - b.order)
}

/** Short label from REST URL for display (e.g. Agro_Structures /0). */
export function developEliteArcGisUrlShortLabel(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return '—'
  try {
    const path = new URL(trimmed).pathname
    const match = path.match(/\/services\/([^/]+)\/FeatureServer\/(\d+)/i)
    if (match) return `${decodeURIComponent(match[1])} /${match[2]}`
    const host = new URL(trimmed).hostname.replace(/^services\d*\./, 'services.')
    return `${host}…`
  } catch {
    return trimmed.length > 42 ? `${trimmed.slice(0, 40)}…` : trimmed
  }
}

export function developEliteDataSourceKindLabel(kind: DevelopEliteDataSourceKind): string {
  switch (kind) {
    case 'map':
      return 'Map'
    case 'table':
      return 'Table'
    case 'kpi':
      return 'KPI + map'
    case 'sidebar':
      return 'Sidebar'
    case 'overlay':
      return 'Overlay'
    default:
      return kind
  }
}

export function developEliteDataSourceGeometryLabel(geometry: DevelopEliteDataSourceGeometry): string {
  switch (geometry) {
    case 'polygon':
      return 'Polygon'
    case 'polyline':
      return 'Line'
    case 'point':
      return 'Point'
    case 'table':
      return 'Table'
    case 'mixed':
      return 'Mixed'
    default:
      return geometry
  }
}

export function readDevelopEliteDataSourceUrl(
  config: DevelopEliteDashboardConfig,
  key: DevelopEliteDataSourceUrlKey,
): string {
  return String(config[key] ?? '')
}

export function patchDevelopEliteDataSourceUrl(
  config: DevelopEliteDashboardConfig,
  key: DevelopEliteDataSourceUrlKey,
  url: string,
): DevelopEliteDashboardConfig {
  return { ...config, [key]: url }
}

/** Apply URL normalizers before persisting (Save & reload). */
export function normalizeDevelopEliteDashboardDataSources(
  draft: DevelopEliteDashboardConfig,
): DevelopEliteDashboardConfig {
  const structuresLayerUrl = normalizeDevelopEliteStructuresLayerUrl(draft.structuresLayerUrl)
  return {
    ...draft,
    structuresLayerUrl,
    zonesLayerUrl: normalizeDevelopEliteZonesLayerUrl(draft.zonesLayerUrl, structuresLayerUrl),
    worldCountriesLayerUrl: normalizeDevelopEliteWorldCountriesLayerUrl(draft.worldCountriesLayerUrl),
    cropsTableUrl: repairDevelopEliteCropsTableUrl(structuresLayerUrl, draft.cropsTableUrl),
    treesLayerUrl: normalizeDevelopEliteTreesLayerUrl(draft.treesLayerUrl),
    agriLocationLayerUrl: normalizeDevelopEliteAgriLocationLayerUrl(draft.agriLocationLayerUrl),
    irrigationValvesLayerUrl: normalizeDevelopEliteIrrigationValvesLayerUrl(draft.irrigationValvesLayerUrl),
    irrigationMainPipeLayerUrl: normalizeDevelopEliteIrrigationMainPipeLayerUrl(
      draft.irrigationMainPipeLayerUrl,
    ),
  }
}
