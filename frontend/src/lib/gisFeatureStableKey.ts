/** Matches GIS Map {@link featureByKeyByLayerRef} indexing — stable keys for attribute ↔ map linking. */

export function computeStableGisFeatureKey(feature: unknown, featureIdx: number): string {
  const ft = feature as { id?: unknown; properties?: Record<string, unknown> } | null
  if (!ft || typeof ft !== 'object') return `idx:${featureIdx}`
  const direct = ft.id
  if (direct !== null && direct !== undefined && direct !== '') return String(direct)
  const props = ft.properties
  if (props && typeof props === 'object') {
    const candidates = ['OBJECTID', 'ObjectId', 'objectid', 'FID', 'fid', 'Id', 'ID', 'id']
    for (const k of candidates) {
      const v = (props as Record<string, unknown>)[k]
      if (v !== null && v !== undefined && v !== '') return `${k}:${String(v)}`
    }
  }
  return `idx:${featureIdx}`
}
