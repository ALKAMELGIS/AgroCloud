/**
 * Filter Remote Sensing Layer dropdown options by satellite provider / collection.
 * Optical multispectral collections get agro indices; SAR / VHR get matching subsets.
 * Dedicated catalogues (DEM, S3/S5P/S6, CLMS, …) replace the shared S2 list entirely.
 * ASTER L1T uses Planetary Computer band formulas (see asterL1tIndices).
 */

import type { RemoteSensingLayerSelectGroup } from './agroCompositeIndices'
import { buildAsterL1tLayerSelectGroups } from './asterL1tIndices'
import {
  buildCollectionIndexSelectGroups,
  collectionHasDedicatedIndexCatalog,
  getCollectionIndexDefs,
} from './collectionIndexCatalog'
import { remoteSensingProviderDef } from './remoteSensingProviders'

/** Capability profile implied by the selected provider collection. */
export type RemoteSensingLayerProfile =
  | 's2-optical'
  | 'landsat-optical'
  | 's3-optical'
  | 'vhr-optical'
  | 'sar'
  | 'aster-optical'
  | 'collection-catalog'

const SAR_COLLECTION_RE =
  /(^|[-_])(sar|grd|palsar|umbra|sentinel-1|alos-2|alos-4|space42-sar|ccm-sar)($|[-_])/i

const VHR_COLLECTION_RE =
  /(pleiades|worldview|planetscope|skysat|blacksky|newsat|markiv|khalifa|dubai|oneatlas|space42-optical)/i

const LANDSAT_COLLECTION_RE = /(landsat|hls)/i

const S3_COLLECTION_RE = /(^|[-_])(sentinel-3|olci|slstr)($|[-_])/i

const S2_COLLECTION_RE = /(sentinel-2|l2a|l1c)/i

const ASTER_COLLECTION_RE = /aster/i

const OPTICAL_CORE = new Set(['NDVI', 'NDMI', 'NDWI', 'SAVI'])
const THERMAL_CORE = new Set(['ET', 'LST'])
const S3_CORE = new Set(['NDVI', 'NDWI', 'SAVI'])

const FULL_OPTICAL_EXTRA_GROUP_IDS = new Set([
  'live-analysis-lulc',
  'live-analysis-anomaly',
  'live-analysis-cultivation',
  'derived-alert',
])

function isVisualPresetLayer(id: string, label: string): boolean {
  const hay = `${id} ${label}`.toUpperCase()
  return (
    /TRUE.?COLOR|FALSE.?COLOR|NATURAL.?COLOR|RGB|TRUECOLOUR|FALSECOLOUR/.test(hay) ||
    /OPTIMIZED.?NATURAL|HIGHLIGHT.?OPTIMIZED/.test(hay)
  )
}

function isSarPresetLayer(id: string, label: string): boolean {
  const hay = `${id} ${label}`.toUpperCase()
  return (
    /\b(VV|VH|HH|HV|SAR|GRD|BACKSCATTER|URBAN.?AREA|FLOOD)\b/.test(hay) ||
    /SENTINEL.?1|S1.?GRD/.test(hay)
  )
}

export function resolveRemoteSensingLayerProfile(
  providerId: string,
  collectionId?: string,
): RemoteSensingLayerProfile {
  const def = remoteSensingProviderDef(providerId)
  const col = (collectionId || def.collections[0]?.id || '').trim()

  if (collectionHasDedicatedIndexCatalog(col)) return 'collection-catalog'
  if (ASTER_COLLECTION_RE.test(col) || def.id === 'aster') return 'aster-optical'
  if (SAR_COLLECTION_RE.test(col) || def.id === 'umbra' || def.id === 'jaea') return 'sar'
  if (S3_COLLECTION_RE.test(col)) return 's3-optical'
  if (LANDSAT_COLLECTION_RE.test(col) || def.id === 'nasa-landsat') return 'landsat-optical'
  if (VHR_COLLECTION_RE.test(col) && !S2_COLLECTION_RE.test(col)) return 'vhr-optical'
  if (
    def.id === 'airbus' ||
    def.id === 'maxar' ||
    def.id === 'planet' ||
    def.id === 'blacksky' ||
    def.id === 'satellogic' ||
    def.id === 'mbrsc' ||
    def.id === 'oneatlas'
  ) {
    return 'vhr-optical'
  }
  return 's2-optical'
}

function isFullOptical(profile: RemoteSensingLayerProfile): boolean {
  return profile === 's2-optical' || profile === 'landsat-optical'
}

function filterCoreOptions(
  options: RemoteSensingLayerSelectGroup['options'],
  profile: RemoteSensingLayerProfile,
): RemoteSensingLayerSelectGroup['options'] {
  return options.filter(opt => {
    const id = opt.id.toUpperCase()
    if (profile === 'sar' || profile === 'collection-catalog') return false
    if (profile === 'vhr-optical') return OPTICAL_CORE.has(id)
    if (profile === 's3-optical') return S3_CORE.has(id)
    return OPTICAL_CORE.has(id) || THERMAL_CORE.has(id)
  })
}

function filterPresetOptions(
  options: RemoteSensingLayerSelectGroup['options'],
  profile: RemoteSensingLayerProfile,
): RemoteSensingLayerSelectGroup['options'] {
  return options.filter(opt => {
    if (profile === 'collection-catalog') return false
    if (profile === 'sar') return isSarPresetLayer(opt.id, opt.label) || isVisualPresetLayer(opt.id, opt.label)
    if (profile === 'vhr-optical') return isVisualPresetLayer(opt.id, opt.label)
    if (profile === 's3-optical') {
      return isVisualPresetLayer(opt.id, opt.label) || /OLCI|CHL|NDVI|NDWI/i.test(`${opt.id} ${opt.label}`)
    }
    return true
  })
}

function presetsGroupLabel(providerId: string, profile: RemoteSensingLayerProfile): string {
  const label = remoteSensingProviderDef(providerId).label
  if (profile === 'sar') return `${label} · SAR / visual layers`
  if (profile === 'vhr-optical') return `${label} · Visual layers`
  if (profile === 's3-optical') return `${label} · OLCI layers`
  if (profile === 'landsat-optical') return `${label} · Landsat layers`
  return `${label} layers`
}

/**
 * Narrow Layer dropdown groups to indices compatible with the selected satellite collection.
 */
export function filterRemoteSensingLayerSelectGroupsForProvider(
  groups: RemoteSensingLayerSelectGroup[],
  providerId: string,
  collectionId?: string,
): RemoteSensingLayerSelectGroup[] {
  const dedicated = buildCollectionIndexSelectGroups(collectionId)
  if (dedicated?.length) return dedicated

  const profile = resolveRemoteSensingLayerProfile(providerId, collectionId)

  if (profile === 'aster-optical') {
    const out: RemoteSensingLayerSelectGroup[] = [...buildAsterL1tLayerSelectGroups()]
    const precip = groups.find(g => g.id === 'climate-precipitation')
    if (precip) out.push(precip)
    return out.filter(g => g.options.length > 0)
  }

  const out: RemoteSensingLayerSelectGroup[] = []

  for (const group of groups) {
    if (group.id === 'core') {
      const options = filterCoreOptions(group.options, profile)
      if (options.length) out.push({ ...group, options })
      continue
    }

    if (group.id === 'climate-precipitation') {
      // CHIRPS stays available for S2 / Landsat / SAR / VHR — not for dedicated catalogues.
      out.push(group)
      continue
    }

    if (group.id === 'sentinel-presets') {
      const options = filterPresetOptions(group.options, profile)
      if (options.length) {
        out.push({
          ...group,
          label: presetsGroupLabel(providerId, profile),
          options,
        })
      }
      continue
    }

    if (FULL_OPTICAL_EXTRA_GROUP_IDS.has(group.id)) {
      if (isFullOptical(profile)) out.push(group)
      continue
    }

    if (isFullOptical(profile)) {
      out.push(group)
    }
  }

  return out.filter(g => g.options.length > 0)
}

/** Prefer NDVI for optical, TRUE_COLOR for VHR/SAR, first catalogue index for dedicated collections. */
export function pickDefaultLayerForProviderProfile(
  options: Array<{ id: string }>,
  providerId: string,
  collectionId?: string,
): string {
  if (!options.length) return ''
  const profile = resolveRemoteSensingLayerProfile(providerId, collectionId)
  const ids = options.map(o => o.id)
  const upper = new Map(ids.map(id => [id.toUpperCase(), id]))

  if (profile === 'collection-catalog') {
    const defs = getCollectionIndexDefs(collectionId)
    for (const def of defs) {
      const hit = upper.get(def.id.toUpperCase())
      if (hit) return hit
    }
    return ids[0]!
  }
  if (profile === 'sar' || profile === 'vhr-optical') {
    for (const key of ['1_TRUE_COLOR', 'TRUE_COLOR', '2_FALSE_COLOR', 'FALSE_COLOR', 'NDVI']) {
      const hit = upper.get(key)
      if (hit) return hit
    }
  }
  if (profile === 's3-optical') {
    for (const key of ['NDVI', 'NDWI', '1_TRUE_COLOR', 'TRUE_COLOR']) {
      const hit = upper.get(key)
      if (hit) return hit
    }
  }
  if (profile === 'aster-optical') {
    for (const key of ['VNIR', 'NDVI', 'SWIR', 'TIR']) {
      const hit = upper.get(key)
      if (hit) return hit
    }
  }
  for (const key of ['NDVI', '1_TRUE_COLOR', 'TRUE_COLOR']) {
    const hit = upper.get(key)
    if (hit) return hit
  }
  return ids[0]!
}
