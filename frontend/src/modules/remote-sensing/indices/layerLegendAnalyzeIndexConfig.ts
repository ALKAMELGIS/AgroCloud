/** Territory classification bands shown in the Analyze / Statistics panel. */
export type AnalyzeTerritoryLevel = 'Healthy' | 'Moderate' | 'Warning' | 'Critical'

export type LayerLegendAnalyzeIndexConfig = {
  key: string
  /** Subtitle under ANALYSIS SCORE (e.g. Vegetation Health). */
  title: string
  /** Dynamic label prefix (e.g. Territory Health, Salinity Severity). */
  healthLabel: string
  stressedLabel: string
  icon: string
  levelLabels: Record<AnalyzeTerritoryLevel, string>
  insights: Record<AnalyzeTerritoryLevel, string>
}

const LEVEL_LABELS_DEFAULT: Record<AnalyzeTerritoryLevel, string> = {
  Healthy: 'Healthy',
  Moderate: 'Moderate',
  Warning: 'Warning',
  Critical: 'Critical',
}

function cfg(
  partial: Omit<LayerLegendAnalyzeIndexConfig, 'key' | 'levelLabels'> & {
    key: string
    levelLabels?: Partial<Record<AnalyzeTerritoryLevel, string>>
  },
): LayerLegendAnalyzeIndexConfig {
  return {
    ...partial,
    levelLabels: { ...LEVEL_LABELS_DEFAULT, ...partial.levelLabels },
  }
}

/** Canonical analyze configs — extend here; never hardcode labels in the panel UI. */
const ANALYZE_INDEX_CONFIGS: Record<string, LayerLegendAnalyzeIndexConfig> = {
  NDVI: cfg({
    key: 'NDVI',
    title: 'Vegetation Health',
    healthLabel: 'Territory Health',
    stressedLabel: 'STRESSED',
    icon: 'fa-seedling',
    insights: {
      Healthy: 'Vegetation cover is strong across the selected AOI.',
      Moderate: 'Moderate vegetation stress detected.',
      Warning: 'Significant vegetation stress detected in parts of the AOI.',
      Critical: 'Critical vegetation decline — immediate field review recommended.',
    },
  }),
  NDMI: cfg({
    key: 'NDMI',
    title: 'Canopy Moisture',
    healthLabel: 'Vegetation Moisture',
    stressedLabel: 'STRESSED',
    icon: 'fa-droplet',
    levelLabels: { Warning: 'Dry', Critical: 'Very Dry' },
    insights: {
      Healthy: 'Canopy moisture is adequate for the selected AOI.',
      Moderate: 'Canopy moisture is moderate — monitor irrigation timing.',
      Warning: 'Low canopy moisture detected within the AOI.',
      Critical: 'Severe canopy moisture deficit across the AOI.',
    },
  }),
  NDWI: cfg({
    key: 'NDWI',
    title: 'Surface Water',
    healthLabel: 'Water Availability',
    stressedLabel: 'STRESSED',
    icon: 'fa-water',
    levelLabels: { Warning: 'Limited', Critical: 'Very Low' },
    insights: {
      Healthy: 'Water availability is favorable inside the AOI.',
      Moderate: 'Moderate water limitation detected.',
      Warning: 'Limited water availability in parts of the AOI.',
      Critical: 'Very low water availability across the AOI.',
    },
  }),
  MNDWI: cfg({
    key: 'MNDWI',
    title: 'Open Water',
    healthLabel: 'Water Availability',
    stressedLabel: 'STRESSED',
    icon: 'fa-water',
    levelLabels: { Warning: 'Limited', Critical: 'Very Low' },
    insights: {
      Healthy: 'Open-water signal is stable within the AOI.',
      Moderate: 'Mixed water signal — review seasonal context.',
      Warning: 'Reduced open-water presence in the AOI.',
      Critical: 'Very low open-water signal across the AOI.',
    },
  }),
  SSI: cfg({
    key: 'SSI',
    title: 'Soil Salinity',
    healthLabel: 'Salinity Severity',
    stressedLabel: 'SALINE',
    icon: 'fa-flask',
    levelLabels: {
      Healthy: 'Low',
      Moderate: 'Moderate',
      Warning: 'Elevated',
      Critical: 'Severe',
    },
    insights: {
      Healthy: 'Salinity levels are low within the AOI.',
      Moderate: 'Moderate salinity detected — monitor soil EC.',
      Warning: 'Elevated salinity stress in parts of the AOI.',
      Critical: 'Severe salinity impact across the AOI.',
    },
  }),
  WST: cfg({
    key: 'WST',
    title: 'Water Stress',
    healthLabel: 'Water Loss',
    stressedLabel: 'STRESSED',
    icon: 'fa-temperature-arrow-up',
    levelLabels: { Warning: 'High Loss', Critical: 'Critical Loss' },
    insights: {
      Healthy: 'Water loss stress is low inside the AOI.',
      Moderate: 'Moderate water-loss pressure detected.',
      Warning: 'High water-loss stress in parts of the AOI.',
      Critical: 'Critical water-loss stress across the AOI.',
    },
  }),
  ISS: cfg({
    key: 'ISS',
    title: 'Irrigation Performance',
    healthLabel: 'Irrigation Stress',
    stressedLabel: 'STRESSED',
    icon: 'fa-faucet-drip',
    insights: {
      Healthy: 'Irrigation stress is low for the selected AOI.',
      Moderate: 'Moderate irrigation stress — review scheduling.',
      Warning: 'Elevated irrigation stress detected.',
      Critical: 'Critical irrigation deficit across the AOI.',
    },
  }),
  DSI: cfg({
    key: 'DSI',
    title: 'Drought Conditions',
    healthLabel: 'Drought Severity',
    stressedLabel: 'DROUGHT',
    icon: 'fa-sun-plant-wilt',
    insights: {
      Healthy: 'Drought severity is low within the AOI.',
      Moderate: 'Moderate drought pressure detected.',
      Warning: 'Significant drought stress in parts of the AOI.',
      Critical: 'Severe drought conditions across the AOI.',
    },
  }),
  SMI: cfg({
    key: 'SMI',
    title: 'Soil Moisture',
    healthLabel: 'Soil Moisture',
    stressedLabel: 'DRY',
    icon: 'fa-earth-americas',
    levelLabels: { Warning: 'Dry', Critical: 'Very Dry' },
    insights: {
      Healthy: 'Soil moisture is adequate inside the AOI.',
      Moderate: 'Soil moisture is moderate — monitor trends.',
      Warning: 'Dry soil conditions detected in parts of the AOI.',
      Critical: 'Very dry soil conditions across the AOI.',
    },
  }),
  ET: cfg({
    key: 'ET',
    title: 'Evapotranspiration',
    healthLabel: 'ET Demand',
    stressedLabel: 'HIGH ET',
    icon: 'fa-wind',
    levelLabels: { Healthy: 'Low', Moderate: 'Moderate', Warning: 'High', Critical: 'Extreme' },
    insights: {
      Healthy: 'ET demand is low relative to the AOI baseline.',
      Moderate: 'Moderate ET demand — standard irrigation planning.',
      Warning: 'High ET demand detected — increase monitoring.',
      Critical: 'Exceptional ET demand across the AOI.',
    },
  }),
  SAVI: cfg({
    key: 'SAVI',
    title: 'Vegetation Cover',
    healthLabel: 'Territory Health',
    stressedLabel: 'STRESSED',
    icon: 'fa-leaf',
    insights: {
      Healthy: 'Soil-adjusted vegetation cover is strong.',
      Moderate: 'Moderate cover stress detected.',
      Warning: 'Significant cover stress in parts of the AOI.',
      Critical: 'Critical cover loss across the AOI.',
    },
  }),
}

/** Map layer aliases to a canonical analyze config key. */
const ANALYZE_INDEX_ALIASES: Record<string, string> = {
  NDSI: 'SSI',
  SI: 'SSI',
  DSSI: 'SSI',
  DNDVI: 'NDVI',
  DNDMI: 'NDMI',
  DNDWI: 'NDWI',
  DMNDWI: 'MNDWI',
  DRI: 'DSI',
  DDRI: 'DSI',
  DDSI: 'DSI',
  VMI: 'SMI',
  DVMI: 'SMI',
  DSMI: 'SMI',
  WDSI: 'WST',
  DWST: 'WST',
  DWDSI: 'WST',
  IEI: 'ISS',
  DIEI: 'ISS',
  UII: 'ISS',
  DUII: 'ISS',
  DISS: 'ISS',
  NDII: 'NDMI',
  NDRE: 'NDVI',
  CIRE: 'NDVI',
  CI_RE: 'NDVI',
  EVI: 'NDVI',
  GNDVI: 'NDVI',
  MSAVI: 'SAVI',
  LST: 'ET',
}

export function normalizeAnalyzeLayerKey(layerId: string | undefined): string {
  const raw = String(layerId || '')
    .trim()
    .toUpperCase()
    .replace(/^D(?=[A-Z])/, '')
  if (!raw) return 'NDVI'
  return ANALYZE_INDEX_ALIASES[raw] ?? raw
}

export function resolveAnalyzeIndexConfig(
  layerId: string | undefined,
  specTitle?: string,
): LayerLegendAnalyzeIndexConfig {
  const key = normalizeAnalyzeLayerKey(layerId)
  const found = ANALYZE_INDEX_CONFIGS[key]
  if (found) return found

  const title = specTitle?.trim() || key || 'Index Analysis'
  return cfg({
    key,
    title,
    healthLabel: 'Territory Health',
    stressedLabel: 'STRESSED',
    icon: 'fa-chart-line',
    insights: {
      Healthy: `${title} is favorable within the selected AOI.`,
      Moderate: `Moderate ${title.toLowerCase()} variation detected.`,
      Warning: `Elevated ${title.toLowerCase()} stress in parts of the AOI.`,
      Critical: `Critical ${title.toLowerCase()} conditions across the AOI.`,
    },
  })
}

export function territoryLevelLabel(
  config: LayerLegendAnalyzeIndexConfig,
  level: AnalyzeTerritoryLevel,
): string {
  return config.levelLabels[level].toUpperCase()
}
