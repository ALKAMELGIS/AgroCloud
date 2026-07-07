import type { CoverageTierStats, ImageryIndexInterpretation } from '../../../lib/imageryIndexInterpretationEngine'

export type SiImageryIndexInterpretationCardProps = {
  interpretation: ImageryIndexInterpretation | null
  loadingAreas?: boolean
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
  const stressed = coverageForTier(interpretation.coverage, 'stress')
  const critical = coverageForTier(interpretation.coverage, 'critical')
  const stressedCombinedPct =
    (stress?.pct ?? 0) + (critical?.pct ?? 0)
  const stressedCombinedHa = (stress?.areaHa ?? 0) + (critical?.areaHa ?? 0)
  const stressedCombinedM2 = (stress?.areaM2 ?? 0) + (critical?.areaM2 ?? 0)

  const extraActions: string[] = []
  if (stressedCombinedPct >= 5) {
    extraActions.push('Inspect stressed zones.')
    extraActions.push('Monitor pests and irrigation if stress increases.')
  }

  const allActions = [
    ...interpretation.actions.map(a => ({ tone: a.tone, text: a.text })),
    ...extraActions.map(text => ({ tone: 'warn' as const, text })),
  ]
  const uniqueActions = allActions.filter(
    (a, i, arr) => arr.findIndex(x => x.text === a.text) === i,
  )

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

      <dl className="acp-ts__interpret-stats">
        <div>
          <dt>Index</dt>
          <dd>{interpretation.layerId}</dd>
        </div>
        <div>
          <dt>Acquisition</dt>
          <dd>{formatSceneDate(interpretation.sceneDate)}</dd>
        </div>
        <div>
          <dt>Mean</dt>
          <dd>{interpretation.mean.toFixed(3)}</dd>
        </div>
        <div>
          <dt>Min / Max</dt>
          <dd>
            {interpretation.min?.toFixed(3) ?? '—'} / {interpretation.max?.toFixed(3) ?? '—'}
          </dd>
        </div>
        {interpretation.stdDev != null ? (
          <div>
            <dt>Std dev</dt>
            <dd>{interpretation.stdDev.toFixed(3)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="acp-ts__interpret-line acp-ts__interpret-line--narrative">{buildNarrative(interpretation)}</p>

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
        ) : (
          <CoverageRow label="Stressed" tier={stressed} />
        )}
        {loadingAreas ? (
          <span className="acp-ts__interpret-loading">Refining area statistics…</span>
        ) : null}
      </div>

      {uniqueActions.length ? (
        <ul className="acp-ts__interpret-actions-list">
          {uniqueActions.slice(0, 4).map(action => (
            <li
              key={action.text}
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
      ) : null}
    </div>
  )
}
