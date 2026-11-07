import { computeStableGisFeatureKey } from '@/modules/gis/layers/gisFeatureStableKey'

export type DevelopEliteStructureFeatureMeta = {
  key: string
}

/** O(n) index for structure styling and clicks — avoids `features.indexOf` per redraw. */
export function buildDevelopEliteStructureFeatureMeta(
  geojson: GeoJSON.FeatureCollection,
): WeakMap<GeoJSON.Feature, DevelopEliteStructureFeatureMeta> {
  const byFeature = new WeakMap<GeoJSON.Feature, DevelopEliteStructureFeatureMeta>()
  geojson.features.forEach((feature, index) => {
    byFeature.set(feature, { key: computeStableGisFeatureKey(feature, index) })
  })
  return byFeature
}
