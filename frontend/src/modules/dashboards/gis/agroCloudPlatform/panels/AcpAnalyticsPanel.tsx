import { useCallback, useMemo, useState } from 'react'
import {
  listAnalyticsSceneDates,
  resolveFieldNdviMeanForSceneDate,
  vegetationDonutFromRows,
  vegetationDonutTrendForSceneDate,
  type AcpFieldTableRow,
} from '../acpMapSpatial'
import { useAcpPlatform } from '../acpPlatformContext'
import { ACP_ANALYTICS_ALL_FIELDS_KEY, AcpAnalyticsFieldSelect } from './AcpAnalyticsFieldSelect'
import { AcpAnalyticsSceneDateControl } from './AcpAnalyticsSceneDateControl'

type Props = {
  distributionRows: AcpFieldTableRow[]
  /** Distribution stats follow the visible map extent (zoom / pan). */
  distributionMapLinked?: boolean
  /** Fields table is scoped to the map viewport. */
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

export function AcpAnalyticsPanel({
  distributionRows,
  distributionMapLinked = false,
  viewportScopeActive = false,
}: Props) {
  const acp = useAcpPlatform()
  const [tab, setTab] = useState<'vegetation' | 'alerts'>('vegetation')

  const fieldFilter = acp.selectedFieldKey ?? ACP_ANALYTICS_ALL_FIELDS_KEY

  const handleFieldFilterChange = useCallback(
    (fieldKey: string) => {
      if (fieldKey === ACP_ANALYTICS_ALL_FIELDS_KEY) {
        acp.bindMapFieldSelection(null)
        return
      }
      acp.bindMapFieldSelection(fieldKey)
    },
    [acp],
  )

  const fieldOptions = useMemo(() => {
    const base = [...distributionRows]
      .filter(r => r.areaHa > 0)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }))
    if (
      acp.selectedFieldKey &&
      !base.some(row => row.fieldKey === acp.selectedFieldKey)
    ) {
      const selectedRow =
        acp.scopedFieldRows.find(row => row.fieldKey === acp.selectedFieldKey) ??
        distributionRows.find(row => row.fieldKey === acp.selectedFieldKey)
      if (selectedRow) base.unshift(selectedRow)
    }
    return base
  }, [acp.scopedFieldRows, acp.selectedFieldKey, distributionRows])

  const scopedRows = useMemo(() => {
    if (fieldFilter === ACP_ANALYTICS_ALL_FIELDS_KEY) return distributionRows
    const hit =
      distributionRows.find(r => r.fieldKey === fieldFilter) ??
      acp.scopedFieldRows.find(r => r.fieldKey === fieldFilter)
    return hit ? [hit] : []
  }, [acp.scopedFieldRows, distributionRows, fieldFilter])

  const sceneDates = useMemo(
    () => listAnalyticsSceneDates(distributionRows, acp.chartLabels),
    [acp.chartLabels, distributionRows],
  )

  const activeSceneDate = useMemo(() => {
    const want = acp.analysisDate.trim().slice(0, 10)
    if (sceneDates.includes(want)) return want
    return sceneDates[0] ?? want
  }, [acp.analysisDate, sceneDates])

  const handleSceneDateChange = useCallback(
    (next: string) => {
      const iso = next.trim().slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return
      acp.setAutoFollowDate(false)
      acp.setAnalysisDate(iso)
      acp.commitWmsLayer({ startDate: iso, endDate: iso })
      acp.refreshEngine()
    },
    [acp],
  )

  const stats = useMemo(
    () =>
      vegetationDonutFromRows(scopedRows, undefined, row =>
        resolveFieldNdviMeanForSceneDate(row, activeSceneDate),
      ),
    [activeSceneDate, scopedRows],
  )
  const trend = useMemo(
    () => vegetationDonutTrendForSceneDate(scopedRows, activeSceneDate, sceneDates),
    [activeSceneDate, sceneDates, scopedRows],
  )

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
  const showUnanalyzed = stats.unanalyzedHa > 0.01 && fieldFilter === ACP_ANALYTICS_ALL_FIELDS_KEY
  const ringPlantedPct = stats.plantedSharePct
  const ringUnplantedPct = stats.unplantedSharePct
  const selectedFieldLabel =
    fieldFilter === ACP_ANALYTICS_ALL_FIELDS_KEY
      ? 'All fields'
      : fieldOptions.find(r => r.fieldKey === fieldFilter)?.displayName ?? 'Field'

  return (
    <section className="acp-analytics">
      <div className="acp-analytics__head">
        <h2 className="acp-analytics__title">Distribution</h2>
        {tab === 'vegetation' ? (
          <AcpAnalyticsSceneDateControl
            sceneDates={sceneDates}
            sceneDate={activeSceneDate}
            onSceneDateChange={handleSceneDateChange}
            loading={acp.sentinelLoading || acp.engineLoading}
          />
        ) : null}
      </div>

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
        <AcpAnalyticsFieldSelect
          options={fieldOptions}
          value={fieldFilter}
          onChange={handleFieldFilterChange}
          aria-label="Select field for vegetation coverage"
        />
      ) : null}

      <p className="acp-analytics__scope">
        {stats.totalFieldCount} total fields · {stats.totalAreaHa.toFixed(0)} ha · NDVI scene
        {distributionMapLinked ? ' · map view' : ''}
        {fieldFilter !== ACP_ANALYTICS_ALL_FIELDS_KEY ? ` · ${selectedFieldLabel}` : ''}
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
        title={
          distributionMapLinked
            ? 'Distribution follows the map. Click to sync the fields table too.'
            : 'Sync the fields table to the map viewport'
        }
        onClick={() => acp.setScopeMode('viewport')}
      >
        <i className="fa-solid fa-hand-pointer" aria-hidden /> Sync fields table to map view
      </button>
    </section>
  )
}
