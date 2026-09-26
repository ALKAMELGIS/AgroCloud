import { geodesicAreaM2 } from '../siLayerClassAreaEngine'
import type { BuildDemOptions } from '../hydroWatershed/terrainTiles'

/** Terrarium tile budget scaled to AOI size — keeps cut/fill responsive on large fields. */
export function resolveCutFillDemBuildOptions(
  geometry: GeoJSON.Geometry | GeoJSON.Feature,
): Pick<BuildDemOptions, 'maxTiles' | 'maxZoom' | 'minZoom'> {
  const ha = geodesicAreaM2(geometry) / 10_000
  if (ha <= 25) return { maxTiles: 16, maxZoom: 14, minZoom: 10 }
  if (ha <= 150) return { maxTiles: 12, maxZoom: 14, minZoom: 10 }
  if (ha <= 800) return { maxTiles: 9, maxZoom: 13, minZoom: 10 }
  if (ha <= 3500) return { maxTiles: 6, maxZoom: 12, minZoom: 9 }
  return { maxTiles: 4, maxZoom: 11, minZoom: 9 }
}
