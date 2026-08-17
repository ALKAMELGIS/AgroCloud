import { TREE_IMAGERY_PROVIDERS, type TreeImageryProviderId } from '../../../lib/treeDetection/webMercatorTiles'
import type { TreeDetectionResult } from '../../../lib/treeDetection/treeDetectionEngine'
import type { TreeDetectionPhase } from './useTreeDetection'
import {
  FIELD_BOUNDARY_AOI_MODE_OPTIONS,
  type FieldBoundaryAoiLayerOption,
  type FieldBoundaryAoiMode,
} from './AgriFieldBoundaryPanel'
import './TreeDetectionsPanel.css'

const AOI_MODE_HINT: Record<FieldBoundaryAoiMode, string> = {
  draw: 'Draw a polygon on the map (toolbox Draw), or reuse the existing sketch.',
  layers: 'Pick a vector layer added under Layers.',
  viewport: 'Uses the current map extent as the study area.',
  select: 'Use the Select rail tool (rectangle / polygon / lasso) on layer features.',
}

type TreeDetectionsPanelProps = {
  provider: TreeImageryProviderId
  onProviderChange: (id: TreeImageryProviderId) => void
  hasAoi: boolean
  aoiMode?: FieldBoundaryAoiMode
  onAoiModeChange?: (mode: FieldBoundaryAoiMode) => void
  aoiLayerOptions?: FieldBoundaryAoiLayerOption[]
  aoiLayerId?: string
  onAoiLayerIdChange?: (layerId: string) => void
  phase: TreeDetectionPhase
  busy: boolean
  error: string | null
  notice?: string | null
  result: TreeDetectionResult | null
  overlayVisible: boolean
  onToggleOverlay: (visible: boolean) => void
  confidenceMin: number
  onConfidenceChange: (value: number) => void
  visibleCount: number
  onRunDetection: () => void
  onExport: () => void
  onExportShapefile: () => void
  onZoomToLayer: () => void
}

const PHASE_LABEL: Record<TreeDetectionPhase, string> = {
  idle: 'Waiting for AOI',
  fetching: 'Loading imagery…',
  analyzing: 'Extracting trees…',
  done: 'Detection complete',
  error: 'Detection failed',
}

export function TreeDetectionsPanel({
  provider,
  onProviderChange,
  hasAoi,
  aoiMode = 'draw',
  onAoiModeChange,
  aoiLayerOptions = [],
  aoiLayerId = '',
  onAoiLayerIdChange,
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

  return (
    <div className="si-tree-detect">
      <section className="si-tree-detect__card">
        <header className="si-tree-detect__card-label">1 · Select AOI</header>
        <label className="si-tree-detect__field">
          <span>Select AOI</span>
          <select
            className="si-tree-detect__select"
            value={aoiMode}
            disabled={busy || !onAoiModeChange}
            aria-label="Select AOI source"
            title={AOI_MODE_HINT[aoiMode]}
            onChange={e => onAoiModeChange?.(e.target.value as FieldBoundaryAoiMode)}
          >
            {FIELD_BOUNDARY_AOI_MODE_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {aoiMode === 'layers' && onAoiLayerIdChange ? (
          <label className="si-tree-detect__field">
            <span>AOI layer</span>
            <select
              className="si-tree-detect__select"
              value={aoiLayerId}
              disabled={busy || aoiLayerOptions.length === 0}
              aria-label="AOI layer from Layers"
              onChange={e => onAoiLayerIdChange(e.target.value)}
            >
              {aoiLayerOptions.length === 0 ? (
                <option value="">Add a vector layer from Layers</option>
              ) : (
                aoiLayerOptions.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                    {typeof l.featureCount === 'number' && l.featureCount > 0
                      ? ` (${l.featureCount})`
                      : ''}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : null}
        {!hasAoi && onAoiModeChange ? (
          <p className="si-tree-detect__aoi-hint">{AOI_MODE_HINT[aoiMode]}</p>
        ) : null}
      </section>

      <section className="si-tree-detect__card">
        <header className="si-tree-detect__card-label">2 · Imagery</header>
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
        <p className="si-tree-detect__hint">Esri World Imagery → tree points (YOLO when available).</p>
      </section>

      <section className="si-tree-detect__card">
        <header className="si-tree-detect__card-label">3 · Ultralytics YOLO Detection</header>
        <div className="si-tree-detect__model-card" aria-label="Ultralytics YOLO Detection">
          <div className="si-tree-detect__model-icon" aria-hidden>
            <i className="fa-solid fa-crosshairs" />
          </div>
          <div className="si-tree-detect__mode-body">
            <span className="si-tree-detect__mode-title">Ultralytics YOLO Detection</span>
            <span className="si-tree-detect__mode-detail">
              Single class <strong>tree</strong>. Each bounding-box centre becomes a GIS Point (no
              segmentation / crown polygon).
            </span>
          </div>
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
          {busy ? 'Running…' : 'Detect trees'}
        </button>
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
          </div>

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
