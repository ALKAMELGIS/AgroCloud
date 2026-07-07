import type { VegetationCoverageSummary } from '../../../../lib/vegetationCoverageEngine'
import { formatCoverageHa, formatCoveragePct } from '../../../../lib/vegetationCoverageEngine'

export type CoverageSummaryCardsProps = {
  summary: VegetationCoverageSummary
}

type KpiCard = {
  label: string
  value: string
  accent?: string
}

export function CoverageSummaryCards({ summary }: CoverageSummaryCardsProps) {
  const cards: KpiCard[] = [
    { label: 'Total AOI', value: `${formatCoverageHa(summary.totalAoiHa)} ha` },
    { label: 'Vegetated Area', value: `${formatCoverageHa(summary.vegetatedHa)} ha`, accent: 'veg' },
    { label: 'Non-Vegetated Area', value: `${formatCoverageHa(summary.nonVegetatedHa)} ha`, accent: 'bare' },
    { label: 'Vegetation Coverage', value: `${formatCoveragePct(summary.vegetationCoveragePct)}%`, accent: 'veg' },
    { label: 'Bare Soil', value: `${formatCoveragePct(summary.bareSoilPct)}%`, accent: 'bare' },
    { label: 'Water', value: `${formatCoveragePct(summary.waterPct)}%`, accent: 'water' },
    { label: 'Cloud/Shadow', value: `${formatCoveragePct(summary.cloudShadowPct)}%`, accent: 'cloud' },
  ]

  return (
    <div className="acp-ts__coverage-kpis" role="list">
      {cards.map(card => (
        <div
          key={card.label}
          className={'acp-ts__coverage-kpi' + (card.accent ? ` acp-ts__coverage-kpi--${card.accent}` : '')}
          role="listitem"
        >
          <span className="acp-ts__coverage-kpi-label">{card.label}</span>
          <strong className="acp-ts__coverage-kpi-value">{card.value}</strong>
        </div>
      ))}
    </div>
  )
}
