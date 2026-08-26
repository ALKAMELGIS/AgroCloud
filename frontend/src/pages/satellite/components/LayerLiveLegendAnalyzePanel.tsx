import {
  formatLegendStatValue,
  formatLowPct,
  type LayerLegendAnalyzeStats,
} from './layerLegendAnalyzeStats'

type LayerLiveLegendAnalyzePanelProps = {
  stats: LayerLegendAnalyzeStats
  locationLabel: string
  loading?: boolean
  hasAoi?: boolean
  hasData?: boolean
}

const STAT_ICONS = {
  min: 'fa-seedling',
  max: 'fa-arrow-trend-up',
  low: 'fa-bullseye',
  avg: 'fa-chart-column',
} as const

function ScoreGauge({
  score,
  accentColor,
  loading,
}: {
  score: number | null
  accentColor: string | null
  loading?: boolean
}) {
  const pct = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
  const accent = accentColor ?? '#84cc16'
  return (
    <div
      className="si-lll-analyze-gauge"
      style={{
        ['--si-lll-gauge-pct' as string]: `${pct}%`,
        ['--si-lll-gauge-accent' as string]: accent,
      }}
      aria-hidden
    >
      <div className="si-lll-analyze-gauge__ring" />
      <div className="si-lll-analyze-gauge__inner">
        <strong>{loading ? '…' : score != null ? Math.round(score) : '—'}</strong>
      </div>
    </div>
  )
}

function statValue(
  loading: boolean | undefined,
  hasData: boolean,
  formatter: () => string,
): string {
  if (loading) return '…'
  if (!hasData) return '—'
  return formatter()
}

export function LayerLiveLegendAnalyzePanel({
  stats,
  locationLabel,
  loading,
  hasAoi = true,
  hasData = false,
}: LayerLiveLegendAnalyzePanelProps) {
  const { config } = stats
  const levelColor = stats.territoryLevelColor ?? '#84cc16'
  const showInsight = hasAoi && hasData && stats.insight && !loading
  const showScore = hasData && stats.healthScore != null

  return (
    <section
      className="si-lll-analyze-panel"
      aria-label={`${config.title} analysis score`}
    >
      <div className="si-lll-analyze-panel__hero">
        <div className="si-lll-analyze-panel__hero-copy">
          <span className="si-lll-analyze-panel__kicker">Health Score</span>
          <h4 className="si-lll-analyze-panel__title">{config.healthLabel} Level</h4>
          <p className="si-lll-analyze-panel__location">
            <i className="fa-solid fa-location-dot" aria-hidden />
            {locationLabel}
          </p>
        </div>
        <ScoreGauge
          score={showScore ? stats.healthScore : null}
          accentColor={hasData ? levelColor : '#64748b'}
          loading={loading && !hasData}
        />
      </div>

      <div className="si-lll-analyze-panel__stats" role="list">
        <div className="si-lll-analyze-stat" role="listitem">
          <i className={`fa-solid ${STAT_ICONS.min} si-lll-analyze-stat__icon`} aria-hidden />
          <span className="si-lll-analyze-stat__label">MIN</span>
          <strong>{statValue(loading, hasData, () => formatLegendStatValue(stats.min))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem">
          <i className={`fa-solid ${STAT_ICONS.max} si-lll-analyze-stat__icon`} aria-hidden />
          <span className="si-lll-analyze-stat__label">MAX</span>
          <strong>{statValue(loading, hasData, () => formatLegendStatValue(stats.max))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem">
          <i className={`fa-solid ${STAT_ICONS.low} si-lll-analyze-stat__icon`} aria-hidden />
          <span className="si-lll-analyze-stat__label">LOW</span>
          <strong>{statValue(loading, hasData, () => formatLowPct(stats.lowPct))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem">
          <i className={`fa-solid ${STAT_ICONS.avg} si-lll-analyze-stat__icon`} aria-hidden />
          <span className="si-lll-analyze-stat__label">AVERAGE</span>
          <strong>{statValue(loading, hasData, () => formatLegendStatValue(stats.average))}</strong>
        </div>
      </div>

      {showInsight ? (
        <p className="si-lll-analyze-panel__insight">
          <i className="fa-solid fa-triangle-exclamation" aria-hidden />
          {stats.insight}
        </p>
      ) : null}
    </section>
  )
}
