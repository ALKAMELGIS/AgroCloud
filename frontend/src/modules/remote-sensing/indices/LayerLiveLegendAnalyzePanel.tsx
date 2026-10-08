import type { AnalyzeTerritoryLevel } from './layerLegendAnalyzeIndexConfig'
import {
  formatLegendStatValue,
  formatLowPct,
  type LayerLegendAnalyzeStats,
} from './layerLegendAnalyzeStats'
import { formatAreaHa } from '../classification/siLayerClassAreaEngine'

type LayerLiveLegendAnalyzePanelProps = {
  stats: LayerLegendAnalyzeStats
  locationLabel: string
  /** AOI display name (compact layout). */
  aoiName?: string
  /** AOI area in hectares (compact layout). */
  aoiAreaHa?: number | null
  loading?: boolean
  hasAoi?: boolean
  hasData?: boolean
  /** Tighter layout for the map float legend card. */
  compact?: boolean
}

const COMPACT_STAT_LABELS = {
  min: 'Min',
  max: 'Max',
  low: 'Low',
  avg: 'Avg',
} as const

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
  compact,
}: {
  score: number | null
  accentColor: string | null
  loading?: boolean
  ariaLabel?: string
  compact?: boolean
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
        className={`si-lll-analyze-gauge${compact ? ' si-lll-analyze-gauge--compact' : ''}`}
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
  aoiName,
  aoiAreaHa,
  loading,
  hasAoi = true,
  hasData = false,
  compact = false,
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

  const compactAoiName = (aoiName ?? '').trim() || (hasAoi ? 'AOI' : '')
  const showCompactAoiRow = compact && hasAoi && compactAoiName.length > 0

  return (
    <section
      className={`si-lll-analyze-panel${compact ? ' si-lll-analyze-panel--compact' : ''}`}
      aria-label={`${config.title} analysis score`}
      style={
        compact && statsReady
          ? { ['--si-lll-analyze-accent' as string]: levelColor }
          : undefined
      }
    >
      <div className="si-lll-analyze-panel__hero">
        <div className="si-lll-analyze-panel__hero-copy">
          {!compact ? <span className="si-lll-analyze-panel__kicker">Health Score</span> : null}
          {compact ? (
            <div className="si-lll-analyze-panel__headline">
              <h4 className="si-lll-analyze-panel__title">{config.healthLabel}</h4>
            </div>
          ) : (
            <h4 className="si-lll-analyze-panel__title">{`${config.healthLabel} Level`}</h4>
          )}
          {showCompactAoiRow ? (
            <div className="si-lll-analyze-panel__aoi-row">
              <span className="si-lll-analyze-panel__aoi-chip" title={compactAoiName}>
                <i className="fa-solid fa-vector-square" aria-hidden />
                <span className="si-lll-analyze-panel__aoi-chip-text">{compactAoiName}</span>
              </span>
              {aoiAreaHa != null && aoiAreaHa > 0 ? (
                <span className="si-lll-analyze-panel__area-chip">
                  {formatAreaHa(aoiAreaHa)} ha
                </span>
              ) : null}
            </div>
          ) : (
            <p className="si-lll-analyze-panel__location">
              {!compact ? <i className="fa-solid fa-location-dot" aria-hidden /> : null}
              <span className="si-lll-analyze-panel__location-text">{locationLabel}</span>
            </p>
          )}
          {!compact && showCaption && showScore && stats.territoryLevel ? (
            <span
              className={`si-lll-analyze-panel__mood si-lll-analyze-gauge__mood si-lll-analyze-gauge__mood--${mood.mod}`}
              role="img"
              aria-label={mood.ariaLabel}
            >
              {mood.emoji}
            </span>
          ) : null}
        </div>
        {compact && showCaption && showScore && stats.territoryLevel ? (
          <span
            className={`si-lll-analyze-panel__level-mood si-lll-analyze-gauge__mood si-lll-analyze-gauge__mood--${mood.mod}`}
            role="img"
            aria-label={mood.ariaLabel}
            title={stats.territoryLevelLabel ?? stats.territoryLevel}
          >
            {mood.emoji}
          </span>
        ) : null}
        <div className="si-lll-analyze-panel__gauge-wrap">
          <ScoreGauge
            score={showScore ? stats.healthScore : null}
            accentColor={statsReady ? levelColor : '#64748b'}
            loading={loading && !statsReady}
            ariaLabel={gaugeAriaLabel}
            compact={compact}
          />
          {compact ? <span className="si-lll-analyze-panel__gauge-caption">Score</span> : null}
        </div>
      </div>

      {compact ? <div className="si-lll-analyze-panel__divider" aria-hidden /> : null}

      <div
        className={`si-lll-analyze-panel__stats${compact ? ' si-lll-analyze-panel__stats--compact' : ''}`}
        role="list"
      >
        <div className="si-lll-analyze-stat" role="listitem" title={compact ? 'Minimum index value in AOI' : undefined}>
          {!compact ? <i className={`fa-solid ${STAT_ICONS.min} si-lll-analyze-stat__icon`} aria-hidden /> : null}
          <span className="si-lll-analyze-stat__label">{compact ? COMPACT_STAT_LABELS.min : 'MIN'}</span>
          <strong>{statValue(loading, statsReady, () => formatLegendStatValue(stats.min))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem" title={compact ? 'Maximum index value in AOI' : undefined}>
          {!compact ? <i className={`fa-solid ${STAT_ICONS.max} si-lll-analyze-stat__icon`} aria-hidden /> : null}
          <span className="si-lll-analyze-stat__label">{compact ? COMPACT_STAT_LABELS.max : 'MAX'}</span>
          <strong>{statValue(loading, statsReady, () => formatLegendStatValue(stats.max))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem" title={compact ? 'Share of AOI in lowest health tier' : undefined}>
          {!compact ? <i className={`fa-solid ${STAT_ICONS.low} si-lll-analyze-stat__icon`} aria-hidden /> : null}
          <span className="si-lll-analyze-stat__label">{compact ? COMPACT_STAT_LABELS.low : 'LOW'}</span>
          <strong>{statValue(loading, statsReady, () => formatLowPct(stats.lowPct))}</strong>
        </div>
        <div className="si-lll-analyze-stat" role="listitem" title={compact ? 'Mean index value in AOI' : undefined}>
          {!compact ? <i className={`fa-solid ${STAT_ICONS.avg} si-lll-analyze-stat__icon`} aria-hidden /> : null}
          <span className="si-lll-analyze-stat__label">{compact ? COMPACT_STAT_LABELS.avg : 'AVERAGE'}</span>
          <strong>{statValue(loading, statsReady, () => formatLegendStatValue(stats.average))}</strong>
        </div>
      </div>

    </section>
  )
}
