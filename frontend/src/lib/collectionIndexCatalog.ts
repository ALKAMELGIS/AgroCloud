/**
 * Per-collection Index Layer catalogue for Remote Sensing toolbox.
 * Each Collection shows only its own indices (not the full Sentinel-2 agro list).
 * Visualization standard: normalize → 10 classes → shared colour ramp.
 */

import type { RemoteSensingLayerSelectGroup, RemoteSensingLayerSelectOption } from './agroCompositeIndices'

export type CollectionIndexDef = {
  id: string
  label: string
  scientificName: string
}

/** Class 1 (weak) → Class 10 (extreme) colour ramp for published index rasters. */
export const INDEX_10_CLASS_COLORS = [
  '#2563eb', // 1 No / Weak — Blue
  '#0d9488', // 2 Very Low — Blue-Green
  '#16a34a', // 3 Low — Green
  '#86efac', // 4 Low–Moderate — Light Green
  '#eab308', // 5 Medium — Yellow
  '#f59e0b', // 6 Moderate — Yellow-Orange
  '#f97316', // 7 High–Moderate — Orange
  '#ea580c', // 8 High — Orange-Red
  '#dc2626', // 9 Very High — Red
  '#7f1d1d', // 10 Extreme — Dark Red
] as const

export const INDEX_10_CLASS_LABELS = [
  'No / Weak Indication',
  'Very Low',
  'Low',
  'Low–Moderate',
  'Medium',
  'Moderate',
  'High–Moderate',
  'High',
  'Very High',
  'Very High / Extreme',
] as const

const SENTINEL_3: CollectionIndexDef[] = [
  { id: 'S3_NDVI', label: 'NDVI', scientificName: 'NDVI = (NIR − Red) / (NIR + Red)' },
  { id: 'S3_EVI', label: 'EVI', scientificName: 'EVI = 2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)' },
  { id: 'S3_FAPAR', label: 'FAPAR', scientificName: 'Fraction of Absorbed Photosynthetically Active Radiation' },
  { id: 'S3_LAI', label: 'LAI', scientificName: 'Leaf Area Index' },
  { id: 'S3_FCOVER', label: 'FCOVER', scientificName: 'Fraction of Vegetation Cover' },
  { id: 'S3_CI', label: 'Chlorophyll Index (CI)', scientificName: 'CI = (NIR / Green) − 1' },
  { id: 'S3_LST', label: 'LST', scientificName: 'Land Surface Temperature' },
  {
    id: 'S3_WQI',
    label: 'Water Quality Index',
    scientificName: 'Chlorophyll-a + Turbidity + Algae Indicators',
  },
]

const SENTINEL_5P: CollectionIndexDef[] = [
  { id: 'S5P_NO2', label: 'NO₂ Index', scientificName: 'Atmospheric Nitrogen Dioxide Concentration' },
  { id: 'S5P_SO2', label: 'SO₂ Index', scientificName: 'Atmospheric Sulfur Dioxide Concentration' },
  { id: 'S5P_CO', label: 'CO Index', scientificName: 'Carbon Monoxide Concentration' },
  { id: 'S5P_O3', label: 'O₃ Index', scientificName: 'Ozone Concentration' },
  { id: 'S5P_CH4', label: 'CH₄ Index', scientificName: 'Methane Concentration' },
  { id: 'S5P_AI', label: 'Aerosol Index (AI)', scientificName: 'UV Aerosol Index' },
  { id: 'S5P_AQI', label: 'Air Quality Index (AQI)', scientificName: 'Combined Pollutant Index' },
]

const SENTINEL_6: CollectionIndexDef[] = [
  { id: 'S6_SLA', label: 'Sea Level Anomaly (SLA)', scientificName: 'Sea Surface Height − Mean Sea Level' },
  { id: 'S6_SSH', label: 'Sea Surface Height (SSH)', scientificName: 'Altimeter Measurement' },
  {
    id: 'S6_OST',
    label: 'Ocean Surface Topography',
    scientificName: 'Sea Surface Height + Corrections',
  },
  { id: 'S6_SWH', label: 'Significant Wave Height (SWH)', scientificName: 'Wave Height Measurement' },
  { id: 'S6_SLT', label: 'Sea Level Trend Index', scientificName: 'Temporal Sea Level Change' },
]

const CCM_OPTICAL: CollectionIndexDef[] = [
  { id: 'CCM_NDVI', label: 'NDVI', scientificName: 'NDVI = (NIR − Red) / (NIR + Red)' },
  { id: 'CCM_NDWI', label: 'NDWI', scientificName: 'NDWI = (Green − NIR) / (Green + NIR)' },
  { id: 'CCM_NDMI', label: 'NDMI', scientificName: 'NDMI = (NIR − SWIR) / (NIR + SWIR)' },
  { id: 'CCM_SAVI', label: 'SAVI', scientificName: 'SAVI = ((NIR − Red) / (NIR + Red + L)) × (1 + L)' },
  { id: 'CCM_EVI', label: 'EVI', scientificName: 'EVI = 2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)' },
  { id: 'CCM_NBR', label: 'NBR', scientificName: 'NBR = (NIR − SWIR2) / (NIR + SWIR2)' },
  {
    id: 'CCM_BSI',
    label: 'BSI',
    scientificName: 'BSI = ((SWIR + Red) − (NIR + Blue)) / ((SWIR + Red) + (NIR + Blue))',
  },
]

const CCM_SAR: CollectionIndexDef[] = [
  { id: 'CCM_SAR_BACKSCATTER', label: 'SAR Backscatter Index', scientificName: 'σ° (dB)' },
  { id: 'CCM_SAR_VV_VH', label: 'VV/VH Ratio', scientificName: 'VV ÷ VH' },
  { id: 'CCM_SAR_RVI', label: 'Radar Vegetation Index (RVI)', scientificName: 'RVI = 4×VH / (VV + VH)' },
  {
    id: 'CCM_SAR_SM',
    label: 'SAR Soil Moisture Index',
    scientificName: 'Backscatter-based Soil Moisture',
  },
  { id: 'CCM_SAR_FLOOD', label: 'Flood Detection Index', scientificName: 'σ°(t2) − σ°(t1)' },
  {
    id: 'CCM_SAR_CHANGE',
    label: 'SAR Change Detection Index',
    scientificName: 'Multi-temporal Backscatter Difference',
  },
]

const COPERNICUS_DEM: CollectionIndexDef[] = [
  { id: 'DEM_SLOPE', label: 'Slope', scientificName: 'Elevation Gradient' },
  { id: 'DEM_ASPECT', label: 'Aspect', scientificName: 'Terrain Orientation' },
  { id: 'DEM_HILLSHADE', label: 'Hillshade', scientificName: 'Terrain Illumination Model' },
  {
    id: 'DEM_TPI',
    label: 'TPI (Topographic Position Index)',
    scientificName: 'Elevation − Mean Neighborhood Elevation',
  },
  {
    id: 'DEM_TRI',
    label: 'TRI (Terrain Ruggedness Index)',
    scientificName: 'Elevation Variability',
  },
  {
    id: 'DEM_TWI',
    label: 'TWI (Topographic Wetness Index)',
    scientificName: 'ln(Flow Accumulation / tan(Slope))',
  },
  { id: 'DEM_WATERSHED', label: 'Watershed Index', scientificName: 'Hydrological Catchment Analysis' },
]

const SENTINEL_MOSAICS: CollectionIndexDef[] = [
  { id: 'MOSAIC_NDVI_TS', label: 'NDVI Time Series', scientificName: 'NDVI(t) Over Time' },
  {
    id: 'MOSAIC_VAI',
    label: 'Vegetation Anomaly Index (VAI)',
    scientificName: 'Current NDVI − Historical NDVI',
  },
  { id: 'MOSAIC_CHANGE', label: 'Change Detection Index', scientificName: 'Image(t2) − Image(t1)' },
  {
    id: 'MOSAIC_CROP',
    label: 'Crop Monitoring Index',
    scientificName: 'NDVI + NDMI + Weather Data',
  },
]

const CLMS_BIO: CollectionIndexDef[] = [
  { id: 'CLMS_LAI', label: 'LAI', scientificName: 'Leaf Area Index' },
  { id: 'CLMS_FAPAR', label: 'FAPAR', scientificName: 'Fraction of Absorbed Photosynthetically Active Radiation' },
  { id: 'CLMS_FCOVER', label: 'FCOVER', scientificName: 'Vegetation Cover Fraction' },
  { id: 'CLMS_GPP', label: 'GPP', scientificName: 'Gross Primary Productivity' },
  { id: 'CLMS_DMP', label: 'DMP', scientificName: 'Dry Matter Productivity' },
  { id: 'CLMS_SM', label: 'Soil Moisture Index', scientificName: 'Surface Soil Moisture' },
]

const CLMS_LULC_PRIORITY: CollectionIndexDef[] = [
  { id: 'CLMS_LC_CHANGE', label: 'Land Cover Change Index', scientificName: 'LC(t2) − LC(t1)' },
  { id: 'CLMS_URBAN', label: 'Urban Expansion Index', scientificName: 'Built-up Area Change' },
  { id: 'CLMS_AGRI_EXP', label: 'Agricultural Expansion Index', scientificName: 'Cropland Change' },
  { id: 'CLMS_FOREST_LOSS', label: 'Forest Loss Index', scientificName: 'Forest(t1) − Forest(t2)' },
  {
    id: 'CLMS_FRAGMENT',
    label: 'Landscape Fragmentation Index',
    scientificName: 'Landscape Structure Change',
  },
]

const CLMS_LULC_MAPPING: CollectionIndexDef[] = [
  {
    id: 'CLMS_LC_CLASS',
    label: 'Land Cover Classification Index',
    scientificName: 'Land Cover Classes',
  },
  { id: 'CLMS_LU_CHANGE', label: 'Land Use Change Index', scientificName: 'Land Use(t2) − Land Use(t1)' },
  { id: 'CLMS_BUILTUP', label: 'Built-up Index', scientificName: 'Urban Area Detection' },
  { id: 'CLMS_VEG_COVER', label: 'Vegetation Cover Index', scientificName: 'Vegetation Fraction' },
  { id: 'CLMS_AGRI_LAND', label: 'Agricultural Land Index', scientificName: 'Cropland Detection' },
]

const COMPLEMENTARY: CollectionIndexDef[] = [
  {
    id: 'COMP_RAINFALL_ANOM',
    label: 'Rainfall Anomaly Index',
    scientificName: 'Current Rainfall − Historical Average Rainfall',
  },
  { id: 'COMP_SPI', label: 'Drought Index (SPI)', scientificName: 'Standardized Precipitation Index' },
  {
    id: 'COMP_TEMP_ANOM',
    label: 'Temperature Anomaly Index',
    scientificName: 'Current Temperature − Historical Temperature',
  },
  {
    id: 'COMP_CLIMATE_STRESS',
    label: 'Climate Stress Index',
    scientificName: 'Temperature + Rainfall + Vegetation Response',
  },
  {
    id: 'COMP_ENV_RISK',
    label: 'Environmental Risk Index',
    scientificName: 'Vegetation + Climate + Land Cover + Terrain Factors',
  },
]

const BY_COLLECTION: Record<string, { label: string; indices: CollectionIndexDef[] }> = {
  'sentinel-3': { label: 'SENTINEL-3 indices', indices: SENTINEL_3 },
  'sentinel-3-olci': { label: 'SENTINEL-3 indices', indices: SENTINEL_3 },
  'sentinel-5p': { label: 'SENTINEL-5P indices', indices: SENTINEL_5P },
  'sentinel-6': { label: 'SENTINEL-6 indices', indices: SENTINEL_6 },
  'ccm-optical': { label: 'CCM Optical indices', indices: CCM_OPTICAL },
  'ccm-sar': { label: 'CCM SAR indices', indices: CCM_SAR },
  'copernicus-dem': { label: 'Copernicus DEM indices', indices: COPERNICUS_DEM },
  'sentinel-mosaics': { label: 'Sentinel Mosaics indices', indices: SENTINEL_MOSAICS },
  'clms-biogeophysical': { label: 'CLMS Bio-geophysical', indices: CLMS_BIO },
  'clms-lulc-priority': { label: 'CLMS LULC Priority Areas', indices: CLMS_LULC_PRIORITY },
  'clms-lulc-mapping': { label: 'CLMS LULC Mapping', indices: CLMS_LULC_MAPPING },
  'complementary-data': { label: 'Complementary Data indices', indices: COMPLEMENTARY },
}

const ALL_INDEX_IDS = new Set(
  Object.values(BY_COLLECTION).flatMap(c => c.indices.map(i => i.id.toUpperCase())),
)

export function normalizeCollectionId(collectionId?: string | null): string {
  return String(collectionId || '')
    .trim()
    .toLowerCase()
}

/** True when this Collection uses a dedicated index catalogue (not S2 agro layers). */
export function collectionHasDedicatedIndexCatalog(collectionId?: string | null): boolean {
  return Boolean(BY_COLLECTION[normalizeCollectionId(collectionId)])
}

export function getCollectionIndexDefs(collectionId?: string | null): CollectionIndexDef[] {
  return BY_COLLECTION[normalizeCollectionId(collectionId)]?.indices ?? []
}

export function isCollectionCatalogIndexId(layerId?: string | null): boolean {
  return ALL_INDEX_IDS.has(String(layerId || '').trim().toUpperCase())
}

export function resolveCollectionIndexDef(layerId?: string | null): CollectionIndexDef | null {
  const u = String(layerId || '').trim().toUpperCase()
  if (!u) return null
  for (const entry of Object.values(BY_COLLECTION)) {
    const hit = entry.indices.find(i => i.id.toUpperCase() === u)
    if (hit) return hit
  }
  return null
}

export function buildCollectionIndexSelectGroups(
  collectionId?: string | null,
): RemoteSensingLayerSelectGroup[] | null {
  const key = normalizeCollectionId(collectionId)
  const entry = BY_COLLECTION[key]
  if (!entry) return null
  const options: RemoteSensingLayerSelectOption[] = entry.indices.map(i => ({
    id: i.id,
    label: i.label,
    scientificName: i.scientificName,
  }))
  return [
    {
      id: `collection-indices-${key}`,
      label: entry.label,
      options,
    },
  ]
}

export function buildIndex10ClassLegendClasses(): Array<{
  label: string
  rangeLabel: string
  color: string
}> {
  return INDEX_10_CLASS_LABELS.map((label, i) => ({
    label,
    rangeLabel: `Class ${i + 1}`,
    color: INDEX_10_CLASS_COLORS[i]!,
  }))
}
