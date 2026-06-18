import type { CropAlertEngineSettings } from '../../../lib/siCropAlertEngine'
import { applyCropAlertEngineDefaultOperatingState } from '../../../lib/siCropAlertEngine'
import type { GisContentMapLayerGroup } from '../../../lib/gisContentRepository'
import { AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG } from '../../../lib/agroStructuresPrimaryAoi'

export const ACP_STRUCTURES_RELOAD_DEBOUNCE_MS = 650
export const ACP_PLATFORM_CONFIG_LS_KEY = 'acp_platform_config_v1'
export const ACP_CROP_ALERT_ENGINE_LS_KEY = 'acp_crop_alert_engine_v1'
export const ACP_CROP_ALERT_RESULTS_LS_KEY = 'acp_crop_alert_results_v1'

export type AcpMapScopeMode = 'viewport' | 'selection' | 'global'

export type AcpDefaultLayerVisibility = {
  aoi: boolean
  sentinelWms: boolean
  liveChas: boolean
  liveAlertTicker: boolean
  weatherAlerts: boolean
}

export type AcpPanelVisibility = {
  fields: boolean
  decision: boolean
  liveAlerts: boolean
  analytics: boolean
  timeSeriesChart: boolean
}

export type AcpMapToolbarConfig = {
  addData: boolean
  legend: boolean
  home: boolean
  layers: boolean
  basemap: boolean
  timeSeries: boolean
}

export type AcpFieldsPanelDefaults = {
  defaultViewMode: 'table' | 'list'
  defaultRowDensity: 1 | 2
}

export type AcpKpiCardConfig = {
  id: string
  label: string
  icon: string
  visible: boolean
  order: number
  source: 'structure-type' | 'computed'
  structureTypeCode?: number
  format: 'count' | 'area-ha' | 'both'
}

export type AcpPlatformConfig = {
  version: 1
  title: string
  basemapId: string
  wmsLayerName: string
  cloudCoverage: number
  maxWmsLayers: number
  clipMode: 'stable' | 'viewport'
  mapScopeMode: AcpMapScopeMode
  autoRefreshMinutes: number
  chartLookbackDays: number
  chartSeries: Array<'ndvi' | 'chas' | 'ndmi'>
  kpiCards: AcpKpiCardConfig[]
  layerGroups: GisContentMapLayerGroup[]
  geodashApiUrl: string
  defaultLayerVisibility: AcpDefaultLayerVisibility
  defaultPortalLayerVisibility: Record<string, boolean>
  defaultCountryFilter: string
  mapToolbar: AcpMapToolbarConfig
  panels: AcpPanelVisibility
  defaultAutoFollowDate: boolean
  fieldsPanel: AcpFieldsPanelDefaults
}

const DEFAULT_KPI_CARDS: AcpKpiCardConfig[] = [
  { id: 'total-countries', label: 'COUNTRIES', icon: 'fa-globe', visible: true, order: 0, source: 'computed', format: 'count' },
  { id: 'total-fields', label: 'TOTAL FIELDS', icon: 'fa-map', visible: true, order: 1, source: 'computed', format: 'both' },
  { id: 'total-area', label: 'TOTAL CULTIVATED AREA', icon: 'fa-chart-area', visible: true, order: 2, source: 'computed', format: 'area-ha' },
  ...AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG.map((item, i) => ({
    id: `st-${item.code}`,
    label: item.label.toUpperCase(),
    icon: structureTypeKpiIcon(item.label),
    visible: true,
    order: i + 3,
    source: 'structure-type' as const,
    structureTypeCode: item.code,
    format: 'both' as const,
  })),
]

export function mergeKpiCardsWithDefaults(saved: AcpKpiCardConfig[]): AcpKpiCardConfig[] {
  const byId = new Map(saved.map(card => [card.id, card]))
  const merged = saved.map(card => {
    const def = DEFAULT_KPI_CARDS.find(d => d.id === card.id)
    return def ? { ...def, ...card, order: def.order } : card
  })
  for (const def of DEFAULT_KPI_CARDS) {
    if (!byId.has(def.id)) merged.push({ ...def })
  }
  return merged.sort((a, b) => a.order - b.order)
}

function structureTypeKpiIcon(label: string): string {
  const key = label.toLowerCase()
  if (key.includes('greenhouse')) return 'fa-warehouse'
  if (key.includes('nethouse')) return 'fa-umbrella'
  if (key.includes('glass')) return 'fa-building'
  if (key.includes('retractable')) return 'fa-arrows-left-right'
  if (key.includes('cravo')) return 'fa-gear'
  if (key.includes('dates')) return 'fa-tree'
  if (key.includes('pivot')) return 'fa-rotate'
  if (key.includes('plot') || key.includes('farm')) return 'fa-table-cells'
  return 'fa-seedling'
}

export const DEFAULT_ACP_PLATFORM_CONFIG: AcpPlatformConfig = {
  version: 1,
  title: 'AgroCloud Platform',
  basemapId: 'esri',
  wmsLayerName: 'NDVI',
  cloudCoverage: 20,
  maxWmsLayers: 64,
  clipMode: 'stable',
  mapScopeMode: 'viewport',
  autoRefreshMinutes: 0,
  chartLookbackDays: 90,
  chartSeries: ['ndvi', 'chas'],
  kpiCards: DEFAULT_KPI_CARDS,
  layerGroups: [
    { id: 'agro-structures', name: 'Agro Structures', collapsed: false },
    { id: 'sentinel-2', name: 'Sentinel-2 Views', collapsed: false },
    { id: 'indices', name: 'Indices analysis', collapsed: false },
  ],
  geodashApiUrl: '',
  defaultLayerVisibility: {
    aoi: true,
    sentinelWms: true,
    liveChas: false,
    liveAlertTicker: true,
    weatherAlerts: false,
  },
  defaultPortalLayerVisibility: {},
  defaultCountryFilter: 'all',
  mapToolbar: {
    addData: true,
    legend: true,
    home: true,
    layers: true,
    basemap: true,
    timeSeries: true,
  },
  panels: {
    fields: true,
    decision: true,
    liveAlerts: true,
    analytics: true,
    timeSeriesChart: false,
  },
  defaultAutoFollowDate: true,
  fieldsPanel: { defaultViewMode: 'table', defaultRowDensity: 1 },
}

export function loadAcpPlatformConfig(): AcpPlatformConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_ACP_PLATFORM_CONFIG }
  try {
    const raw = window.localStorage.getItem(ACP_PLATFORM_CONFIG_LS_KEY)
    if (!raw) return { ...DEFAULT_ACP_PLATFORM_CONFIG }
    const parsed = JSON.parse(raw) as Partial<AcpPlatformConfig>
    return {
      ...DEFAULT_ACP_PLATFORM_CONFIG,
      ...parsed,
      kpiCards: parsed.kpiCards?.length
        ? mergeKpiCardsWithDefaults(parsed.kpiCards)
        : DEFAULT_KPI_CARDS,
      defaultLayerVisibility: {
        ...DEFAULT_ACP_PLATFORM_CONFIG.defaultLayerVisibility,
        ...parsed.defaultLayerVisibility,
      },
      panels: {
        ...DEFAULT_ACP_PLATFORM_CONFIG.panels,
        ...parsed.panels,
      },
      mapToolbar: {
        ...DEFAULT_ACP_PLATFORM_CONFIG.mapToolbar,
        ...parsed.mapToolbar,
      },
      defaultPortalLayerVisibility: {
        ...DEFAULT_ACP_PLATFORM_CONFIG.defaultPortalLayerVisibility,
        ...parsed.defaultPortalLayerVisibility,
      },
      defaultCountryFilter: parsed.defaultCountryFilter ?? DEFAULT_ACP_PLATFORM_CONFIG.defaultCountryFilter,
      fieldsPanel: {
        ...DEFAULT_ACP_PLATFORM_CONFIG.fieldsPanel,
        ...parsed.fieldsPanel,
      },
    }
  } catch {
    return { ...DEFAULT_ACP_PLATFORM_CONFIG }
  }
}

export function persistAcpPlatformConfig(config: AcpPlatformConfig): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACP_PLATFORM_CONFIG_LS_KEY, JSON.stringify(config))
}

export function loadAcpAlertEngineSettings(): CropAlertEngineSettings {
  if (typeof window === 'undefined') return applyCropAlertEngineDefaultOperatingState()
  try {
    const raw = window.localStorage.getItem(ACP_CROP_ALERT_ENGINE_LS_KEY)
    if (!raw) return applyCropAlertEngineDefaultOperatingState()
    return applyCropAlertEngineDefaultOperatingState(JSON.parse(raw))
  } catch {
    return applyCropAlertEngineDefaultOperatingState()
  }
}

export function persistAcpAlertEngineSettings(settings: CropAlertEngineSettings): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ACP_CROP_ALERT_ENGINE_LS_KEY, JSON.stringify(settings))
}
