import { memo, useId, type CSSProperties } from 'react'
import type { DchasRiskTier } from '../../../lib/siCropAlertDchasBeacon'
import { DCHAS_ORB_BLINK_MS, DCHAS_RISK_COLORS } from '../../../lib/siCropAlertDchasBeacon'
import { CROP_ALERT_HVD_VIEWBOX } from '../../../lib/cropAlertLayerHvdIcon'
import './SiCropAlertHvdIcon.css'

type Size = 'sm' | 'md' | 'lg'

type Props = {
  tier: DchasRiskTier
  selected?: boolean
  enhanced?: boolean
  pulseRings?: number
  size?: Size
  className?: string
}

const SIZE_PX: Record<Size, number> = {
  sm: 20,
  md: 34,
  lg: 44,
}

export const SiCropAlertHvdIcon = memo(function SiCropAlertHvdIcon({
  tier,
  selected = false,
  enhanced = true,
  pulseRings = 0,
  size = 'md',
  className = '',
}: Props) {
  const color = DCHAS_RISK_COLORS[tier]
  const blinkMs = DCHAS_ORB_BLINK_MS[tier]
  const px = SIZE_PX[size]
  const uid = useId().replace(/:/g, '')
  const bodyGradId = `si-crop-alert-hvd-body-${uid}`
  const glowGradId = `si-crop-alert-hvd-glow-${uid}`

  const style = {
    '--hvd-tone': color,
    '--hvd-size': `${px}px`,
    ...(blinkMs != null ? { '--hvd-pulse-ms': `${blinkMs}ms` } : {}),
  } as CSSProperties

  return (
    <span
      className={[
        'si-crop-alert-hvd-icon',
        enhanced ? 'si-crop-alert-hvd-icon--enhanced' : '',
        `si-crop-alert-hvd-icon--tier-${tier}`,
        blinkMs != null ? 'si-crop-alert-hvd-icon--pulse' : '',
        pulseRings > 0 ? 'si-crop-alert-hvd-icon--rings' : '',
        selected ? 'si-crop-alert-hvd-icon--selected' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      aria-hidden
    >
      {pulseRings > 0 ? (
        <span className="si-crop-alert-hvd-icon__pulse" data-ring-count={pulseRings} />
      ) : null}
      <svg
        className="si-crop-alert-hvd-icon__svg"
        viewBox={CROP_ALERT_HVD_VIEWBOX}
        width={px}
        height={px}
        focusable="false"
      >
        <defs>
          <linearGradient id={bodyGradId} x1="20%" y1="12%" x2="80%" y2="92%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
            <stop offset="38%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </linearGradient>
          <radialGradient id={glowGradId} cx="50%" cy="42%" r="58%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <circle className="si-crop-alert-hvd-icon__body" cx="16" cy="16" r="11.5" fill={color} />
        <circle
          className="si-crop-alert-hvd-icon__body-gloss"
          cx="16"
          cy="16"
          r="11.5"
          fill={`url(#${bodyGradId})`}
        />
        <circle className="si-crop-alert-hvd-icon__body-ring" cx="16" cy="16" r="11.5" fill="none" />
        <path
          className="si-crop-alert-hvd-icon__leaf"
          d="M16 9.2c-1.4 3.1-3.1 5.8-3.1 8.4 0 2.1 1.6 3.4 3.1 4.2 1.5-.8 3.1-2.1 3.1-4.2 0-2.6-1.7-5.3-3.1-8.4z"
        />
        <g className="si-crop-alert-hvd-icon__alert-badge">
          <circle cx="22.8" cy="9.6" r="3.6" />
          <rect x="21.6" y="7.1" width="1.2" height="3.2" rx="0.5" />
          <circle cx="22.2" cy="11.6" r="0.75" />
        </g>
        <g className="si-crop-alert-hvd-icon__hvd-badge">
          <rect x="11.2" y="22.4" width="9.6" height="4.2" rx="1.2" />
          <text x="16" y="25.2">HVD</text>
        </g>
        <circle className="si-crop-alert-hvd-icon__shine" cx="12.5" cy="11.5" r="4.5" fill={`url(#${glowGradId})`} />
      </svg>
    </span>
  )
})
