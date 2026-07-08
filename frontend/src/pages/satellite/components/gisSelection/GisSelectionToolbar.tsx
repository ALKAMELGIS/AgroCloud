import type { GisSelectionSetMode, GisSelectionTool } from '../../../../lib/gisSelection/types'
import { useMapOverlayIsolation } from '../../useMapOverlayIsolation'
import './gisSelection.css'

export type GisSelectionToolbarProps = {
  active: boolean
  tool: GisSelectionTool
  setMode: GisSelectionSetMode
  onToolChange: (tool: GisSelectionTool) => void
  onSetModeChange: (mode: GisSelectionSetMode) => void
  onOpenAttributes: () => void
  onOpenLocation: () => void
  onClear: () => void
  onDeactivate: () => void
}

const SELECT_TOOLS: Array<{ id: GisSelectionTool; icon: string; label: string }> = [
  { id: 'select', icon: 'fa-solid fa-arrow-pointer', label: 'Select' },
  { id: 'rectangle', icon: 'fa-regular fa-square', label: 'Rectangle' },
  { id: 'polygon', icon: 'fa-solid fa-draw-polygon', label: 'Polygon' },
  { id: 'lasso', icon: 'fa-solid fa-bezier-curve', label: 'Lasso' },
  { id: 'circle', icon: 'fa-regular fa-circle', label: 'Circle' },
  { id: 'line', icon: 'fa-solid fa-minus', label: 'Line' },
  { id: 'trace', icon: 'fa-solid fa-route', label: 'Trace' },
]

const SET_MODES: Array<{ id: GisSelectionSetMode; label: string; hint: string }> = [
  { id: 'new', label: 'New', hint: 'Replace selection' },
  { id: 'add', label: 'Add', hint: 'Shift — add to selection' },
  { id: 'remove', label: 'Remove', hint: 'Ctrl — remove from selection' },
  { id: 'subset', label: 'From current', hint: 'Ctrl+Shift — select from current' },
]

export function GisSelectionToolbar({
  active,
  tool,
  setMode,
  onToolChange,
  onSetModeChange,
  onOpenAttributes,
  onOpenLocation,
  onClear,
  onDeactivate,
}: GisSelectionToolbarProps) {
  const isolation = useMapOverlayIsolation(active)
  if (!active) return null

  return (
    <div {...isolation} className="gis-sel-toolbar" role="toolbar" aria-label="Feature selection tools" dir="ltr">
      <span className="gis-sel-toolbar__brand">
        <i className="fa-solid fa-object-group" aria-hidden />
        <span>Select</span>
      </span>

      <span className="gis-sel-toolbar__sep" aria-hidden />

      <div className="gis-sel-toolbar__group">
        {SELECT_TOOLS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`gis-sel-toolbar__btn${tool === t.id ? ' is-on' : ''}`}
            title={t.label}
            aria-label={t.label}
            aria-pressed={tool === t.id}
            onClick={() => onToolChange(t.id)}
          >
            <i className={t.icon} aria-hidden />
          </button>
        ))}
      </div>

      <span className="gis-sel-toolbar__sep" aria-hidden />

      <div className="gis-sel-toolbar__modes" role="group" aria-label="Selection mode">
        {SET_MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`gis-sel-toolbar__mode${setMode === m.id ? ' is-on' : ''}`}
            title={m.hint}
            aria-pressed={setMode === m.id}
            onClick={() => onSetModeChange(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <span className="gis-sel-toolbar__sep" aria-hidden />

      <button type="button" className="gis-sel-toolbar__query" title="Show selected feature attributes" onClick={onOpenAttributes}>
        <i className="fa-solid fa-table-columns" aria-hidden />
        <span>Attributes</span>
      </button>
      <button type="button" className="gis-sel-toolbar__query" title="Zoom to selected features" onClick={onOpenLocation}>
        <i className="fa-solid fa-location-crosshairs" aria-hidden />
        <span>Location</span>
      </button>

      <span className="gis-sel-toolbar__sep" aria-hidden />

      <button type="button" className="gis-sel-toolbar__btn" title="Clear selection" aria-label="Clear selection" onClick={onClear}>
        <i className="fa-solid fa-eraser" aria-hidden />
      </button>
      <button type="button" className="gis-sel-toolbar__btn gis-sel-toolbar__btn--close" title="Close selection tools" aria-label="Close" onClick={onDeactivate}>
        <i className="fa-solid fa-xmark" aria-hidden />
      </button>
    </div>
  )
}
