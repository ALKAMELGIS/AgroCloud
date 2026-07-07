import type {
  McdaCriterionWeights,
  WellSuitabilitySite,
} from '../../../lib/hydroWatershed/wellSuitabilityMcdaEngine'
import './HydroWatershedPanel.css'
import './WellSiteRecommendationPanel.css'
import './WellSuitabilityPanel.css'

type WeightKey = keyof McdaCriterionWeights

const WEIGHT_FIELDS: Array<{ key: WeightKey; label: string; icon: string }> = [
  { key: 'geology', label: 'Geology', icon: 'fa-layer-group' },
  { key: 'hydrology', label: 'Hydrology', icon: 'fa-water' },
  { key: 'terrain', label: 'Terrain', icon: 'fa-mountain' },
  { key: 'climate', label: 'Climate', icon: 'fa-cloud-rain' },
  { key: 'landSurface', label: 'Land surface', icon: 'fa-seedling' },
  { key: 'satellite', label: 'Satellite', icon: 'fa-satellite' },
]

type WellSuitabilityPanelProps = {
  status: 'idle' | 'running' | 'done' | 'error'
  hasAoi: boolean
  demLoading: boolean
  demError: string | null
  error: string | null
  progressLabel: string | null
  progressPct: number
  weights: McdaCriterionWeights
  topN: number
  points: WellSuitabilitySite[]
  stats: Array<{ label: string; value: string }>
  legendSwatches: Array<{ color: string; label?: string }>
  heatVisible: boolean
  streamsVisible: boolean
  opacity: number
  hasResult: boolean
  onRun: () => void
  onWeightChange: (key: WeightKey, value: number) => void
  onTopNChange: (n: number) => void
  onToggleHeat: () => void
  onToggleStreams: () => void
  onOpacityChange: (value: number) => void
  onExportGeoTiff: () => void
  onExportGeoJson: () => void
  onExportCsv: () => void
  onExportXlsx: () => void
  onExportPdf: () => void
  onExportShapefile: () => void
  onExportKmz: () => void
  onZoomToPoint: (point: WellSuitabilitySite) => void
}

export function WellSuitabilityPanel({
  status,
  hasAoi,
  demLoading,
  demError,
  error,
  progressLabel,
  progressPct,
  weights,
  topN,
  points,
  stats,
  legendSwatches,
  heatVisible,
  streamsVisible,
  opacity,
  hasResult,
  onRun,
  onWeightChange,
  onTopNChange,
  onToggleHeat,
  onToggleStreams,
  onOpacityChange,
  onExportGeoTiff,
  onExportGeoJson,
  onExportCsv,
  onExportXlsx,
  onExportPdf,
  onExportShapefile,
  onExportKmz,
  onZoomToPoint,
}: WellSuitabilityPanelProps) {
  const running = status === 'running' || demLoading
  const message = error || demError

  return (
    <div className="si-hydro si-wellsite si-well-suit">
      <header className="si-hydro__head">
        <span className="si-hydro__brand-icon" aria-hidden>
          <i className="fa-solid fa-bore-hole" />
        </span>
        <span className="si-hydro__brand">
          <span className="si-hydro__title">Well Suitability (MCDA)</span>
          <span className="si-hydro__subtitle">Multi-criteria groundwater potential</span>
        </span>
      </header>

      <div className="si-well-suit__weights">
        <p className="si-well-suit__weights-title">
          <i className="fa-solid fa-sliders" aria-hidden /> Analysis weights (AHP)
        </p>
        {WEIGHT_FIELDS.map(f => (
          <label key={f.key} className="si-well-suit__weight-row">
            <span className="si-well-suit__weight-label">
              <i className={`fa-solid ${f.icon}`} aria-hidden /> {f.label}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={weights[f.key]}
              disabled={running}
              onChange={e => onWeightChange(f.key, Number(e.target.value))}
              aria-label={`${f.label} weight`}
            />
            <span className="si-well-suit__weight-pct">{Math.round(weights[f.key] * 100)}%</span>
          </label>
        ))}
        <label className="si-well-suit__topn">
          <span>Sites to rank</span>
          <input
            type="range"
            min={5}
            max={20}
            step={1}
            value={topN}
            disabled={running}
            onChange={e => onTopNChange(Number(e.target.value))}
            aria-label="Number of ranked sites"
          />
          <span>{topN}</span>
        </label>
      </div>

      <div className="si-hydro__toolbar">
        <button
          type="button"
          className="si-hydro__runall"
          onClick={onRun}
          disabled={!hasAoi || running}
          title={hasAoi ? 'Run MCDA groundwater analysis' : 'Draw an AOI first'}
        >
          {running ? (
            <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
          ) : (
            <i className="fa-solid fa-chart-area" aria-hidden />
          )}
          <span>{running ? 'Analysing…' : 'Run MCDA'}</span>
        </button>
      </div>

      {running && progressLabel ? (
        <div className="si-well-suit__progress" role="status">
          <div className="si-well-suit__progress-bar">
            <span style={{ width: `${Math.round(progressPct * 100)}%` }} />
          </div>
          <p>{progressLabel}</p>
        </div>
      ) : null}

      {message ? (
        <p className="si-hydro__error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {message}
        </p>
      ) : null}

      {hasResult ? (
        <>
          <div className="si-hydro__card is-done si-wellsite__heat">
            {stats.length ? (
              <dl className="si-hydro__stats">
                {stats.map(s => (
                  <div key={s.label} className="si-hydro__stat">
                    <dt>{s.label}</dt>
                    <dd>{s.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {legendSwatches.length ? (
              <div className="si-well-suit__class-legend" aria-hidden>
                {legendSwatches.map((sw, i) => (
                  <span key={i} className="si-well-suit__class-chip">
                    <span style={{ background: sw.color }} />
                    {sw.label}
                  </span>
                ))}
              </div>
            ) : null}

            <div className="si-wellsite__opacity">
              <i className="fa-solid fa-circle-half-stroke" aria-hidden />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                onChange={e => onOpacityChange(Number(e.target.value))}
                aria-label="Heatmap opacity"
                disabled={!heatVisible}
              />
            </div>

            <div className="si-hydro__actions">
              <button
                type="button"
                className={`si-hydro__act${heatVisible ? ' is-on' : ''}`}
                onClick={onToggleHeat}
                aria-pressed={heatVisible}
              >
                <i className={`fa-solid ${heatVisible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
                <span className="si-hydro__act-text">Heatmap</span>
              </button>
              <button
                type="button"
                className={`si-hydro__act${streamsVisible ? ' is-on' : ''}`}
                onClick={onToggleStreams}
                aria-pressed={streamsVisible}
              >
                <i className="fa-solid fa-water" aria-hidden />
                <span className="si-hydro__act-text">Streams</span>
              </button>
              <button type="button" className="si-hydro__act" onClick={onExportGeoTiff} title="GeoTIFF heatmap">
                <i className="fa-solid fa-file-image" aria-hidden />
                <span className="si-hydro__act-text">TIFF</span>
              </button>
            </div>
          </div>

          <div className="si-hydro__card is-done si-wellsite__sites">
            <div className="si-wellsite__sites-head">
              <span className="si-wellsite__sites-title">
                <i className="fa-solid fa-ranking-star" aria-hidden /> Ranked locations
              </span>
              <span className="si-wellsite__sites-hint">
                <i className="fa-solid fa-percent" aria-hidden /> Confidence
              </span>
            </div>
            <ul className="si-wellsite__list si-well-suit__list">
              {points.map(p => (
                <li key={p.rank} className="si-well-suit__site-block">
                  <div className="si-wellsite__item">
                    <span className="si-wellsite__rank">{p.rank}</span>
                    <span className="si-wellsite__item-name">
                      {p.potentialClass} · {p.potentialScore}%
                    </span>
                    <span className="si-wellsite__item-score" title={`Confidence ${p.confidencePct}%`}>
                      <span
                        className="si-wellsite__score-bar"
                        style={{ width: `${Math.max(8, p.confidencePct)}%` }}
                      />
                      <span className="si-wellsite__score-num">{p.confidencePct}%</span>
                    </span>
                    <button
                      type="button"
                      className="si-hydro__act"
                      onClick={() => onZoomToPoint(p)}
                      title="Zoom to site"
                    >
                      <i className="fa-solid fa-crosshairs" aria-hidden />
                    </button>
                  </div>
                  <p className="si-well-suit__narrative">{p.narrative}</p>
                  <dl className="si-well-suit__attrs">
                    <div>
                      <dt>Depth</dt>
                      <dd>{p.drillingDepthM} m</dd>
                    </div>
                    <div>
                      <dt>SWL</dt>
                      <dd>{p.staticWaterLevelM} m</dd>
                    </div>
                    <div>
                      <dt>Stream</dt>
                      <dd>{p.streamDistM} m</dd>
                    </div>
                    <div>
                      <dt>Aquifer</dt>
                      <dd>{p.aquiferType}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            <div className="si-hydro__actions si-well-suit__exports">
              <button type="button" className="si-hydro__act" onClick={onExportPdf} title="PDF report">
                <i className="fa-solid fa-file-pdf" aria-hidden />
                <span className="si-hydro__act-text">PDF</span>
              </button>
              <button type="button" className="si-hydro__act" onClick={onExportXlsx} title="Excel workbook">
                <i className="fa-solid fa-file-excel" aria-hidden />
                <span className="si-hydro__act-text">Excel</span>
              </button>
              <button type="button" className="si-hydro__act" onClick={onExportGeoJson} title="GeoJSON">
                <i className="fa-solid fa-map" aria-hidden />
                <span className="si-hydro__act-text">GeoJSON</span>
              </button>
              <button type="button" className="si-hydro__act" onClick={onExportShapefile} title="Shapefile ZIP">
                <i className="fa-solid fa-file-zipper" aria-hidden />
                <span className="si-hydro__act-text">SHP</span>
              </button>
              <button type="button" className="si-hydro__act" onClick={onExportKmz} title="KMZ for Google Earth">
                <i className="fa-solid fa-globe" aria-hidden />
                <span className="si-hydro__act-text">KMZ</span>
              </button>
              <button type="button" className="si-hydro__act" onClick={onExportCsv} title="CSV">
                <i className="fa-solid fa-table" aria-hidden />
                <span className="si-hydro__act-text">CSV</span>
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default WellSuitabilityPanel
