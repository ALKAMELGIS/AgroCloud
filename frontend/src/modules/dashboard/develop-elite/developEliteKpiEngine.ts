import {
  AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG,
  featureToPrimaryAoiFeature,
  isPolygonalAoiGeometry,
  resolveAgroStructuresCountryCode,
  resolveAgroStructuresCountryDisplayName,
  resolveAgroStructuresCountryLabel,
  resolveAgroStructuresFeatureAreaHa,
  resolveAgroStructuresFieldName,
} from '@/modules/remote-sensing/imagery/agroStructuresPrimaryAoi'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'
import type { ArcGisTableRow } from './developEliteArcgisFetch'
import { readArcGisField } from './developEliteChartAggregate'
import { normalizeDevelopEliteFarmNameKey, normalizeDevelopEliteJoinKey } from './developEliteLayerJoin'
import {
  flattenArcgisUniqueValueInfos,
  normalizeUniqueValueKey,
  pickRendererPrimaryField,
} from '@/modules/gis/layers/arcgisDrawingInfoMapbox'
import type { DevelopEliteDashboardConfig, DevelopEliteKpiCardConfig } from './developEliteDashboardConfig'
import { structureFeatureMatchesCountryFilter } from './developEliteCountryFilter'
import { comparePortfolioCountryListLabels } from './developEliteCountryListSort'

export type DevelopEliteFilters = {
  country: string
  zoneId: string
  selectedFieldKey: string | null
  locationSearch: string
  /** Side structure boxes — single Structure_Type code. */
  structureTypeCode: number | null
  /** KPI cards (CEF / PIVOT) — multiple Structure_Type codes. */
  structureTypeCodes: number[] | null
  /** Agri / tree KPI cards — narrows dashboard to matching spatial subset. */
  activeKpiCardId: string | null
}

export type DevelopEliteStructureFeature = GeoJSON.Feature & {
  properties: Record<string, unknown>
}

export type DevelopEliteFarmListItem = {
  fieldKey: string
  objectId: string
  title: string
  subtitle: string
}

export type DevelopEliteZoneListItem = {
  zoneId: string
  label: string
  count: number
}

export type DevelopEliteCountryListItem = {
  code: string
  label: string
  count: number
}

export type DevelopEliteSideStructureCounts = {
  glasshouse: number
  nethouse: number
  greenhouse: number
}

export type DevelopEliteKpiValues = {
  heroTotalAreaHa: number
  heroZoneLayerTotalAreaHa: number
  cards: Record<string, string>
}

export type DevelopEliteListContext = {
  countryLabels?: Map<string, string> | null
}

export type DevelopEliteFilterContext = DevelopEliteListContext & {
  worldCountryDomain?: Map<string, string> | null
  /** Zone sidebar label when ZONE_ID is missing on structures. */
  activeZoneLabel?: string | null
  /** Farm / project join keys from Agri Location points for the active Project_Code zone filter. */
  zoneProjectFarmCodes?: Set<string> | null
}

/** Natural sort for farm / zone codes (e.g. FA-16-A, 2B-B, 301). */
export function compareDevelopEliteListNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

const DEVELOP_ELITE_FARM_NH_TITLE = /^NH[-\s]*(\d+)/i

function developEliteFarmNhSortNumber(title: string): number | null {
  const m = title.trim().match(DEVELOP_ELITE_FARM_NH_TITLE)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** Farm sidebar: NH 01, NH 02, … first, then natural sort on the rest. */
export function compareDevelopEliteFarmListItems(
  a: { title: string },
  b: { title: string },
): number {
  const aNh = developEliteFarmNhSortNumber(a.title)
  const bNh = developEliteFarmNhSortNumber(b.title)
  if (aNh != null && bNh != null) {
    if (aNh !== bNh) return aNh - bNh
    return compareDevelopEliteListNames(a.title, b.title)
  }
  if (aNh != null) return -1
  if (bNh != null) return 1
  return compareDevelopEliteListNames(a.title, b.title)
}

function developEliteCropTableFarmLabel(row: ArcGisTableRow, joinField: string): string {
  const farmName = readArcGisField(row, 'Farm_Name')
  if (farmName != null && String(farmName).trim()) return String(farmName).trim()
  const code = readArcGisField(row, joinField)
  if (code != null && String(code).trim()) return String(code).trim()
  return ''
}

/** Stable key for crop table rows — collapses duplicate ArcGIS records with the same farm/crop. */
export function developEliteCropTableRowDedupeKey(
  row: ArcGisTableRow,
  joinField = 'Farm_Code',
): string {
  const joinKey = joinField.trim() || 'Farm_Code'
  const fcRaw = readArcGisField(row, joinKey)
  const fc = fcRaw != null && fcRaw !== '' ? normalizeDevelopEliteJoinKey(String(fcRaw)) : ''
  const farmNameRaw = readArcGisField(row, 'Farm_Name')
  const farmName =
    farmNameRaw != null && farmNameRaw !== ''
      ? normalizeDevelopEliteFarmNameKey(String(farmNameRaw))
      : ''
  const crop = String(readArcGisField(row, 'Crop_Type') ?? '')
  const variety = String(readArcGisField(row, 'Variety') ?? '')
  const zone = readProp(row as Record<string, unknown>, 'ZONE_ID')
  const planting = String(readArcGisField(row, 'Planting_Date') ?? '')
  const harvest = String(readArcGisField(row, 'Harvest_Date') ?? '')
  return [zone, fc, farmName, crop, variety, planting, harvest].join('\u001f')
}

/** Keep the first row per visible crop assignment (pie/bar/table share this pool). */
export function dedupeDevelopEliteCropTableRows(
  rows: ArcGisTableRow[],
  joinField = 'Farm_Code',
): ArcGisTableRow[] {
  const seen = new Set<string>()
  const out: ArcGisTableRow[] = []
  for (const row of rows) {
    const key = developEliteCropTableRowDedupeKey(row, joinField)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

/** Crops table: NH rows first (by number), then natural farm/code order. */
export function compareDevelopEliteCropTableRows(
  a: ArcGisTableRow,
  b: ArcGisTableRow,
  joinField: string,
): number {
  return compareDevelopEliteFarmListItems(
    { title: developEliteCropTableFarmLabel(a, joinField) },
    { title: developEliteCropTableFarmLabel(b, joinField) },
  )
}

const SIDE_TYPE_CODES: Record<'glasshouse' | 'nethouse' | 'greenhouse', number> = {
  glasshouse: 1002,
  nethouse: 1001,
  greenhouse: 1000,
}

function structureTypeCode(props: Record<string, unknown>): number | null {
  const raw = props.Structure_Type ?? props.STRUCTURE_TYPE ?? props.structure_type
  const code = Number(raw)
  return Number.isFinite(code) ? code : null
}

export function readDevelopEliteStructureTypeCode(props: Record<string, unknown>): number | null {
  return structureTypeCode(props)
}

export function readProp(props: Record<string, unknown>, key: string): string {
  const v = props[key] ?? props[key.toUpperCase()] ?? props[key.toLowerCase()]
  return v != null ? String(v).trim() : ''
}

function normalizeFilterToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function readDevelopEliteStructureZoneId(props: Record<string, unknown>): string {
  const raw =
    props.ZONE_ID ??
    props.ZONEID ??
    props.Zone_ID ??
    props.zone_id ??
    props.ZoneId
  if (raw == null || raw === '') return ''
  return String(raw).trim()
}

export function readDevelopEliteAgriLocationProjectCode(props: Record<string, unknown>): string {
  return (
    readProp(props, 'Project_Code') ||
    readProp(props, 'ProjectCode') ||
    readProp(props, 'PROJECT_CODE') ||
    readProp(props, 'project_code')
  )
}

function structureFeatureJoinKeys(props: Record<string, unknown>): Set<string> {
  const keys = new Set<string>()
  for (const field of ['Farm_Code', 'FARM_CODE', 'Project_Code', 'ProjectCode', 'PROJECT_CODE'] as const) {
    const v = readProp(props, field)
    if (v) keys.add(normalizeDevelopEliteJoinKey(v))
  }
  return keys
}

function structureMatchesZoneFilter(
  props: Record<string, unknown>,
  zoneId: string,
  ctx?: DevelopEliteFilterContext | null,
): boolean {
  const zone = zoneId?.trim()
  if (!zone || zone === 'all') return true
  const activeZoneLabel = ctx?.activeZoneLabel
  const projectCode = readDevelopEliteAgriLocationProjectCode(props)
  if (projectCode) {
    const needle = normalizeFilterToken(zone)
    const hay = normalizeFilterToken(projectCode)
    if (hay === needle || projectCode === zone) return true
  }
  const zid = readDevelopEliteStructureZoneId(props)
  if (zid && (zid === zone || zid === String(Number(zone)))) return true
  const name = resolveAgroStructuresFieldName(props) || readProp(props, 'Name')
  if (name) {
    if (name === zone || normalizeFilterToken(name) === normalizeFilterToken(zone)) return true
    if (
      activeZoneLabel &&
      (name === activeZoneLabel || normalizeFilterToken(name) === normalizeFilterToken(activeZoneLabel))
    ) {
      return true
    }
  }
  const projectFarmCodes = ctx?.zoneProjectFarmCodes
  if (projectFarmCodes?.size) {
    for (const key of structureFeatureJoinKeys(props)) {
      if (projectFarmCodes.has(key)) return true
    }
  }
  return false
}

/** Agri Location `Project_Code` zone filter — farm codes on points in that project (optional country). */
export function developEliteCollectAgriProjectFarmCodes(
  agriFeatures: GeoJSON.Feature[],
  projectCode: string,
  countryCode?: string,
  ctx?: DevelopEliteFilterContext,
): Set<string> {
  const zone = projectCode.trim()
  if (!zone || zone === 'all') return new Set()
  const needle = normalizeFilterToken(zone)
  const codes = new Set<string>()
  const country = countryCode?.trim()
  const countryCtx = {
    countryLabels: ctx?.countryLabels,
    worldCountryDomain: ctx?.worldCountryDomain,
  }
  for (const f of agriFeatures) {
    const props = (f.properties ?? {}) as Record<string, unknown>
    const pc = readDevelopEliteAgriLocationProjectCode(props)
    if (!pc || normalizeFilterToken(pc) !== needle) continue
    if (country && country !== 'all') {
      if (!structureFeatureMatchesCountryFilter(props, country, countryCtx)) continue
    }
    for (const key of structureFeatureJoinKeys(props)) {
      codes.add(key)
    }
  }
  return codes
}

/** Tree / AgroLocation on map: zone + country on point attributes (not structure-derived ZONE_ID only). */
export function filterDevelopEliteMapPointFeatures(
  features: GeoJSON.Feature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): GeoJSON.Feature[] {
  if (!features.length) return []
  const country = filters.country?.trim()
  const zone = filters.zoneId?.trim()
  const hasCountry = Boolean(country && country !== 'all')
  const hasZone = Boolean(zone && zone !== 'all')
  if (!hasCountry && !hasZone) return features

  return features.filter(f => {
    const props = (f.properties ?? {}) as Record<string, unknown>
    if (hasCountry) {
      const code = readProp(props, 'Country') || readProp(props, 'COUNTRY') || readProp(props, 'country')
      if (code) {
        if (
          !structureFeatureMatchesCountryFilter(props, country!, {
            countryLabels: ctx?.countryLabels,
            worldCountryDomain: ctx?.worldCountryDomain,
          })
        ) {
          return false
        }
      }
    }
    if (hasZone) {
      const projectCode = readDevelopEliteAgriLocationProjectCode(props)
      if (projectCode) {
        const needle = normalizeFilterToken(zone!)
        const hay = normalizeFilterToken(projectCode)
        if (hay !== needle && projectCode !== zone) return false
      } else if (!structureMatchesZoneFilter(props, zone!, ctx)) {
        return false
      }
    }
    return true
  })
}

function matchFieldFilter(
  props: Record<string, unknown>,
  fieldName: string,
  match: string,
  mode: DevelopEliteKpiCardConfig['fieldMatchMode'],
): boolean {
  const hay = readProp(props, fieldName).toLowerCase()
  const needle = match.trim().toLowerCase()
  if (!needle) return false
  if (mode === 'equals') return hay === needle
  if (mode === 'regex') {
    try {
      return new RegExp(match, 'i').test(hay)
    } catch {
      return hay.includes(needle)
    }
  }
  return hay.includes(needle)
}

export function normalizeStructureFeatures(
  geojson: GeoJSON.FeatureCollection | null | undefined,
): DevelopEliteStructureFeature[] {
  const out: DevelopEliteStructureFeature[] = []
  for (const raw of geojson?.features ?? []) {
    const f = raw as DevelopEliteStructureFeature
    if (!f?.geometry || !isPolygonalAoiGeometry(f.geometry)) continue
    if (!featureToPrimaryAoiFeature(f)) continue
    out.push({
      type: 'Feature',
      geometry: f.geometry,
      properties: { ...(f.properties ?? {}) },
    })
  }
  return out
}

export function filterStructureFeatures(
  features: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): DevelopEliteStructureFeature[] {
  const country = filters.country?.trim()
  const zone = filters.zoneId?.trim()
  const q = filters.locationSearch.trim().toLowerCase()
  return features.filter((f, i) => {
    const props = f.properties ?? {}
    if (country && country !== 'all') {
      if (
        !structureFeatureMatchesCountryFilter(props, country, {
          countryLabels: ctx?.countryLabels,
          worldCountryDomain: ctx?.worldCountryDomain,
        })
      ) {
        return false
      }
    }
    if (zone && zone !== 'all') {
      if (!structureMatchesZoneFilter(props, zone, ctx)) return false
    }
    if (filters.selectedFieldKey) {
      if (computeStableGisFeatureKey(f, i) !== filters.selectedFieldKey) return false
    }
    if (filters.structureTypeCode != null) {
      if (structureTypeCode(props) !== filters.structureTypeCode) return false
    }
    if (filters.structureTypeCodes?.length) {
      const c = structureTypeCode(props)
      if (c == null || !filters.structureTypeCodes.includes(c)) return false
    }
    if (q) {
      const name = resolveAgroStructuresFieldName(props) || readProp(props, 'Farm_Name')
      const zoneId = readDevelopEliteStructureZoneId(props)
      const region = readProp(props, 'Region')
      const hay = `${name} ${zoneId} ${region}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/**
 * Crop table stats for pie/bar: zone/KPI scope via {@link Farm_Code} structure join (not crop-table ZONE_ID).
 * When a single field is selected, uses the same join as the table.
 */
function structureFeaturesForSelectedField(
  structureFeatures: DevelopEliteStructureFeature[],
  selectedFieldKey: string,
): DevelopEliteStructureFeature[] {
  const selected = structureFeatures.filter(
    (f, i) => computeStableGisFeatureKey(f, i) === selectedFieldKey,
  )
  return selected.length ? selected : structureFeatures
}

/** Layer 1 crop rows linked to layer 0 polygons via join field (default Farm_Code). */
export function filterCropRowsByStructureJoin(
  cropRows: ArcGisTableRow[],
  structureFeatures: DevelopEliteStructureFeature[],
  joinField = 'Farm_Code',
): ArcGisTableRow[] {
  const joinKey = joinField.trim() || 'Farm_Code'
  const farmCodes = new Set<string>()
  for (const f of structureFeatures) {
    const raw = readArcGisField(f.properties ?? {}, joinKey)
    const code = raw != null && raw !== '' ? normalizeDevelopEliteJoinKey(String(raw)) : ''
    if (code) farmCodes.add(code)
  }
  if (!farmCodes.size) return []
  return cropRows.filter(row => {
    const rawFc = readArcGisField(row, joinKey)
    const fc = rawFc != null && rawFc !== '' ? normalizeDevelopEliteJoinKey(String(rawFc)) : ''
    return Boolean(fc && farmCodes.has(fc))
  })
}

function developEliteChartStatsUseStructureJoin(filters: DevelopEliteFilters): boolean {
  const zone = filters.zoneId?.trim()
  return (
    (Boolean(zone) && zone !== 'all') ||
    filters.structureTypeCode != null ||
    Boolean(filters.structureTypeCodes?.length) ||
    Boolean(filters.activeKpiCardId)
  )
}

function filterCropRowsByFarmCodeSet(
  rows: ArcGisTableRow[],
  farmCodes: Set<string>,
  joinField = 'Farm_Code',
): ArcGisTableRow[] {
  if (!farmCodes.size) return []
  const joinKey = joinField.trim() || 'Farm_Code'
  return rows.filter(row => {
    const rawFc = readArcGisField(row, joinKey)
    const fc = rawFc != null && rawFc !== '' ? normalizeDevelopEliteJoinKey(String(rawFc)) : ''
    return Boolean(fc && farmCodes.has(fc))
  })
}

/** Farm codes on zone-scoped structures (sidebar zone / Project_Code → {@link Farm_Code} join). */
export function developEliteFarmCodesFromStructureFeatures(
  structureFeatures: DevelopEliteStructureFeature[],
  joinField = 'Farm_Code',
): Set<string> {
  const joinKey = joinField.trim() || 'Farm_Code'
  const codes = new Set<string>()
  for (const f of structureFeatures) {
    const raw = readArcGisField(f.properties ?? {}, joinKey)
    const code = raw != null && raw !== '' ? normalizeDevelopEliteJoinKey(String(raw)) : ''
    if (code) codes.add(code)
  }
  return codes
}

export function filterCropRowsForChartStats(
  cropRows: ArcGisTableRow[],
  structureFeatures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  joinField = 'Farm_Code',
  ctx?: DevelopEliteFilterContext,
): ArcGisTableRow[] {
  if (filters.selectedFieldKey) {
    const linkedStructures = structureFeaturesForSelectedField(
      structureFeatures,
      filters.selectedFieldKey,
    )
    return filterCropRowsByStructureJoin(cropRows, linkedStructures, joinField)
  }

  if (!developEliteChartStatsUseStructureJoin(filters)) {
    return cropRows
  }

  const zone = filters.zoneId?.trim()
  const hasZone = Boolean(zone && zone !== 'all')

  if (structureFeatures.length) {
    return filterCropRowsByStructureJoin(cropRows, structureFeatures, joinField)
  }

  if (hasZone) {
    const fromAgri = ctx?.zoneProjectFarmCodes
    const fromStructures = developEliteFarmCodesFromStructureFeatures(structureFeatures, joinField)
    const codes = new Set<string>([...(fromAgri ?? []), ...fromStructures])
    return filterCropRowsByFarmCodeSet(cropRows, codes, joinField)
  }

  return []
}

export function filterCropRowsForStructures(
  cropRows: ArcGisTableRow[],
  structureFeatures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  joinField = 'Farm_Code',
): ArcGisTableRow[] {
  const joinKey = joinField.trim() || 'Farm_Code'
  const farmCodes = new Set<string>()
  for (const f of structureFeatures) {
    const raw = readArcGisField(f.properties ?? {}, joinKey)
    const code = raw != null && raw !== '' ? normalizeDevelopEliteJoinKey(String(raw)) : ''
    if (code) farmCodes.add(code)
  }
  return cropRows.filter(row => {
    const rawFc = readArcGisField(row, joinKey)
    const fc =
      rawFc != null && rawFc !== '' ? normalizeDevelopEliteJoinKey(String(rawFc)) : ''
    const z = readProp(row, 'ZONE_ID')
    if (farmCodes.size && fc && !farmCodes.has(fc)) return false
    if (filters.zoneId && filters.zoneId !== 'all') {
      const zone = filters.zoneId
      const projectCode = readDevelopEliteAgriLocationProjectCode(row as Record<string, unknown>)
      const matchesZone = z === zone
      const matchesProject =
        projectCode === zone ||
        (projectCode && normalizeFilterToken(projectCode) === normalizeFilterToken(zone))
      if (!matchesZone && !matchesProject) return false
    }
    return true
  })
}

export function buildFarmListItems(
  features: DevelopEliteStructureFeature[],
  _ctx?: DevelopEliteListContext,
): DevelopEliteFarmListItem[] {
  const items: DevelopEliteFarmListItem[] = []
  for (let i = 0; i < features.length; i++) {
    const f = features[i]!
    const props = f.properties ?? {}
    const title =
      resolveAgroStructuresFieldName(props) ||
      readProp(props, 'Farm_Name') ||
      readProp(props, 'Farm_Code') ||
      `Field ${i + 1}`
    const zoneName = readDevelopEliteStructureZoneId(props)
    items.push({
      fieldKey: computeStableGisFeatureKey(f, i),
      objectId: String(props.OBJECTID ?? props.objectid ?? i),
      title,
      subtitle: zoneName,
    })
  }
  return items.sort(compareDevelopEliteFarmListItems)
}

export function filterZoneListForCountry(
  zones: DevelopEliteZoneListItem[],
  structureFeatures: DevelopEliteStructureFeature[],
  countryCode: string,
  ctx?: DevelopEliteFilterContext,
): DevelopEliteZoneListItem[] {
  const country = countryCode?.trim()
  if (!country || country === 'all') return zones

  const scoped = filterStructureFeatures(
    structureFeatures,
    {
      country,
      zoneId: 'all',
      selectedFieldKey: null,
      locationSearch: '',
      structureTypeCode: null,
      structureTypeCodes: null,
      activeKpiCardId: null,
    },
    ctx,
  )
  const zoneIds = new Set<string>()
  const labels = new Set<string>()
  for (const f of scoped) {
    const props = f.properties ?? {}
    const zid = readDevelopEliteStructureZoneId(props)
    if (zid && zid !== '—') zoneIds.add(zid)
    const name = resolveAgroStructuresFieldName(props) || readProp(props, 'Name')
    if (name.trim()) labels.add(name.trim().toLowerCase())
  }
  if (!zoneIds.size && !labels.size) return []
  return zones.filter(
    z => zoneIds.has(z.zoneId) || labels.has(z.label.trim().toLowerCase()),
  )
}

function readZoneDisplayName(props: Record<string, unknown>): string {
  return readProp(props, 'Name') || resolveAgroStructuresFieldName(props)
}

/** Sidebar list: distinct Agri Location `Project_Code` values. */
export function buildAgriLocationProjectCodeListItems(
  features: GeoJSON.Feature[],
): DevelopEliteZoneListItem[] {
  const map = new Map<string, DevelopEliteZoneListItem>()
  for (const f of features) {
    const props = (f.properties ?? {}) as Record<string, unknown>
    const code = readDevelopEliteAgriLocationProjectCode(props)
    if (!code) continue
    const key = code.toLowerCase()
    const hit = map.get(key)
    if (hit) {
      hit.count += 1
      continue
    }
    map.set(key, { zoneId: code, label: code, count: 1 })
  }
  return [...map.values()].sort((a, b) => compareDevelopEliteListNames(a.label, b.label))
}

export function filterProjectCodeListForCountry(
  items: DevelopEliteZoneListItem[],
  agriFeatures: GeoJSON.Feature[],
  countryCode: string,
  ctx?: DevelopEliteFilterContext,
): DevelopEliteZoneListItem[] {
  const country = countryCode?.trim()
  if (!country || country === 'all') return items
  const codes = new Set<string>()
  for (const f of agriFeatures) {
    const props = (f.properties ?? {}) as Record<string, unknown>
    if (
      !structureFeatureMatchesCountryFilter(props, country, {
        countryLabels: ctx?.countryLabels,
        worldCountryDomain: ctx?.worldCountryDomain,
      })
    ) {
      continue
    }
    const code = readDevelopEliteAgriLocationProjectCode(props)
    if (code) codes.add(code.toLowerCase())
  }
  if (!codes.size) return []
  return items.filter(z => codes.has(z.zoneId.toLowerCase()))
}

export function buildZoneListItems(features: DevelopEliteStructureFeature[]): DevelopEliteZoneListItem[] {
  const map = new Map<string, DevelopEliteZoneListItem>()
  for (const f of features) {
    const props = f.properties ?? {}
    const zoneId = readDevelopEliteStructureZoneId(props)
    const name = readZoneDisplayName(props)
    const label = name || zoneId
    if (!label || label === '—') continue
    const key = name ? `name:${name.trim().toLowerCase()}` : `id:${zoneId.toLowerCase()}`
    const hit = map.get(key)
    if (hit) {
      hit.count += 1
      if (zoneId && (hit.zoneId === hit.label || !hit.zoneId)) hit.zoneId = zoneId
      continue
    }
    map.set(key, { zoneId: zoneId || label, label, count: 1 })
  }
  return [...map.values()].sort((a, b) => compareDevelopEliteListNames(a.label, b.label))
}

export type DevelopEliteMapView = {
  zoom: number
  west: number
  south: number
  east: number
  north: number
}

function visitGeometryCoordinates(
  geometry: GeoJSON.Geometry,
  visit: (lng: number, lat: number) => void,
): void {
  if (geometry.type === 'GeometryCollection') {
    for (const child of geometry.geometries) visitGeometryCoordinates(child, visit)
    return
  }
  const walk = (node: unknown): void => {
    if (!Array.isArray(node) || node.length === 0) return
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      visit(node[0] as number, node[1] as number)
      return
    }
    for (const child of node) walk(child)
  }
  walk((geometry as GeoJSON.Geometry & { coordinates?: unknown }).coordinates)
}

export type DevelopEliteZoneGeometryLookup = {
  geometryForItem: (item: DevelopEliteZoneListItem) => GeoJSON.Geometry | null | undefined
}

/** Resolve zone polygon/point geometry for list items (zones layer preferred). */
export function buildDevelopEliteZoneGeometryLookup(
  features: DevelopEliteStructureFeature[],
): DevelopEliteZoneGeometryLookup {
  const byId = new Map<string, GeoJSON.Geometry>()
  const byLabel = new Map<string, GeoJSON.Geometry>()
  for (const f of features) {
    const geometry = f.geometry
    if (!geometry) continue
    const props = f.properties ?? {}
    const zoneId = readDevelopEliteStructureZoneId(props)
    const name = readZoneDisplayName(props)
    const projectCode = readDevelopEliteAgriLocationProjectCode(props)
    if (zoneId && zoneId !== '—') byId.set(zoneId.toLowerCase(), geometry)
    if (name?.trim()) byLabel.set(name.trim().toLowerCase(), geometry)
    if (projectCode?.trim()) byId.set(projectCode.trim().toLowerCase(), geometry)
  }
  return {
    geometryForItem(item) {
      const idKey = item.zoneId?.trim().toLowerCase()
      const labelKey = item.label?.trim().toLowerCase()
      if (idKey && byId.has(idKey)) return byId.get(idKey)
      if (labelKey && byLabel.has(labelKey)) return byLabel.get(labelKey)
      if (labelKey && byId.has(labelKey)) return byId.get(labelKey)
      return null
    },
  }
}

export function developEliteZoneListItemInMapView(
  item: DevelopEliteZoneListItem,
  lookup: DevelopEliteZoneGeometryLookup,
  view: DevelopEliteMapView | null | undefined,
): boolean {
  if (!view) return false
  return geometryOverlapsMapView(lookup.geometryForItem(item), view)
}

/** All zones stay visible; items overlapping the map view sort to the top. */
export function sortDevelopEliteZoneListByMapView<T extends DevelopEliteZoneListItem>(
  items: readonly T[],
  view: DevelopEliteMapView | null | undefined,
  features: DevelopEliteStructureFeature[],
  tieBreak: (a: T, b: T) => number,
): T[] {
  const copy = [...items]
  if (!view || !features.length) return copy.sort(tieBreak)
  const lookup = buildDevelopEliteZoneGeometryLookup(features)
  return copy.sort((a, b) => {
    const aIn = developEliteZoneListItemInMapView(a, lookup, view)
    const bIn = developEliteZoneListItemInMapView(b, lookup, view)
    if (aIn !== bIn) return aIn ? -1 : 1
    return tieBreak(a, b)
  })
}

/** True when a feature's extent overlaps the current map view (zoom-to-layer). */
export function geometryOverlapsMapView(
  geometry: GeoJSON.Geometry | null | undefined,
  view: DevelopEliteMapView,
): boolean {
  if (!geometry) return false
  let hit = false
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  visitGeometryCoordinates(geometry, (lng, lat) => {
    if (lng < minLng) minLng = lng
    if (lat < minLat) minLat = lat
    if (lng > maxLng) maxLng = lng
    if (lat > maxLat) maxLat = lat
    if (lng >= view.west && lng <= view.east && lat >= view.south && lat <= view.north) hit = true
  })
  if (hit) return true
  if (!Number.isFinite(minLng)) return false
  return !(maxLng < view.west || minLng > view.east || maxLat < view.south || minLat > view.north)
}

/** Clip charts/KPIs to the map extent only when zoomed to field/portfolio detail (not world overview). */
/** Regional map pan/zoom links KPIs to the visible extent (portfolio globe stays unscoped below this). */
export const DEVELOP_ELITE_VIEWPORT_KPI_MIN_ZOOM = 5

export function developEliteShouldScopeKpisToMapView(
  view: DevelopEliteMapView | null | undefined,
): boolean {
  return view != null && Number.isFinite(view.zoom) && view.zoom >= DEVELOP_ELITE_VIEWPORT_KPI_MIN_ZOOM
}

/** Sum Area_Ha / geometry for all Agro Structures in scope (all Structure_Type subtypes). */
export function computeDevelopEliteStructuresTotalAreaHa(
  features: DevelopEliteStructureFeature[],
): number {
  let total = 0
  for (const f of features) {
    total += resolveAgroStructuresFeatureAreaHa(f.properties ?? {}, f.geometry)
  }
  return total
}

export function filterStructureFeaturesByMapView(
  features: DevelopEliteStructureFeature[],
  view: DevelopEliteMapView | null | undefined,
): DevelopEliteStructureFeature[] {
  if (!developEliteShouldScopeKpisToMapView(view)) return features
  return features.filter(f => geometryOverlapsMapView(f.geometry, view!))
}

export function filterGeoJsonFeaturesByMapView<T extends GeoJSON.Feature>(
  features: readonly T[],
  view: DevelopEliteMapView | null | undefined,
): T[] {
  if (!developEliteShouldScopeKpisToMapView(view)) return [...features]
  return features.filter(f => geometryOverlapsMapView(f.geometry, view!))
}

export function computeDevelopEliteZoneLayerTotalAreaHaInMapView(
  zoneLayer: GeoJSON.FeatureCollection | null | undefined,
  view: DevelopEliteMapView | null | undefined,
): number {
  if (!developEliteShouldScopeKpisToMapView(view)) return 0
  if (!zoneLayer?.features?.length) return 0
  let total = 0
  for (const raw of zoneLayer.features) {
    if (raw?.type !== 'Feature') continue
    if (!geometryOverlapsMapView(raw.geometry, view!)) continue
    total += resolveAgroStructuresFeatureAreaHa(raw.properties ?? {}, raw.geometry)
  }
  return total
}

export function buildCountryListItems(
  features: DevelopEliteStructureFeature[],
  ctx?: DevelopEliteListContext,
): DevelopEliteCountryListItem[] {
  const map = new Map<string, { label: string; count: number }>()
  for (const f of features) {
    const props = f.properties ?? {}
    const code = resolveAgroStructuresCountryCode(props)
    if (!code || code === 'Unknown') continue
    const label = resolveAgroStructuresCountryDisplayName(props, ctx?.countryLabels)
    const hit = map.get(code) ?? { label, count: 0 }
    hit.count += 1
    if (label && label !== 'Unknown') hit.label = label
    map.set(code, hit)
  }
  return [...map.entries()]
    .map(([code, v]) => ({
      code,
      label: resolveAgroStructuresCountryLabel(code, ctx?.countryLabels) || v.label,
      count: v.count,
    }))
    .sort((a, b) => comparePortfolioCountryListLabels(a.label, b.label))
}

export function resolveDevelopEliteCountryFilterLabel(
  countryCode: string,
  countryList: DevelopEliteCountryListItem[],
  countryLabels?: Map<string, string> | null,
): string {
  if (!countryCode || countryCode === 'all') return 'All countries'
  const hit = countryList.find(c => c.code === countryCode)
  if (hit?.label) return hit.label
  return resolveAgroStructuresCountryLabel(countryCode, countryLabels)
}

export function computeSideStructureCounts(features: DevelopEliteStructureFeature[]): DevelopEliteSideStructureCounts {
  const counts = { glasshouse: 0, nethouse: 0, greenhouse: 0 }
  for (const f of features) {
    const code = structureTypeCode(f.properties ?? {})
    if (code === SIDE_TYPE_CODES.glasshouse) counts.glasshouse += 1
    if (code === SIDE_TYPE_CODES.nethouse) counts.nethouse += 1
    if (code === SIDE_TYPE_CODES.greenhouse) counts.greenhouse += 1
  }
  return counts
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(Math.round(n))
}

function formatNumber(n: number, format?: DevelopEliteKpiCardConfig['format']): string {
  if (!Number.isFinite(n)) return '—'
  if (format === 'compact') return formatCompact(n)
  if (format === 'area') return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
  return String(Math.round(n))
}

function uniqueValueCodesForLegendLabel(
  drawingInfo: Record<string, unknown> | null | undefined,
  labelMatch: string,
): Set<string> {
  const ren = (drawingInfo as { renderer?: { type?: string } } | null)?.renderer
  if (!ren || String(ren.type || '') !== 'uniqueValue') return new Set()
  const target = labelMatch.trim().toLowerCase()
  if (!target) return new Set()
  const codes = new Set<string>()
  for (const uvi of flattenArcgisUniqueValueInfos(ren)) {
    const lab = String(uvi?.label ?? '').trim().toLowerCase()
    if (lab === target || lab.includes(target)) {
      codes.add(normalizeUniqueValueKey(uvi?.value))
    }
  }
  return codes
}

function agriLocationCategoryField(
  drawingInfo: Record<string, unknown> | null | undefined,
  preferredField?: string,
): string {
  const pref = String(preferredField || '').trim()
  if (pref) return pref
  const ren = (drawingInfo as { renderer?: Record<string, unknown> } | null)?.renderer
  if (ren && String(ren.type || '') === 'uniqueValue') {
    const fromRen = pickRendererPrimaryField(ren)
    if (fromRen) return fromRen
  }
  return 'Subtype'
}

const DEVELOP_ELITE_AGRI_LOCATION_SUBTYPE_BY_LABEL: Record<string, string[]> = {
  'wildlife project': ['1003'],
  'vip farm': ['1002'],
  'agri location': ['1001'],
}

function agriFeatureMatchesCategory(
  props: Record<string, unknown>,
  fieldName: string,
  match: string,
  mode: DevelopEliteKpiCardConfig['fieldMatchMode'],
  drawingInfo: Record<string, unknown> | null | undefined,
): boolean {
  if (!match.trim()) return false
  const field = agriLocationCategoryField(drawingInfo, fieldName)
  if (matchFieldFilter(props, field, match, mode ?? 'equals')) return true
  const codes = uniqueValueCodesForLegendLabel(drawingInfo, match)
  if (codes.size) {
    const raw = readProp(props, field) || readProp(props, 'Subtype') || readProp(props, 'subtype')
    if (codes.has(normalizeUniqueValueKey(raw))) return true
  }
  const subtypeFallback = DEVELOP_ELITE_AGRI_LOCATION_SUBTYPE_BY_LABEL[match.trim().toLowerCase()]
  if (subtypeFallback?.length) {
    const sub = normalizeUniqueValueKey(
      readProp(props, field) || readProp(props, 'Subtype') || readProp(props, 'subtype'),
    )
    if (subtypeFallback.includes(sub)) return true
  }
  if (matchFieldFilter(props, 'Project', match, mode ?? 'equals')) return true
  if (matchFieldFilter(props, 'Name', match, mode ?? 'equals')) return true
  return false
}

function evalKpiCard(
  card: DevelopEliteKpiCardConfig,
  features: DevelopEliteStructureFeature[],
  cropRows: ArcGisTableRow[],
  config: DevelopEliteDashboardConfig,
  scopedTreeCount: number,
  agriLocationFeatures: GeoJSON.Feature[],
  agriLocationDrawingInfo: Record<string, unknown> | null | undefined,
  filters: DevelopEliteFilters,
  agriScopeStructures: DevelopEliteStructureFeature[],
  agriKpiFilters: DevelopEliteFilters,
  filterContext?: DevelopEliteFilterContext,
): string {
  const propsList = features.map(f => f.properties ?? {})
  switch (card.source) {
    case 'totalAreaHa': {
      let sum = 0
      for (const f of features) {
        sum += resolveAgroStructuresFeatureAreaHa(f.properties ?? {}, f.geometry)
      }
      return formatNumber(sum, card.format ?? 'area')
    }
    case 'structureTypeCount': {
      const codes = new Set(card.structureTypeCodes ?? [])
      const n = propsList.filter(p => {
        const c = structureTypeCode(p)
        return c != null && codes.has(c)
      }).length
      return formatNumber(n, card.format)
    }
    case 'structureTypeGroupCount': {
      const codes = new Set(card.structureTypeCodes ?? [])
      const n = propsList.filter(p => {
        const c = structureTypeCode(p)
        return c != null && codes.has(c)
      }).length
      return formatNumber(n, card.format)
    }
    case 'fieldFilterCount': {
      const field = card.fieldName || 'ProjectCode'
      const match = card.fieldMatch ?? ''
      const n = propsList.filter(p => matchFieldFilter(p, field, match, card.fieldMatchMode ?? 'contains')).length
      return formatNumber(n, card.format)
    }
    case 'agriLocationFilterCount': {
      let match = card.fieldMatch ?? ''
      if (card.id === 'wildfelid' && config.wildfelidProjectMatch) {
        match = config.wildfelidProjectMatch
      }
      const n = countScopedAgriLocationFeatures(
        agriLocationFeatures,
        agriScopeStructures,
        agriKpiFilters,
        card.fieldName || 'Subtype',
        match,
        card.fieldMatchMode ?? 'equals',
        agriLocationDrawingInfo,
        filterContext,
      )
      return formatNumber(n, card.format)
    }
    case 'distinctFieldCount': {
      const field = card.distinctField || 'ProjectCode'
      const set = new Set<string>()
      for (const p of propsList) {
        const v = readProp(p, field)
        if (v) set.add(v)
      }
      return formatNumber(set.size, card.format)
    }
    case 'cropFieldSum': {
      const field = card.cropSumField || 'Total_Tree'
      let sum = 0
      for (const row of cropRows) {
        const v = Number(row[field])
        if (Number.isFinite(v)) sum += v
      }
      return formatNumber(sum, card.format ?? 'compact')
    }
    case 'treesLayerCount':
      return formatNumber(scopedTreeCount, card.format ?? 'compact')
    case 'agriLocationLayerCount':
      return formatNumber(
        countScopedAgriLocationLayer(
          agriLocationFeatures,
          agriScopeStructures,
          agriKpiFilters,
          filterContext,
        ),
        card.format ?? 'number',
      )
    default:
      return '—'
  }
}

function developElitePointLayerNoGeoScope(filters: DevelopEliteFilters): boolean {
  return (
    (!filters.country || filters.country === 'all') &&
    (!filters.zoneId || filters.zoneId === 'all') &&
    !filters.selectedFieldKey &&
    !filters.locationSearch.trim()
  )
}

const AGRI_STRUCTURE_JOIN_FIELDS = [
  'Farm_Code',
  'FARM_CODE',
  'ProjectCode',
  'Project_Code',
  'PROJECT_CODE',
] as const

function developElitePointJoinKeys(props: Record<string, unknown>): Set<string> {
  const keys = new Set<string>()
  for (const field of AGRI_STRUCTURE_JOIN_FIELDS) {
    const v = readProp(props, field)
    if (v) keys.add(normalizeDevelopEliteJoinKey(v))
  }
  return keys
}

function developElitePointJoinsScopedStructure(
  props: Record<string, unknown>,
  scopedStructures: DevelopEliteStructureFeature[],
): boolean {
  const keys = developElitePointJoinKeys(props)
  if (!keys.size) return false
  for (const f of scopedStructures) {
    const sp = f.properties ?? {}
    for (const field of AGRI_STRUCTURE_JOIN_FIELDS) {
      const v = readProp(sp, field)
      if (v && keys.has(normalizeDevelopEliteJoinKey(v))) return true
    }
  }
  return false
}

/** Country / zone / structure join scope for Agri_Location & tree points (map view applied separately). */
export function developElitePointFeatureMatchesDashboardGeoScope(
  props: Record<string, unknown>,
  scopedStructures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): boolean {
  if (developElitePointLayerNoGeoScope(filters)) return true

  const country = filters.country?.trim()
  const zone = filters.zoneId?.trim()
  const countryCtx = {
    countryLabels: ctx?.countryLabels,
    worldCountryDomain: ctx?.worldCountryDomain,
  }

  if (country && country !== 'all') {
    if (structureFeatureMatchesCountryFilter(props, country, countryCtx)) return true
  }
  if (zone && zone !== 'all') {
    if (structureMatchesZoneFilter(props, zone, ctx)) return true
  }

  const zoneIds = developEliteZoneIdsFromStructures(scopedStructures)
  const pointZone = (
    readDevelopEliteStructureZoneId(props) ||
    readProp(props, 'ZONE_ID') ||
    readProp(props, 'ZONEID')
  ).toLowerCase()
  if (pointZone && zoneIds.has(pointZone)) return true

  if (developElitePointJoinsScopedStructure(props, scopedStructures)) return true

  if (country && country !== 'all') return false
  if (zone && zone !== 'all') return false
  return zoneIds.size === 0
}

export function developEliteZoneIdsFromStructures(
  scopedStructures: DevelopEliteStructureFeature[],
): Set<string> {
  const zoneIds = new Set<string>()
  for (const f of scopedStructures) {
    const props = f.properties ?? {}
    const z =
      readDevelopEliteStructureZoneId(props) || readProp(props, 'ZONE_ID') || readProp(props, 'ZONEID')
    if (z && z !== '—') zoneIds.add(z.toLowerCase())
  }
  return zoneIds
}

/** Map + KPI: tree points scoped by country/zone (structure-derived ZONE_ID set). */
export function filterScopedTreeFeatures(
  treeFeatures: GeoJSON.Feature[],
  scopedStructures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): GeoJSON.Feature[] {
  if (!treeFeatures.length) return []
  if (developElitePointLayerNoGeoScope(filters)) return treeFeatures

  return treeFeatures.filter(t =>
    developElitePointFeatureMatchesDashboardGeoScope(t.properties ?? {}, scopedStructures, filters, ctx),
  )
}

/** Count tree points from FeatureServer /24, scoped by dashboard country/zone/field filters. */
export function countScopedTreeFeatures(
  treeFeatures: GeoJSON.Feature[],
  scopedStructures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): number {
  return filterScopedTreeFeatures(treeFeatures, scopedStructures, filters, ctx).length
}

/** Map + KPI: every Agri_Location point scoped by country/zone. */
export function filterScopedAgriLocationLayerFeatures(
  agriFeatures: GeoJSON.Feature[],
  scopedStructures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): GeoJSON.Feature[] {
  if (!agriFeatures.length) return []
  if (developElitePointLayerNoGeoScope(filters)) return agriFeatures

  return agriFeatures.filter(feature =>
    developElitePointFeatureMatchesDashboardGeoScope(
      feature.properties ?? {},
      scopedStructures,
      filters,
      ctx,
    ),
  )
}

/** Every Agri_Location feature, scoped by the same country / zone filter as the map. */
export function countScopedAgriLocationLayer(
  agriFeatures: GeoJSON.Feature[],
  scopedStructures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  ctx?: DevelopEliteFilterContext,
): number {
  return filterScopedAgriLocationLayerFeatures(agriFeatures, scopedStructures, filters, ctx).length
}

/** Agri_Location features (e.g. Wildlife Project), scoped like the tree KPI. */
export function filterScopedAgriLocationFeatures(
  agriFeatures: GeoJSON.Feature[],
  scopedStructures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  fieldName: string,
  match: string,
  mode: DevelopEliteKpiCardConfig['fieldMatchMode'],
  drawingInfo: Record<string, unknown> | null | undefined,
  ctx?: DevelopEliteFilterContext,
): GeoJSON.Feature[] {
  if (!agriFeatures.length || !match.trim()) return []

  const out: GeoJSON.Feature[] = []
  for (const feature of agriFeatures) {
    const props = feature.properties ?? {}
    if (!agriFeatureMatchesCategory(props, fieldName, match, mode, drawingInfo)) continue
    if (
      !developElitePointFeatureMatchesDashboardGeoScope(props, scopedStructures, filters, ctx)
    ) {
      continue
    }
    out.push(feature)
  }
  return out
}

export function countScopedAgriLocationFeatures(
  agriFeatures: GeoJSON.Feature[],
  scopedStructures: DevelopEliteStructureFeature[],
  filters: DevelopEliteFilters,
  fieldName: string,
  match: string,
  mode: DevelopEliteKpiCardConfig['fieldMatchMode'],
  drawingInfo: Record<string, unknown> | null | undefined,
  ctx?: DevelopEliteFilterContext,
): number {
  return filterScopedAgriLocationFeatures(
    agriFeatures,
    scopedStructures,
    filters,
    fieldName,
    match,
    mode,
    drawingInfo,
    ctx,
  ).length
}

/** Sum of `Area_Ha` (or geometry) for all polygons in the Zones feature layer. */
export function computeDevelopEliteZoneLayerTotalAreaHa(
  zoneLayer: GeoJSON.FeatureCollection | null | undefined,
  view?: DevelopEliteMapView | null,
): number {
  if (developEliteShouldScopeKpisToMapView(view)) {
    return computeDevelopEliteZoneLayerTotalAreaHaInMapView(zoneLayer, view)
  }
  const features = zoneLayer?.features
  if (!features?.length) return 0
  let total = 0
  for (const raw of features) {
    if (raw?.type !== 'Feature') continue
    total += resolveAgroStructuresFeatureAreaHa(raw.properties ?? {}, raw.geometry)
  }
  return total
}

export function developEliteAgriKpiFilters(filters: DevelopEliteFilters): DevelopEliteFilters {
  return {
    country: filters.country,
    zoneId: filters.zoneId,
    selectedFieldKey: null,
    locationSearch: '',
    structureTypeCode: filters.structureTypeCode,
    structureTypeCodes: filters.structureTypeCodes,
    activeKpiCardId: filters.activeKpiCardId,
  }
}

/** Map canvas: no dashboard filters — only per-feature highlight / flash on click. */
export function developEliteMapDisplayFilters(_filters: DevelopEliteFilters): DevelopEliteFilters {
  return {
    country: 'all',
    zoneId: 'all',
    selectedFieldKey: null,
    locationSearch: '',
    structureTypeCode: null,
    structureTypeCodes: null,
    activeKpiCardId: null,
  }
}

export function computeDevelopEliteKpis(
  features: DevelopEliteStructureFeature[],
  cropRows: ArcGisTableRow[],
  config: DevelopEliteDashboardConfig,
  scopedTreeCount = 0,
  agriLocationFeatures: GeoJSON.Feature[] = [],
  agriLocationDrawingInfo: Record<string, unknown> | null | undefined = null,
  filters: DevelopEliteFilters = {
    country: 'all',
    zoneId: 'all',
    selectedFieldKey: null,
    locationSearch: '',
    structureTypeCode: null,
    structureTypeCodes: null,
    activeKpiCardId: null,
  },
  agriScopeStructures: DevelopEliteStructureFeature[] = features,
  agriKpiFilters: DevelopEliteFilters = developEliteAgriKpiFilters(filters),
  filterContext?: DevelopEliteFilterContext,
): DevelopEliteKpiValues {
  const heroTotalAreaHa = computeDevelopEliteStructuresTotalAreaHa(features)
  const cards: Record<string, string> = {}
  for (const card of config.kpiCards.filter(c => c.visible)) {
    cards[card.id] = evalKpiCard(
      card,
      features,
      cropRows,
      config,
      scopedTreeCount,
      agriLocationFeatures,
      agriLocationDrawingInfo,
      filters,
      agriScopeStructures,
      agriKpiFilters,
      filterContext,
    )
  }
  return { heroTotalAreaHa, heroZoneLayerTotalAreaHa: 0, cards }
}

export function structureTypeCatalogLabels(): typeof AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG {
  return AGRO_STRUCTURES_STRUCTURE_TYPE_CATALOG
}
