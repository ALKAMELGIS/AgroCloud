import type { UseFloodSimulationReturn } from '../useFloodSimulation'
import type { FloodGridResolutionM } from '../floodTypes'

type Props = {
  model: UseFloodSimulationReturn
}

const GRIDS: FloodGridResolutionM[] = [1, 2, 5, 10]

export function FloodSimulationSetupPanel({ model }: Props) {
  const {
    config,
    setConfig,
    gridWarning,
    cellEstimate,
    gpuAvailable,
    run,
    phase,
    progress,
    requestDrawArea,
  } = model
  const busy = phase === 'RUNNING'

  return (
    <div className="si-flood-sim-setup">
      <h3 className="si-flood-sim-setup__title">Simulate a Flood</h3>
      <p className="si-flood-sim-setup__lead">Run a 2D flood simulation locally in your browser.</p>

      <div className="si-flood-sim-setup__section">
        <span className="si-flood-sim-setup__label">Simulation area</span>
        <p className="si-flood-sim-setup__meta">
          Use <strong>Edit</strong> on the map rail or <strong>Draw area</strong> below to sketch a polygon on the map.
        </p>
        <div className="si-flood-sim-setup__row">
          <button
            type="button"
            className="si-flood-sim-btn si-flood-sim-btn--chip"
            onClick={requestDrawArea}
          >
            Draw area
          </button>
        </div>
        {cellEstimate.cellCount > 0 ? (
          <p className="si-flood-sim-setup__meta">
            ~{cellEstimate.width}×{cellEstimate.height} cells ({cellEstimate.cellCount.toLocaleString()})
          </p>
        ) : null}
      </div>

      <div className="si-flood-sim-setup__grid">
        <label>
          Rainfall (mm)
          <input
            type="number"
            min={1}
            value={config.rainfallMm}
            onChange={e => setConfig(c => ({ ...c, rainfallMm: Number(e.target.value) || 0 }))}
          />
        </label>
        <label>
          Duration (min)
          <input
            type="number"
            min={5}
            value={config.durationMin}
            onChange={e => setConfig(c => ({ ...c, durationMin: Number(e.target.value) || 0 }))}
          />
        </label>
        <label>
          Grid
          <select
            value={config.gridM}
            onChange={e => setConfig(c => ({ ...c, gridM: Number(e.target.value) as FloodGridResolutionM }))}
          >
            {GRIDS.map(g => (
              <option key={g} value={g}>{g} m</option>
            ))}
          </select>
        </label>
      </div>

      {gridWarning ? <p className="si-flood-sim-setup__warn">{gridWarning}</p> : null}

      <button
        type="button"
        className="si-flood-sim-btn si-flood-sim-btn--primary"
        disabled={busy || Boolean(gridWarning)}
        onClick={run}
      >
        ▶ Run 2D simulation
      </button>

      <div className="si-flood-sim-setup__status">
        <span>{gpuAvailable ? '✓ Local GPU' : '✓ Local CPU worker'}</span>
        <span>✓ Data stays in your browser</span>
      </div>

      {phase === 'ERROR' && progress ? (
        <p className="si-flood-sim-setup__warn" role="alert">{progress.label}</p>
      ) : null}

      {busy && progress ? (
        <p className="si-flood-sim-setup__progress">
          {progress.label} — {progress.pct}%
        </p>
      ) : null}

      {!busy && phase === 'SETUP' && progress?.label && progress.phase === 'done' ? (
        <p className="si-flood-sim-setup__warn">{progress.label}</p>
      ) : null}
    </div>
  )
}
