import {
  WAPI_ALERT_LEVEL_LABELS,
  WAPI_HARVEST_STAGE_LABELS,
  type WapiAlertFieldResult,
} from '../../../lib/siWapiAlertEngine'
import './SiWapiAlertMapPopup.css'

export type SiWapiAlertMapPopupProps = {
  result: WapiAlertFieldResult
  onClose: () => void
}

export function SiWapiAlertMapPopup({ result, onClose }: SiWapiAlertMapPopupProps) {
  return (
    <div className="si-wapi-alert-popup" style={{ borderTopColor: result.color }}>
      <div className="si-wapi-alert-popup__head">
        <div>
          <p className="si-wapi-alert-popup__kicker">ISS Irrigation</p>
          <h4 className="si-wapi-alert-popup__title">{result.fieldName}</h4>
        </div>
        <button type="button" className="si-wapi-alert-popup__close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" aria-hidden />
        </button>
      </div>
      <dl className="si-wapi-alert-popup__grid">
        <div>
          <dt>Field ID</dt>
          <dd>{result.fieldId}</dd>
        </div>
        <div>
          <dt>ISS</dt>
          <dd>{result.iss.toFixed(3)}</dd>
        </div>
        <div>
          <dt>Alert</dt>
          <dd style={{ color: result.color }}>{WAPI_ALERT_LEVEL_LABELS[result.alertLevel]}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>#{result.priorityRank}</dd>
        </div>
        <div className="si-wapi-alert-popup__span">
          <dt>Water stress</dt>
          <dd>{result.waterStressStatus}</dd>
        </div>
        <div className="si-wapi-alert-popup__span">
          <dt>Harvest stage</dt>
          <dd>{WAPI_HARVEST_STAGE_LABELS[result.harvestStage]}</dd>
        </div>
        <div className="si-wapi-alert-popup__span">
          <dt>Recommended action</dt>
          <dd>{result.recommendedAction}</dd>
        </div>
      </dl>
    </div>
  )
}
