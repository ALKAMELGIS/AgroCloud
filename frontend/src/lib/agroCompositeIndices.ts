/**
 * AgroCloud composite agricultural indices derived from core interpretation layers:
 * NDVI, NDMI, NDWI, SAVI (+ delta variants vs previous scene).
 */

import type { SentinelHubWmsLayerInfo } from './sentinelHubWmsLayers'
import { AGRO_CHAS_EXPR } from './chasIndex'
import { STRESS_ZONES_CHAS_EXPR } from './siStressZonesEngine'
import {
  ADI_CURRENT_INDEX_EXPR,
  ADI_LAYER_ID,
  ADI_SCIENTIFIC_NAME,
  isAdiLayerId,
} from './adiIndex'
import {
  NCADI_FUSION_EXPR,
  NCADI_LAYER_ID,
  NCADI_SCIENTIFIC_NAME,
  isNcadiLayerId,
} from './ncadiIndex'
import {
  LULC_CLASSIFICATION_LAYER_ID,
  LULC_SCIENTIFIC_NAME,
  isLulcClassificationLayerId,
} from './siLulcClassification'

/** Derived visualization layers — same fusion input, rule-engine styling only. */
export const AGRO_DERIVED_LAYER_DEFS: readonly AgroCompositeIndexDef[] = [
  {
    id: 'CHAS_ALERT',
    label: 'CHAS Alert',
    scientificName: 'CHAS Alert Layer (derived 4-level rule engine)',
    deltaId: 'CHAS_ALERT',
    deltaLabel: 'CHAS Alert',
    expr: AGRO_CHAS_EXPR,
  },
  {
    id: 'STRESS_ZONES',
    label: 'Stress Zones',
    scientificName: 'AI Stress Zones (CHAS fusion + 5-class stress map)',
    deltaId: 'STRESS_ZONES',
    deltaLabel: 'Stress Zones',
    expr: STRESS_ZONES_CHAS_EXPR,
  },
  {
    id: ADI_LAYER_ID,
    label: 'ADI',
    scientificName: ADI_SCIENTIFIC_NAME,
    deltaId: ADI_LAYER_ID,
    deltaLabel: 'ADI',
    expr: ADI_CURRENT_INDEX_EXPR,
  },
  {
    id: NCADI_LAYER_ID,
    label: 'NCADI',
    scientificName: NCADI_SCIENTIFIC_NAME,
    deltaId: NCADI_LAYER_ID,
    deltaLabel: 'NCADI',
    expr: NCADI_FUSION_EXPR,
  },
]

export const AGRO_CORE_INTERPRETATION_LAYER_IDS = ['NDVI', 'NDMI', 'NDWI', 'SAVI', 'ET'] as const

export type AgroCoreInterpretationLayerId = (typeof AGRO_CORE_INTERPRETATION_LAYER_IDS)[number]

/** Full scientific names for Core Interpretation layers. */
export const AGRO_CORE_LAYER_SCIENTIFIC_NAMES: Record<AgroCoreInterpretationLayerId, string> = {
  NDVI: 'Normalized Difference Vegetation Index',
  NDMI: 'Normalized Difference Moisture Index',
  NDWI: 'Normalized Difference Water Index',
  SAVI: 'Soil-Adjusted Vegetation Index',
  ET: 'Evapotranspiration (moisture-proxy mm/day)',
}

export type AgroCompositeIndexDef = {
  id: string
  label: string
  /** Full scientific / descriptive name shown beside the abbreviation in Layer select. */
  scientificName: string
  /** Evalscript expression using ndvi, ndmi, ndwi, savi variables. */
  expr: string
  /** Delta layer id (Δ prefix in UI). */
  deltaId: string
  deltaLabel: string
}

export type AgroCompositeCategory = {
  id: string
  groupLabel: string
  indices: AgroCompositeIndexDef[]
}

/** Static composite indices grouped for Layer dropdown + Layer Live legend. */
export const AGRO_COMPOSITE_CATEGORIES: readonly AgroCompositeCategory[] = [
  {
    id: 'vegetation-health',
    groupLabel: '🌱 Vegetation Health Layer',
    indices: [
      {
        id: 'CVHI',
        label: 'CVHI',
        scientificName: 'Composite Vegetation Health Index (NDVI·NDMI·NDWI·SAVI mean)',
        deltaId: 'DCVHI',
        deltaLabel: 'ΔCVHI',
        expr: '(ndvi + ndmi + ndwi + savi) / 4',
      },
      {
        id: 'VHS',
        label: 'VHS',
        scientificName: 'Vegetation Health Score',
        deltaId: 'DVHS',
        deltaLabel: 'ΔVHS',
        expr: '(ndvi + savi) / 2',
      },
      {
        id: 'VDI',
        label: 'VDI',
        scientificName: 'Vegetation Dryness Index',
        deltaId: 'DVDI',
        deltaLabel: 'ΔVDI',
        expr: '0.7 * ndvi + 0.3 * savi',
      },
      {
        id: 'CVI',
        label: 'CVI',
        scientificName: 'Composite Vegetation Index',
        deltaId: 'DCVI',
        deltaLabel: 'ΔCVI',
        expr: '(ndvi + ndmi + savi) / 3',
      },
      {
        id: 'CSI',
        label: 'CSI',
        scientificName: 'Crop Stress Index',
        deltaId: 'DCSI',
        deltaLabel: 'ΔCSI',
        expr: '1 - ((ndvi + ndmi) / 2)',
      },
      {
        id: 'WST',
        label: 'WST',
        scientificName: 'Water Stress Index',
        deltaId: 'DWST',
        deltaLabel: 'ΔWST',
        expr: 'ndvi - ndmi',
      },
    ],
  },
  {
    id: 'water-moisture',
    groupLabel: '💧 Water & Moisture Layer',
    indices: [
      {
        id: 'DRI',
        label: 'DRI',
        scientificName: 'Drought Risk Index',
        deltaId: 'DDRI',
        deltaLabel: 'ΔDRI',
        expr: '1 - ((ndmi + ndwi) / 2)',
      },
      {
        id: 'VMI',
        label: 'VMI',
        scientificName: 'Vegetation Moisture Index',
        deltaId: 'DVMI',
        deltaLabel: 'ΔVMI',
        expr: '(ndmi + ndwi) / 2',
      },
      {
        id: 'SMI',
        label: 'SMI',
        scientificName: 'Soil Moisture Index',
        deltaId: 'DSMI',
        deltaLabel: 'ΔSMI',
        expr: '0.7 * ndmi + 0.3 * ndwi',
      },
      {
        id: 'OIR',
        label: 'OIR',
        scientificName: 'Over-Irrigation Risk',
        deltaId: 'DOIR',
        deltaLabel: 'ΔOIR',
        expr: 'ndwi - ndvi',
      },
    ],
  },
  {
    id: 'irrigation-field',
    groupLabel: '🚜 Irrigation & Field Management',
    indices: [
      {
        id: 'IEI',
        label: 'IEI',
        scientificName: 'Irrigation Efficiency Index',
        deltaId: 'DIEI',
        deltaLabel: 'ΔIEI',
        expr: 'savi === 0 ? 0 : ndmi / savi',
      },
      {
        id: 'UII',
        label: 'UII',
        scientificName: 'Under-Irrigation Index',
        deltaId: 'DUII',
        deltaLabel: 'ΔUII',
        expr: 'savi - ndmi',
      },
      {
        id: 'FPR',
        label: 'FPR',
        scientificName: 'Field Performance Ratio',
        deltaId: 'DFPR',
        deltaLabel: 'ΔFPR',
        expr: '(1 - ndvi) + (1 - ndmi)',
      },
      {
        id: 'CPI',
        label: 'CPI',
        scientificName: 'Crop Production Index',
        deltaId: 'DCPI',
        deltaLabel: 'ΔCPI',
        expr: '0.4 * ndvi + 0.3 * ndmi + 0.2 * savi + 0.1 * ndwi',
      },
    ],
  },
  {
    id: 'growth-stability',
    groupLabel: '🌾 Growth & Stability',
    indices: [
      {
        id: 'GPI',
        label: 'GPI',
        scientificName: 'Growth Performance Index',
        deltaId: 'DGPI',
        deltaLabel: 'ΔGPI',
        expr: '(ndvi + savi + ndmi) / 3',
      },
      {
        id: 'CSI2',
        label: 'CSI2',
        scientificName: 'Canopy Stability Index II',
        deltaId: 'DCSI2',
        deltaLabel: 'ΔCSI2',
        expr: '1 - Math.abs(ndvi - savi)',
      },
      {
        id: 'CRI',
        label: 'CRI',
        scientificName: 'Crop Resilience Index',
        deltaId: 'DCRI',
        deltaLabel: 'ΔCRI',
        expr: 'ndvi + ndmi',
      },
      {
        id: 'VDG',
        label: 'VDG',
        scientificName: 'Vegetation Decline Gradient',
        deltaId: 'DVDG',
        deltaLabel: 'ΔVDG',
        expr: '1 - ((ndvi + savi) / 2)',
      },
    ],
  },
  {
    id: 'risk-composite',
    groupLabel: '⚠️ Risk & Composite',
    indices: [
      {
        id: 'ARI',
        label: 'ARI',
        scientificName: 'Agro Risk Index',
        deltaId: 'DARI',
        deltaLabel: 'ΔARI',
        expr: '1 - ((ndvi + ndmi + ndwi + savi) / 4)',
      },
      {
        id: 'CHS',
        label: 'CHS',
        scientificName: 'Composite Health Score',
        deltaId: 'DCHS',
        deltaLabel: 'ΔCHS',
        expr: '(ndvi + ndmi + ndwi + savi) / 4',
      },
      {
        id: 'CPS',
        label: 'CPS',
        scientificName: 'Crop Pressure Score',
        deltaId: 'DCPS',
        deltaLabel: 'ΔCPS',
        expr: '(1 - ndvi) + (1 - ndmi)',
      },
    ],
  },
  {
    id: 'soil-salinity',
    groupLabel: '🧂 Soil & Salinity Layer',
    indices: [
      {
        id: 'NDSI',
        label: 'NDSI',
        scientificName: 'Normalized Difference Salinity Index ((B11−B8)/(B11+B8))',
        deltaId: 'DNDSI',
        deltaLabel: 'ΔNDSI',
        expr: 'ndsi',
      },
      {
        id: 'SI',
        label: 'SI',
        scientificName: 'Salinity Index (√(B3·B4))',
        deltaId: 'DSI',
        deltaLabel: 'ΔSI',
        expr: 'si',
      },
      {
        id: 'SSI',
        label: 'SSI',
        scientificName: 'Soil Salinity Index (NDSI + SI)',
        deltaId: 'DSSI',
        deltaLabel: 'ΔSSI',
        expr: 'ssi',
      },
    ],
  },
  {
    id: 'crop',
    groupLabel: '🌾 Crop',
    indices: [
      {
        id: 'CHAS',
        label: 'CHAS',
        scientificName: 'Crop Health Analysis Score (NDVI·NDWI·NDMI·SAVI fusion)',
        deltaId: 'DCHAS',
        deltaLabel: 'ΔCHAS',
        expr: AGRO_CHAS_EXPR,
      },
    ],
  },
] as const

/** Four-index CHAS fusion (NDVI·NDWI·NDMI·SAVI) — scientific raster + derived alert layers. */
export { AGRO_CHAS_EXPR } from './chasIndex'

const STATIC_BY_ID = new Map<string, AgroCompositeIndexDef>()
const DELTA_BY_ID = new Map<string, AgroCompositeIndexDef>()
const ALL_COMPOSITE_IDS = new Set<string>()

for (const cat of AGRO_COMPOSITE_CATEGORIES) {
  for (const idx of cat.indices) {
    STATIC_BY_ID.set(idx.id.toUpperCase(), idx)
    DELTA_BY_ID.set(idx.deltaId.toUpperCase(), idx)
    ALL_COMPOSITE_IDS.add(idx.id.toUpperCase())
    ALL_COMPOSITE_IDS.add(idx.deltaId.toUpperCase())
  }
}

for (const derived of AGRO_DERIVED_LAYER_DEFS) {
  STATIC_BY_ID.set(derived.id.toUpperCase(), derived)
  ALL_COMPOSITE_IDS.add(derived.id.toUpperCase())
}

export const AGRO_DELTA_CATEGORIES: readonly AgroCompositeCategory[] = AGRO_COMPOSITE_CATEGORIES.map(cat => ({
  id: `${cat.id}-delta`,
  groupLabel: `${cat.groupLabel} (Delta)`,
  indices: cat.indices.map(idx => ({
    id: idx.deltaId,
    label: idx.deltaLabel,
    scientificName: `Change · ${idx.scientificName}`,
    deltaId: idx.deltaId,
    deltaLabel: idx.deltaLabel,
    expr: idx.expr,
  })),
}))

export function isAgroDerivedLayerId(layerId: string): boolean {
  const u = String(layerId || '').trim().toUpperCase()
  return AGRO_DERIVED_LAYER_DEFS.some(d => d.id.toUpperCase() === u)
}

export function isAgroStaticCompositeLayerId(layerId: string): boolean {
  return STATIC_BY_ID.has(String(layerId || '').trim().toUpperCase())
}

export function isAgroDeltaCompositeLayerId(layerId: string): boolean {
  return DELTA_BY_ID.has(String(layerId || '').trim().toUpperCase())
}

export function isAgroCompositeLayerId(layerId: string): boolean {
  const u = String(layerId || '').trim().toUpperCase()
  return ALL_COMPOSITE_IDS.has(u)
}

export function resolveAgroCompositeIndexDef(layerId: string): AgroCompositeIndexDef | null {
  const u = String(layerId || '').trim().toUpperCase()
  return STATIC_BY_ID.get(u) ?? DELTA_BY_ID.get(u) ?? null
}

/** Static layer id paired with a delta layer (e.g. DVHS → VHS). */
export function resolveAgroStaticLayerIdForDelta(deltaLayerId: string): string | null {
  const u = String(deltaLayerId || '').trim().toUpperCase()
  for (const cat of AGRO_COMPOSITE_CATEGORIES) {
    for (const idx of cat.indices) {
      if (idx.deltaId.toUpperCase() === u) return idx.id
    }
  }
  return null
}

export function resolveAgroCompositeExpr(layerId: string, corePrefix = ''): string | null {
  const def = resolveAgroCompositeIndexDef(layerId)
  if (!def) return null
  if (!corePrefix) return def.expr
  return def.expr
    .replace(/\bndvi\b/g, `${corePrefix}ndvi`)
    .replace(/\bndmi\b/g, `${corePrefix}ndmi`)
    .replace(/\bndwi\b/g, `${corePrefix}ndwi`)
    .replace(/\bsavi\b/g, `${corePrefix}savi`)
}

/** Custom WMS layer entries injected after GetCapabilities parse. */
export function buildAgroCloudCustomWmsLayerEntries(): SentinelHubWmsLayerInfo[] {
  const out: SentinelHubWmsLayerInfo[] = [
    { name: 'SAVI', title: 'SAVI' },
    { name: 'ET', title: 'Evapotranspiration' },
  ]
  const seen = new Set(out.map(l => l.name.toUpperCase()))
  for (const id of ALL_COMPOSITE_IDS) {
    if (seen.has(id)) continue
    seen.add(id)
    const def = STATIC_BY_ID.get(id) ?? DELTA_BY_ID.get(id)!
    const label = DELTA_BY_ID.has(id) ? def.deltaLabel : def.label
    out.push({ name: id, title: label })
  }
  return out
}

export type RemoteSensingLayerSelectOption = {
  id: string
  label: string
  scientificName?: string
}

export type RemoteSensingLayerSelectGroup = {
  id: string
  label: string
  options: RemoteSensingLayerSelectOption[]
}

/** Resolve scientific name for a layer id in the Remote Sensing dropdown. */
export function resolveRemoteSensingLayerScientificName(layerId: string): string | undefined {
  const u = String(layerId || '').trim().toUpperCase()
  if (!u) return undefined
  if (u in AGRO_CORE_LAYER_SCIENTIFIC_NAMES) {
    return AGRO_CORE_LAYER_SCIENTIFIC_NAMES[u as AgroCoreInterpretationLayerId]
  }
  if (isLulcClassificationLayerId(u)) return LULC_SCIENTIFIC_NAME
  if (isAdiLayerId(u)) return ADI_SCIENTIFIC_NAME
  if (isNcadiLayerId(u)) return NCADI_SCIENTIFIC_NAME
  const composite = resolveAgroCompositeIndexDef(u)
  if (composite) {
    if (isAgroDeltaCompositeLayerId(u)) return `Change · ${composite.scientificName}`
    return composite.scientificName
  }
  return undefined
}

export function buildRemoteSensingLayerSelectGroups(
  capabilityLayers: Array<{ name: string; title?: string }>,
): RemoteSensingLayerSelectGroup[] {
  const byName = new Map<string, string>()
  for (const layer of capabilityLayers) {
    const id = String(layer.name || '').trim()
    if (!id) continue
    byName.set(id.toUpperCase(), String(layer.title || id).trim() || id)
  }

  const groups: RemoteSensingLayerSelectGroup[] = []

  groups.push({
    id: 'core',
    label: 'Core Interpretation',
    options: AGRO_CORE_INTERPRETATION_LAYER_IDS.map(id => ({
      id,
      label: id,
      scientificName: AGRO_CORE_LAYER_SCIENTIFIC_NAMES[id],
    })),
  })

  groups.push({
    id: 'live-analysis-lulc',
    label: 'Live Analysis · Land Cover',
    options: [
      {
        id: LULC_CLASSIFICATION_LAYER_ID,
        label: 'LULC',
        scientificName: LULC_SCIENTIFIC_NAME,
      },
    ],
  })

  groups.push({
    id: 'live-analysis-anomaly',
    label: 'Live Analysis · Anomaly',
    options: [
      {
        id: ADI_LAYER_ID,
        label: 'ADI',
        scientificName: ADI_SCIENTIFIC_NAME,
      },
    ],
  })

  groups.push({
    id: 'live-analysis-cultivation',
    label: 'Live Analysis · Cultivation',
    options: [
      {
        id: NCADI_LAYER_ID,
        label: 'NCADI',
        scientificName: NCADI_SCIENTIFIC_NAME,
      },
    ],
  })

  for (const cat of AGRO_COMPOSITE_CATEGORIES) {
    groups.push({
      id: cat.id,
      label: cat.groupLabel,
      options: cat.indices.map(idx => ({
        id: idx.id,
        label: idx.label,
        scientificName: idx.scientificName,
      })),
    })
  }

  if (AGRO_DERIVED_LAYER_DEFS.length) {
    groups.push({
      id: 'derived-alert',
      label: '🚨 Derived Alert Layers',
      options: AGRO_DERIVED_LAYER_DEFS.filter(
        idx => !isAdiLayerId(idx.id) && !isNcadiLayerId(idx.id),
      ).map(idx => ({
        id: idx.id,
        label: idx.label,
        scientificName: idx.scientificName,
      })),
    })
  }

  for (const cat of AGRO_DELTA_CATEGORIES) {
    groups.push({
      id: cat.id,
      label: cat.groupLabel,
      options: cat.indices.map(idx => ({
        id: idx.id,
        label: idx.label,
        scientificName: idx.scientificName,
      })),
    })
  }

  const assigned = new Set<string>([
    ...AGRO_CORE_INTERPRETATION_LAYER_IDS.map(s => s.toUpperCase()),
    ...ALL_COMPOSITE_IDS,
    LULC_CLASSIFICATION_LAYER_ID,
  ])

  const standard = capabilityLayers
    .map(l => {
      const id = String(l.name || '').trim()
      if (!id || assigned.has(id.toUpperCase())) return null
      return { id, label: String(l.title || id).trim() || id, scientificName: undefined }
    })
    .filter((x): x is RemoteSensingLayerSelectOption => x != null)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))

  if (standard.length) {
    groups.push({ id: 'sentinel-presets', label: 'Sentinel Hub layers', options: standard })
  }

  return groups.filter(g => g.options.length > 0)
}

/** Flat option list for Layer Live legend catalog (preserves group order). */
export function flattenRemoteSensingLayerSelectGroups(
  groups: RemoteSensingLayerSelectGroup[],
): RemoteSensingLayerSelectOption[] {
  const out: RemoteSensingLayerSelectOption[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const opt of group.options) {
      const key = opt.id.toUpperCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(opt)
    }
  }
  return out
}
