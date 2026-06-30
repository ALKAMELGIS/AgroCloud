import { TREE_IMAGERY_PROVIDERS, type TreeImageryProviderId } from '../../../lib/treeDetection/webMercatorTiles'
import type { TreeAnalysisMode, TreeDetectionResult } from '../../../lib/treeDetection/treeDetectionEngine'
import type { TreeDetectionPhase } from './useTreeDetection'
import './TreeDetectionsPanel.css'

type AnalysisModeOption = {
  id: TreeAnalysisMode
  title: string
}

const ANALYSIS_MODES: AnalysisModeOption[] = [
  { id: 'detect', title: 'Tree Detection Only' },
  { id: 'detect-classify', title: 'Detection + Species Classification' },
]

type TreeDetectionsPanelProps = {
  provider: TreeImageryProviderId
  onProviderChange: (id: TreeImageryProviderId) => void
  analysisMode: TreeAnalysisMode
  onAnalysisModeChange: (mode: TreeAnalysisMode) => void
  hasAoi: boolean
  phase: TreeDetectionPhase
  busy: boolean
  error: string | null
  /** Non-blocking info note (e.g. on-device fallback in use). */
  notice?: string | null
  result: TreeDetectionResult | null
  overlayVisible: boolean
  onToggleOverlay: (visible: boolean) => void
  /** Minimum YOLO confidence (0..1) used to filter the detected trees on the map. */
  confidenceMin: number
  onConfidenceChange: (value: number) => void
  /** Trees passing the current confidence filter (≤ result.stats.total). */
  visibleCount: number
  onRunDetection: () => void
  onExport: () => void
  onExportShapefile: () => void
  onZoomToLayer: () => void
}

const PHASE_LABEL: Record<TreeDetectionPhase, string> = {
  idle: 'Waiting for AOI',
  fetching: 'Loading imagery…',
  analyzing: 'Detecting tree crowns…',
  done: 'Detection complete',
  error: 'Detection failed',
}

export function TreeDetectionsPanel({
  provider,
  onProviderChange,
  analysisMode,
  onAnalysisModeChange,
  hasAoi,
  phase,
  busy,
  error,
  notice,
  result,
  overlayVisible,
  onToggleOverlay,
  confidenceMin,
  onConfidenceChange,
  visibleCount,
  onRunDetection,
  onExport,
  onExportShapefile,
  onZoomToLayer,
}: TreeDetectionsPanelProps) {
  const stats = result?.stats
  const providerEntries = Object.values(TREE_IMAGERY_PROVIDERS)
  const runLabel = analysisMode === 'detect-classify' ? 'Run detection + species' : 'Run detection'

  return (
    <div className="si-tree-detect">
      <section className="si-tree-detect__card">
        <header className="si-tree-detect__card-label">1 · Analysis mode</header>
        <div className="si-tree-detect__modes" role="radiogroup" aria-label="Analysis mode">
          {ANALYSIS_MODES.map(m => {
            const selected = analysisMode === m.id
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`si-tree-detect__mode${selected ? ' is-selected' : ''}`}
                onClick={() => onAnalysisModeChange(m.id)}
              >
                <span className="si-tree-detect__mode-radio" aria-hidden />
                <span className="si-tree-detect__mode-body">
                  <span className="si-tree-detect__mode-title">{m.title}</span>
                </span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="si-tree-detect__btn si-tree-detect__btn--primary si-tree-detect__run"
          onClick={onRunDetection}
          disabled={!hasAoi || busy}
        >
          {busy ? (
            <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
          ) : (
            <i className="fa-solid fa-play" aria-hidden />
          )}{' '}
          {busy ? 'Running…' : runLabel}
        </button>
      </section>

      <section className="si-tree-detect__card">
        <header className="si-tree-detect__card-label">2 · Imagery & model</header>
        <label className="si-tree-detect__field">
          <span>Basemap provider</span>
          <select
            value={provider}
            onChange={e => onProviderChange(e.target.value as TreeImageryProviderId)}
            className="si-tree-detect__select"
          >
            {providerEntries.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.corsSafe ? '' : ' (display only)'}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="si-tree-detect__status" data-phase={phase}>
        <span className="si-tree-detect__status-dot" />
        <span className="si-tree-detect__status-text">
          {busy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> : null} {PHASE_LABEL[phase]}
        </span>
        {!busy && phase === 'done' ? (
          <button type="button" className="si-tree-detect__chip-btn" onClick={onRunDetection} title="Re-run detection">
            <i className="fa-solid fa-rotate" aria-hidden /> Re-run
          </button>
        ) : null}
      </section>

      {error ? (
        <p className="si-tree-detect__error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {error}
        </p>
      ) : null}

      {!error && notice ? (
        <p className="si-tree-detect__notice">
          <i className="fa-solid fa-circle-info" aria-hidden /> {notice}
        </p>
      ) : null}

      {stats ? (
        <section className="si-tree-detect__results">
          <div className="si-tree-detect__metric-grid">
            <div className="si-tree-detect__metric">
              <span>Trees detected</span>
              <strong>
                {visibleCount.toLocaleString('en-US')}
                {visibleCount !== stats.total ? (
                  <small> / {stats.total.toLocaleString('en-US')}</small>
                ) : null}
              </strong>
            </div>
            <div className="si-tree-detect__metric">
              <span>Density</span>
              <strong>
                {stats.densityPerHa}
                <small> /ha</small>
              </strong>
            </div>
            <div className="si-tree-detect__metric">
              <span>Canopy cover</span>
              <strong>
                {stats.canopyCoverPct}
                <small>%</small>
              </strong>
            </div>
            <div className="si-tree-detect__metric">
              <span>Avg crown</span>
              <strong>
                {stats.meanCrownDiameterM}
                <small> m</small>
              </strong>
            </div>
          </div>

          <div className="si-tree-detect__legend">
            <header className="si-tree-detect__card-label">Crown size classes</header>
            {stats.byClass.map(row => (
              <div key={row.id} className="si-tree-detect__legend-row">
                <span className="si-tree-detect__legend-swatch" style={{ background: row.color }} aria-hidden />
                <span className="si-tree-detect__legend-label">{row.label}</span>
                <span className="si-tree-detect__legend-count">{row.count.toLocaleString('en-US')}</span>
                <span className="si-tree-detect__legend-bar">
                  <span
                    style={{
                      width: `${Math.max(4, (row.count / Math.max(1, stats.total)) * 100)}%`,
                      background: row.color,
                    }}
                  />
                </span>
              </div>
            ))}
          </div>

          {stats.bySpecies && stats.bySpecies.length ? (
            <div className="si-tree-detect__legend">
              <header className="si-tree-detect__card-label">Tree species</header>
              {stats.bySpecies.map(row => (
                <div key={row.id} className="si-tree-detect__legend-row">
                  <span className="si-tree-detect__legend-swatch" style={{ background: row.color }} aria-hidden />
                  <span className="si-tree-detect__legend-label">{row.label}</span>
                  <span className="si-tree-detect__legend-count">{row.count.toLocaleString('en-US')}</span>
                  <span className="si-tree-detect__legend-bar">
                    <span
                      style={{
                        width: `${Math.max(4, (row.count / Math.max(1, stats.total)) * 100)}%`,
                        background: row.color,
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="si-tree-detect__filter">
            <div className="si-tree-detect__filter-head">
              <span>Confidence filter</span>
              <strong>≥ {Math.round(confidenceMin * 100)}%</strong>
            </div>
            <input
              type="range"
              min={0}
              max={0.95}
              step={0.05}
              value={confidenceMin}
              onChange={e => onConfidenceChange(Number(e.target.value))}
              className="si-tree-detect__range"
              aria-label="Minimum detection confidence"
            />
          </div>

          <div className="si-tree-detect__meta">
            AOI {stats.aoiAreaHa} ha · imagery z{stats.zoom} · {stats.metersPerPixel} m/px · {stats.tilesLoaded} tiles ·{' '}
            {TREE_IMAGERY_PROVIDERS[stats.provider]?.label ?? stats.provider}
          </div>

          <div className="si-tree-detect__result-actions">
            <label className="si-tree-detect__toggle">
              <input type="checkbox" checked={overlayVisible} onChange={e => onToggleOverlay(e.target.checked)} />
              <span>Show overlay on map</span>
            </label>
            <button
              type="button"
              className="si-tree-detect__btn"
              onClick={onZoomToLayer}
              disabled={!visibleCount}
              title="Zoom map to detected trees"
            >
              <i className="fa-solid fa-magnifying-glass-location" aria-hidden /> Zoom to layer
            </button>
          </div>

          <div className="si-tree-detect__export-actions">
            <button type="button" className="si-tree-detect__btn" onClick={onExport} disabled={!visibleCount}>
              <i className="fa-solid fa-download" aria-hidden /> GeoJSON
            </button>
            <button type="button" className="si-tree-detect__btn" onClick={onExportShapefile} disabled={!visibleCount}>
              <i className="fa-solid fa-file-zipper" aria-hidden /> Shapefile
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
