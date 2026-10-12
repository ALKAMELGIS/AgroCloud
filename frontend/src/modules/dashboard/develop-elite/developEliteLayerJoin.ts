import type { DevelopEliteStructureFeature } from './developEliteKpiEngine'
import { readArcGisField } from './developEliteChartAggregate'
import {
  computeStableGisFeatureKey,
  findFeatureIndexByStableKey,
} from '@/modules/gis/layers/gisFeatureStableKey'

export type DevelopEliteTableRowMapFlyTarget =
  | { kind: 'structure'; fieldKey: string }
  | { kind: 'agri'; feature: GeoJSON.Feature }

/** Normalize Farm_Code (and similar keys) for structure ↔ crops table joins. */
export function normalizeDevelopEliteJoinKey(value: string): string {
  return value.trim().toUpperCase()
}

export function normalizeDevelopEliteFarmNameKey(value: string): string {
  return value.trim().toLowerCase()
}

/** Map join code (e.g. Farm_Code) → stable map feature key for layer 0 polygons. */
export function buildDevelopEliteStructureFieldKeyByJoinCode(
  features: DevelopEliteStructureFeature[],
  joinField: string,
): Map<string, string> {
  const map = new Map<string, string>()
  const field = joinField.trim() || 'Farm_Code'
  for (let i = 0; i < features.length; i++) {
    const f = features[i]!
    const raw = readArcGisField(f.properties ?? {}, field)
    const code = raw != null && raw !== '' ? normalizeDevelopEliteJoinKey(String(raw)) : ''
    if (code && !map.has(code)) map.set(code, computeStableGisFeatureKey(f, i))
  }
  return map
}

/** Fallback when join codes differ between crops table and structures layer. */
/** Resolve map feature key for a crops-table row (Farm_Code → structures layer). */
export function findDevelopEliteStructureFieldKey(
  features: DevelopEliteStructureFeature[],
  joinField: string,
  joinValue: string,
  farmName?: string,
): string | null {
  const field = joinField.trim() || 'Farm_Code'
  const code = joinValue.trim() ? normalizeDevelopEliteJoinKey(joinValue) : ''
  if (code) {
    for (let i = 0; i < features.length; i++) {
      const f = features[i]!
      const raw = readArcGisField(f.properties ?? {}, field)
      if (raw == null || raw === '') continue
      if (normalizeDevelopEliteJoinKey(String(raw)) === code) {
        return computeStableGisFeatureKey(f, i)
      }
    }
  }
  const nameKey = farmName?.trim() ? normalizeDevelopEliteFarmNameKey(farmName) : ''
  if (nameKey) {
    for (let i = 0; i < features.length; i++) {
      const f = features[i]!
      const raw = readArcGisField(f.properties ?? {}, 'Farm_Name')
      if (raw == null || raw === '') continue
      if (normalizeDevelopEliteFarmNameKey(String(raw)) === nameKey) {
        return computeStableGisFeatureKey(f, i)
      }
    }
  }
  return null
}

/** Structure polygon fly-to when present; otherwise Agri Location point (crops table double-click). */
export function resolveDevelopEliteTableRowMapFlyTarget(
  structureFeatures: DevelopEliteStructureFeature[],
  agriCollection: GeoJSON.FeatureCollection | null | undefined,
  joinField: string,
  row: Record<string, string>,
): DevelopEliteTableRowMapFlyTarget | null {
  const field = joinField.trim() || 'Farm_Code'
  const farmCode = row.Farm_Code ?? row[field] ?? ''
  const farmName = row.Farm_Name ?? ''
  let fieldKey = row._fieldKey?.trim() ?? ''
  if (!fieldKey) {
    fieldKey = findDevelopEliteStructureFieldKey(structureFeatures, field, farmCode, farmName) ?? ''
  } else if (findFeatureIndexByStableKey(structureFeatures, fieldKey) < 0) {
    const resolved = findDevelopEliteStructureFieldKey(structureFeatures, field, farmCode, farmName)
    if (resolved) fieldKey = resolved
  }
  if (fieldKey && findFeatureIndexByStableKey(structureFeatures, fieldKey) >= 0) {
    return { kind: 'structure', fieldKey }
  }
  const agriHit = findDevelopEliteAgriLocationFeatureByJoin(
    agriCollection,
    field,
    farmCode,
    farmName,
  )
  if (agriHit) return { kind: 'agri', feature: agriHit }
  return null
}

function readPointLngLat(geometry: GeoJSON.Geometry | undefined): [number, number] | null {
  if (!geometry) return null
  if (geometry.type === 'Point' && geometry.coordinates.length >= 2) {
    return [geometry.coordinates[0], geometry.coordinates[1]]
  }
  if (geometry.type === 'MultiPoint' && geometry.coordinates[0]?.length >= 2) {
    const c = geometry.coordinates[0]
    return [c[0], c[1]]
  }
  return null
}

/** Agri Location point for a crops-table row when structure polygon is missing. */
export function findDevelopEliteAgriLocationFeatureByJoin(
  collection: GeoJSON.FeatureCollection | null | undefined,
  joinField: string,
  joinValue: string,
  farmName?: string,
): GeoJSON.Feature | null {
  const features = collection?.features ?? []
  if (!features.length) return null
  const field = joinField.trim() || 'Farm_Code'
  const code = joinValue.trim() ? normalizeDevelopEliteJoinKey(joinValue) : ''
  if (code) {
    for (const f of features) {
      const raw = readArcGisField(f.properties ?? {}, field)
      if (raw == null || raw === '') continue
      if (normalizeDevelopEliteJoinKey(String(raw)) !== code) continue
      if (readPointLngLat(f.geometry)) return f
    }
  }
  const nameKey = farmName?.trim() ? normalizeDevelopEliteFarmNameKey(farmName) : ''
  if (nameKey) {
    for (const f of features) {
      const raw = readArcGisField(f.properties ?? {}, 'Farm_Name')
      if (raw == null || raw === '') continue
      if (normalizeDevelopEliteFarmNameKey(String(raw)) !== nameKey) continue
      if (readPointLngLat(f.geometry)) return f
    }
  }
  return null
}

export function buildDevelopEliteStructureFieldKeyByFarmName(
  features: DevelopEliteStructureFeature[],
): Map<string, string> {
  const map = new Map<string, string>()
  for (let i = 0; i < features.length; i++) {
    const f = features[i]!
    const raw = readArcGisField(f.properties ?? {}, 'Farm_Name')
    const name = raw != null && raw !== '' ? normalizeDevelopEliteFarmNameKey(String(raw)) : ''
    if (name && !map.has(name)) map.set(name, computeStableGisFeatureKey(f, i))
  }
  return map
}
