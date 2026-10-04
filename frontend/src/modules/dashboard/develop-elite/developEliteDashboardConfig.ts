import { WORLD_COUNTRIES_FS51_URL } from '@/modules/gis/map/worldCountriesLayer'
import { AGRO_STRUCTURES_FS21_URL } from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'
import {
  DEFAULT_DEVELOP_ELITE_CHARTS,
  normalizeDevelopEliteChartsConfig,
  type DevelopEliteChartsConfig,
} from './developEliteChartsConfig'
import {
  DEFAULT_DEVELOP_ELITE_LAYOUT,
  DEVELOP_ELITE_LAYOUT_PRESET_VERSION,
  normalizeDevelopEliteLayout,
  type DevelopEliteLayoutConfig,
} from './developEliteLayoutConfig'
import {
  DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER,
  DEFAULT_DEVELOP_ELITE_MAP_LAYER_VISIBILITY,
  normalizeDevelopEliteMapDataLayerOrder,
  normalizeDevelopEliteMapLayerVisibility,
  type DevelopEliteMapDataLayerId,
} from './developEliteMapDataLayers'

export const DEVELOP_ELITE_CONFIG_LS_KEY = 'develop_elite_dashboard_config_v1'
export const DEVELOP_ELITE_LAYOUT_PRESET_LS_KEY = 'develop_elite_layout_preset_v'
export const DEVELOP_ELITE_MAP_LAYER_ORDER_PRESET_LS_KEY = 'develop_elite_map_layer_order_preset_v'
/** Bump when default map layer stack changes (e.g. add AgroLocation after Tree). */
export const DEVELOP_ELITE_MAP_LAYER_ORDER_PRESET_VERSION = 1

export const DEFAULT_DEVELOP_ELITE_STRUCTURES_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/0'

export const DEFAULT_DEVELOP_ELITE_CROPS_TABLE_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Agro_Structures/FeatureServer/1'

/** Zone catalog. Each feature's Name is the list label; ZONE_ID joins farms when present. */
export const DEFAULT_DEVELOP_ELITE_ZONES_LAYER_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/arcgis/rest/services/Zones/FeatureServer/6'

export const DEFAULT_DEVELOP_ELITE_WORLD_COUNTRIES_LAYER_URL = WORLD_COUNTRIES_FS51_URL

/** Tree inventory points (KPI card «Tree»). */
export const DEFAULT_DEVELOP_ELITE_TREES_LAYER_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Tree/FeatureServer/24'

export const DEFAULT_DEVELOP_ELITE_AGRI_LOCATION_LAYER_URL =
  'https://services1.arcgis.com/jz3ndhbYV5K9NwI8/ArcGIS/rest/services/Agri_Location/FeatureServer/0'

export type DevelopEliteKpiSource =
  | 'totalAreaHa'
  | 'structureTypeCount'
  | 'structureTypeGroupCount'
  | 'fieldFilterCount'
  | 'distinctFieldCount'
  | 'cropFieldSum'
  | 'treesLayerCount'
  | 'agriLocationLayerCount'
  | 'agriLocationFilterCount'

export type DevelopEliteKpiCardConfig = {
  id: string
  title: string
  subtitle?: string
  icon: string
  visible: boolean
  order: number
  source: DevelopEliteKpiSource
  structureTypeCodes?: number[]
  fieldName?: string
  fieldMatch?: string
  fieldMatchMode?: 'equals' | 'contains' | 'regex'
  distinctField?: string
  cropSumField?: string
  format?: 'number' | 'compact' | 'area'
}

export type DevelopEliteDashboardConfig = {
  version: 1
  structuresLayerUrl: string
  /** Zone sidebar (Name field) — defaults to Agro_Structures /21. */
  zonesLayerUrl: string
  /** Portfolio country outlines on map and country sidebar. */
  worldCountriesLayerUrl: string
  cropsTableUrl: string
  /** Point layer for tree KPI (FeatureServer /24). */
  treesLayerUrl: string
  /** Farm plot / agri location polygons (Agri_Location FeatureServer). */
  agriLocationLayerUrl: string
  basemapId: string
  chartGroupField: string
  /** Numeric field summed per group for pie/bar (e.g. Total_Tree). Empty = row count. */
  chartValueField: string
  /** Join field on structures layer and crops table (e.g. Farm_Code). */
  cropStructureJoinField: string
  charts: DevelopEliteChartsConfig
  tableColumns: string[]
  wildfelidProjectMatch: string
  kpiCards: DevelopEliteKpiCardConfig[]
  layout: DevelopEliteLayoutConfig
  mapLayerVisibility: Record<DevelopEliteMapDataLayerId, boolean>
  mapDataLayerOrder: DevelopEliteMapDataLayerId[]
}

export type { DevelopEliteMapDataLayerId }

export type { DevelopEliteChartsConfig, DevelopEliteLayoutConfig }

const CEF_STRUCTURE_CODES = [1000, 1001, 1002, 1003, 1004]

export const DEFAULT_DEVELOP_ELITE_KPI_CARDS: DevelopEliteKpiCardConfig[] = [
  {
    id: 'total-cef',
    title: 'Total CEF',
    subtitle: 'Controlled environment farm',
    icon: 'fa-seedling',
    visible: true,
    order: 1,
    source: 'structureTypeGroupCount',
    structureTypeCodes: CEF_STRUCTURE_CODES,
    format: 'compact',
  },
  {
    id: 'pivot',
    title: 'PIVOT',
    icon: 'fa-seedling',
    visible: true,
    order: 2,
    source: 'structureTypeCount',
    structureTypeCodes: [1006],
    format: 'number',
  },
  {
    id: 'wildfelid',
    title: 'Wildfelid Projects',
    icon: 'fa-paw',
    visible: true,
    order: 3,
    source: 'agriLocationFilterCount',
    fieldName: 'Subtype',
    fieldMatch: 'Wildlife Project',
    fieldMatchMode: 'equals',
    format: 'number',
  },
  {
    id: 'vip-farm',
    title: 'VIP Farm',
    icon: 'fa-star',
    visible: true,
    order: 4,
    source: 'fieldFilterCount',
    fieldName: 'Farm_Category',
    fieldMatch: 'VIP FARM',
    fieldMatchMode: 'equals',
    format: 'number',
  },
  {
    id: 'tree',
    title: 'Tree',
    icon: 'elite-tree',
    visible: true,
    order: 5,
    source: 'treesLayerCount',
    format: 'compact',
  },
  {
    id: 'total-projects',
    title: 'Total Projects',
    icon: 'elite-total-projects',
    visible: true,
    order: 6,
    source: 'agriLocationLayerCount',
    format: 'number',
  },
]

export const DEFAULT_DEVELOP_ELITE_TABLE_COLUMNS = [
  'OBJECTID',
  'ZONE_ID',
  'Farm_Name',
  'Farm_Code',
  'Crop_Type',
  'Variety',
  'Total_Tree',
  'Planting_Date',
  'Harvest_Date',
  'Cost',
]

export function normalizeDevelopEliteZonesLayerUrl(zonesUrl: string, _structuresLayerUrl: string): string {
  const trimmed = String(zonesUrl || '').trim()
  if (!trimmed || /Agro_Structures\/FeatureServer\/(?:0|21|27)\/?$/i.test(trimmed)) {
    return DEFAULT_DEVELOP_ELITE_ZONES_LAYER_URL
  }
  return trimmed
}

export function normalizeDevelopEliteWorldCountriesLayerUrl(url: string): string {
  const trimmed = String(url || '').trim()
  return trimmed || DEFAULT_DEVELOP_ELITE_WORLD_COUNTRIES_LAYER_URL
}

export function normalizeDevelopEliteTreesLayerUrl(url: string): string {
  const trimmed = String(url || '').trim()
  return trimmed || DEFAULT_DEVELOP_ELITE_TREES_LAYER_URL
}

export function normalizeDevelopEliteAgriLocationLayerUrl(url: string): string {
  const trimmed = String(url || '').trim()
  return trimmed || DEFAULT_DEVELOP_ELITE_AGRI_LOCATION_LAYER_URL
}

export const DEFAULT_DEVELOP_ELITE_CONFIG: DevelopEliteDashboardConfig = {
  version: 1,
  structuresLayerUrl: DEFAULT_DEVELOP_ELITE_STRUCTURES_URL,
  zonesLayerUrl: DEFAULT_DEVELOP_ELITE_ZONES_LAYER_URL,
  worldCountriesLayerUrl: DEFAULT_DEVELOP_ELITE_WORLD_COUNTRIES_LAYER_URL,
  cropsTableUrl: DEFAULT_DEVELOP_ELITE_CROPS_TABLE_URL,
  treesLayerUrl: DEFAULT_DEVELOP_ELITE_TREES_LAYER_URL,
  agriLocationLayerUrl: DEFAULT_DEVELOP_ELITE_AGRI_LOCATION_LAYER_URL,
  basemapId: 'google-earth-satellite',
  chartGroupField: 'Crop_Type',
  chartValueField: 'Total_Tree',
  cropStructureJoinField: 'Farm_Code',
  charts: DEFAULT_DEVELOP_ELITE_CHARTS,
  tableColumns: DEFAULT_DEVELOP_ELITE_TABLE_COLUMNS,
  wildfelidProjectMatch: 'Wildlife Project',
  kpiCards: DEFAULT_DEVELOP_ELITE_KPI_CARDS,
  layout: DEFAULT_DEVELOP_ELITE_LAYOUT,
  mapLayerVisibility: { ...DEFAULT_DEVELOP_ELITE_MAP_LAYER_VISIBILITY },
  mapDataLayerOrder: [...DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER],
}

const LEGACY_TOTAL_PROJECTS_ICONS = new Set(['fa-seedling', 'fa-diagram-project', 'fa-project-diagram'])
const LEGACY_TREE_ICONS = new Set(['fa-grapes', 'fa-tree', 'fa-seedling'])

function mergeKpiCards(saved: DevelopEliteKpiCardConfig[]): DevelopEliteKpiCardConfig[] {
  const byId = new Map(saved.map(c => [c.id, c]))
  const merged = [...saved]
  for (const def of DEFAULT_DEVELOP_ELITE_KPI_CARDS) {
    if (!byId.has(def.id)) merged.push({ ...def })
  }
  const totalProjectsDef = DEFAULT_DEVELOP_ELITE_KPI_CARDS.find(c => c.id === 'total-projects')
  return merged
    .map(card => {
      if (card.id === 'total-projects' && totalProjectsDef) {
        let next = card
        if (card.source === 'distinctFieldCount' || card.source === 'fieldFilterCount') {
          next = { ...next, source: totalProjectsDef.source, distinctField: undefined }
        }
        if (LEGACY_TOTAL_PROJECTS_ICONS.has(card.icon)) {
          next = { ...next, icon: totalProjectsDef.icon }
        }
        return next
      }
      if (card.id === 'tree') {
        const treeDef = DEFAULT_DEVELOP_ELITE_KPI_CARDS.find(c => c.id === 'tree')
        if (!treeDef) return card
        let next = card
        if (card.source === 'cropFieldSum') {
          next = { ...next, source: treeDef.source, cropSumField: undefined }
        }
        if (LEGACY_TREE_ICONS.has(card.icon)) {
          next = { ...next, icon: treeDef.icon }
        }
        return next
      }
      if (card.id === 'wildfelid') {
        const wildDef = DEFAULT_DEVELOP_ELITE_KPI_CARDS.find(c => c.id === 'wildfelid')
        if (!wildDef) return card
        if (card.source === 'fieldFilterCount') {
          return {
            ...card,
            source: wildDef.source,
            fieldName: wildDef.fieldName,
            fieldMatch: wildDef.fieldMatch,
            fieldMatchMode: wildDef.fieldMatchMode,
          }
        }
        return card
      }
      return card
    })
    .sort((a, b) => a.order - b.order)
}

export function loadDevelopEliteDashboardConfig(): DevelopEliteDashboardConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_DEVELOP_ELITE_CONFIG }
  try {
    const raw = window.localStorage.getItem(DEVELOP_ELITE_CONFIG_LS_KEY)
    if (!raw) return { ...DEFAULT_DEVELOP_ELITE_CONFIG }
    const parsed = JSON.parse(raw) as Partial<DevelopEliteDashboardConfig>
    const presetKey = DEVELOP_ELITE_LAYOUT_PRESET_LS_KEY
    const storedPreset = Number(window.localStorage.getItem(presetKey) || 0)
    const mapOrderPresetKey = DEVELOP_ELITE_MAP_LAYER_ORDER_PRESET_LS_KEY
    const storedMapOrderPreset = Number(window.localStorage.getItem(mapOrderPresetKey) || 0)
    let layout = normalizeDevelopEliteLayout(parsed.layout)
    if (storedPreset < DEVELOP_ELITE_LAYOUT_PRESET_VERSION) {
      layout = normalizeDevelopEliteLayout({
        ...DEFAULT_DEVELOP_ELITE_LAYOUT,
        ...layout,
        widgetFloat: {},
        kpiCardWidths: {},
        gridLayouts: undefined,
        chartPieWeight: DEFAULT_DEVELOP_ELITE_LAYOUT.chartPieWeight,
        chartBarWeight: DEFAULT_DEVELOP_ELITE_LAYOUT.chartBarWeight,
        chartTableWeight: DEFAULT_DEVELOP_ELITE_LAYOUT.chartTableWeight,
        mapHeightPercent: DEFAULT_DEVELOP_ELITE_LAYOUT.mapHeightPercent,
        colSidebarPx: DEFAULT_DEVELOP_ELITE_LAYOUT.colSidebarPx,
        colZonesPx: DEFAULT_DEVELOP_ELITE_LAYOUT.colZonesPx,
        colStructurePx: DEFAULT_DEVELOP_ELITE_LAYOUT.colStructurePx,
      })
      try {
        window.localStorage.setItem(presetKey, String(DEVELOP_ELITE_LAYOUT_PRESET_VERSION))
      } catch {
        /* ignore */
      }
    }
    const config: DevelopEliteDashboardConfig = {
      ...DEFAULT_DEVELOP_ELITE_CONFIG,
      ...parsed,
      version: 1,
      structuresLayerUrl:
        String(parsed.structuresLayerUrl || '').trim() || DEFAULT_DEVELOP_ELITE_STRUCTURES_URL,
      zonesLayerUrl: normalizeDevelopEliteZonesLayerUrl(
        String(parsed.zonesLayerUrl || '').trim(),
        String(parsed.structuresLayerUrl || '').trim() || DEFAULT_DEVELOP_ELITE_STRUCTURES_URL,
      ),
      worldCountriesLayerUrl: normalizeDevelopEliteWorldCountriesLayerUrl(
        String(parsed.worldCountriesLayerUrl || ''),
      ),
      cropsTableUrl: repairDevelopEliteCropsTableUrl(
        String(parsed.structuresLayerUrl || '').trim() || DEFAULT_DEVELOP_ELITE_STRUCTURES_URL,
        String(parsed.cropsTableUrl || '').trim() || DEFAULT_DEVELOP_ELITE_CROPS_TABLE_URL,
      ),
      treesLayerUrl: normalizeDevelopEliteTreesLayerUrl(String(parsed.treesLayerUrl || '')),
      agriLocationLayerUrl: normalizeDevelopEliteAgriLocationLayerUrl(
        String(parsed.agriLocationLayerUrl || ''),
      ),
      chartGroupField: String(parsed.chartGroupField || DEFAULT_DEVELOP_ELITE_CONFIG.chartGroupField),
      chartValueField:
        String(parsed.chartValueField ?? DEFAULT_DEVELOP_ELITE_CONFIG.chartValueField).trim() ||
        DEFAULT_DEVELOP_ELITE_CONFIG.chartValueField,
      cropStructureJoinField:
        String(parsed.cropStructureJoinField ?? DEFAULT_DEVELOP_ELITE_CONFIG.cropStructureJoinField).trim() ||
        DEFAULT_DEVELOP_ELITE_CONFIG.cropStructureJoinField,
      wildfelidProjectMatch: (() => {
        const raw = String(parsed.wildfelidProjectMatch ?? DEFAULT_DEVELOP_ELITE_CONFIG.wildfelidProjectMatch).trim()
        if (raw === 'Wild') return 'Wildlife Project'
        return raw || DEFAULT_DEVELOP_ELITE_CONFIG.wildfelidProjectMatch
      })(),

      mapLayerVisibility: normalizeDevelopEliteMapLayerVisibility(parsed.mapLayerVisibility),
      mapDataLayerOrder: (() => {
        if (storedMapOrderPreset < DEVELOP_ELITE_MAP_LAYER_ORDER_PRESET_VERSION) {
          return [...DEFAULT_DEVELOP_ELITE_MAP_DATA_LAYER_ORDER]
        }
        return normalizeDevelopEliteMapDataLayerOrder(parsed.mapDataLayerOrder)
      })(),
      kpiCards: mergeKpiCards(Array.isArray(parsed.kpiCards) ? parsed.kpiCards : []),
      tableColumns:
        Array.isArray(parsed.tableColumns) && parsed.tableColumns.length
          ? parsed.tableColumns
          : DEFAULT_DEVELOP_ELITE_TABLE_COLUMNS,
      layout,
      charts: normalizeDevelopEliteChartsConfig(parsed.charts),
    }
    if (
      storedPreset < DEVELOP_ELITE_LAYOUT_PRESET_VERSION ||
      storedMapOrderPreset < DEVELOP_ELITE_MAP_LAYER_ORDER_PRESET_VERSION
    ) {
      try {
        window.localStorage.setItem(
          mapOrderPresetKey,
          String(DEVELOP_ELITE_MAP_LAYER_ORDER_PRESET_VERSION),
        )
      } catch {
        /* ignore */
      }
      saveDevelopEliteDashboardConfig(config)
    }
    return config
  } catch {
    return { ...DEFAULT_DEVELOP_ELITE_CONFIG }
  }
}

export function saveDevelopEliteDashboardConfig(config: DevelopEliteDashboardConfig): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DEVELOP_ELITE_CONFIG_LS_KEY, JSON.stringify(config))
  } catch {
    /* ignore quota */
  }
}

/** Crops attribute table is layer 1; layer 0 is structures polygons only. */
export function repairDevelopEliteCropsTableUrl(structuresUrl: string, cropsUrl: string): string {
  const crops = cropsUrl.trim() || DEFAULT_DEVELOP_ELITE_CROPS_TABLE_URL
  const norm = crops.replace(/\/+$/, '')
  const structuresNorm = structuresUrl.replace(/\/+$/, '')
  if (norm.endsWith('/FeatureServer/0') && structuresNorm.endsWith('/FeatureServer/0')) {
    return DEFAULT_DEVELOP_ELITE_CROPS_TABLE_URL
  }
  return crops
}

/** Canonical polygon layer URL for queries (legacy /27 → FS/21). */
export function resolveDevelopEliteStructuresQueryUrl(configUrl: string): string {
  const trimmed = String(configUrl || '').trim()
  if (!trimmed) return AGRO_STRUCTURES_FS21_URL
  return trimmed.replace(/\/+$/, '')
}
