import { useMemo } from 'react'
import type { FloodMonitoringResult } from '../../../lib/floodMonitoringPipeline'
import type { FloodPhase } from './useFloodMonitoring'
import './FloodMonitoringPanel.css'

export type FloodLayerKind = 'flood' | 'change' | 'vector'

type FloodMonitoringPanelProps = {
  hasAoi: boolean
  configured: boolean
  configHint: string | null
  phase: FloodPhase
  busy: boolean
  progress: number
  message: string
  error: string | null
  result: FloodMonitoringResult | null
  preDate: string
  postDate: string
  thresholdDb: number
  onPreDateChange: (value: string) => void
  onPostDateChange: (value: string) => void
  onThresholdChange: (value: number) => void
  layerVisible: Record<FloodLayerKind, boolean>
  onToggleLayer: (kind: FloodLayerKind, visible: boolean) => void
  onRun: () => void
  onZoomToLayer: () => void
  onExportGeoJson: () => void
  onExportReport?: () => void
  exportReportBusy?: boolean
  exportReportLabel?: string | null
  onClose: () => void
}

const PHASE_LABEL: Record<FloodPhase, string> = {
  idle: 'Ready — define an event window',
  queued: 'Queued',
  fetching: 'Acquiring Sentinel-1 scenes',
  detecting: 'Running SAR change detection',
  vectorizing: 'Compiling flood layers',
  done: 'Analysis complete',
  error: 'Analysis failed',
}

/** Hand-built SVG donut (no chart lib) for the flood-composition dashboard. */
function FloodDonut({
  data,
  centerValue,
  centerLabel,
}: {
  data: Array<{ name: string; color: string; pct: number }>
  centerValue: string
  centerLabel: string
}) {
  const wedges = useMemo(() => {
    const total = data.reduce((s, d) => s + Math.max(0, d.pct), 0) || 1
    let acc = 0
    const R = 54
    const C = 60
    return data
      .filter(d => d.pct > 0)
      .map(d => {
        const start = (acc / total) * Math.PI * 2
        acc += d.pct
        const end = (acc / total) * Math.PI * 2
        const large = end - start > Math.PI ? 1 : 0
        const x1 = C + R * Math.sin(start)
        const y1 = C - R * Math.cos(start)
        const x2 = C + R * Math.sin(end)
        const y2 = C - R * Math.cos(end)
        return { d: `M${C},${C} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`, color: d.color, name: d.name }
      })
  }, [data])

  return (
    <div className="si-flood__donut">
      <svg viewBox="0 0 120 120" role="img" aria-label="Flood distribution">
        {wedges.length ? (
          wedges.map(w => <path key={w.name} d={w.d} fill={w.color} stroke="rgba(3,8,16,.55)" strokeWidth={0.6} />)
        ) : (
          <circle cx={60} cy={60} r={54} fill="rgba(148,163,184,.18)" />
        )}
        <circle cx={60} cy={60} r={33} className="si-flood__donut-hole" />
      </svg>
      <div className="si-flood__donut-center">
        <strong>{centerValue}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  )
}

export function FloodMonitoringPanel({
  hasAoi,
  configured,
  configHint,
  phase,
  busy,
  progress,
  message,
  error,
  result,
  preDate,
  postDate,
  thresholdDb,
  onPreDateChange,
  onPostDateChange,
  onThresholdChange,
  layerVisible,
  onToggleLayer,
  onRun,
  onZoomToLayer,
  onExportGeoJson,
  onExportReport,
  exportReportBusy = false,
  exportReportLabel = null,
  onClose,
}: FloodMonitoringPanelProps) {
  const stats = result?.stats
  const classStats = result?.classStats ?? []
  const canRun = hasAoi && configured && !!postDate && !busy
  const maxPct = Math.max(1, ...classStats.map(c => c.pct))
  const thresholdPct = Math.round(((thresholdDb - -24) / (-10 - -24)) * 100)

  return (
    <div className="si-flood">
      <header className="si-flood__brand">
        <span className="si-flood__brand-mark">
          <i className="fa-solid fa-house-flood-water" aria-hidden />
        </span>
        <span className="si-flood__brand-text">
          <span className="si-flood__brand-title">SAR Flood Intelligence</span>
          <span className="si-flood__brand-sub">Sentinel-1 · Flood Detection &amp; Report</span>
        </span>
        <button type="button" className="si-flood__close" onClick={onClose} aria-label="Collapse">
          <i className="fa-solid fa-chevron-up" aria-hidden />
        </button>
      </header>

      <section className="si-flood__card">
        <header className="si-flood__step">
          <span className="si-flood__step-no">1</span>
          <span className="si-flood__step-title">Event window</span>
          <span className="si-flood__step-tag">{preDate ? 'Change detection' : 'Single date'}</span>
        </header>
        <div className="si-flood__dates">
          <label className="si-flood__field">
            <span>Pre-event · baseline</span>
            <div className="si-flood__input-wrap">
              <i className="fa-regular fa-calendar" aria-hidden />
              <input
                type="date"
                className="si-flood__input"
                value={preDate}
                max={postDate || undefined}
                onChange={e => onPreDateChange(e.target.value)}
              />
            </div>
          </label>
          <label className="si-flood__field">
            <span>Post-event · flood</span>
            <div className="si-flood__input-wrap">
              <i className="fa-regular fa-calendar-check" aria-hidden />
              <input
                type="date"
                className="si-flood__input"
                value={postDate}
                onChange={e => onPostDateChange(e.target.value)}
              />
            </div>
          </label>
        </div>
      </section>

      <section className="si-flood__card">
        <header className="si-flood__step">
          <span className="si-flood__step-no">2</span>
          <span className="si-flood__step-title">Water sensitivity</span>
          <span className="si-flood__step-value">{thresholdDb} dB</span>
        </header>
        <input
          type="range"
          min={-24}
          max={-10}
          step={0.5}
          value={thresholdDb}
          onChange={e => onThresholdChange(Number(e.target.value))}
          className="si-flood__range"
          style={{ ['--si-flood-fill' as string]: `${thresholdPct}%` }}
          aria-label="Water backscatter threshold (dB)"
        />
        <div className="si-flood__range-scale">
          <span>Conservative</span>
          <span>VV backscatter ≤</span>
          <span>Aggressive</span>
        </div>
        <button type="button" className="si-flood__run" onClick={onRun} disabled={!canRun}>
          {busy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> : <i className="fa-solid fa-play" aria-hidden />}
          <span>{busy ? 'Processing…' : 'Run flood analysis'}</span>
        </button>
        {!hasAoi ? (
          <p className="si-flood__gate">
            <i className="fa-solid fa-draw-polygon" aria-hidden /> Draw an Area of Interest to begin.
          </p>
        ) : null}
        {hasAoi && !configured ? (
          <p className="si-flood__gate">
            <i className="fa-solid fa-key" aria-hidden /> {configHint || 'Sentinel-1 SAR source unavailable.'}
          </p>
        ) : null}
      </section>

      <section className="si-flood__status" data-phase={phase}>
        <span className="si-flood__status-dot" />
        <span className="si-flood__status-text">
          {busy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> : null}
          {PHASE_LABEL[phase]}
        </span>
        {!busy && phase === 'done' ? (
          <button type="button" className="si-flood__rerun" onClick={onRun} title="Re-run analysis">
            <i className="fa-solid fa-rotate" aria-hidden /> Re-run
          </button>
        ) : null}
      </section>

      {busy ? (
        <div className="si-flood__progress" aria-hidden>
          <span style={{ width: `${Math.round(Math.max(6, progress * 100))}%` }} />
        </div>
      ) : null}
      {busy && message ? <p className="si-flood__progress-msg">{message}</p> : null}

      {error ? (
        <p className="si-flood__error">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {error}
        </p>
      ) : null}

      {stats ? (
        <section className="si-flood__results">
          <div className="si-flood__hero">
            <div className="si-flood__hero-main">
              <span className="si-flood__hero-label">Flooded area</span>
              <strong className="si-flood__hero-value">
                {stats.floodedHa.toLocaleString('en-US')}
                <small>ha</small>
              </strong>
            </div>
            <div className="si-flood__hero-aside">
              <span className="si-flood__hero-pct">{stats.pctInundated}%</span>
              <span className="si-flood__hero-pct-label">of AOI inundated</span>
            </div>
          </div>

          <div className="si-flood__metric-grid">
            <div className="si-flood__metric">
              <span>Post-event water</span>
              <strong>
                {stats.postWaterHa.toLocaleString('en-US')}
                <small>ha</small>
              </strong>
            </div>
            <div className="si-flood__metric">
              <span>Pre-event water</span>
              <strong>
                {stats.preWaterHa.toLocaleString('en-US')}
                <small>ha</small>
              </strong>
            </div>
          </div>

          <div className="si-flood__panel">
            <header className="si-flood__panel-label">Surface composition</header>
            <div className="si-flood__chart">
              <FloodDonut data={classStats} centerValue={`${stats.pctInundated}%`} centerLabel="flood" />
              <div className="si-flood__legend">
                {classStats.map(row => (
                  <div key={row.name} className="si-flood__legend-row">
                    <span className="si-flood__legend-swatch" style={{ background: row.color }} aria-hidden />
                    <span className="si-flood__legend-label">{row.name}</span>
                    <span className="si-flood__legend-count">{row.pct}%</span>
                    <span className="si-flood__legend-bar">
                      <span style={{ width: `${Math.max(3, (row.pct / maxPct) * 100)}%`, background: row.color }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="si-flood__meta">
            <span className="si-flood__meta-chip">
              <i className="fa-regular fa-clock" aria-hidden />
              {stats.mode === 'change-detection' ? `${stats.preDate} → ${stats.postDate}` : `${stats.postDate} · single date`}
            </span>
            <span className="si-flood__meta-chip">VV ≤ {stats.thresholdDb} dB</span>
            <span className="si-flood__meta-chip">{stats.resolution}</span>
          </div>

          <div className="si-flood__panel">
            <header className="si-flood__panel-label">Output layers</header>
            <label className="si-flood__toggle">
              <span className="si-flood__toggle-dot" style={{ background: '#2563eb' }} />
              <span className="si-flood__toggle-name">Flood extent · raster</span>
              <input type="checkbox" checked={layerVisible.flood} onChange={e => onToggleLayer('flood', e.target.checked)} />
              <span className="si-flood__switch" aria-hidden />
            </label>
            <label className="si-flood__toggle">
              <span className="si-flood__toggle-dot" style={{ background: '#38bdf8' }} />
              <span className="si-flood__toggle-name">Flood boundaries · vector</span>
              <input type="checkbox" checked={layerVisible.vector} onChange={e => onToggleLayer('vector', e.target.checked)} />
              <span className="si-flood__switch" aria-hidden />
            </label>
            <label className="si-flood__toggle">
              <span className="si-flood__toggle-dot" style={{ background: '#ef4444' }} />
              <span className="si-flood__toggle-name">Change detection · raster</span>
              <input type="checkbox" checked={layerVisible.change} onChange={e => onToggleLayer('change', e.target.checked)} />
              <span className="si-flood__switch" aria-hidden />
            </label>
          </div>

          <div className="si-flood__result-actions">
            <button type="button" className="si-flood__action" onClick={onZoomToLayer} title="Zoom to flood extent">
              <i className="fa-solid fa-magnifying-glass-location" aria-hidden /> Zoom to layer
            </button>
            <button type="button" className="si-flood__action" onClick={onExportGeoJson} title="Export flood boundaries">
              <i className="fa-solid fa-download" aria-hidden /> Export GeoJSON
            </button>
            {onExportReport ? (
              <button
                type="button"
                className="si-flood__action si-flood__action--report"
                onClick={onExportReport}
                disabled={exportReportBusy}
                title="Export SAR Flood Intelligence Report (Word + Excel)"
              >
                {exportReportBusy ? (
                  <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                ) : (
                  <i className="fa-solid fa-file-word" aria-hidden />
                )}
                {exportReportBusy ? exportReportLabel || 'Exporting…' : 'Export Flood Report'}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
