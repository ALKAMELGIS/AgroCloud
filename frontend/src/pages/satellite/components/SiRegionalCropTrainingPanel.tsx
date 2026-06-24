import {
  REGIONAL_CROP_PRESETS,
  resolveRegionalCropCatalog,
  type RegionalCropCatalog,
  type RegionalCropTrainingState,
  type RegionalTrainingSample,
} from '../../../lib/siRegionalCropTraining'
import './SiRegionalCropTrainingPanel.css'

export type SiRegionalCropTrainingPanelProps = {
  state: RegionalCropTrainingState
  hasAoi: boolean
  fieldCount: number
  seasonStart: string
  seasonEnd: string
  onChange: (patch: Partial<RegionalCropTrainingState>) => void
  onAddSampleFromSelectedField: () => void
  onRemoveSample: (id: string) => void
  onCalibrate: () => void
  onClearCalibration: () => void
  selectedFieldId: string | null
  selectedFieldName: string | null
}

export function SiRegionalCropTrainingPanel({
  state,
  hasAoi,
  fieldCount,
  seasonStart,
  seasonEnd,
  onChange,
  onAddSampleFromSelectedField,
  onRemoveSample,
  onCalibrate,
  onClearCalibration,
  selectedFieldId,
  selectedFieldName,
}: SiRegionalCropTrainingPanelProps) {
  const catalogCrops = resolveRegionalCropCatalog(state.catalog)
  const activeCrop =
    catalogCrops.find(c => c.id === state.activeCropId) ?? catalogCrops[0] ?? REGIONAL_CROP_PRESETS[0]

  const toggleEnabled = (cropId: string) => {
    const enabled = state.catalog.enabledCropIds.includes(cropId)
    const next = enabled
      ? state.catalog.enabledCropIds.filter(id => id !== cropId)
      : [...state.catalog.enabledCropIds, cropId]
    onChange({
      catalog: { ...state.catalog, enabledCropIds: next },
      activeCropId: cropId,
    })
  }

  return (
    <div className="si-regional-train">
      <p className="si-regional-train__hint">
        Label known fields with regional crop types, then calibrate assignments for other fields inside AOI.
        Uses Sentinel time-series signatures — separate from Layer Live.
      </p>

      <div className="si-regional-train__section">
        <p className="si-regional-train__label">Expected crops in region</p>
        <div className="si-regional-train__chips">
          {REGIONAL_CROP_PRESETS.map(c => {
            const on = state.catalog.enabledCropIds.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                className={`si-regional-train__chip${on ? ' is-on' : ''}`}
                onClick={() => toggleEnabled(c.id)}
                title={c.label}
              >
                <span className="si-regional-train__swatch" style={{ background: c.color }} aria-hidden />
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="si-regional-train__section">
        <p className="si-regional-train__label">Active crop for labeling</p>
        <div className="si-regional-train__active-row">
          <span className="si-regional-train__swatch si-regional-train__swatch--lg" style={{ background: activeCrop?.color }} />
          <select
            className="si-regional-train__select"
            value={state.activeCropId}
            onChange={e => onChange({ activeCropId: e.target.value })}
          >
            {catalogCrops.map(c => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="si-regional-train__actions">
        <button
          type="button"
          className={`si-regional-train__btn si-regional-train__btn--ghost${state.pickMode ? ' is-active' : ''}`}
          onClick={() => onChange({ pickMode: !state.pickMode })}
          disabled={!hasAoi}
        >
          <i className="fa-solid fa-crosshairs" aria-hidden />
          {state.pickMode ? 'Click field on map…' : 'Pick field on map'}
        </button>
        <button
          type="button"
          className="si-regional-train__btn si-regional-train__btn--ghost"
          onClick={onAddSampleFromSelectedField}
          disabled={!selectedFieldId || state.loading}
        >
          <i className="fa-solid fa-plus" aria-hidden />
          Label selected field
        </button>
      </div>

      {selectedFieldId ? (
        <p className="si-regional-train__meta">
          Selected: <strong>{selectedFieldName ?? selectedFieldId}</strong>
        </p>
      ) : (
        <p className="si-regional-train__meta">Select or click a field inside AOI to add training samples.</p>
      )}

      <div className="si-regional-train__section">
        <p className="si-regional-train__label">
          Training samples ({state.samples.length})
        </p>
        {state.samples.length === 0 ? (
          <p className="si-regional-train__empty">No samples yet — label at least one known field per crop type.</p>
        ) : (
          <ul className="si-regional-train__samples">
            {state.samples.map(s => (
              <li key={s.id}>
                <span className="si-regional-train__swatch" style={{ background: s.color }} aria-hidden />
                <span className="si-regional-train__sample-name">{s.fieldName ?? s.cropLabel}</span>
                <span className="si-regional-train__sample-crop">{s.cropLabel}</span>
                <span className="si-regional-train__sample-scenes">
                  {s.features ? `${s.features.sceneCount} scenes` : '…'}
                </span>
                <button
                  type="button"
                  className="si-regional-train__sample-del"
                  aria-label="Remove sample"
                  onClick={() => onRemoveSample(s.id)}
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="si-regional-train__season">
        <span>Season: {seasonStart || '—'} → {seasonEnd || '—'}</span>
        <span>{fieldCount} field(s) in AOI</span>
      </div>

      <button
        type="button"
        className="si-regional-train__btn si-regional-train__btn--primary"
        onClick={onCalibrate}
        disabled={!hasAoi || state.samples.length === 0 || state.loading || fieldCount === 0}
      >
        <i className={`fa-solid ${state.loading ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`} aria-hidden />
        {state.loading ? 'Calibrating…' : 'Run regional calibration'}
      </button>

      {state.calibration ? (
        <button type="button" className="si-regional-train__btn si-regional-train__btn--ghost" onClick={onClearCalibration}>
          <i className="fa-solid fa-eraser" aria-hidden />
          Clear calibration overlay
        </button>
      ) : null}

      <label className="si-regional-train__overlay-toggle">
        <input
          type="checkbox"
          checked={state.overlayVisible}
          onChange={e => onChange({ overlayVisible: e.target.checked })}
          disabled={!state.calibration}
        />
        Show calibrated fields on map
      </label>

      {(state.statusMessage || state.calibration?.statusMessage) ? (
        <p className="si-regional-train__status" role="status">
          {state.statusMessage || state.calibration?.statusMessage}
        </p>
      ) : null}

      {state.calibration && state.calibration.assignments.length > 0 ? (
        <div className="si-regional-train__section">
          <p className="si-regional-train__label">Calibrated fields</p>
          <ul className="si-regional-train__assignments">
            {state.calibration.assignments.map(a => (
              <li key={a.fieldId}>
                <span className="si-regional-train__swatch" style={{ background: a.color }} aria-hidden />
                <span>{a.fieldName}</span>
                <span className="si-regional-train__conf">{(a.confidence * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
          <div className="si-regional-train__legend">
            {catalogCrops
              .filter(c => state.calibration!.assignments.some(a => a.cropId === c.id))
              .map(c => (
                <div key={c.id} className="si-regional-train__legend-row">
                  <span className="si-regional-train__swatch" style={{ background: c.color }} aria-hidden />
                  {c.label}
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
