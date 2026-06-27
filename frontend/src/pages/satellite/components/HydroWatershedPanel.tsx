import type { HydroStepId } from '../../../lib/hydroWatershed/hydroEngine'
import type { HydroStepState } from './useHydroWatershed'
import './HydroWatershedPanel.css'

type StepMeta = {
  id: HydroStepId
  icon: string
  label: string
}

/** Ordered analysis steps — icon-first, minimal text, each emits a map layer. */
const STEPS: StepMeta[] = [
  { id: 'dem', icon: 'fa-solid fa-mountain', label: 'Elevation' },
  { id: 'hillshade', icon: 'fa-solid fa-mound', label: 'Hillshade' },
  { id: 'slope', icon: 'fa-solid fa-chart-line', label: 'Slope' },
  { id: 'flow-accum', icon: 'fa-solid fa-water', label: 'Flow accumulation' },
  { id: 'streams', icon: 'fa-solid fa-timeline', label: 'Stream network' },
  { id: 'watershed', icon: 'fa-solid fa-fill-drip', label: 'Watershed' },
  { id: 'mesh', icon: 'fa-solid fa-diagram-project', label: 'Mesh' },
]

type HydroWatershedPanelProps = {
  steps: Record<HydroStepId, HydroStepState>
  demLoading: boolean
  demError: string | null
  hasAoi: boolean
  streamModel: 'strahler' | 'shreve'
  onStreamModelChange: (model: 'strahler' | 'shreve') => void
  onRunStep: (id: HydroStepId) => void
  onToggleVisible: (id: HydroStepId) => void
  onRemoveStep: (id: HydroStepId) => void
  onExportRaster: (id: HydroStepId) => void
  onRunAll: () => void
  onClose: () => void
}

export function HydroWatershedPanel({
  steps,
  demLoading,
  demError,
  hasAoi,
  streamModel,
  onStreamModelChange,
  onRunStep,
  onToggleVisible,
  onRemoveStep,
  onExportRaster,
  onRunAll,
  onClose,
}: HydroWatershedPanelProps) {
  return (
    <div className="si-hydro">
      <header className="si-hydro__head">
        <span className="si-hydro__brand-icon" aria-hidden>
          <i className="fa-solid fa-water" />
        </span>
        <span className="si-hydro__brand">
          <span className="si-hydro__title">Hydro Watershed</span>
          <span className="si-hydro__subtitle">Terrain hydrology workflow</span>
        </span>
        <button type="button" className="si-hydro__close" onClick={onClose} aria-label="Close panel">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </header>

      <div className="si-hydro__toolbar">
        <button
          type="button"
          className="si-hydro__runall"
          onClick={onRunAll}
          disabled={!hasAoi || demLoading}
        >
          {demLoading ? (
            <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
          ) : (
            <i className="fa-solid fa-gears" aria-hidden />
          )}
          <span>Run analysis</span>
        </button>
      </div>

      {demError ? (
        <p className="si-hydro__error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {demError}
        </p>
      ) : null}

      <div className="si-hydro__grid" role="list">
        {STEPS.map(step => {
          const st = steps[step.id]
          const running = st.status === 'running'
          const done = st.status === 'done'
          const failed = st.status === 'error'
          const canExport = done && st.result?.kind === 'raster' && !!st.result.band
          return (
            <div
              key={step.id}
              role="listitem"
              className={`si-hydro__card${done ? ' is-done' : ''}${failed ? ' is-error' : ''}`}
            >
              <button
                type="button"
                className="si-hydro__run"
                onClick={() => onRunStep(step.id)}
                disabled={!hasAoi || running}
                title={`Run ${step.label}`}
              >
                <span className="si-hydro__run-icon" aria-hidden>
                  {running ? (
                    <i className="fa-solid fa-circle-notch fa-spin" />
                  ) : (
                    <i className={step.icon} />
                  )}
                </span>
                <span className="si-hydro__run-label">{step.label}</span>
                <span className="si-hydro__run-play" aria-hidden>
                  {running ? (
                    <i className="fa-solid fa-spinner fa-spin" />
                  ) : (
                    <i className={`fa-solid ${done ? 'fa-rotate-right' : 'fa-play'}`} />
                  )}
                </span>
              </button>

              {done && st.result ? (
                <div className="si-hydro__layer">
                  {step.id === 'streams' ? (
                    <div className="si-hydro__model" role="group" aria-label="Stream classification model">
                      <button
                        type="button"
                        className={`si-hydro__model-opt${streamModel === 'strahler' ? ' is-on' : ''}`}
                        onClick={() => onStreamModelChange('strahler')}
                        aria-pressed={streamModel === 'strahler'}
                        title="Strahler stream order"
                      >
                        Strahler
                      </button>
                      <button
                        type="button"
                        className={`si-hydro__model-opt${streamModel === 'shreve' ? ' is-on' : ''}`}
                        onClick={() => onStreamModelChange('shreve')}
                        aria-pressed={streamModel === 'shreve'}
                        title="Shreve stream magnitude"
                      >
                        Shreve
                      </button>
                    </div>
                  ) : null}
                  {st.result.stats.length ? (
                    <dl className="si-hydro__stats">
                      {st.result.stats.map(s => (
                        <div key={s.label} className="si-hydro__stat">
                          <dt>{s.label}</dt>
                          <dd>{s.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  <div className="si-hydro__actions">
                    <button
                      type="button"
                      className={`si-hydro__act${st.visible ? ' is-on' : ''}`}
                      onClick={() => onToggleVisible(step.id)}
                      title={st.visible ? 'Hide layer' : 'Show layer'}
                      aria-pressed={st.visible}
                    >
                      <i className={`fa-solid ${st.visible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
                    </button>
                    {canExport ? (
                      <button
                        type="button"
                        className="si-hydro__act"
                        onClick={() => onExportRaster(step.id)}
                        title="Export raster — GeoTIFF clipped to AOI"
                      >
                        <i className="fa-solid fa-file-export" aria-hidden />
                        <span className="si-hydro__act-text">Export</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="si-hydro__act si-hydro__act--danger"
                      onClick={() => onRemoveStep(step.id)}
                      title="Remove layer"
                    >
                      <i className="fa-solid fa-trash-can" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}

              {failed ? <p className="si-hydro__card-err">{st.error}</p> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default HydroWatershedPanel
