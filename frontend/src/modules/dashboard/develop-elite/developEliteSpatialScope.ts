import { bbox } from '@turf/turf'
import type { DevelopEliteDashboardConfig, DevelopEliteKpiCardConfig } from './developEliteDashboardConfig'
import {
  developEliteAgriKpiFilters,
  filterScopedAgriLocationFeatures,
  filterScopedAgriLocationLayerFeatures,
  filterScopedTreeFeatures,
  filterStructureFeatures,
  readDevelopEliteStructureZoneId,
  readProp,
  type DevelopEliteFilterContext,
  type DevelopEliteFilters,
  type DevelopEliteStructureFeature,
} from './developEliteKpiEngine'

export const DEVELOP_ELITE_SIDE_STRUCTURE_TYPE_CODES = {
  greenhouse: 1000,
  nethouse: 1001,
  glasshouse: 1002,
} as const

export type DevelopEliteSideStructureKind = keyof typeof DEVELOP_ELITE_SIDE_STRUCTURE_TYPE_CODES

export function developEliteEmptyFeatureCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

export function developEliteFeatureCollectionBbox(
  fc: GeoJSON.FeatureCollection,
): [number, number, number, number] | null {
  if (!fc.features.length) return null
  try {
    const [west, south, east, north] = bbox(fc)
    if (!Number.isFinite(west)) return null
    return [west, south, east, north]
  } catch {
    return null
  }
}

export function developEliteStructureFeaturesToCollection(
  features: DevelopEliteStructureFeature[],
): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features }
}

export function developElitePointsToCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features }
}

export function developEliteScopedStructureFeatures(
  allFeatures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  ctx: DevelopEliteFilterContext,
): DevelopEliteStructureFeature[] {
  return filterStructureFeatures(allFeatures, filters, ctx)
}

export function developEliteDashboardStructurePool(
  allFeatures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  ctx: DevelopEliteFilterContext,
  config: DevelopEliteDashboardConfig,
  agriLocationFeatures: GeoJSON.Feature[],
  agriLocationDrawingInfo: Record<string, unknown> | null | undefined,
  treeFeatures: GeoJSON.Feature[],
): DevelopEliteStructureFeature[] {
  let base = filterStructureFeatures(allFeatures, filters, ctx)
  if (!filters.activeKpiCardId) return base
  const card = config.kpiCards.find(c => c.id === filters.activeKpiCardId)
  if (!card) return base
  const agriScope = filterStructureFeatures(
    allFeatures,
    {
      ...developEliteAgriKpiFilters(filters),
      activeKpiCardId: null,
      structureTypeCode: null,
      structureTypeCodes: null,
    },
    ctx,
  )
  return developEliteNarrowStructuresForActiveKpiCard(
    base,
    card,
    config,
    agriLocationFeatures,
    agriScope,
    developEliteAgriKpiFilters(filters),
    agriLocationDrawingInfo,
    treeFeatures,
    filters,
    ctx,
  )
}

export type DevelopEliteKpiSpatialPatch = Pick<
  DevelopEliteFilters,
  'structureTypeCode' | 'structureTypeCodes' | 'activeKpiCardId'
>

export function developEliteKpiCardIsActive(
  card: DevelopEliteKpiCardConfig,
  filters: DevelopEliteFilters,
): boolean {
  if (filters.activeKpiCardId === card.id) return true
  if (card.source === 'structureTypeCount' && card.structureTypeCodes?.length === 1) {
    return filters.structureTypeCode === card.structureTypeCodes[0] && !filters.structureTypeCodes?.length
  }
  if (
    (card.source === 'structureTypeGroupCount' || card.source === 'structureTypeCount') &&
    card.structureTypeCodes &&
    card.structureTypeCodes.length > 1
  ) {
    const codes = filters.structureTypeCodes
    return (
      Boolean(codes?.length) &&
      codes.length === card.structureTypeCodes.length &&
      card.structureTypeCodes.every(c => codes.includes(c)) &&
      filters.structureTypeCode == null
    )
  }
  return false
}

export function developEliteStructureSideTypeIsActive(
  kind: DevelopEliteSideStructureKind,
  filters: DevelopEliteFilters,
): boolean {
  return filters.structureTypeCode === DEVELOP_ELITE_SIDE_STRUCTURE_TYPE_CODES[kind] && !filters.activeKpiCardId
}

export function developEliteKpiCardSpatialPatch(
  card: DevelopEliteKpiCardConfig,
): DevelopEliteKpiSpatialPatch | null {
  if (card.source === 'structureTypeCount' || card.source === 'structureTypeGroupCount') {
    if (!card.structureTypeCodes?.length) return null
    if (card.structureTypeCodes.length === 1) {
      return {
        structureTypeCode: card.structureTypeCodes[0]!,
        structureTypeCodes: null,
        activeKpiCardId: null,
      }
    }
    return {
      structureTypeCode: null,
      structureTypeCodes: [...card.structureTypeCodes],
      activeKpiCardId: null,
    }
  }
  if (
    card.source === 'agriLocationFilterCount' ||
    card.source === 'agriLocationLayerCount' ||
    card.source === 'treesLayerCount'
  ) {
    return { structureTypeCode: null, structureTypeCodes: null, activeKpiCardId: card.id }
  }
  return null
}

export function developEliteFiltersWithStructureSideType(
  filters: DevelopEliteFilters,
  code: number,
): DevelopEliteFilters {
  const toggleOff = filters.structureTypeCode === code && !filters.structureTypeCodes?.length
  return {
    ...filters,
    selectedFieldKey: null,
    activeKpiCardId: null,
    structureTypeCode: toggleOff ? null : code,
    structureTypeCodes: null,
  }
}

export function developEliteZoneIdsFromFeatureList(features: GeoJSON.Feature[]): Set<string> {
  const zoneIds = new Set<string>()
  for (const f of features) {
    const props = (f.properties ?? {}) as Record<string, unknown>
    const z =
      readDevelopEliteStructureZoneId(props) ||
      readProp(props, 'ZONE_ID') ||
      readProp(props, 'ZONEID') ||
      readProp(props, 'ProjectCode')
    if (z && z !== '—') zoneIds.add(z.toLowerCase())
  }
  return zoneIds
}

export function developEliteNarrowStructuresByZoneIds(
  structures: DevelopEliteStructureFeature[],
  zoneIds: Set<string>,
): DevelopEliteStructureFeature[] {
  if (!zoneIds.size) return []
  return structures.filter(f => {
    const props = f.properties ?? {}
    const z = readDevelopEliteStructureZoneId(props) || readProp(props, 'ZONE_ID')
    return Boolean(z && zoneIds.has(z.toLowerCase()))
  })
}

export function developEliteNarrowStructuresForActiveKpiCard(
  structures: DevelopEliteStructureFeature[],
  card: DevelopEliteKpiCardConfig,
  config: DevelopEliteDashboardConfig,
  agriLocationFeatures: GeoJSON.Feature[],
  agriScopeStructures: DevelopEliteStructureFeature[],
  agriKpiFilters: DevelopEliteFilters,
  agriLocationDrawingInfo: Record<string, unknown> | null | undefined,
  treeFeatures: GeoJSON.Feature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): DevelopEliteStructureFeature[] {
  if (card.source === 'treesLayerCount') {
    const trees = filterScopedTreeFeatures(treeFeatures, agriScopeStructures, filters, ctx)
    const zoneIds = developEliteZoneIdsFromFeatureList(trees)
    return developEliteNarrowStructuresByZoneIds(structures, zoneIds)
  }
  if (card.source === 'agriLocationLayerCount') {
    const agri = filterScopedAgriLocationLayerFeatures(
      agriLocationFeatures,
      agriScopeStructures,
      agriKpiFilters,
      ctx,
    )
    const zoneIds = developEliteZoneIdsFromFeatureList(agri)
    return developEliteNarrowStructuresByZoneIds(structures, zoneIds)
  }
  if (card.source === 'agriLocationFilterCount') {
    let match = card.fieldMatch ?? ''
    if (card.id === 'wildfelid' && config.wildfelidProjectMatch) {
      match = config.wildfelidProjectMatch
    }
    const agri = filterScopedAgriLocationFeatures(
      agriLocationFeatures,
      agriScopeStructures,
      agriKpiFilters,
      card.fieldName || 'Subtype',
      match,
      card.fieldMatchMode ?? 'equals',
      agriLocationDrawingInfo,
      ctx,
    )
    const zoneIds = developEliteZoneIdsFromFeatureList(agri)
    return developEliteNarrowStructuresByZoneIds(structures, zoneIds)
  }
  return structures
}

export function developEliteKpiCardFlyCollection(
  card: DevelopEliteKpiCardConfig,
  config: DevelopEliteDashboardConfig,
  structures: DevelopEliteStructureFeature[],
  agriLocationFeatures: GeoJSON.Feature[],
  agriScopeStructures: DevelopEliteStructureFeature[],
  agriKpiFilters: DevelopEliteFilters,
  agriLocationDrawingInfo: Record<string, unknown> | null | undefined,
  treeFeatures: GeoJSON.Feature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): GeoJSON.FeatureCollection {
  if (card.source === 'structureTypeCount' || card.source === 'structureTypeGroupCount') {
    return developEliteStructureFeaturesToCollection(structures)
  }
  if (card.source === 'treesLayerCount') {
    const trees = filterScopedTreeFeatures(treeFeatures, agriScopeStructures, filters, ctx)
    return developElitePointsToCollection(trees)
  }
  if (card.source === 'agriLocationLayerCount') {
    const agri = filterScopedAgriLocationLayerFeatures(
      agriLocationFeatures,
      agriScopeStructures,
      agriKpiFilters,
      ctx,
    )
    return developElitePointsToCollection(agri)
  }
  if (card.source === 'agriLocationFilterCount') {
    let match = card.fieldMatch ?? ''
    if (card.id === 'wildfelid' && config.wildfelidProjectMatch) {
      match = config.wildfelidProjectMatch
    }
    const agri = filterScopedAgriLocationFeatures(
      agriLocationFeatures,
      agriScopeStructures,
      agriKpiFilters,
      card.fieldName || 'Subtype',
      match,
      card.fieldMatchMode ?? 'equals',
      agriLocationDrawingInfo,
      ctx,
    )
    return developElitePointsToCollection(agri)
  }
  return developEliteEmptyFeatureCollection()
}

export function resolveDevelopEliteExtentFlyCollection(
  card: DevelopEliteKpiCardConfig | null,
  opts: {
    config: DevelopEliteDashboardConfig
    scopeFilters: DevelopEliteFilters
    allFeatures: DevelopEliteStructureFeature[]
    ctx: DevelopEliteFilterContext
    agriLocationFeatures: GeoJSON.Feature[]
    agriLocationDrawingInfo: Record<string, unknown> | null | undefined
    treeFeatures: GeoJSON.Feature[]
    zoneLayer: GeoJSON.FeatureCollection | null | undefined
  },
): GeoJSON.FeatureCollection {
  const filtersForFly: DevelopEliteFilters = { ...opts.scopeFilters, activeKpiCardId: null }
  const structurePool = filterStructureFeatures(opts.allFeatures, filtersForFly, opts.ctx)
  const agriScope = filterStructureFeatures(
    opts.allFeatures,
    {
      ...developEliteAgriKpiFilters(filtersForFly),
      activeKpiCardId: null,
      structureTypeCode: null,
      structureTypeCodes: null,
    },
    opts.ctx,
  )
  const agriKpiFilters = developEliteAgriKpiFilters(filtersForFly)

  if (card) {
    const cardFc = developEliteKpiCardFlyCollection(
      card,
      opts.config,
      structurePool,
      opts.agriLocationFeatures,
      agriScope,
      agriKpiFilters,
      opts.agriLocationDrawingInfo,
      opts.treeFeatures,
      filtersForFly,
      opts.ctx,
    )
    if (cardFc.features.length) return cardFc
  }

  let fc = developEliteStructureFeaturesToCollection(structurePool)
  if (fc.features.length) return fc

  fc = developEliteFilterZoneLayerGeoJson(opts.zoneLayer, opts.scopeFilters)
  if (fc.features.length) return fc

  const broad = filterStructureFeatures(
    opts.allFeatures,
    {
      country: opts.scopeFilters.country,
      zoneId: opts.scopeFilters.zoneId,
      selectedFieldKey: null,
      locationSearch: '',
      structureTypeCode: null,
      structureTypeCodes: null,
      activeKpiCardId: null,
    },
    opts.ctx,
  )
  return developEliteStructureFeaturesToCollection(broad)
}

export function developEliteFilterZoneLayerGeoJson(
  zoneLayer: GeoJSON.FeatureCollection | null | undefined,
  filters: DevelopEliteFilters,
): GeoJSON.FeatureCollection {
  if (!zoneLayer?.features?.length) return developEliteEmptyFeatureCollection()
  let features = zoneLayer.features
  if (filters.zoneId && filters.zoneId !== 'all') {
    const want = filters.zoneId.toLowerCase()
    features = features.filter(f => {
      const props = (f.properties ?? {}) as Record<string, unknown>
      const z = readDevelopEliteStructureZoneId(props) || readProp(props, 'Name') || readProp(props, 'ZONE_ID')
      return z.toLowerCase() === want || readProp(props, 'Name').toLowerCase() === want
    })
  }
  return { type: 'FeatureCollection', features }
}
