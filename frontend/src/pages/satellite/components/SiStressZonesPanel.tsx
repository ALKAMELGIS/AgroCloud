import type { StressZoneAreaRow, StressZoneSceneResult, StressZoneTimeSeriesPoint } from '../../../lib/siStressZonesLive'
import { STRESS_ZONE_COLORS, STRESS_ZONE_LABELS } from '../../../lib/siStressZonesMapping'
import './SiStressZonesPanel.css'

export type SiStressZonesPanelProps = {
  fieldName: string
  sceneDate: string
  loading: boolean
  error: string | null
  result: StressZoneSceneResult | null
  timeSeries: StressZoneTimeSeriesPoint[]
  showOnMap: boolean
  compareEnabled: boolean
  onShowOnMapChange: (v: boolean) => void
  onCompareEnabledChange: (v: boolean) => void
  onRefresh: () => void
  onZoneClick?: (zone: StressZoneAreaRow) => void
}

function fmt(n: number | null | undefined, digits = 3): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits)
}

export function SiStressZonesPanel({
  fieldName,
  sceneDate,
  loading,
  error,
  result,
  timeSeries,
  showOnMap,
  compareEnabled,
  onShowOnMapChange,
  onCompareEnabledChange,
  onRefresh,
  onZoneClick,
}: SiStressZonesPanelProps) {
  const dominant = result?.zones.reduce(
    (best, z) => (z.pct > (best?.pct ?? 0) ? z : best),
    null as StressZoneAreaRow | null,
  )

  return (
    <div className="si-stress-zones">
      <header className="si-stress-zones__head">
        <div>
          <h3 className="si-stress-zones__title">Stress Zones Detection</h3>
          <p className="si-stress-zones__sub">
            {fieldName} · Scene {sceneDate}
          </p>
        </div>
        <button type="button" className="si-stress-zones__refresh" disabled={loading} onClick={() => void onRefresh()}>
          <i className={'fa-solid ' + (loading ? 'fa-spinner fa-spin' : 'fa-rotate')} aria-hidden="true" />
          {loading ? 'Analyzing…' : 'Run'}
        </button>
      </header>

      <p className="si-stress-zones__formula">
        CHAS = 0.4·NDVI + 0.25·NDMI + 0.2·SAVI + 0.15·NDWI · Stress Score = 1 − CHAS
      </p>

      <div className="si-stress-zones__toggles">
        <label className="si-stress-zones__toggle">
          <input type="checkbox" checked={showOnMap} onChange={e => onShowOnMapChange(e.target.checked)} />
          Show stress zones on map
        </label>
        <label className="si-stress-zones__toggle">
          <input type="checkbox" checked={compareEnabled} onChange={e => onCompareEnabledChange(e.target.checked)} />
          Time series comparison
        </label>
      </div>

      {error ? <p className="si-stress-zones__error" role="alert">{error}</p> : null}

      {result ? (
        <>
          <div className="si-stress-zones__kpis">
            <div className="si-stress-zones__kpi">
              <span>CHAS</span>
              <strong>{fmt(result.chas, 4)}</strong>
            </div>
            <div className="si-stress-zones__kpi">
              <span>Stress Score</span>
              <strong>{fmt(result.stressScore, 4)}</strong>
            </div>
            <div className="si-stress-zones__kpi">
              <span>Dominant</span>
              <strong style={{ color: dominant?.color ?? STRESS_ZONE_COLORS.healthy }}>
                {dominant ? STRESS_ZONE_LABELS[dominant.tier] : '—'}
              </strong>
            </div>
          </div>

          <div className="si-stress-zones__indices">
            <span>NDVI {fmt(result.indices.ndvi, 4)}</span>
            <span>NDMI {fmt(result.indices.ndmi, 4)}</span>
            <span>SAVI {fmt(result.indices.savi, 4)}</span>
            <span>NDWI {fmt(result.indices.ndwi, 4)}</span>
          </div>

          <table className="si-stress-zones__table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Coverage</th>
                <th>Area (ha)</th>
              </tr>
            </thead>
            <tbody>
              {result.zones.map(zone => (
                <tr key={zone.tier} className="si-stress-zones__row" onClick={() => onZoneClick?.(zone)}>
                  <td>
                    <span className="si-stress-zones__swatch" style={{ background: zone.color }} />
                    {zone.label}
                  </td>
                  <td>{zone.pct.toFixed(1)}%</td>
                  <td>{zone.areaHa.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="si-stress-zones__insight">
            <strong>Risk cause</strong>
            <p>{result.riskCause}</p>
            <strong>AI recommendation</strong>
            <p>{result.recommendation}</p>
          </div>

          {compareEnabled && timeSeries.length > 1 ? (
            <div className="si-stress-zones__ts">
              <h4>Stress evolution</h4>
              <div className="si-stress-zones__ts-list">
                {timeSeries
                  .filter(p => p.stressScore != null)
                  .slice(-8)
                  .map(p => (
                    <div key={p.date} className="si-stress-zones__ts-row">
                      <span>{p.date}</span>
                      <span>Stress {fmt(p.stressScore, 3)}</span>
                      <span>NDVI {fmt(p.ndvi, 3)}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </>
      ) : loading ? (
        <p className="si-stress-zones__loading">Computing stress zones from Sentinel-2…</p>
      ) : (
        <p className="si-stress-zones__hint">Draw or select an AOI, then run analysis.</p>
      )}

      <ul className="si-stress-zones__legend" aria-label="Stress zone legend">
        {Object.entries(STRESS_ZONE_LABELS).map(([tier, label]) => (
          <li key={tier}>
            <span style={{ background: STRESS_ZONE_COLORS[tier as keyof typeof STRESS_ZONE_COLORS] }} />
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}
