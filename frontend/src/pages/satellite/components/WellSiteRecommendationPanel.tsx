import type { WellSitePoint } from '../../../lib/hydroWatershed/hydroEngine'
import './HydroWatershedPanel.css'
import './WellSiteRecommendationPanel.css'

type WellSiteRecommendationPanelProps = {
  status: 'idle' | 'running' | 'done' | 'error'
  hasAoi: boolean
  demLoading: boolean
  demError: string | null
  error: string | null
  points: WellSitePoint[]
  stats: Array<{ label: string; value: string }>
  legendSwatches: Array<{ color: string }>
  heatVisible: boolean
  opacity: number
  hasResult: boolean
  onRun: () => void
  onToggleHeat: () => void
  onOpacityChange: (value: number) => void
  onExportGeoTiff: () => void
  onExportGeoJson: () => void
  onExportCsv: () => void
  onExportXlsx: () => void
  onExportReport?: () => void
  exportReportBusy?: boolean
  exportReportLabel?: string
  onZoomToPoint: (point: WellSitePoint) => void
}

export function WellSiteRecommendationPanel({
  status,
  hasAoi,
  demLoading,
  demError,
  error,
  points,
  stats,
  legendSwatches,
  heatVisible,
  opacity,
  hasResult,
  onRun,
  onToggleHeat,
  onOpacityChange,
  onExportGeoTiff,
  onExportGeoJson,
  onExportCsv,
  onExportXlsx,
  onExportReport,
  exportReportBusy,
  exportReportLabel,
  onZoomToPoint,
}: WellSiteRecommendationPanelProps) {
  const running = status === 'running' || demLoading
  const message = error || demError

  return (
    <div className="si-hydro si-wellsite">
      <header className="si-hydro__head">
        <span className="si-hydro__brand-icon" aria-hidden>
          <i className="fa-solid fa-droplet" />
        </span>
        <span className="si-hydro__brand">
          <span className="si-hydro__title">Well Site (Hydro-AI)</span>
          <span className="si-hydro__subtitle">Drilling suitability recommendation</span>
        </span>
      </header>

      <div className="si-hydro__toolbar">
        <button
          type="button"
          className="si-hydro__runall"
          onClick={onRun}
          disabled={!hasAoi || running}
          title={hasAoi ? 'Run well-site suitability' : 'Draw an AOI first'}
        >
          {running ? (
            <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
          ) : (
            <i className="fa-solid fa-gears" aria-hidden />
          )}
          <span>{running ? 'Analysing…' : 'Run'}</span>
        </button>
        {onExportReport ? (
          <button
            type="button"
            className="si-hydro__export-report"
            onClick={onExportReport}
            disabled={!hasAoi || !hasResult || exportReportBusy || running}
            title="Export Well Site Recommendation Report (Word) — cover, TOC, summary, tables, charts, maps with basemap & legend"
          >
            {exportReportBusy ? (
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
            ) : (
              <i className="fa-solid fa-file-word" aria-hidden />
            )}
            <span>{exportReportLabel ?? 'Export Report'}</span>
          </button>
        ) : null}
      </div>

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
              <div className="si-wellsite__legend" aria-hidden>
                <span className="si-wellsite__legend-label">Low</span>
                <span className="si-wellsite__legend-bar">
                  {legendSwatches.map((sw, i) => (
                    <span key={i} style={{ background: sw.color }} />
                  ))}
                </span>
                <span className="si-wellsite__legend-label">High</span>
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
                title={heatVisible ? 'Hide heatmap' : 'Show heatmap'}
              >
                <i className={`fa-solid ${heatVisible ? 'fa-eye' : 'fa-eye-slash'}`} aria-hidden />
                <span className="si-hydro__act-text">Heatmap</span>
              </button>
              <button
                type="button"
                className="si-hydro__act"
                onClick={onExportGeoTiff}
                title="Export suitability heatmap — GeoTIFF clipped to AOI"
              >
                <i className="fa-solid fa-file-export" aria-hidden />
                <span className="si-hydro__act-text">TIFF</span>
              </button>
            </div>
          </div>

          <div className="si-hydro__card is-done si-wellsite__sites">
            <div className="si-wellsite__sites-head">
              <span className="si-wellsite__sites-title">
                <i className="fa-solid fa-location-dot" aria-hidden /> Recommended sites
              </span>
              <span className="si-wellsite__sites-hint" title="Added to the Layers panel with full attribute table">
                <i className="fa-solid fa-layer-group" aria-hidden /> In Layers
              </span>
            </div>

            <ol className="si-wellsite__list">
              {points.map(p => (
                <li key={p.rank} className="si-wellsite__item">
                  <span className="si-wellsite__rank">{p.rank}</span>
                  <span className="si-wellsite__item-name">Well site {p.rank}</span>
                  <span
                    className="si-wellsite__item-score"
                    title={`Suitability ${p.score}%`}
                    aria-label={`Suitability ${p.score} percent`}
                  >
                    <span
                      className="si-wellsite__score-bar"
                      style={{ width: `${p.score}%` }}
                      aria-hidden
                    />
                    <span className="si-wellsite__score-num">{p.score}%</span>
                  </span>
                  <button
                    type="button"
                    className="si-hydro__act"
                    onClick={() => onZoomToPoint(p)}
                    title={`Zoom to site ${p.rank}`}
                    aria-label={`Zoom to site ${p.rank}`}
                  >
                    <i className="fa-solid fa-magnifying-glass-location" aria-hidden />
                  </button>
                </li>
              ))}
            </ol>

            <div className="si-wellsite__final-rec" role="note">
              <div className="si-wellsite__final-rec-title">
                <i className="fa-solid fa-scale-balanced" aria-hidden /> Final recommendation
              </div>
              <p className="si-wellsite__final-rec-text">
                The system does not claim water is present with 100% certainty. Based on terrain, DEM,
                slope, aquifer type, and hydrological indicators, these sites have the highest success
                probability.
              </p>
              <p className="si-wellsite__final-rec-pre">Before drilling, prefer:</p>
              <ul className="si-wellsite__final-rec-list">
                <li>Electrical Resistivity Survey (ERT)</li>
                <li>Pump Test</li>
                <li>Field geological study</li>
              </ul>
            </div>

            <div className="si-hydro__actions">
              <button
                type="button"
                className="si-hydro__act"
                onClick={onExportGeoJson}
                title="Export recommended points — GeoJSON"
              >
                <i className="fa-solid fa-file-code" aria-hidden />
                <span className="si-hydro__act-text">GeoJSON</span>
              </button>
              <button
                type="button"
                className="si-hydro__act"
                onClick={onExportCsv}
                title="Export recommended wells — CSV (all attributes + coordinates)"
              >
                <i className="fa-solid fa-file-csv" aria-hidden />
                <span className="si-hydro__act-text">CSV</span>
              </button>
              <button
                type="button"
                className="si-hydro__act"
                onClick={onExportXlsx}
                title="Export Excel — wells + statistical analysis sheet"
              >
                <i className="fa-solid fa-file-excel" aria-hidden />
                <span className="si-hydro__act-text">Excel</span>
              </button>
              {onExportReport ? (
                <button
                  type="button"
                  className="si-hydro__act"
                  onClick={onExportReport}
                  disabled={exportReportBusy}
                  title="Export professional Word report — cover, TOC, summary, charts, tables, maps"
                >
                  {exportReportBusy ? (
                    <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                  ) : (
                    <i className="fa-solid fa-file-word" aria-hidden />
                  )}
                  <span className="si-hydro__act-text">DOC</span>
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default WellSiteRecommendationPanel
