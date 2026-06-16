import { CHAS_FORMULA_DOC } from '../../../lib/chasIndex'
import {
  DCHAS_DELTA_CRITICAL,
  DCHAS_DELTA_STRESS,
  DCHAS_ORB_BLINK_MS,
  DCHAS_RISK_COLORS,
  DCHAS_RISK_ICONS,
  DCHAS_RISK_LABELS,
  beaconIconForeground,
} from '../../../lib/siCropAlertEngine'
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
      {DCHAS_LEGEND_ITEMS.map(item => {
        const color = DCHAS_RISK_COLORS[item.tier]
        const blinkMs = DCHAS_ORB_BLINK_MS[item.tier]
        return (
          <span
            key={item.tier}
            className="si-crop-alert-map-legend__item"
            title={`${DCHAS_RISK_LABELS[item.tier]} · ${item.blink}`}
          >
            <span
              className={[
                'si-crop-alert-map-legend__orb',
                blinkMs != null ? 'si-crop-alert-map-legend__orb--blink' : 'si-crop-alert-map-legend__orb--steady',
              ].join(' ')}
              style={{
                backgroundColor: color,
                color: beaconIconForeground(color),
                ...(blinkMs != null ? { animationDuration: `${blinkMs}ms` } : {}),
              }}
              aria-hidden
            >
              <i className={`fa-solid ${DCHAS_RISK_ICONS[item.tier]}`} />
            </span>
            <span className="si-crop-alert-map-legend__label">{DCHAS_RISK_LABELS[item.tier]}</span>
            <span className="si-crop-alert-map-legend__range">{item.rangeLabel}</span>
          </span>
        )
      })}
    </div>
  )
}
