import type { Map as MaplibreMap } from 'maplibre-gl'
import { DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS } from './developEliteMapLibreOverlays'
import { DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS } from './developEliteMapLibreStructureFlash'
import { developEliteMapLibreHasLayer } from './developEliteMapLibreStyle'

const DEFAULT_RADIUS_PX = 10

function queryLayerIds(map: MaplibreMap): string[] {
  const ids = [...DE_MAPLIBRE_STRUCTURE_HIGHLIGHT_LAYER_IDS, ...DE_MAPLIBRE_POPUP_QUERY_LAYER_IDS]
  return ids.filter(id => {
    if (!developEliteMapLibreHasLayer(map, id)) return false
    try {
      return map.getLayoutProperty(id, 'visibility') !== 'none'
    } catch {
      return true
    }
  })
}

/** True when a map click should open a feature popup instead of a blank-map tool (e.g. weather intel). */
export function developEliteMapLibreClickHitsPopupFeature(
  map: MaplibreMap,
  point: { x: number; y: number },
  radiusPx = DEFAULT_RADIUS_PX,
): boolean {
  const layers = queryLayerIds(map)
  if (!layers.length) return false
  let hits = map.queryRenderedFeatures([point.x, point.y], { layers })
  if (hits.length) return true
  const r = Math.max(4, radiusPx)
  hits = map.queryRenderedFeatures(
    [
      [point.x - r, point.y - r],
      [point.x + r, point.y + r],
    ],
    { layers },
  )
  return hits.length > 0
}
