import { useMemo } from 'react'
import {
  PIPELINE_STAGES,
  PRITHVI_CROP_CLASSES,
  type CropClassificationJob,
} from '../../../lib/siPrithviCropPipeline'
import './SiPrithviCropToolPanel.css'

export type SiPrithviCropToolPanelProps = {
  aoiGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
  hasSelfInference: boolean
  season: { start: string; end: string }
  onSeasonChange: (season: { start: string; end: string }) => void
  job: CropClassificationJob | null
  isRunning: boolean
  onPickAoi: () => void
  onRunAoi: () => void
  onRunChip: (imageUrl: string) => void
  onCancel: () => void
  onAddToMap?: () => void
}

function stageState(
  job: CropClassificationJob | null,
  stageStatus: string,
): 'idle' | 'active' | 'done' {
  if (!job) return 'idle'
  const order = ['fetching', 'preprocessing', 'inferring', 'done']
  const cur = order.indexOf(job.status)
  const me = order.indexOf(stageStatus)
  if (job.status === 'error') return cur >= me ? 'idle' : 'idle'
  if (cur < 0) return 'idle'
  if (me < cur) return 'done'
  if (me === cur) return job.status === 'done' ? 'done' : 'active'
  return 'idle'
}

export function SiPrithviCropToolPanel(props: SiPrithviCropToolPanelProps) {
  const {
    aoiGeometry,
    season,
    onSeasonChange,
    job,
    isRunning,
    onRunAoi,
    onCancel,
    onAddToMap,
  } = props

  const hasAoi = Boolean(aoiGeometry)
  const result = job?.status === 'done' ? job.result : null
  const scenes = result?.scenes
  const prediction = result?.prediction
  const country = result?.country ?? null
  const classStats = result?.classStats ?? null
  const progressPct = Math.round((job?.progress ?? 0) * 100)

  const sceneTiles = useMemo(
    () => [
      { key: 'T1', src: scenes?.t1 ?? null },
      { key: 'T2', src: scenes?.t2 ?? null },
      { key: 'T3', src: scenes?.t3 ?? null },
      { key: 'Crop Type', src: prediction?.url ?? null },
    ],
    [scenes, prediction],
  )

  const legendItems = useMemo(() => {
    if (result?.legend && result.legend.length) {
      return result.legend.map(c => ({ id: c.id, name: c.name, color: c.color }))
    }
    return PRITHVI_CROP_CLASSES.map(c => ({ id: c.id, name: c.name, color: c.color }))
  }, [result])

  return (
    <div className="prithvi-tool" dir="auto">
      <header className="prithvi-tool__head">
        <div className="prithvi-tool__title">Crop Classification</div>
      </header>

      <div className="prithvi-tool__section">
        <div className="prithvi-tool__dates">
          <label>
            <span>Season start</span>
            <input
              type="date"
              value={season.start}
              max={season.end}
              disabled={isRunning}
              onChange={e => onSeasonChange({ ...season, start: e.target.value })}
            />
          </label>
          <label>
            <span>Season end</span>
            <input
              type="date"
              value={season.end}
              min={season.start}
              disabled={isRunning}
              onChange={e => onSeasonChange({ ...season, end: e.target.value })}
            />
          </label>
        </div>

        <div className="prithvi-tool__row">
          {isRunning ? (
            <button type="button" className="prithvi-tool__btn is-danger" onClick={onCancel}>
              <i className="fa-solid fa-stop" aria-hidden /> Cancel
            </button>
          ) : (
            <button
              type="button"
              className="prithvi-tool__btn is-primary"
              onClick={onRunAoi}
              disabled={!hasAoi}
            >
              <i className="fa-solid fa-play" aria-hidden /> Run classification
            </button>
          )}
        </div>
      </div>

      {/* Pipeline stepper */}
      {job ? (
        <div className="prithvi-tool__pipeline">
          <div className="prithvi-tool__progress">
            <div className="prithvi-tool__progress-bar" style={{ width: `${progressPct}%` }} />
          </div>
          <ol className="prithvi-tool__steps">
            {PIPELINE_STAGES.map(stage => {
              const st = stageState(job, stage.status)
              return (
                <li key={stage.status} className={`prithvi-tool__step is-${st}`}>
                  <span className="prithvi-tool__step-dot">
                    {st === 'done' ? <i className="fa-solid fa-check" aria-hidden /> : null}
                    {st === 'active' ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : null}
                  </span>
                  <span className="prithvi-tool__step-label">{stage.label}</span>
                </li>
              )
            })}
          </ol>
          <div className={`prithvi-tool__status is-${job.status}`}>{job.message}</div>
          {job.status === 'error' && job.error ? (
            <div className="prithvi-tool__error">{job.error}</div>
          ) : null}
        </div>
      ) : null}

      {/* Results */}
      {result ? (
        <div className="prithvi-tool__results">
          {country ? (
            <div className="prithvi-tool__country">
              <i className="fa-solid fa-location-dot" aria-hidden />{' '}
              Detected country: <strong>{country.name}</strong>
              {country.code ? ` (${country.code})` : ''}
              <span className="prithvi-tool__country-src"> · {country.source}</span>
            </div>
          ) : null}
          <div className="prithvi-tool__grid">
            {sceneTiles.map(tile => (
              <figure key={tile.key} className="prithvi-tool__tile">
                {tile.src ? (
                  <img src={tile.src} alt={tile.key} loading="lazy" />
                ) : (
                  <div className="prithvi-tool__tile-empty">
                    <i className="fa-regular fa-image" aria-hidden />
                  </div>
                )}
                <figcaption>{tile.key}</figcaption>
              </figure>
            ))}
          </div>
          {prediction?.url && prediction?.bounds && onAddToMap ? (
            <button type="button" className="prithvi-tool__btn is-primary" onClick={onAddToMap}>
              <i className="fa-solid fa-layer-group" aria-hidden /> Add Crop Type layer to map
            </button>
          ) : null}
          {classStats && classStats.length ? (
            <div className="prithvi-tool__stats">
              <div className="prithvi-tool__stats-title">Crop composition</div>
              <ul className="prithvi-tool__stats-list">
                {classStats.map(s => (
                  <li key={s.id ?? s.name}>
                    <span>{s.name}</span>
                    <span className="prithvi-tool__stats-pct">{s.pct}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Legend */}
      <div className="prithvi-tool__legend">
        <div className="prithvi-tool__legend-title">
          {result?.legend && result.legend.length ? 'Crop Type legend' : 'Model prediction legend'}
        </div>
        <ul className="prithvi-tool__legend-list">
          {legendItems.map(c => (
            <li key={c.id}>
              <span className="prithvi-tool__swatch" style={{ background: c.color }} />
              {c.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default SiPrithviCropToolPanel
