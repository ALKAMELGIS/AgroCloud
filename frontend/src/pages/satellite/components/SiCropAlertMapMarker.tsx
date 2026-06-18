import { memo, useMemo, type CSSProperties } from 'react'
import type { CropAlertFieldResult } from '../../../lib/siCropAlertEngine'
import { resolveDchasOrbPresentation } from '../../../lib/siCropAlertEngine'
import { SiCropAlertMapPopup } from './SiCropAlertMapPopup'
import { SiCropAlertHvdIcon } from './SiCropAlertHvdIcon'
import './SiCropAlertMapMarker.css'
import './SiCropAlertHvdIcon.css'

type HvdIconSize = 'sm' | 'md' | 'lg'

export type SiCropAlertMapMarkerProps = {
  result: CropAlertFieldResult
  selected: boolean
  popupOpen?: boolean
  dimmed?: boolean
  iconSize?: HvdIconSize
  onSelect: (fieldKey: string) => void
  onClosePopup?: () => void
}

export const SiCropAlertMapMarker = memo(function SiCropAlertMapMarker({
  result,
  selected,
  popupOpen = false,
  dimmed = false,
  iconSize = 'md',
  onSelect,
  onClosePopup,
}: SiCropAlertMapMarkerProps) {
  const orb = useMemo(() => resolveDchasOrbPresentation(result), [result])
  const { tier, label, deltaChas, chasCurrent, pulse, color } = orb

  const deltaLabel =
    deltaChas != null ? `${deltaChas >= 0 ? '+' : ''}${deltaChas.toFixed(3)}` : '—'
  const title = `${result.farmName || result.farmCode || result.objectId}: ${label} · ΔCHAS ${deltaLabel} · CHAS ${chasCurrent.toFixed(3)}`

  return (
    <div
      className={[
        'si-crop-alert-beacon-root',
        popupOpen ? 'si-crop-alert-beacon-root--popup-open' : '',
        dimmed ? 'si-crop-alert-beacon-root--dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="si-crop-alert-beacon-root__column">
        {popupOpen && onClosePopup ? (
          <SiCropAlertMapPopup result={result} onClose={onClosePopup} />
        ) : null}
        <div
          className={[
            'si-crop-alert-hvd-beacon',
            `si-crop-alert-hvd-beacon--tier-${tier}`,
            selected ? 'si-crop-alert-hvd-beacon--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--hvd-tone': color } as CSSProperties}
          role="button"
          tabIndex={0}
          title={title}
          aria-label={title}
          onClick={e => {
            e.stopPropagation()
            onSelect(result.fieldKey)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onSelect(result.fieldKey)
            }
          }}
        >
          <SiCropAlertHvdIcon
            tier={tier}
            selected={selected}
            enhanced
            pulseRings={pulse.ringCount}
            size={iconSize}
          />
          {selected && !popupOpen ? (
            <span className="si-crop-alert-hvd-beacon__label">
              {result.farmName || result.farmCode || `#${result.objectId}`}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
})
