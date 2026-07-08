import type { CoverageTierStats, ImageryIndexInterpretation } from '../../../lib/imageryIndexInterpretationEngine'

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
}

function formatHa(ha: number): string {
  if (!Number.isFinite(ha) || ha <= 0) return '0'
  if (ha >= 100) return ha.toFixed(0)
  if (ha >= 1) return ha.toFixed(1)
  return ha.toFixed(2)
}

function formatM2(m2: number): string {
  if (!Number.isFinite(m2) || m2 <= 0) return '0'
  return Math.round(m2).toLocaleString('en-US')
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

function coverageForTier(
  coverage: CoverageTierStats[],
  tier: CoverageTierStats['tier'],
): CoverageTierStats | undefined {
  return coverage.find(c => c.tier === tier)
}

function buildNarrative(interpretation: ImageryIndexInterpretation): string {
  const { layerId, mean, sceneDate, meanLabel, coverage } = interpretation
  const healthy = coverageForTier(coverage, 'healthy')
  const moderate = coverageForTier(coverage, 'moderate')
  const stress = coverageForTier(coverage, 'stress')
  const critical = coverageForTier(coverage, 'critical')
  const secondary = moderate && moderate.pct >= 3 ? moderate : stress && stress.pct >= 3 ? stress : critical

  let text = `${layerId} = ${mean.toFixed(2)} on ${formatSceneDate(sceneDate)} indicates ${meanLabel.toLowerCase()}.`
  if (healthy && healthy.pct >= 40) {
    text += ` Approximately ${formatPct(healthy.pct)}% (${formatHa(healthy.areaHa)} ha) of the field shows favorable conditions`
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
    text: a.text,
  }))

  if (moderate && moderate.pct >= 8) {
    items.push({
      id: 'scout-moderate',
      tone: 'warn',
      text: `Scout moderate-vigor zones (${formatPct(moderate.pct)}% · ${formatHa(moderate.areaHa)} ha).`,
      actionable: true,
      icon: 'fa-solid fa-binoculars',
    })
  }

  if (stressedPct >= 5) {
    items.push({
      id: 'inspect-stress',
      tone: stressedPct >= 15 ? 'alert' : 'warn',
      text: `Inspect stressed areas on map (${formatPct(stressedPct)}% · ${formatHa(stressedHa)} ha).`,
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

function CoverageRow({ label, tier }: { label: string; tier?: CoverageTierStats }) {
  if (!tier || tier.pct <= 0) return null
  return (
    <div className={`acp-ts__interpret-tier acp-ts__interpret-tier--${tier.tier}`}>
      <span className="acp-ts__interpret-tier-label">{label}</span>
      <span className="acp-ts__interpret-tier-value">
        {formatPct(tier.pct)}% · {formatHa(tier.areaHa)} ha · {formatM2(tier.areaM2)} m²
      </span>
    </div>
  )
}

export function SiImageryIndexInterpretationCard({
  interpretation,
  loadingAreas = false,
  onAction,
}: SiImageryIndexInterpretationCardProps) {
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

  const actionItems = buildContextualActions(interpretation)
  const quickActions = actionItems.filter(a => a.actionable).slice(0, 3)

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
      <div className="acp-ts__interpret-head">
        <span
          className={`acp-ts__interpret-badge acp-ts__interpret-badge--${interpretation.meanTier}`}
          style={{ borderColor: interpretation.meanColor, color: interpretation.meanColor }}
        >
          {interpretation.meanLabel}
        </span>
        <span className="acp-ts__interpret-title">Index interpretation</span>
      </div>

      <p className="acp-ts__interpret-stats" aria-label="Index statistics">
        <span className="acp-ts__interpret-stat">
          <span className="acp-ts__interpret-stat-k">Index</span>
          <span className="acp-ts__interpret-stat-v">{interpretation.layerId}</span>
        </span>
        <span className="acp-ts__interpret-stat-sep" aria-hidden>
          ·
        </span>
        <span className="acp-ts__interpret-stat">
          <span className="acp-ts__interpret-stat-k">Date</span>
          <span className="acp-ts__interpret-stat-v">{formatSceneDate(interpretation.sceneDate)}</span>
        </span>
        <span className="acp-ts__interpret-stat-sep" aria-hidden>
          ·
        </span>
        <span className="acp-ts__interpret-stat">
          <span className="acp-ts__interpret-stat-k">Mean</span>
          <span className="acp-ts__interpret-stat-v">{interpretation.mean.toFixed(3)}</span>
        </span>
        <span className="acp-ts__interpret-stat-sep" aria-hidden>
          ·
        </span>
        <span className="acp-ts__interpret-stat">
          <span className="acp-ts__interpret-stat-k">Min/Max</span>
          <span className="acp-ts__interpret-stat-v">
            {interpretation.min?.toFixed(3) ?? '—'}/{interpretation.max?.toFixed(3) ?? '—'}
          </span>
        </span>
        {interpretation.stdDev != null ? (
          <>
            <span className="acp-ts__interpret-stat-sep" aria-hidden>
              ·
            </span>
            <span className="acp-ts__interpret-stat">
              <span className="acp-ts__interpret-stat-k">σ</span>
              <span className="acp-ts__interpret-stat-v">{interpretation.stdDev.toFixed(3)}</span>
            </span>
          </>
        ) : null}
      </p>

      <p className="acp-ts__interpret-line acp-ts__interpret-line--narrative">{buildNarrative(interpretation)}</p>

      <section className="acp-ts__interpret-actions-block" aria-label="Recommended actions">
        <h4 className="acp-ts__interpret-actions-title">
          <i className="fa-solid fa-bolt" aria-hidden /> Actions
        </h4>
        {actionItems.length ? (
          <ul className="acp-ts__interpret-actions-list">
            {actionItems.slice(0, 5).map(action => (
              <li
                key={action.id}
                className={
                  action.tone === 'ok'
                    ? 'acp-ts__interpret-action--ok'
                    : action.tone === 'alert'
                      ? 'acp-ts__interpret-action--alert'
                      : 'acp-ts__interpret-action--warn'
                }
              >
                {action.tone === 'ok' ? '✓' : '⚠'} {action.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="acp-ts__interpret-line acp-ts__interpret-line--actions">
            No specific actions — conditions are within expected range.
          </p>
        )}
        {quickActions.length ? (
          <div className="acp-ts__interpret-action-chips">
            {quickActions.map(action => (
              <button
                key={`chip-${action.id}`}
                type="button"
                className={`acp-ts__interpret-action-chip acp-ts__interpret-action-chip--${action.tone}${
                  onAction ? '' : ' acp-ts__interpret-action-chip--static'
                }`}
                title={action.text}
                disabled={!onAction}
                onClick={() => handleActionClick(action)}
              >
                {action.icon ? <i className={action.icon} aria-hidden /> : null}
                <span>{action.text}</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="acp-ts__interpret-coverage-grid">
        <CoverageRow label="Healthy" tier={healthy} />
        <CoverageRow label="Moderate" tier={moderate} />
        {stressedCombinedPct > 0 ? (
          <div className="acp-ts__interpret-tier acp-ts__interpret-tier--stress">
            <span className="acp-ts__interpret-tier-label">Stressed</span>
            <span className="acp-ts__interpret-tier-value">
              {formatPct(stressedCombinedPct)}% · {formatHa(stressedCombinedHa)} ha ·{' '}
              {formatM2(stressedCombinedM2)} m²
            </span>
          </div>
        ) : null}
        {loadingAreas ? (
          <span className="acp-ts__interpret-loading">Refining area statistics…</span>
        ) : null}
      </div>
    </div>
  )
}
