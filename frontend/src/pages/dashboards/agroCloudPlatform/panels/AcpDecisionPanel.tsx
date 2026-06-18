import { useAcpPlatform } from '../acpPlatformContext'
import type { DchasRiskTier } from '../../../../lib/siCropAlertDchasBeacon'
import { DCHAS_HEALTHY_COLOR, DCHAS_ISOLATED_COLOR } from '../../../../lib/siCropAlertDchasBeacon'
import { CropAlertTierIcon } from '../../../satellite/components/SiCropAlertHvdIcon'
import '../../../satellite/components/SiCropAlertHvdIcon.css'

const DECISIONS: {
  id: 'healthy' | 'stable' | 'warning' | 'critical'
  label: string
  tier: DchasRiskTier
  tone: string
  color?: string
}[] = [
  { id: 'healthy', label: 'Healthy', tier: 'stable', tone: 'healthy', color: DCHAS_ISOLATED_COLOR },
  { id: 'stable', label: 'Stable', tier: 'stable', tone: 'stable', color: DCHAS_HEALTHY_COLOR },
  { id: 'warning', label: 'Warning', tier: 'stress', tone: 'warning' },
  { id: 'critical', label: 'Critical', tier: 'critical', tone: 'critical' },
]

export function AcpDecisionPanel() {
  const acp = useAcpPlatform()

  return (
    <section className="acp-decision-block">
      <h2 className="acp-decision-block__title">Decision Support</h2>
      <div className="acp-decision">
        {DECISIONS.map(d => (
          <button
            key={d.id}
            type="button"
            className={`acp-decision__card acp-decision__card--${d.tone}${acp.decisionFilter === d.id ? ' is-on' : ''}`}
            onClick={() => acp.setDecisionFilter(acp.decisionFilter === d.id ? null : d.id)}
          >
            <CropAlertTierIcon tier={d.tier} size="sm" className="acp-decision__icon" color={d.color} />
            <span>{d.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
