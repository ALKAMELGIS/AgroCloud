import type { GisSelectableLayer } from '../../../../lib/gisSelection/types'
import { GisSelectionLayerList } from './GisSelectionLayerList'
import './gisSelection.css'

export type GisSelectionLayerPanelProps = {
  open: boolean
  layers: GisSelectableLayer[]
  onToggleLayer: (layerId: string, selectable: boolean) => void
  onClose: () => void
}

/** Standalone layer panel — prefer embedding via GisSelectionResultsPanel. */
export function GisSelectionLayerPanel({ open, layers, onToggleLayer, onClose }: GisSelectionLayerPanelProps) {
  if (!open) return null

  return (
    <aside className="gis-sel-layers" role="complementary" aria-label="Selectable layers" dir="ltr">
      <header className="gis-sel-layers__head">
        <span>Selectable layers</span>
        <button type="button" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>
      <div className="gis-sel-layers__body">
        <GisSelectionLayerList layers={layers} onToggleLayer={onToggleLayer} />
      </div>
    </aside>
  )
}
