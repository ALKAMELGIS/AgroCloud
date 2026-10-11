import type { Map as MapboxMap } from 'mapbox-gl'

export function setMapboxSymbolLayersVisible(map: MapboxMap, visible: boolean): void {
  const style = map.getStyle()
  if (!style?.layers) return
  for (const layer of style.layers) {
    if (layer.type === 'symbol') {
      try {
        map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
      } catch {
        /* layer may not exist after style swap */
      }
    }
  }
}

export function setMapboxFillExtrusionLayersVisible(map: MapboxMap, visible: boolean): void {
  const style = map.getStyle()
  if (!style?.layers) return
  for (const layer of style.layers) {
    if (layer.type === 'fill-extrusion') {
      try {
        map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none')
      } catch {
        /* ignore */
      }
    }
  }
}
