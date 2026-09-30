import { useEffect } from 'react'
import type { UseElevationProfileReturn } from './useElevationProfile'
import '../hydro-watershed/HydroWatershedPanel.css'
import './ElevationProfilePanel.css'

const DEFAULT_COLORS = { line: '#1d4ed8', graph: '#5b21b6', highlight: '#22d3ee' }

const STAT_ROWS: Array<{ key: keyof UseElevationProfileReturn['statsOn']; label: string }> = [
  { key: 'min', label: 'Minimum elevation' },
  { key: 'avg', label: 'Average elevation' },
  { key: 'max', label: 'Maximum elevation' },
  { key: 'change', label: 'Elevation change' },
  { key: 'slopeMax', label: 'Maximum slope' },
  { key: 'slopeAvg', label: 'Average slope' },
]

type Props = {
  model: UseElevationProfileReturn
}

export function ElevationProfilePanel({ model }: Props) {
  useEffect(() => {
    if (model.enabled && model.method === 'interactive' && !model.profile && model.vertices.length === 0) {
      model.armInteractive()
    }
  }, [model.enabled])

  return (
    <div className="si-hydro si-elev-profile">
      <header className="si-hydro__head">
        <span className="si-hydro__brand-icon" aria-hidden>
          <i className="fa-solid fa-chart-area" />
        </span>
        <span className="si-hydro__brand">
          <span className="si-hydro__title">Elevation Profile</span>
          <span className="si-hydro__subtitle">Terrain section along a line</span>
        </span>
      </header>

      <div className="si-elev-profile__tabs" role="tablist">
        {(['create', 'properties'] as const).map(id => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={model.tab === id}
            className={`si-elev-profile__tab${model.tab === id ? ' is-active' : ''}`}
            onClick={() => model.setTab(id)}
          >
            {id === 'create' ? 'Create' : 'Properties'}
          </button>
        ))}
      </div>

      {model.tab === 'create' ? (
        <div className="si-elev-profile__body">
          <label className="si-elev-profile__field" htmlFor="ep-units">
            Distance units
            <select id="ep-units" value="meters" disabled>
              <option value="meters">Meters</option>
            </select>
          </label>
          <p className="si-elev-profile__label">Creation method</p>
          <button
            type="button"
            className={`si-elev-profile__method${model.method === 'interactive' ? ' is-active' : ''}`}
            onClick={model.armInteractive}
          >
            <i className="fa-solid fa-pen-ruler" aria-hidden />
            <span>
              <strong>Interactive placement</strong>
              <small>Click each vertex. Double-click to finish the line.</small>
            </span>
          </button>
          <button
            type="button"
            className={`si-elev-profile__method${model.method === 'layer' ? ' is-active' : ''}`}
            onClick={() => model.setMethod('layer')}
          >
            <i className="fa-solid fa-share-nodes" aria-hidden />
            <span>
              <strong>From layer</strong>
              <small>Use the drawn AOI boundary or a sketched line.</small>
            </span>
          </button>
          <label className="si-elev-profile__field" htmlFor="ep-layer">
            Line layer
            <select id="ep-layer" value={model.layerId} onChange={e => model.setLayerId(e.target.value)}>
              <option value="sketch">{model.sketchLine ? 'Drawn sketch / AOI' : 'No line layer'}</option>
            </select>
          </label>
          <button type="button" className="si-hydro__export-report" disabled={!model.sketchLine || model.busy} onClick={model.applySketch}>
            {model.busy ? 'Building…' : 'Apply'}
          </button>
          {model.method === 'interactive' ? (
            <p className="si-elev-profile__info">
              <i className="fa-solid fa-circle-info" aria-hidden />
              Click on the map to place each vertex of a line. Double-click to place the last vertex and build the profile.
            </p>
          ) : null}
          {model.drawing ? <p className="si-elev-profile__hint">Right-click undoes the last vertex.</p> : null}
          {model.error ? <p className="si-elev-profile__error">{model.error}</p> : null}
          <button type="button" className="si-elev-profile__new" onClick={model.clear}>
            New profile
          </button>
        </div>
      ) : (
        <div className="si-elev-profile__body">
          <label className="si-elev-profile__color">
            Line
            <input type="color" value={model.colors.line} onChange={e => model.setColors({ ...model.colors, line: e.target.value })} />
          </label>
          <label className="si-elev-profile__color">
            Graph
            <input type="color" value={model.colors.graph} onChange={e => model.setColors({ ...model.colors, graph: e.target.value })} />
          </label>
          <label className="si-elev-profile__color">
            Highlight
            <input type="color" value={model.colors.highlight} onChange={e => model.setColors({ ...model.colors, highlight: e.target.value })} />
          </label>
          <div className="si-elev-profile__prop-actions">
            <button type="button" onClick={() => model.setColors(DEFAULT_COLORS)}>
              Restore defaults
            </button>
            <button type="button" onClick={model.reverse} disabled={!model.profile}>
              Reverse direction
            </button>
            <button type="button" onClick={model.exportCsv} disabled={!model.profile}>
              Export
            </button>
          </div>
          <p className="si-elev-profile__label">Statistics</p>
          <label className="si-elev-profile__check">
            <input
              type="checkbox"
              checked={Object.values(model.statsOn).every(Boolean)}
              onChange={e => {
                const on = e.target.checked
                for (const row of STAT_ROWS) {
                  if (model.statsOn[row.key] !== on) model.toggleStat(row.key)
                }
              }}
            />
            Select all
          </label>
          {STAT_ROWS.map(row => (
            <label key={row.key} className="si-elev-profile__check">
              <input type="checkbox" checked={model.statsOn[row.key]} onChange={() => model.toggleStat(row.key)} />
              {row.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
