import { computeLayerStatistics } from '../../lib/timeSeriesReport/buildTimeSeriesReportPayload'
import type { ImageryTimeSeriesLayerSeries } from '../../../dashboards/agroCloudPlatform/acpImageryTimeSeries'

export type SiImageryStatisticsTabProps = {
  layerSeries: ImageryTimeSeriesLayerSeries[]
  labels: string[]
}

function fmt(v: number | null, digits = 3): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toFixed(digits)
}

export function SiImageryStatisticsTab({ layerSeries, labels }: SiImageryStatisticsTabProps) {
  if (!labels.length || !layerSeries.length) {
    return (
      <div className="acp-ts__stats acp-ts__stats--empty" role="status">
        Run analysis to view layer statistics.
      </div>
    )
  }

  const stats = layerSeries.map(s => computeLayerStatistics(s.layerId, s.values))

  return (
    <div className="acp-ts__stats">
      <h4 className="acp-ts__coverage-section-title">Layer Statistics</h4>
      <p className="acp-ts__stats-meta">
        {labels.length} observations · {labels[0]} → {labels[labels.length - 1]}
      </p>
      <table className="acp-ts__coverage-table">
        <thead>
          <tr>
            <th scope="col">Layer</th>
            <th scope="col">Mean</th>
            <th scope="col">Min</th>
            <th scope="col">Max</th>
            <th scope="col">Std Dev</th>
            <th scope="col">Trend</th>
            <th scope="col">Obs</th>
          </tr>
        </thead>
        <tbody>
          {stats.map(row => (
            <tr key={row.layerId}>
              <td>
                <strong>{row.layerId}</strong>
              </td>
              <td>{fmt(row.mean)}</td>
              <td>{fmt(row.min)}</td>
              <td>{fmt(row.max)}</td>
              <td>{fmt(row.stdDev)}</td>
              <td>
                <span className={`acp-ts__stats-trend acp-ts__stats-trend--${row.trend.toLowerCase()}`}>
                  {row.trend}
                </span>
              </td>
              <td>{row.observationCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
