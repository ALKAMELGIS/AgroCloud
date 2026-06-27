import {
  AREA_UNIT_OPTIONS,
  DISTANCE_UNIT_OPTIONS,
  MEASURE_MODES,
  getMeasureModeSpec,
  type AreaUnit,
  type DistanceUnit,
  type MeasureComputed,
  type MeasureMode,
  type MeasureUnits,
} from '../../../lib/measurement/measurementEngine'
import './MeasurementPanel.css'

const GROUP_LABEL: Record<string, string> = {
  planar: 'Distance & area',
  shape: 'Shapes',
  point: 'Point',
  threeD: '3D / terrain',
}

const GROUP_ORDER: Array<'planar' | 'shape' | 'point' | 'threeD'> = ['planar', 'shape', 'point', 'threeD']

export type MeasurementPanelProps = {
  activeMode: MeasureMode | null
  onSelectMode: (mode: MeasureMode) => void
  units: MeasureUnits
  onUnitsChange: (units: MeasureUnits) => void
  /** Live computed result for the in-progress measurement. */
  active: MeasureComputed | null
  vertexCount: number
  finished: boolean
  completedCount: number
  terrainAvailable: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onFinish: () => void
  onClearCurrent: () => void
  onClearAll: () => void
  onClose: () => void
}

export function MeasurementPanel({
  activeMode,
  onSelectMode,
  units,
  onUnitsChange,
  active,
  vertexCount,
  finished,
  completedCount,
  terrainAvailable,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onFinish,
  onClearCurrent,
  onClearAll,
  onClose,
}: MeasurementPanelProps) {
  const spec = activeMode ? getMeasureModeSpec(activeMode) : null
  const canFinish =
    !!spec && !finished && !spec.autoFinishCount && vertexCount >= spec.minPoints

  return (
    <div className="si-measure-panel" role="dialog" aria-label="Measurement tools">
      <header className="si-measure-panel__head">
        <span className="si-measure-panel__brand-icon" aria-hidden>
          <i className="fa-solid fa-ruler-combined" />
        </span>
        <span className="si-measure-panel__brand">
          <span className="si-measure-panel__title">Measurement</span>
          <span className="si-measure-panel__subtitle">Distance · area · terrain</span>
        </span>
        <button type="button" className="si-measure-panel__close" onClick={onClose} aria-label="Close measurement panel">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="si-measure-panel__tools">
        {GROUP_ORDER.map(group => {
          const modes = MEASURE_MODES.filter(m => m.group === group)
          if (!modes.length) return null
          return (
            <div key={group} className="si-measure-panel__group">
              <span className="si-measure-panel__group-label">{GROUP_LABEL[group]}</span>
              <div className="si-measure-panel__grid" role="group" aria-label={GROUP_LABEL[group]}>
                {modes.map(m => {
                  const disabled = Boolean(m.requiresTerrain && !terrainAvailable)
                  const on = activeMode === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`si-measure-tool${on ? ' is-on' : ''}`}
                      aria-pressed={on}
                      disabled={disabled}
                      title={disabled ? `${m.label} — enable 3D terrain first` : `${m.label} — ${m.hint}`}
                      onClick={() => onSelectMode(m.id)}
                    >
                      <i className={m.icon} aria-hidden />
                      <span>{m.short}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="si-measure-panel__units">
        <label className="si-measure-panel__unit">
          <span>Distance</span>
          <select
            value={units.distance}
            onChange={e => onUnitsChange({ ...units, distance: e.target.value as DistanceUnit })}
          >
            {DISTANCE_UNIT_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="si-measure-panel__unit">
          <span>Area</span>
          <select value={units.area} onChange={e => onUnitsChange({ ...units, area: e.target.value as AreaUnit })}>
            {AREA_UNIT_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="si-measure-panel__result" aria-live="polite">
        {!activeMode ? (
          <p className="si-measure-panel__placeholder">Pick a measurement tool above, then click on the map.</p>
        ) : active && active.readouts.length ? (
          <>
            <dl className="si-measure-panel__readouts">
              {active.readouts.map((r, i) => (
                <div key={`${r.label}-${i}`} className={`si-measure-panel__readout${r.primary ? ' is-primary' : ''}`}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
            <p className="si-measure-panel__hint">
              {finished ? 'Measurement complete — start another or pick a different tool.' : spec?.hint}
            </p>
          </>
        ) : (
          <p className="si-measure-panel__hint">{spec?.hint}</p>
        )}
      </div>

      <div className="si-measure-panel__actions">
        <button type="button" className="si-measure-panel__btn" onClick={onUndo} disabled={!canUndo} title="Undo last point">
          <i className="fa-solid fa-rotate-left" aria-hidden /> Undo
        </button>
        <button type="button" className="si-measure-panel__btn" onClick={onRedo} disabled={!canRedo} title="Redo point">
          <i className="fa-solid fa-rotate-right" aria-hidden /> Redo
        </button>
        {canFinish ? (
          <button type="button" className="si-measure-panel__btn si-measure-panel__btn--primary" onClick={onFinish}>
            <i className="fa-solid fa-check" aria-hidden /> Finish
          </button>
        ) : null}
      </div>
      <div className="si-measure-panel__actions">
        <button type="button" className="si-measure-panel__btn" onClick={onClearCurrent} title="Clear the current measurement">
          <i className="fa-solid fa-eraser" aria-hidden /> Clear current
        </button>
        <button
          type="button"
          className="si-measure-panel__btn si-measure-panel__btn--danger"
          onClick={onClearAll}
          disabled={completedCount === 0 && vertexCount === 0}
          title="Remove all measurements from the map"
        >
          <i className="fa-solid fa-trash-can" aria-hidden /> Clear all
        </button>
      </div>

      <footer className="si-measure-panel__foot">
        <span>
          <i className="fa-solid fa-layer-group" aria-hidden /> {completedCount} kept on map
        </span>
        {!terrainAvailable ? <span className="si-measure-panel__foot-note">3D modes need terrain on</span> : null}
      </footer>
    </div>
  )
}

export default MeasurementPanel
