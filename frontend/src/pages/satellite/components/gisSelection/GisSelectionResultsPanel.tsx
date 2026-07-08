import type { GisSelectableLayer, GisSelectionStats } from '../../../../lib/gisSelection/types'
import { GisSelectionLayerList } from './GisSelectionLayerList'
import './gisSelection.css'

export type GisSelectionResultsPanelProps = {
  open: boolean
  stats: GisSelectionStats
  layers: GisSelectableLayer[]
  onToggleLayer: (layerId: string, selectable: boolean) => void
  onZoom: () => void
  onClear: () => void
  onExport: () => void
  onSelectByAttributes?: () => void
  onSelectByLocation?: () => void
  onClose: () => void
}

export function GisSelectionResultsPanel({
  open,
  stats,
  layers,
  onToggleLayer,
  onZoom,
  onClear,
  onExport,
  onSelectByAttributes,
  onSelectByLocation,
  onClose,
}: GisSelectionResultsPanelProps) {
  if (!open) return null

  return (
    <aside className="gis-sel-results" role="complementary" aria-label="Selection results" dir="ltr">
      <header className="gis-sel-results__head">
        <span>
          <i className="fa-solid fa-list-check" aria-hidden /> Selection
        </span>
        <button type="button" className="gis-sel-results__close" aria-label="Close" onClick={onClose}>
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="gis-sel-results__body">
        <div className="gis-sel-results__metrics">
          <div>
            <strong>{stats.featureCount}</strong>
            <span>Features</span>
          </div>
          {stats.areaHa != null ? (
            <div>
              <strong>{stats.areaHa.toFixed(2)}</strong>
              <span>Area (ha)</span>
            </div>
          ) : null}
          {stats.lengthKm != null && stats.lengthKm > 0 ? (
            <div>
              <strong>{stats.lengthKm.toFixed(2)}</strong>
              <span>Length (km)</span>
            </div>
          ) : null}
        </div>

        <GisSelectionLayerList layers={layers} onToggleLayer={onToggleLayer} />

        {stats.numericSummaries.length ? (
          <div className="gis-sel-results__stats">
            <p className="gis-sel-results__stats-title">Field statistics</p>
            <ul>
              {stats.numericSummaries.map(row => (
                <li key={row.field}>
                  <span className="gis-sel-results__field">{row.field}</span>
                  <span>
                    min {row.min.toFixed(2)} · max {row.max.toFixed(2)} · avg {row.avg.toFixed(2)} · Σ{' '}
                    {row.sum.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="gis-sel-results__actions">
          <button type="button" onClick={onZoom} disabled={!stats.featureCount}>
            <i className="fa-solid fa-expand" aria-hidden /> Zoom
          </button>
          <button type="button" onClick={onExport} disabled={!stats.featureCount}>
            <i className="fa-solid fa-file-export" aria-hidden /> Export
          </button>
          {onSelectByAttributes ? (
            <button type="button" onClick={onSelectByAttributes}>
              <i className="fa-solid fa-table-columns" aria-hidden /> Query attrs
            </button>
          ) : null}
          {onSelectByLocation ? (
            <button type="button" onClick={onSelectByLocation}>
              <i className="fa-solid fa-layer-group" aria-hidden /> Query location
            </button>
          ) : null}
          <button type="button" onClick={onClear} disabled={!stats.featureCount}>
            <i className="fa-solid fa-eraser" aria-hidden /> Clear
          </button>
        </div>
      </div>
    </aside>
  )
}
