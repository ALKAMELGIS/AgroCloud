import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useMap } from 'react-map-gl/mapbox'
import { buildBasemapCatalog, catalogEntryById } from '@/modules/gis/map/basemapCatalog'
import type { FloodVisualizationMode } from '../floodTypes'
import type { UseFloodSimulationReturn } from '../useFloodSimulation'
import '../floodSimulation.css'

type Props = {
  model: UseFloodSimulationReturn
  basemapId: string
  setBasemapId: (id: string) => void
}

const VIZ_CARDS: Array<{ id: FloodVisualizationMode; title: string; sub: string }> = [
  { id: 'depthTime', title: 'Depth over time', sub: 'Animated water depth' },
  { id: 'maxDepth', title: 'Maximum depth', sub: 'Peak inundation' },
  { id: 'flowSpeed', title: 'Flow speed', sub: 'Velocity magnitude' },
  { id: 'flowPaths', title: 'Flow paths', sub: 'Directional flow' },
]

const MAP_STYLE_CHIPS = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'google-satellite-hybrid', label: 'Satellite' },
  { id: 'topographic-3d', label: 'Paper' },
  { id: 'esri-world-imagery', label: 'Atlas' },
  { id: 'carto-dark', label: 'Night' },
]

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function FloodSimulationChrome({ model, basemapId, setBasemapId }: Props) {
  const mapCollection = useMap()
  const map = mapCollection?.current?.getMap()
  const host = map?.getContainer() ?? null

  const {
    result,
    phase,
    frameIndex,
    setFrameIndex,
    playing,
    setPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    vizMode,
    setVizMode,
    fineTune,
    setFineTune,
    progress,
    pause,
    stop,
    exportPng,
    exportGeoJson,
    exportConfig,
    mapHit,
    buildingsOn,
    labelsOn,
    terrainBoost,
    toggleBuildings,
    toggleLabels,
    toggleTerrainBoost,
    gpuAvailable,
  } = model

  const showResults = phase === 'RUNNING' || phase === 'PAUSED' || phase === 'COMPLETE'
  const frame = result?.frames[frameIndex]
  const totalSec = result?.frames[result.frames.length - 1]?.timeSec ?? model.config.durationMin * 60

  const headerTitle = useMemo(() => {
    const g = model.config.gridM
    return `Simulation · swmm2d_${g}m`
  }, [model.config.gridM])

  if (!host || !showResults) return null

  return createPortal(
    <div className="si-flood-sim-chrome" data-map-overlay-isolate="">
      <aside className="si-flood-sim-panel si-flood-sim-panel--left">
        <header className="si-flood-sim-panel__head">
          <div>
            <h2>{headerTitle}</h2>
            <p>
              {model.config.gridM} m cells · {model.config.rainfallMm} mm rain · {model.config.durationMin} min
              simulation
            </p>
          </div>
        </header>

        <section className="si-flood-sim-panel__section">
          <h3>What to show</h3>
          <div className="si-flood-sim-viz-grid">
            {VIZ_CARDS.map(card => (
              <button
                key={card.id}
                type="button"
                className={`si-flood-sim-viz-card${vizMode === card.id ? ' is-active' : ''}`}
                onClick={() => setVizMode(card.id)}
              >
                <span className="si-flood-sim-viz-card__thumb" />
                <strong>{card.title}</strong>
                <span>{card.sub}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="si-flood-sim-legend">
          <span>0.05</span>
          <span className="si-flood-sim-legend__bar" />
          <span>0.1</span>
          <span>0.3</span>
          <span>1</span>
          <span>2+ m</span>
        </div>
        {vizMode === 'flowPaths' || vizMode === 'flowSpeed' ? (
          <p className="si-flood-sim-panel__hint">Flow lines, brighter where faster.</p>
        ) : null}

        <section className="si-flood-sim-panel__section">
          <h3>Map style</h3>
          <div className="si-flood-sim-style-grid">
            {MAP_STYLE_CHIPS.map(chip => {
              const catalog = buildBasemapCatalog('')
              const exists = Boolean(catalogEntryById(catalog, chip.id))
              if (!exists && chip.id !== basemapId) return null
              return (
                <button
                  key={chip.id}
                  type="button"
                  className={`si-flood-sim-style-chip${basemapId === chip.id ? ' is-active' : ''}`}
                  onClick={() => setBasemapId(chip.id)}
                >
                  {chip.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="si-flood-sim-panel__section">
          <h3>On the map</h3>
          <div className="si-flood-sim-toggles">
            <button type="button" className={`si-flood-sim-btn si-flood-sim-btn--chip${buildingsOn ? ' is-on' : ''}`} onClick={toggleBuildings}>
              Buildings
            </button>
            <button type="button" className={`si-flood-sim-btn si-flood-sim-btn--chip${terrainBoost ? ' is-on' : ''}`} onClick={toggleTerrainBoost}>
              Terrain 1.5×
            </button>
            <button type="button" className={`si-flood-sim-btn si-flood-sim-btn--chip${labelsOn ? ' is-on' : ''}`} onClick={toggleLabels}>
              Labels
            </button>
          </div>
        </section>

        <details className="si-flood-sim-fine-tune">
          <summary>Fine-tune water and flow lines</summary>
          <label>
            Water opacity
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={fineTune.waterOpacity}
              onChange={e => setFineTune(f => ({ ...f, waterOpacity: Number(e.target.value) }))}
            />
          </label>
          <label>
            Particle count
            <input
              type="range"
              min={200}
              max={2000}
              step={100}
              value={fineTune.particleCount}
              onChange={e => setFineTune(f => ({ ...f, particleCount: Number(e.target.value) }))}
            />
          </label>
        </details>

        {phase === 'RUNNING' && progress ? (
          <div className="si-flood-sim-running">
            <strong>Simulating flood</strong>
            <span>{progress.pct}%</span>
            <span>{gpuAvailable ? 'Local GPU' : 'Local CPU'}</span>
            <button type="button" className="si-flood-sim-btn" onClick={pause}>Pause</button>
            <button type="button" className="si-flood-sim-btn" onClick={stop}>Stop</button>
          </div>
        ) : null}
      </aside>

      <div className="si-flood-sim-timeline">
        <button
          type="button"
          className="si-flood-sim-timeline__play"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <i className={`fa-solid ${playing ? 'fa-pause' : 'fa-play'}`} />
        </button>
        <div className="si-flood-sim-timeline__time">
          <strong>{formatTime(frame?.timeSec ?? 0)}</strong>
          <span>since start</span>
        </div>
        <div className="si-flood-sim-timeline__stats">
          <div>
            <span>Flooded area</span>
            <strong>{frame ? `${frame.floodedAreaHa.toFixed(1)} ha` : '—'}</strong>
          </div>
          <div>
            <span>Deepest water</span>
            <strong>{frame ? `${Math.round(frame.maxDepthM * 100)} cm` : '—'}</strong>
          </div>
          <div>
            <span>Water on surface</span>
            <strong>{frame ? `${Math.round(frame.volumeM3).toLocaleString()} m³` : '—'}</strong>
          </div>
        </div>
        <input
          type="range"
          className="si-flood-sim-timeline__scrub"
          min={0}
          max={Math.max(0, (result?.frames.length ?? 1) - 1)}
          value={frameIndex}
          onChange={e => setFrameIndex(Number(e.target.value))}
        />
        <select
          className="si-flood-sim-timeline__speed"
          value={playbackSpeed}
          onChange={e => setPlaybackSpeed(Number(e.target.value))}
        >
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
        <button type="button" className="si-flood-sim-btn si-flood-sim-btn--ghost" onClick={exportPng}>Export</button>
        <button type="button" className="si-flood-sim-btn si-flood-sim-btn--ghost" onClick={exportGeoJson}>GeoJSON</button>
        <button type="button" className="si-flood-sim-btn si-flood-sim-btn--ghost" onClick={exportConfig}>Config</button>
      </div>

      {mapHit ? (
        <div className="si-flood-sim-inspect">
          <h4>Flood information</h4>
          <p>Depth <strong>{Math.round(mapHit.depthM * 100)} cm</strong></p>
          <p>Velocity <strong>{mapHit.velocityMs.toFixed(1)} m/s</strong></p>
          <p>Arrival <strong>{mapHit.arrivalSec != null ? formatTime(mapHit.arrivalSec) : '—'}</strong></p>
          <p>Elevation <strong>{mapHit.elevationM.toFixed(1)} m</strong></p>
        </div>
      ) : null}
    </div>,
    host,
  )
}
