import { useMemo, useState } from 'react'
import {
  vegetationDonutFromRows,
  vegetationDonutTrendFromRows,
  type AcpFieldTableRow,
} from '../acpMapSpatial'
import { useAcpPlatform } from '../acpPlatformContext'

const ALL_FIELDS_KEY = '__all__'

type Props = {
  distributionRows: AcpFieldTableRow[]
  viewportScopeActive?: boolean
}

function formatPortfolioPct(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return '0%'
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1)}%`
}

function TrendIndicator({
  delta,
  direction,
}: {
  delta: number | null
  direction: 'up' | 'down' | 'flat' | null
}) {
  if (direction == null) return null
  const icon =
    direction === 'up'
      ? 'fa-solid fa-arrow-trend-up'
      : direction === 'down'
        ? 'fa-solid fa-arrow-trend-down'
        : 'fa-solid fa-minus'
  const label =
    delta != null && Number.isFinite(delta) && Math.abs(delta) >= 0.5
      ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`
      : direction === 'flat'
        ? 'Stable'
        : null

  return (
    <span
      className={`acp-analytics__trend acp-analytics__trend--${direction}`}
      title={
        delta != null && Number.isFinite(delta)
          ? `Planted area ${delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'unchanged'} vs previous NDVI scene`
          : 'Compared to previous NDVI scene'
      }
    >
      <i className={icon} aria-hidden />
      {label ? <span>{label}</span> : null}
    </span>
  )
}

export function AcpAnalyticsPanel({ distributionRows, viewportScopeActive = false }: Props) {
  const acp = useAcpPlatform()
  const [tab, setTab] = useState<'vegetation' | 'alerts'>('vegetation')
  const [fieldFilter, setFieldFilter] = useState(ALL_FIELDS_KEY)

  const fieldOptions = useMemo(
    () =>
      [...distributionRows]
        .filter(r => r.areaHa > 0)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })),
    [distributionRows],
  )

  const scopedRows = useMemo(() => {
    if (fieldFilter === ALL_FIELDS_KEY) return distributionRows
    const hit = distributionRows.find(r => r.fieldKey === fieldFilter)
    return hit ? [hit] : []
  }, [distributionRows, fieldFilter])

  const stats = useMemo(() => vegetationDonutFromRows(scopedRows), [scopedRows])
  const trend = useMemo(() => vegetationDonutTrendFromRows(scopedRows), [scopedRows])

  const alertCounts = useMemo(() => {
    return {
      critical: distributionRows.filter(r => r.severity === 'critical').length,
      high: distributionRows.filter(r => r.severity === 'high').length,
      warning: distributionRows.filter(r => r.severity === 'warning').length,
      normal: distributionRows.filter(r => r.severity === 'normal').length,
    }
  }, [distributionRows])

  const alertTotal = alertCounts.critical + alertCounts.high + alertCounts.warning + alertCounts.normal
  const alertPct = (n: number) => (alertTotal > 0 ? Math.round((n / alertTotal) * 100) : 0)
  const showUnanalyzed = stats.unanalyzedHa > 0.01 && fieldFilter === ALL_FIELDS_KEY
  const ringPlantedPct = stats.plantedSharePct
  const ringUnplantedPct = stats.unplantedSharePct
  const selectedFieldLabel =
    fieldFilter === ALL_FIELDS_KEY
      ? 'All fields'
      : fieldOptions.find(r => r.fieldKey === fieldFilter)?.displayName ?? 'Field'

  return (
    <section className="acp-analytics">
      <h2 className="acp-analytics__title">Distribution</h2>

      <div className="acp-pill-tabs acp-pill-tabs--dist" role="tablist">
        <button
          type="button"
          role="tab"
          className={tab === 'vegetation' ? 'is-on' : ''}
          aria-selected={tab === 'vegetation'}
          onClick={() => setTab('vegetation')}
        >
          Vegetation Coverage
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'alerts' ? 'is-on' : ''}
          aria-selected={tab === 'alerts'}
          onClick={() => setTab('alerts')}
        >
          Alert Distribution
        </button>
      </div>

      {tab === 'vegetation' ? (
        <label className="acp-analytics__field-select">
          <span className="acp-analytics__field-select-label">Field</span>
          <select
            value={fieldFilter}
            onChange={e => setFieldFilter(e.target.value)}
            aria-label="Select field for vegetation coverage"
          >
            <option value={ALL_FIELDS_KEY}>All fields</option>
            {fieldOptions.map(row => (
              <option key={row.fieldKey} value={row.fieldKey}>
                {row.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <p className="acp-analytics__scope">
        {acp.analysisDate} · {stats.totalFieldCount} total fields · {stats.totalAreaHa.toFixed(0)} ha · NDVI
        Live
        {viewportScopeActive ? ' · map view' : ''}
        {fieldFilter !== ALL_FIELDS_KEY ? ` · ${selectedFieldLabel}` : ''}
        {stats.analyzedFieldCount > 0 && stats.analyzedFieldCount < stats.totalFieldCount
          ? ` · ${stats.analyzedFieldCount} analyzed`
          : ''}
      </p>

      {tab === 'vegetation' ? (
        <div className="acp-analytics__donut-wrap">
          <div className="acp-analytics__donut" aria-hidden>
            <div
              className="acp-analytics__donut-ring"
              style={{
                ['--veg-pct' as string]: ringPlantedPct,
                ['--bare-pct' as string]: ringUnplantedPct,
              }}
            >
              <div className="acp-analytics__donut-hole">
                <span className="acp-analytics__donut-pct">{formatPortfolioPct(ringPlantedPct)}</span>
                <small>Planted</small>
              </div>
            </div>
          </div>
          <div className="acp-analytics__legend-wrap">
            <TrendIndicator delta={trend.plantedShareDelta} direction={trend.direction} />
            <ul className="acp-analytics__legend">
              <li>
                <i className="acp-analytics__swatch acp-analytics__swatch--veg" aria-hidden />
                <span>
                  Planted <strong>{formatPortfolioPct(ringPlantedPct)}</strong>
                  <small className="acp-analytics__legend-sub">{stats.vegetationHa.toFixed(2)} ha</small>
                </span>
              </li>
              <li>
                <i className="acp-analytics__swatch acp-analytics__swatch--bare" aria-hidden />
                <span>
                  Unplanted <strong>{formatPortfolioPct(ringUnplantedPct)}</strong>
                  <small className="acp-analytics__legend-sub">{stats.bareHa.toFixed(2)} ha</small>
                </span>
              </li>
              {showUnanalyzed ? (
                <li>
                  <i className="acp-analytics__swatch acp-analytics__swatch--unanalyzed" aria-hidden />
                  <span>
                    Unanalyzed <strong>{formatPortfolioPct(stats.unanalyzedPct)}</strong>
                    <small className="acp-analytics__legend-sub">{stats.unanalyzedHa.toFixed(2)} ha</small>
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : (
        <div className="acp-analytics__alert-dist">
          <div className="acp-analytics__donut" aria-hidden>
            <div
              className="acp-analytics__donut-ring acp-analytics__donut-ring--alerts"
              style={{
                ['--p1' as string]: alertPct(alertCounts.critical),
                ['--p2' as string]: alertPct(alertCounts.critical) + alertPct(alertCounts.high),
                ['--p3' as string]:
                  alertPct(alertCounts.critical) + alertPct(alertCounts.high) + alertPct(alertCounts.warning),
              }}
            >
              <div className="acp-analytics__donut-hole">
                <span className="acp-analytics__donut-pct">
                  {alertCounts.critical + alertCounts.high + alertCounts.warning}
                </span>
                <small>Alerts</small>
              </div>
            </div>
          </div>
          <ul className="acp-analytics__legend">
            <li>
              <i className="acp-analytics__swatch acp-analytics__swatch--critical" aria-hidden />
              <span>
                Critical <strong>{alertPct(alertCounts.critical)}%</strong>
                <small className="acp-analytics__legend-sub">{alertCounts.critical}</small>
              </span>
            </li>
            <li>
              <i className="acp-analytics__swatch acp-analytics__swatch--high" aria-hidden />
              <span>
                High <strong>{alertPct(alertCounts.high)}%</strong>
                <small className="acp-analytics__legend-sub">{alertCounts.high}</small>
              </span>
            </li>
            <li>
              <i className="acp-analytics__swatch acp-analytics__swatch--warning" aria-hidden />
              <span>
                Warning <strong>{alertPct(alertCounts.warning)}%</strong>
                <small className="acp-analytics__legend-sub">{alertCounts.warning}</small>
              </span>
            </li>
          </ul>
        </div>
      )}

      <button
        type="button"
        className={`acp-analytics__hint${viewportScopeActive ? ' is-on' : ''}`}
        onClick={() => acp.setScopeMode('viewport')}
      >
        <i className="fa-solid fa-hand-pointer" aria-hidden /> Sync table to map view
      </button>
    </section>
  )
}
