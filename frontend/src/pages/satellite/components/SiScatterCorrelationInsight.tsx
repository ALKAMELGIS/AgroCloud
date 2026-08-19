import type { ImageryCorrelationScatterAnalysis } from '../../dashboards/agroCloudPlatform/acpImageryTimeSeries'
import { buildCorrelationInterpretation } from '../lib/timeSeriesReport/timeSeriesScatterChartRenderer'

export type SiScatterCorrelationInsightProps = {
  analysis: ImageryCorrelationScatterAnalysis
  onRowDateClick?: (isoDate: string) => void
}

/** Full-width correlation data grid — luxury dark theme, no nested chrome. */
export function SiScatterCorrelationInsight({
  analysis,
  onRowDateClick,
}: SiScatterCorrelationInsightProps) {
  const { regression, relationship, points, xLayerId, yLayerId } = analysis
  const interpret = buildCorrelationInterpretation(analysis)

  return (
    <section className="acp-ts__scatter-insight" aria-label="Correlation analysis data">
      <header className="acp-ts__scatter-stats">
        <div className="acp-ts__scatter-stats-metrics" aria-label="Regression statistics">
          <span className="acp-ts__scatter-stat">
            <em>r</em>
            <strong>{regression.r.toFixed(3)}</strong>
          </span>
          <span className="acp-ts__scatter-stat">
            <em>R²</em>
            <strong>{regression.r2.toFixed(3)}</strong>
          </span>
          <span className="acp-ts__scatter-stat">
            <em>n</em>
            <strong>{regression.n}</strong>
          </span>
        </div>
        <span
          className={[
            'acp-ts__scatter-rel',
            `acp-ts__scatter-rel--${relationship.strength}`,
            relationship.direction !== 'none' ? `acp-ts__scatter-rel--${relationship.direction}` : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={interpret}
        >
          {relationship.label}
        </span>
      </header>

      {points.length ? (
        <div className="acp-ts__scatter-table-wrap">
          <table className="acp-ts__scatter-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">{xLayerId}</th>
                <th scope="col">{yLayerId}</th>
              </tr>
            </thead>
            <tbody>
              {points.map(p => {
                const key = `${p.date}-${p.x}-${p.y}`
                const clickable = Boolean(p.date && onRowDateClick)
                return (
                  <tr
                    key={key}
                    className={clickable ? 'is-clickable' : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    title={clickable ? `Set map date to ${p.date}` : undefined}
                    onClick={
                      clickable
                        ? () => onRowDateClick?.(p.date!)
                        : undefined
                    }
                    onKeyDown={
                      clickable
                        ? e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              onRowDateClick?.(p.date!)
                            }
                          }
                        : undefined
                    }
                  >
                    <td>{p.date || '—'}</td>
                    <td>{p.x.toFixed(4)}</td>
                    <td>{p.y.toFixed(4)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )
}
