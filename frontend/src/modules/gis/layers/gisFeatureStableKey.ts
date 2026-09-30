/** Stable keys for attribute table ↔ map canvas linking (never use row index when an ID exists). */

export const GIS_FEATURE_ID_PROPERTY_KEYS = [
  'OBJECT_ID',
  'OBJECTID',
  'ObjectId',
  'objectid',
  'Feature_ID',
  'feature_id',
  'object_id',
  'objectId',
  'FID',
  'fid',
  'Id',
  'ID',
  'id',
] as const

const EMPTY_ID_TOKENS = new Set(['none', 'null', 'undefined', ''])

function isUsableIdValue(value: unknown): value is string | number {
  if (value === null || value === undefined) return false
  const s = String(value).trim()
  return s.length > 0 && !EMPTY_ID_TOKENS.has(s.toLowerCase())
}

/** Extract OBJECT_ID / Feature_ID / OBJECTID from feature properties. */
export function gisFeatureIdFromProperties(
  props: Record<string, unknown> | null | undefined,
): { key: string; field: string; value: string } | null {
  if (!props || typeof props !== 'object') return null
  for (const k of GIS_FEATURE_ID_PROPERTY_KEYS) {
    const v = props[k]
    if (!isUsableIdValue(v)) continue
    const value = String(v).trim()
    return { key: `${k}:${value}`, field: k, value }
  }
  return null
}

/** Matches GIS Map {@link featureByKeyByLayerRef} indexing — stable keys for attribute ↔ map linking. */
export function computeStableGisFeatureKey(feature: unknown, featureIdx: number): string {
  const ft = feature as { id?: unknown; properties?: Record<string, unknown> } | null
  if (!ft || typeof ft !== 'object') return `idx:${featureIdx}`
  const direct = ft.id
  if (isUsableIdValue(direct)) return String(direct).trim()
  const fromProps = gisFeatureIdFromProperties(ft.properties)
  if (fromProps) return fromProps.key
  return `idx:${featureIdx}`
}

/** Find a feature in a layer collection by stable key (Object ID / Feature ID). */
export function findFeatureIndexByStableKey(features: unknown[], featureKey: string): number {
  for (let i = 0; i < features.length; i++) {
    if (computeStableGisFeatureKey(features[i], i) === featureKey) return i
  }
  return -1
}
