/**
 * Agricultural Object Intelligence Report — data dictionary + attribute aliases.
 * Layer properties win when present; Sentinel-2 / proxies fill gaps honestly.
 */

export type AgriObjectCapabilityStatus =
  | 'AVAILABLE'
  | 'AVAILABLE – CALCULATED FROM SENTINEL-2'
  | 'AVAILABLE – ADDITIONAL DATA REQUIRED'
  | 'REQUIRES GROUND TRUTH'
  | 'REQUIRES MODEL TRAINING'
  | 'NOT RELIABLY DERIVABLE FROM SENTINEL-2'

export type AgriObjectFieldKey =
  | 'objectId'
  | 'objectType'
  | 'objectName'
  | 'boundaryCoordinates'
  | 'centroidLatitude'
  | 'centroidLongitude'
  | 'estimatedAreaHa'
  | 'agriculturalStatus'
  | 'activeStatus'
  | 'landCoverType'
  | 'treeVegetationCoveragePct'
  | 'cropType'
  | 'cropTypeConfidencePct'
  | 'cultivatedAreaByCropHa'
  | 'cropGrowthStage'
  | 'estimatedPlantingDate'
  | 'estimatedHarvestDate'
  | 'cropHealthStatus'
  | 'vegetationIndex'
  | 'ndvi'
  | 'ndre'
  | 'ndmi'
  | 'waterStressIndicator'
  | 'soilMoistureIndicator'
  | 'actualEt'
  | 'cropWaterRequirement'
  | 'irrigationPerformance'
  | 'estimatedWaterUse'
  | 'waterProductivity'
  | 'soilSalinityIndicator'
  | 'landDegradationIndicator'
  | 'landCropSuitability'
  | 'estimatedYield'
  | 'estimatedTotalProduction'
  | 'yieldProductionConfidence'
  | 'changeFromPreviousPeriod'
  | 'newlyCultivatedAbandoned'
  | 'anomalyDetected'
  | 'priorityForFieldInspection'
  | 'recommendedActionInsight'
  | 'timeSeriesDataAvailable'
  | 'satelliteDataUsed'
  | 'aiAnalyticalMethodUsed'
  | 'capabilityStatus'
  | 'requiredGroundTruthData'
  | 'additionalDatasetRequired'
  | 'expectedAccuracy'
  | 'technicalLimitations'
  | 'additionalEoAiOutputs'
  | 'additionalObservationsRecommendations'

export type AgriObjectFieldDef = {
  key: AgriObjectFieldKey
  label: string
  /** Common GeoJSON / enrichment property names (case-insensitive). */
  aliases: string[]
}

/** Canonical report columns (Sheet 1), matching the product data dictionary. */
export const AGRI_OBJECT_FIELD_DEFS: AgriObjectFieldDef[] = [
  { key: 'objectId', label: 'Object ID', aliases: ['objectid', 'object_id', 'plot_id', 'site_plot_id', 'id', 'fid', 'gid'] },
  { key: 'objectType', label: 'Object Type', aliases: ['object_type', 'structure_type', 'type', 'feature_type', 'class'] },
  { key: 'objectName', label: 'Object Name / Label', aliases: ['name', 'farm_name', 'label', 'plot_name', 'title'] },
  { key: 'boundaryCoordinates', label: 'Boundary / Polygon Coordinates', aliases: [] },
  { key: 'centroidLatitude', label: 'Centroid Latitude', aliases: ['centroid_lat', 'lat', 'latitude', 'y'] },
  { key: 'centroidLongitude', label: 'Centroid Longitude', aliases: ['centroid_lon', 'centroid_lng', 'lon', 'lng', 'longitude', 'x'] },
  { key: 'estimatedAreaHa', label: 'Estimated Area (ha)', aliases: ['area_ha', 'shape_area', 'area', 'hectares', 'ha'] },
  {
    key: 'agriculturalStatus',
    label: 'Agricultural / Non-Agricultural',
    aliases: [
      'agricultural',
      'is_agricultural',
      'agri_status',
      'land_use',
      'agri',
      'farmland',
      'is_agri',
      'ag_status',
    ],
  },
  {
    key: 'activeStatus',
    label: 'Active / Inactive Status',
    aliases: [
      'status',
      'active',
      'active_status',
      'cultivation_status',
      'farm_status',
      'plot_status',
      'activity',
      'activity_status',
    ],
  },
  {
    key: 'landCoverType',
    label: 'Land-Cover Type',
    aliases: [
      'land_cover',
      'landcover',
      'lulc',
      'cover_type',
      'lc',
      'land_use_type',
      'lulc_class',
      'landcover_class',
      'cover',
    ],
  },
  {
    key: 'treeVegetationCoveragePct',
    label: 'Vegetation Coverage (%)',
    aliases: ['vegetation_coverage', 'veg_cover_pct', 'tree_cover', 'canopy_cover'],
  },
  { key: 'cropType', label: 'Crop Type', aliases: ['crop_type', 'croptype', 'crop', 'crop_name'] },
  {
    key: 'cropTypeConfidencePct',
    label: 'Crop Confidence (%)',
    aliases: ['crop_confidence', 'crop_type_confidence', 'confidence'],
  },
  {
    key: 'cultivatedAreaByCropHa',
    label: 'Cultivated Area by Crop (ha)',
    aliases: ['cultivated_area', 'crop_area_ha', 'planted_area'],
  },
  { key: 'cropGrowthStage', label: 'Crop Growth Stage', aliases: ['growth_stage', 'phenology', 'crop_stage'] },
  {
    key: 'estimatedPlantingDate',
    label: 'Estimated Planting Date',
    aliases: ['planting_date', 'sow_date', 'sowing_date'],
  },
  {
    key: 'estimatedHarvestDate',
    label: 'Estimated Harvest Date',
    aliases: ['harvest_date', 'harvest_window'],
  },
  { key: 'cropHealthStatus', label: 'Crop Health', aliases: ['crop_health', 'health_status', 'vhs_band'] },
  {
    key: 'vegetationIndex',
    label: 'Vegetation Index',
    aliases: ['vegetation_index', 'veg_index'],
  },
  { key: 'ndvi', label: 'NDVI', aliases: ['ndvi', 'ndvi_mean', 'mean_ndvi'] },
  { key: 'ndre', label: 'NDRE', aliases: ['ndre', 'ndre_mean', 'mean_ndre'] },
  { key: 'ndmi', label: 'NDMI', aliases: ['ndmi', 'ndmi_mean', 'mean_ndmi'] },
  {
    key: 'waterStressIndicator',
    label: 'Water Stress',
    aliases: ['water_stress', 'ndmi_stress', 'moisture_stress'],
  },
  {
    key: 'soilMoistureIndicator',
    label: 'Soil Moisture Proxy',
    aliases: ['soil_moisture', 'moisture'],
  },
  { key: 'actualEt', label: 'Actual ET', aliases: ['actual_et', 'et', 'eta', 'et_mm'] },
  {
    key: 'cropWaterRequirement',
    label: 'Crop Water Requirement',
    aliases: ['cwr', 'crop_water_requirement', 'etc'],
  },
  {
    key: 'irrigationPerformance',
    label: 'Irrigation Performance',
    aliases: ['irrigation_performance', 'irrigation_status'],
  },
  { key: 'estimatedWaterUse', label: 'Estimated Water Use', aliases: ['water_use', 'estimated_water_use'] },
  { key: 'waterProductivity', label: 'Water Productivity', aliases: ['water_productivity', 'wp'] },
  {
    key: 'soilSalinityIndicator',
    label: 'Soil-Salinity Indicator',
    aliases: ['soil_salinity', 'salinity', 'ndsi', 'ssi', 'si'],
  },
  {
    key: 'landDegradationIndicator',
    label: 'Land-Degradation Indicator',
    aliases: ['land_degradation', 'degradation'],
  },
  {
    key: 'landCropSuitability',
    label: 'Land / Crop Suitability',
    aliases: ['suitability', 'land_suitability', 'crop_suitability'],
  },
  { key: 'estimatedYield', label: 'Estimated Yield', aliases: ['estimated_yield', 'yield_t_ha', 'yield'] },
  {
    key: 'estimatedTotalProduction',
    label: 'Estimated Total Production',
    aliases: ['total_production', 'production_tons', 'estimated_production'],
  },
  {
    key: 'yieldProductionConfidence',
    label: 'Yield / Production Confidence',
    aliases: ['yield_confidence', 'production_confidence'],
  },
  {
    key: 'changeFromPreviousPeriod',
    label: 'Change from Previous Period',
    aliases: ['ndvi_change', 'change', 'temporal_change'],
  },
  {
    key: 'newlyCultivatedAbandoned',
    label: 'Newly Cultivated / Abandoned',
    aliases: ['cultivation_change', 'abandonment'],
  },
  { key: 'anomalyDetected', label: 'Anomaly Detected', aliases: ['anomaly', 'anomaly_flag'] },
  {
    key: 'priorityForFieldInspection',
    label: 'Priority for Field Inspection',
    aliases: ['inspection_priority', 'priority'],
  },
  {
    key: 'recommendedActionInsight',
    label: 'Recommended Action / Insight',
    aliases: ['recommendation', 'recommended_action', 'insight'],
  },
  {
    key: 'timeSeriesDataAvailable',
    label: 'Time-Series Data Available',
    aliases: ['timeseries_available'],
  },
  { key: 'satelliteDataUsed', label: 'Satellite Data Used', aliases: ['satellite', 'sensor'] },
  {
    key: 'aiAnalyticalMethodUsed',
    label: 'AI / Analytical Method Used',
    aliases: ['method', 'model', 'ai_method'],
  },
  { key: 'capabilityStatus', label: 'Capability Status', aliases: [] },
  {
    key: 'requiredGroundTruthData',
    label: 'Required Ground-Truth Data',
    aliases: ['ground_truth'],
  },
  {
    key: 'additionalDatasetRequired',
    label: 'Additional Dataset Required',
    aliases: ['additional_dataset'],
  },
  { key: 'expectedAccuracy', label: 'Expected Accuracy', aliases: ['accuracy'] },
  { key: 'technicalLimitations', label: 'Technical Limitations', aliases: ['limitations'] },
  {
    key: 'additionalEoAiOutputs',
    label: 'Additional EO / AI Outputs',
    aliases: ['eo_outputs'],
  },
  {
    key: 'additionalObservationsRecommendations',
    label: 'Additional Observations / Recommendations',
    aliases: ['observations', 'notes'],
  },
]

export const AGRI_OBJECT_REPORT_HEADERS = AGRI_OBJECT_FIELD_DEFS.map(d => d.label)

/**
 * Column order/labels for the EXAMPLE-style single-sheet Excel export (46 columns).
 * Keys resolve against AgriObjectReportRow values.
 */
export const AGRI_OBJECT_EXAMPLE_EXPORT_COLUMNS: Array<{ key: AgriObjectFieldKey; label: string }> = [
  { key: 'objectId', label: 'Object ID' },
  { key: 'objectType', label: 'Object Type' },
  { key: 'objectName', label: 'Object Name / Label' },
  { key: 'boundaryCoordinates', label: 'Boundary / Polygon Coordinates' },
  { key: 'centroidLatitude', label: 'Centroid Latitude' },
  { key: 'centroidLongitude', label: 'Centroid Longitude' },
  { key: 'estimatedAreaHa', label: 'Estimated Area (ha)' },
  { key: 'agriculturalStatus', label: 'Agricultural / Non-Agricultural' },
  { key: 'activeStatus', label: 'Active / Inactive Status' },
  { key: 'landCoverType', label: 'Land-Cover Type' },
  { key: 'treeVegetationCoveragePct', label: 'Vegetation Coverage (%)' },
  { key: 'cropType', label: 'Crop Type' },
  { key: 'cropTypeConfidencePct', label: 'Crop Confidence (%)' },
  { key: 'cropGrowthStage', label: 'Crop Growth Stage' },
  { key: 'cropHealthStatus', label: 'Crop Health' },
  { key: 'ndvi', label: 'NDVI' },
  { key: 'ndre', label: 'NDRE' },
  { key: 'ndmi', label: 'NDMI' },
  { key: 'waterStressIndicator', label: 'Water Stress' },
  { key: 'soilMoistureIndicator', label: 'Soil Moisture Proxy' },
  { key: 'actualEt', label: 'Actual ET' },
  { key: 'cropWaterRequirement', label: 'Crop Water Requirement' },
  { key: 'irrigationPerformance', label: 'Irrigation Performance' },
  { key: 'estimatedWaterUse', label: 'Estimated Water Use' },
  { key: 'waterProductivity', label: 'Water Productivity' },
  { key: 'soilSalinityIndicator', label: 'Soil-Salinity Indicator' },
  { key: 'landDegradationIndicator', label: 'Land-Degradation Indicator' },
  { key: 'landCropSuitability', label: 'Land / Crop Suitability' },
  { key: 'estimatedYield', label: 'Estimated Yield' },
  { key: 'estimatedTotalProduction', label: 'Estimated Total Production' },
  { key: 'yieldProductionConfidence', label: 'Yield / Production Confidence' },
  { key: 'changeFromPreviousPeriod', label: 'Change from Previous Period' },
  { key: 'newlyCultivatedAbandoned', label: 'Newly Cultivated / Abandoned' },
  { key: 'anomalyDetected', label: 'Anomaly Detected' },
  { key: 'priorityForFieldInspection', label: 'Priority for Field Inspection' },
  { key: 'recommendedActionInsight', label: 'Recommended Action / Insight' },
  { key: 'timeSeriesDataAvailable', label: 'Time-Series Data Available' },
  { key: 'satelliteDataUsed', label: 'Satellite Data Used' },
  { key: 'aiAnalyticalMethodUsed', label: 'AI / Analytical Method Used' },
  { key: 'capabilityStatus', label: 'Capability Status' },
  { key: 'requiredGroundTruthData', label: 'Required Ground-Truth Data' },
  { key: 'additionalDatasetRequired', label: 'Additional Dataset Required' },
  { key: 'expectedAccuracy', label: 'Expected Accuracy' },
  { key: 'technicalLimitations', label: 'Technical Limitations' },
  { key: 'additionalEoAiOutputs', label: 'Additional EO / AI Outputs' },
  { key: 'additionalObservationsRecommendations', label: 'Additional Observations / Recommendations' },
]

export const NOT_AVAILABLE = 'Not Available'
export const NOT_AVAILABLE_FROM_S2 =
  'Not Available — field cannot be produced from Sentinel-2 alone / no connected dataset'
export const REQUIRES_ET_DATASET = 'Not Available — Requires additional dataset'
export const REQUIRES_CROP_MODEL = 'Not Available — Requires crop model/ground truth'
export const REQUIRES_MULTI_TEMPORAL =
  'Not Available — Requires multi-temporal historical imagery'
export const REQUIRES_MULTI_DATE = 'Not Available — Requires multi-date time series'
export const REQUIRES_SINGLE_DATE_LIMIT = 'Not Available — Single-date snapshot only'
export const REQUIRES_SOIL_CLIMATE = 'Not Available — Requires soil and climate datasets'
export const REQUIRES_GT_VALIDATION =
  'Not Available — Requires ground-truth validation to compute'
export const CROP_CONFIDENCE_UNAVAILABLE = '--'

const ALIAS_INDEX = (() => {
  const map = new Map<string, AgriObjectFieldKey>()
  for (const def of AGRI_OBJECT_FIELD_DEFS) {
    for (const a of def.aliases) {
      map.set(a.toLowerCase().replace(/[\s-]+/g, '_'), def.key)
    }
    map.set(def.key.toLowerCase(), def.key)
  }
  return map
})()

function normalizePropKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

/** Resolve which dictionary field a raw property name maps to (if any). */
export function resolveAgriObjectFieldKey(propName: string): AgriObjectFieldKey | null {
  const n = normalizePropKey(propName)
  return ALIAS_INDEX.get(n) ?? null
}

export function readPropCaseInsensitive(
  props: Record<string, unknown> | null | undefined,
  aliases: string[],
): unknown {
  if (!props || typeof props !== 'object') return undefined
  const entries = Object.entries(props)
  const want = new Set(aliases.map(a => normalizePropKey(a)))
  for (const [k, v] of entries) {
    if (want.has(normalizePropKey(k))) {
      if (v == null || v === '') continue
      return v
    }
  }
  return undefined
}

export function formatAgriCell(value: unknown): string | number {
  if (value == null || value === '') return NOT_AVAILABLE
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  const s = String(value).trim()
  return s || NOT_AVAILABLE
}

export type AgriObjectGapRow = {
  objectId: string
  field: string
  reason: string
  requiredDataset: string
  recommendedSolution: string
}

export type AgriObjectMethodRow = {
  field: string
  source: string
  dataset: string
  satellite: string
  resolution: string
  acquisitionDate: string
  method: string
  confidence: string
  capabilityStatus: AgriObjectCapabilityStatus
  limitations: string
}

export type AgriObjectChangeLabel =
  | 'Stable'
  | 'Improving'
  | 'Declining'
  | 'Newly cultivated'
  | 'Potentially abandoned'
  | 'Insufficient historical data'

export type AgriObjectInspectionPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'None'
