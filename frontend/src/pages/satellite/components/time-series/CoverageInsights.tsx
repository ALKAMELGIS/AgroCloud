import type { VegetationCoverageInsights } from '../../../../lib/vegetationCoverageEngine'

export type CoverageInsightsProps = {
  insights: VegetationCoverageInsights
}

export function CoverageInsights({ insights }: CoverageInsightsProps) {
  return (
    <div className="acp-ts__coverage-insights">
      <div className="acp-ts__coverage-insight-block">
        <h4 className="acp-ts__coverage-section-title">
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true" /> AI Interpretation
        </h4>
        <ul className="acp-ts__coverage-narrative">
          {insights.narrative.map(line => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      {insights.recommendations.length ? (
        <div className="acp-ts__coverage-insight-block">
          <h4 className="acp-ts__coverage-section-title">
            <i className="fa-solid fa-list-check" aria-hidden="true" /> Recommendations
          </h4>
          <ul className="acp-ts__coverage-recs">
            {insights.recommendations.map(rec => (
              <li key={rec}>{rec}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
