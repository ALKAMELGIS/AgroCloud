import { memo, type CSSProperties } from 'react'
import {
  WAPI_ALERT_LEVEL_ICONS,
  WAPI_ALERT_LEVEL_LABELS,
  type WapiAlertFieldResult,
} from '../../../lib/siWapiAlertEngine'
import './SiWapiAlertMapMarker.css'

export type SiWapiAlertMapMarkerProps = {
  result: WapiAlertFieldResult
  selected: boolean
  onSelect: (fieldKey: string) => void
}

export const SiWapiAlertMapMarker = memo(function SiWapiAlertMapMarker({
  result,
  selected,
  onSelect,
}: SiWapiAlertMapMarkerProps) {
  const icon = WAPI_ALERT_LEVEL_ICONS[result.alertLevel]
  const label = WAPI_ALERT_LEVEL_LABELS[result.alertLevel]
  const title = `${result.fieldName}: ${label} · ISS ${result.iss.toFixed(3)}`

  return (
    <button
      type="button"
      className={`si-iss-alert-pin${selected ? ' is-selected' : ''} si-iss-alert-pin--${result.alertLevel}`}
      style={{ '--iss-alert-color': result.color } as CSSProperties}
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={e => {
        e.stopPropagation()
        onSelect(result.fieldKey)
      }}
      onPointerDown={e => e.stopPropagation()}
    >
      <span className="si-iss-alert-pin__pulse" aria-hidden />
      <span className="si-iss-alert-pin__orb">
        <i className={`fa-solid ${icon}`} aria-hidden />
      </span>
      <span className="si-iss-alert-pin__stem" aria-hidden />
      <span className="si-iss-alert-pin__label">{label}</span>
    </button>
  )
})
