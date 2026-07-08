import type { GisSelectableLayer } from '../../../../lib/gisSelection/types'
import './gisSelection.css'

export type GisSelectionLayerListProps = {
  layers: GisSelectableLayer[]
  onToggleLayer: (layerId: string, selectable: boolean) => void
}

export function GisSelectionLayerList({ layers, onToggleLayer }: GisSelectionLayerListProps) {
  if (!layers.length) {
    return <p className="gis-sel-results__layers-empty">No selectable layers on the map.</p>
  }

  return (
    <div className="gis-sel-results__layers">
      <p className="gis-sel-results__layers-title">Selectable layers</p>
      <ul className="gis-sel-layers__list">
        {layers.map(layer => (
          <li key={layer.id}>
            <label>
              <input
                type="checkbox"
                checked={layer.selectable}
                onChange={e => onToggleLayer(layer.id, e.target.checked)}
              />
              <span className="gis-sel-layers__name">{layer.name}</span>
              <span className="gis-sel-layers__count">
                {layer.selectedCount}/{layer.featureCount}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
