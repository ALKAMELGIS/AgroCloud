import { CHAS_FORMULA_DOC } from '../../../lib/chasIndex'
import {
  DCHAS_DELTA_CRITICAL,
  DCHAS_DELTA_STRESS,
  DCHAS_ORB_RING_COUNT,
  DCHAS_RISK_LABELS,
} from '../../../lib/siCropAlertEngine'
import { CropAlertTierIcon } from './SiCropAlertHvdIcon'
import './SiCropAlertHvdIcon.css'
import './SiCropAlertMapLegend.css'

const DCHAS_LEGEND_ITEMS = [
  {
    tier: 'critical' as const,
    rangeLabel: `ΔCHAS ≤ ${DCHAS_DELTA_CRITICAL}`,
    blink: 'Fast pulse',
  },
  {
    tier: 'stress' as const,
    rangeLabel: `${DCHAS_DELTA_CRITICAL} < Δ ≤ ${DCHAS_DELTA_STRESS}`,
    blink: 'Medium pulse',
  },
  {
    tier: 'watch' as const,
    rangeLabel: `${DCHAS_DELTA_STRESS} < Δ ≤ 0`,
    blink: 'Slow pulse',
  },
  {
    tier: 'stable' as const,
    rangeLabel: 'ΔCHAS > 0',
    blink: 'Steady glow',
  },
]

export function SiCropAlertMapLegend() {
  return (
    <div className="si-crop-alert-map-legend" dir="ltr" aria-label="ΔCHAS alert legend — orb color and blink from change detection">
      <p className="si-crop-alert-map-legend__hint">
        Orb color + pulse = ΔCHAS only · CHAS = {CHAS_FORMULA_DOC} · CI_RE = RE/NIR − 1
      </p>
      {DCHAS_LEGEND_ITEMS.map(item => (
        <span
          key={item.tier}
          className="si-crop-alert-map-legend__item"
          title={`${DCHAS_RISK_LABELS[item.tier]} · ${item.blink}`}
        >
          <CropAlertTierIcon
            tier={item.tier}
            size="sm"
            enhanced
            pulseRings={DCHAS_ORB_RING_COUNT[item.tier]}
            className="si-crop-alert-map-legend__icon"
          />
          <span className="si-crop-alert-map-legend__label">{DCHAS_RISK_LABELS[item.tier]}</span>
          <span className="si-crop-alert-map-legend__range">{item.rangeLabel}</span>
        </span>
      ))}
    </div>
  )
}
