import { useMemo } from 'react'
import type { CoverageTierStats, ImageryIndexInterpretation } from '../../../lib/imageryIndexInterpretationEngine'
import {
  computeImageryYieldEstimate,
  DEFAULT_POTATO_MAX_YIELD_T_HA,
  type ImageryYieldEstimate,
} from '../../../lib/imageryYieldEstimation'
import type { SentinelHubDailyIndexMeans } from '../../../lib/sentinelHubStatisticsApi'

export type ImageryInterpretationActionId =
  | 'scout-moderate'
  | 'inspect-stress'
  | 'schedule-irrigation'
  | 'review-nutrition'
  | 'export-interpretation'

export type InterpretationActionItem = {
  id: ImageryInterpretationActionId | `engine-${number}`
  tone: 'ok' | 'warn' | 'alert'
  text: string
  actionable?: boolean
  icon?: string
}

export type SiImageryIndexInterpretationCardProps = {
  interpretation: ImageryIndexInterpretation | null
  loadingAreas?: boolean
  onAction?: (actionId: ImageryInterpretationActionId) => void
  /** Daily index means - used for NDVI/NDMI/NDRE yield estimation on the scene date. */
  dailyRows?: SentinelHubDailyIndexMeans[]
  /** Override potato default (55 t/ha). */
  maxYieldTHa?: number
  cropLabel?: string
}

function formatHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '0'
  if (ha >= 100) return ha.toFixed(0)
  if (ha >= 1) return ha.toFixed(1)
  return ha.toFixed(2)
}

function formatPct(pct: number): string {
  if (!Number.isFinite(pct)) return '0'
  return pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)
}

function formatSceneDate(iso: string): string {
  const d = new Date(`${iso.trim().slice(0, 10)}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatTons(v: number): string {
  if (!Number.isFinite(v)) return '-'
  if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (v >= 100) return v.toFixed(0)
  return v.toFixed(1)
}

function coverageForTier(
  coverage: CoverageTierStats[],
  tier: CoverageTierStats['tier'],
): CoverageTierStats | undefined {
  return coverage.find(c => c.tier === tier)
}

function dailyRowForScene(
  dailyRows: SentinelHubDailyIndexMeans[] | undefined,
  sceneDate: string,
): SentinelHubDailyIndexMeans | undefined {
  const day = sceneDate.trim().slice(0, 10)
  if (!day || !dailyRows?.length) return undefined
  return (
    dailyRows.find(r => String(r.date ?? '').slice(0, 10) === day) ??
    dailyRows[dailyRows.length - 1]
  )
}

function buildNarrative(interpretation: ImageryIndexInterpretation): string {
  const { layerId, mean, sceneDate, meanLabel, coverage } = interpretation
  if (mean == null || !Number.isFinite(mean)) {
    return `No mean ${layerId} value for ${formatSceneDate(sceneDate)}.`
  }
  const healthy = coverageForTier(coverage, 'healthy')
  const moderate = coverageForTier(coverage, 'moderate')
  const stress = coverageForTier(coverage, 'stress')
  const critical = coverageForTier(coverage, 'critical')
  const secondary = moderate && moderate.pct >= 3 ? moderate : stress && stress.pct >= 3 ? stress : critical

  let text = `${layerId} = ${mean.toFixed(2)} on ${formatSceneDate(sceneDate)} indicates ${meanLabel.toLowerCase()}.`
  if (healthy && healthy.pct >= 40) {
    text += ` About ${formatPct(healthy.pct)}% (${formatHa(healthy.areaHa)} ha) shows favorable conditions`
    if (secondary && secondary.pct >= 3) {
      text += `, while ${formatPct(secondary.pct)}% (${formatHa(secondary.areaHa)} ha) shows ${secondary.label.toLowerCase()}.`
    } else {
      text += '.'
    }
  }
  return text
}

function buildContextualActions(interpretation: ImageryIndexInterpretation): InterpretationActionItem[] {
  const moderate = coverageForTier(interpretation.coverage, 'moderate')
  const stress = coverageForTier(interpretation.coverage, 'stress')
  const critical = coverageForTier(interpretation.coverage, 'critical')
  const stressedPct = (stress?.pct ?? 0) + (critical?.pct ?? 0)
  const stressedHa = (stress?.areaHa ?? 0) + (critical?.areaHa ?? 0)

  const items: InterpretationActionItem[] = interpretation.actions.map((a, i) => ({
    id: `engine-${i}` as const,
    tone: a.tone,
    text: a.text.replace(/\s*[·•]\s*/g, ' - '),
  }))

  if (moderate && moderate.pct >= 8) {
    items.push({
      id: 'scout-moderate',
      tone: 'warn',
      text: `Scout moderate-vigor zones (${formatPct(moderate.pct)}% - ${formatHa(moderate.areaHa)} ha).`,
      actionable: true,
      icon: 'fa-solid fa-binoculars',
    })
  }

  if (stressedPct >= 5) {
    items.push({
      id: 'inspect-stress',
      tone: stressedPct >= 15 ? 'alert' : 'warn',
      text: `Inspect stressed areas on map (${formatPct(stressedPct)}% - ${formatHa(stressedHa)} ha).`,
      actionable: true,
      icon: 'fa-solid fa-map-location-dot',
    })
  }

  const layer = interpretation.layerId.toUpperCase()
  if (layer === 'NDWI' || layer === 'NDMI') {
    if (interpretation.meanTier === 'stress' || interpretation.meanTier === 'critical') {
      items.push({
        id: 'schedule-irrigation',
        tone: 'warn',
        text: 'Review irrigation scheduling for the selected date.',
        actionable: true,
        icon: 'fa-solid fa-droplet',
      })
    }
  } else if (layer === 'NDRE' || layer === 'CI_RE' || layer === 'CIRE') {
    if (interpretation.meanTier === 'moderate' || interpretation.meanTier === 'stress') {
      items.push({
        id: 'review-nutrition',
        tone: 'warn',
        text: 'Review nitrogen application in moderate or stressed zones.',
        actionable: true,
        icon: 'fa-solid fa-leaf',
      })
    }
  }

  const seen = new Set<string>()
  return items.filter(a => {
    if (seen.has(a.text)) return false
    seen.add(a.text)
    return true
  })
}

function CoverageCard({ label, tier }: { label: string; tier?: CoverageTierStats }) {
  if (!tier || tier.pct <= 0) return null
  return (
    <div className={`acp-ts__interpret-cov-card acp-ts__interpret-cov-card--${tier.tier}`}>
      <span className="acp-ts__interpret-cov-card-label">{label}</span>
      <span className="acp-ts__interpret-cov-card-pct">{formatPct(tier.pct)}%</span>
      <span className="acp-ts__interpret-cov-card-area">{formatHa(tier.areaHa)} ha</span>
    </div>
  )
}

function YieldBlock({
  estimate,
  sceneDate,
  incompleteReason,
}: {
  estimate: ImageryYieldEstimate | null
  sceneDate: string
  incompleteReason?: string
}) {
  return (
    <section className="acp-ts__interpret-yield" aria-label="Yield estimation">
      <header className="acp-ts__interpret-yield-head">
        <h4 className="acp-ts__interpret-section-title">
          <i className="fa-solid fa-wheat-awn" aria-hidden /> Yield
          <span className="acp-ts__interpret-yield-sub">
            {formatSceneDate(sceneDate)} - 0.5 NDVI + 0.3 NDMI + 0.2 NDRE
          </span>
        </h4>
        {estimate ? (
          <div className="acp-ts__interpret-yield-hero">
            <span className="acp-ts__interpret-yield-hero-k">Production</span>
            <span className="acp-ts__interpret-yield-hero-v">
              {formatTons(estimate.totalProductionTons)}
              <small> t</small>
            </span>
          </div>
        ) : null}
      </header>

      {estimate ? (
        <>
          <div className="acp-ts__interpret-yield-metrics">
            <div className="acp-ts__interpret-yield-metric">
              <span className="acp-ts__interpret-yield-metric-k">Factor</span>
              <span className="acp-ts__interpret-yield-metric-v">{estimate.yieldFactor.toFixed(3)}</span>
            </div>
            <div className="acp-ts__interpret-yield-metric">
              <span className="acp-ts__interpret-yield-metric-k">Yield</span>
              <span className="acp-ts__interpret-yield-metric-v">
                {estimate.estimatedYieldTHa.toFixed(1)}
                <small> t/ha</small>
              </span>
            </div>
            <div className="acp-ts__interpret-yield-metric acp-ts__interpret-yield-metric--accent">
              <span className="acp-ts__interpret-yield-metric-k">Total</span>
              <span className="acp-ts__interpret-yield-metric-v">
                {formatTons(estimate.totalProductionTons)}
                <small> t</small>
              </span>
            </div>
          </div>
          <div className="acp-ts__interpret-yield-inputs" aria-label="Index inputs">
            <span>
              NDVI <strong>{estimate.ndvi.toFixed(2)}</strong>
            </span>
            <span>
              NDMI <strong>{estimate.ndmi.toFixed(2)}</strong>
            </span>
            <span>
              NDRE <strong>{estimate.ndre.toFixed(2)}</strong>
            </span>
            <span>
              Area <strong>{formatHa(estimate.areaHa)} ha</strong>
            </span>
            <span>
              Max <strong>{estimate.maxYieldTHa} t/ha</strong>
            </span>
          </div>
        </>
      ) : (
        <p className="acp-ts__interpret-yield-empty">
          {incompleteReason ||
            `Need NDVI, NDMI, NDRE and plot area (max ${DEFAULT_POTATO_MAX_YIELD_T_HA} t/ha potato).`}
        </p>
      )}
    </section>
  )
}

export function SiImageryIndexInterpretationCard({
  interpretation,
  loadingAreas = false,
  onAction,
  dailyRows,
  maxYieldTHa = DEFAULT_POTATO_MAX_YIELD_T_HA,
  cropLabel = 'Potato',
}: SiImageryIndexInterpretationCardProps) {
  const yieldEstimate = useMemo(() => {
    if (!interpretation) return null
    const row = dailyRowForScene(dailyRows, interpretation.sceneDate)
    return computeImageryYieldEstimate({
      ndvi: row?.ndvi ?? (interpretation.layerId.toUpperCase() === 'NDVI' ? interpretation.mean : null),
      ndmi: row?.ndmi ?? null,
      ndre: row?.ndre ?? null,
      areaHa: interpretation.totalAreaHa,
      maxYieldTHa,
      cropLabel,
    })
  }, [interpretation, dailyRows, maxYieldTHa, cropLabel])

  if (!interpretation) {
    return (
      <div className="acp-ts__interpret acp-ts__interpret--empty" role="status">
        No interpretation available for the selected date.
      </div>
    )
  }

  const healthy = coverageForTier(interpretation.coverage, 'healthy')
  const moderate = coverageForTier(interpretation.coverage, 'moderate')
  const stress = coverageForTier(interpretation.coverage, 'stress')
  const critical = coverageForTier(interpretation.coverage, 'critical')
  const stressedCombinedPct = (stress?.pct ?? 0) + (critical?.pct ?? 0)
  const stressedCombinedHa = (stress?.areaHa ?? 0) + (critical?.areaHa ?? 0)
  const stressedCombinedM2 = (stress?.areaM2 ?? 0) + (critical?.areaM2 ?? 0)
  const stressedTier: CoverageTierStats | undefined =
    stressedCombinedPct > 0
      ? {
          tier: 'stress',
          label: 'Stressed',
          color: stress?.color ?? critical?.color ?? '#f97316',
          areaHa: stressedCombinedHa,
          areaM2: stressedCombinedM2,
          pct: stressedCombinedPct,
        }
      : undefined

  const actionItems = buildContextualActions(interpretation)
  const row = dailyRowForScene(dailyRows, interpretation.sceneDate)
  const yieldIncomplete =
    !row || row.ndvi == null || row.ndmi == null || row.ndre == null
      ? 'NDVI, NDMI, and NDRE means are required for this scene. Run time series with those layers available.'
      : interpretation.totalAreaHa <= 0
        ? 'Plot area is required for total production.'
        : undefined

  const handleActionClick = (item: InterpretationActionItem) => {
    if (!item.actionable || !onAction) return
    if (
      item.id === 'scout-moderate' ||
      item.id === 'inspect-stress' ||
      item.id === 'schedule-irrigation' ||
      item.id === 'review-nutrition' ||
      item.id === 'export-interpretation'
    ) {
      onAction(item.id)
    }
  }

  return (
    <div className="acp-ts__interpret" aria-live="polite">
      <header className="acp-ts__interpret-head">
        <div className="acp-ts__interpret-head-main">
          <span
            className={`acp-ts__interpret-badge acp-ts__interpret-badge--${interpretation.meanTier}`}
            style={{ borderColor: interpretation.meanColor, color: interpretation.meanColor }}
          >
            {interpretation.meanLabel}
          </span>
          <div className="acp-ts__interpret-head-copy">
            <span className="acp-ts__interpret-title">Index interpretation</span>
            <span className="acp-ts__interpret-head-date">{formatSceneDate(interpretation.sceneDate)}</span>
          </div>
        </div>
        <span className="acp-ts__interpret-head-area">
          {formatHa(interpretation.totalAreaHa)} ha
        </span>
      </header>

      <div className="acp-ts__interpret-stats" aria-label="Index statistics">
        <div className="acp-ts__interpret-stat">
          <span className="acp-ts__interpret-stat-k">Index</span>
          <span className="acp-ts__interpret-stat-v">{interpretation.layerId}</span>
        </div>
        <div className="acp-ts__interpret-stat">
          <span className="acp-ts__interpret-stat-k">Mean</span>
          <span className="acp-ts__interpret-stat-v">
            {interpretation.mean != null ? interpretation.mean.toFixed(3) : '-'}
          </span>
        </div>
        <div className="acp-ts__interpret-stat">
          <span className="acp-ts__interpret-stat-k">Min / Max</span>
          <span className="acp-ts__interpret-stat-v">
            {interpretation.min?.toFixed(3) ?? '-'}/{interpretation.max?.toFixed(3) ?? '-'}
          </span>
        </div>
        <div className="acp-ts__interpret-stat">
          <span className="acp-ts__interpret-stat-k">SD</span>
          <span className="acp-ts__interpret-stat-v">
            {interpretation.stdDev != null ? interpretation.stdDev.toFixed(3) : '-'}
          </span>
        </div>
      </div>

      <p className="acp-ts__interpret-line acp-ts__interpret-line--narrative">{buildNarrative(interpretation)}</p>

      <YieldBlock
        estimate={yieldEstimate}
        sceneDate={interpretation.sceneDate}
        incompleteReason={yieldIncomplete}
      />

      <section className="acp-ts__interpret-coverage" aria-label="Coverage by vigor class">
        <h4 className="acp-ts__interpret-section-title">Coverage</h4>
        <div className="acp-ts__interpret-coverage-grid">
          <CoverageCard label="Healthy" tier={healthy} />
          <CoverageCard label="Moderate" tier={moderate} />
          <CoverageCard label="Stressed" tier={stressedTier} />
          {loadingAreas ? (
            <span className="acp-ts__interpret-loading">Refining area statistics...</span>
          ) : null}
        </div>
      </section>

      <section className="acp-ts__interpret-actions-block" aria-label="Recommended actions">
        <h4 className="acp-ts__interpret-section-title">
          <i className="fa-solid fa-bolt" aria-hidden /> Actions
        </h4>
        {actionItems.length ? (
          <ul className="acp-ts__interpret-actions-list">
            {actionItems.slice(0, 3).map(action => {
              const clickable = Boolean(action.actionable && onAction)
              return (
                <li key={action.id} className={`acp-ts__interpret-action acp-ts__interpret-action--${action.tone}`}>
                  {clickable ? (
                    <button
                      type="button"
                      className="acp-ts__interpret-action-btn"
                      onClick={() => handleActionClick(action)}
                    >
                      {action.icon ? <i className={action.icon} aria-hidden /> : (
                        <i
                          className={
                            action.tone === 'ok' ? 'fa-solid fa-check' : 'fa-solid fa-triangle-exclamation'
                          }
                          aria-hidden
                        />
                      )}
                      <span>{action.text}</span>
                    </button>
                  ) : (
                    <span className="acp-ts__interpret-action-static">
                      <i
                        className={
                          action.tone === 'ok' ? 'fa-solid fa-check' : 'fa-solid fa-triangle-exclamation'
                        }
                        aria-hidden
                      />
                      <span>{action.text}</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="acp-ts__interpret-line acp-ts__interpret-line--actions">
            No specific actions - conditions are within expected range.
          </p>
        )}
      </section>
    </div>
  )
}
