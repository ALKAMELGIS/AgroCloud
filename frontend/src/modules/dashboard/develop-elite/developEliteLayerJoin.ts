import type { DevelopEliteStructureFeature } from './developEliteKpiEngine'
import { readArcGisField } from './developEliteChartAggregate'
import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'

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
