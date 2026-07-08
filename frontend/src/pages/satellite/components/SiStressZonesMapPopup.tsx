import type { StressZoneAreaRow, StressZoneSceneResult } from '../../../lib/siStressZonesLive'
import { STRESS_ZONE_LABELS } from '../../../lib/siStressZonesMapping'
import './SiStressZonesMapPopup.css'

export type SiStressZonesMapPopupProps = {
  zone: StressZoneAreaRow | null
  result: StressZoneSceneResult
  onClose: () => void
}

function fmt(n: number, digits = 3): string {
  return Number.isFinite(n) ? n.toFixed(digits) : '—'
}

export function SiStressZonesMapPopup({ zone, result, onClose }: SiStressZonesMapPopupProps) {
  const tier = zone?.tier ?? result.tier
  const label = zone?.label ?? STRESS_ZONE_LABELS[tier]

  return (
    <div className="si-stress-popup">
      <header className="si-stress-popup__head">
        <strong style={{ color: zone?.color }}>{label}</strong>
        <button type="button" className="si-stress-popup__close" onClick={onClose} aria-label="Close">
          <i className="fa-solid fa-xmark" />
        </button>
      </header>
      <dl className="si-stress-popup__grid">
        <div>
          <dt>Stress level</dt>
          <dd>{label}</dd>
        </div>
        <div>
          <dt>Area</dt>
          <dd>
            {zone
              ? `${zone.areaHa.toFixed(2)} ha (${zone.pct.toFixed(1)}%)`
              : `${result.totalAreaHa.toFixed(2)} ha AOI`}
          </dd>
        </div>
        <div>
          <dt>NDVI</dt>
          <dd>{fmt(result.indices.ndvi, 4)}</dd>
        </div>
        <div>
          <dt>NDMI</dt>
          <dd>{fmt(result.indices.ndmi, 4)}</dd>
        </div>
        <div>
          <dt>Risk cause</dt>
          <dd>{result.riskCause}</dd>
        </div>
        <div>
          <dt>AI recommendation</dt>
          <dd>{result.recommendation}</dd>
        </div>
      </dl>
    </div>
  )
}
