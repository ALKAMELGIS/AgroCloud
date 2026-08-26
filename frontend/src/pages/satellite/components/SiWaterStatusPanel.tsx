import type { FieldWaterRequirementResult } from '../lib/timeSeriesReport/waterRequirementService'
import type { WaterStressUiLevel } from './useFieldWaterRequirement'

type SiWaterStatusPanelProps = {
  fieldLabel: string
  cropType: string
  water: FieldWaterRequirementResult | null
  uiStress: WaterStressUiLevel
  loading?: boolean
}

function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return 'N/A'
  return v.toFixed(digits)
}

function stressClass(level: WaterStressUiLevel): string {
  switch (level) {
    case 'Low':
      return 'si-water-status__stress--low'
    case 'Moderate':
      return 'si-water-status__stress--moderate'
    case 'High':
      return 'si-water-status__stress--high'
    case 'Severe':
      return 'si-water-status__stress--severe'
    default:
      return 'si-water-status__stress--unknown'
  }
}

export function SiWaterStatusPanel({
  fieldLabel,
  cropType,
  water,
  uiStress,
  loading,
}: SiWaterStatusPanelProps) {
  if (!water && !loading) return null

  return (
    <div className="si-water-status" aria-label="Water Status">
      <div className="si-water-status__head">
        <span className="si-water-status__icon" aria-hidden>
          <i className="fa-solid fa-droplet" />
        </span>
        <div className="si-water-status__titles">
          <strong>Water Status</strong>
          <span>{fieldLabel}</span>
        </div>
        <span className={`si-water-status__stress ${stressClass(uiStress)}`}>{uiStress}</span>
        {loading ? (
          <span className="si-water-status__busy">
            <i className="fa-solid fa-spinner fa-spin" aria-hidden />
          </span>
        ) : null}
      </div>

      {water ? (
        <>
          <div className="si-water-status__grid">
            <div>
              <em>Crop</em>
              <strong>{cropType || '—'}</strong>
            </div>
            <div>
              <em>Growth Stage</em>
              <strong>{water.growthStage}</strong>
            </div>
            <div>
              <em>ETc (mm/day)</em>
              <strong>{fmt(water.etcMmDay, 2)}</strong>
            </div>
            <div>
              <em>AET (mm/day)</em>
              <strong title={water.sources.aetSource}>{fmt(water.aetMmDay, 2)}</strong>
            </div>
            <div>
              <em>Water Stress</em>
              <strong>
                {water.waterStressPercent != null ? `${fmt(water.waterStressPercent, 1)}%` : 'N/A'}
              </strong>
            </div>
            <div>
              <em>Required (m³/day)</em>
              <strong>{fmt(water.waterRequirementM3Day, 1)}</strong>
            </div>
            <div>
              <em>Required (m³/week)</em>
              <strong>{fmt(water.waterRequirementM3Week, 1)}</strong>
            </div>
            <div>
              <em>Observation</em>
              <strong>{water.observationDate ?? '—'}</strong>
            </div>
          </div>

          <div className="si-water-status__indices">
            <span>NDVI {fmt(water.ndvi, 3)}</span>
            <span>NDMI {fmt(water.ndmi, 3)}</span>
            <span>NDWI {fmt(water.ndwi, 3)}</span>
            <span>NDII {fmt(water.ndii, 3)}</span>
          </div>

          <p className="si-water-status__meta" title={`${water.sources.etSource} · ${water.sources.aetSource}`}>
            ET₀: {water.sources.weatherSource} · {water.sources.kcSource} · Status: {water.calculationStatus}
          </p>
        </>
      ) : (
        <p className="si-water-status__meta">Loading water requirement…</p>
      )}
    </div>
  )
}
