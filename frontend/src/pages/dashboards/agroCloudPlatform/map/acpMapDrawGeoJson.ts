import { resolveAgroStructuresCountry } from '../../../../lib/agroStructuresPrimaryAoi'

function featureKey(f: GeoJSON.Feature, index: number): string {
  const props = (f.properties ?? {}) as Record<string, unknown>
  return String(props.OBJECTID ?? props.objectid ?? props.__acpFieldKey ?? index)
}

/** Merge dataMask + map outline so Farm Plots / PIVOT / greenhouse outlines always draw. */
export function resolveAcpMapDrawGeoJson(
  aoiMask: GeoJSON.FeatureCollection | null,
  structureMapOutline: GeoJSON.FeatureCollection | null,
  countryFilter = 'all',
): GeoJSON.FeatureCollection | null {
  const pools: GeoJSON.Feature[] = []
  if (aoiMask?.features?.length) {
    pools.push(...(aoiMask.features as GeoJSON.Feature[]))
  }
  if (structureMapOutline?.features?.length) {
    pools.push(...(structureMapOutline.features as GeoJSON.Feature[]))
  }
  if (!pools.length) return null

  const seen = new Set<string>()
  let features: GeoJSON.Feature[] = []
  for (let i = 0; i < pools.length; i++) {
    const f = pools[i]!
    const key = featureKey(f, i)
    if (seen.has(key)) continue
    seen.add(key)
    features.push(f)
  }

  if (countryFilter && countryFilter !== 'all') {
    features = features.filter(
      f => resolveAgroStructuresCountry((f.properties ?? {}) as Record<string, unknown>) === countryFilter,
    )
  }

  if (!features.length) return null
  return { type: 'FeatureCollection', features }
}

export const ACP_AOI_FILL_OPACITY_EXPRESSION = [
  'match',
  ['get', '__acpOutlineRole'],
  'greenhouse',
  0,
  0.08,
] as const

export const ACP_AOI_FILL_SUPPRESSED_OPACITY_EXPRESSION = [
  'match',
  ['get', '__acpOutlineRole'],
  'greenhouse',
  0,
  0,
] as const
