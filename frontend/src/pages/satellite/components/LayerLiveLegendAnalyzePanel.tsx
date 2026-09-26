import type { AnalyzeTerritoryLevel } from './layerLegendAnalyzeIndexConfig'
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

function resolveHealthMood(level: AnalyzeTerritoryLevel | null): {
  emoji: string
  mod: string
  ariaLabel: string
} {
  switch (level) {
    case 'Healthy':
      return { emoji: '😊', mod: 'healthy', ariaLabel: 'Healthy condition' }
    case 'Moderate':
      return { emoji: '😐', mod: 'moderate', ariaLabel: 'Moderate condition' }
    case 'Warning':
      return { emoji: '😟', mod: 'warning', ariaLabel: 'Stressed condition' }
    case 'Critical':
      return { emoji: '😰', mod: 'critical', ariaLabel: 'Critical condition' }
    default:
      return { emoji: '·', mod: 'unknown', ariaLabel: 'Condition unknown' }
  }
}

function ScoreGauge({
  score,
  accentColor,
  loading,
  ariaLabel,
}: {
  score: number | null
  accentColor: string | null
  loading?: boolean
  ariaLabel?: string
}) {
  const pct = score != null && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0
  const accent = accentColor ?? '#84cc16'
  const gaugeStyle = {
    ['--si-lll-gauge-pct' as string]: `${pct}%`,
    ['--si-lll-gauge-accent' as string]: accent,
  }
  return (
    <div className="si-lll-analyze-gauge-column" style={gaugeStyle}>
      <div
        className="si-lll-analyze-gauge"
        style={gaugeStyle}
        aria-hidden={!ariaLabel}
        aria-label={ariaLabel}
      >
        <div className="si-lll-analyze-gauge__ring" />
        <div className="si-lll-analyze-gauge__inner">
          <strong>{loading ? '…' : score != null ? Math.round(score) : '—'}</strong>
        </div>
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
  const statsReady =
    hasData ||
    (stats.average != null && Number.isFinite(stats.average)) ||
    stats.healthScore != null
  const showCaption = hasAoi && statsReady && !loading
  const showScore = statsReady && stats.healthScore != null
  const mood = resolveHealthMood(showCaption && showScore ? stats.territoryLevel : null)
  const gaugeAriaLabel =
    showCaption && showScore && stats.healthScore != null
      ? `Health score ${Math.round(stats.healthScore)}. ${mood.ariaLabel}.`
      : undefined

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
          {showCaption && showScore && stats.territoryLevel ? (
            <span
              className={`si-lll-analyze-panel__mood si-lll-analyze-gauge__mood si-lll-analyze-gauge__mood--${mood.mod}`}
              role="img"
              aria-label={mood.ariaLabel}
            >
              {mood.emoji}
            </span>
          ) : null}
        </div>
        <ScoreGauge
          score={showScore ? stats.healthScore : null}
          accentColor={statsReady ? levelColor : '#64748b'}
          loading={loading && !statsReady}
          ariaLabel={gaugeAriaLabel}
        />
      </div>

      <div className="si-lll-analyze-panel__stats" role="list">
        <div className="si-lll-analyze-stat" role="listitem">
          <i className={`fa-solid ${STAT_ICONS.min} si-lll-analyze-stat__icon`} aria-hidden />
          <span className="si-lll-analyze-stat__label">MIN</span>
          <strong>{statValue(loading, statsReady, () => formatLegendStatValue(stats.min))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem">
          <i className={`fa-solid ${STAT_ICONS.max} si-lll-analyze-stat__icon`} aria-hidden />
          <span className="si-lll-analyze-stat__label">MAX</span>
          <strong>{statValue(loading, statsReady, () => formatLegendStatValue(stats.max))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem">
          <i className={`fa-solid ${STAT_ICONS.low} si-lll-analyze-stat__icon`} aria-hidden />
          <span className="si-lll-analyze-stat__label">LOW</span>
          <strong>{statValue(loading, statsReady, () => formatLowPct(stats.lowPct))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem">
          <i className={`fa-solid ${STAT_ICONS.avg} si-lll-analyze-stat__icon`} aria-hidden />
          <span className="si-lll-analyze-stat__label">AVERAGE</span>
          <strong>{statValue(loading, statsReady, () => formatLegendStatValue(stats.average))}</strong>
        </div>
      </div>

    </section>
  )
}
