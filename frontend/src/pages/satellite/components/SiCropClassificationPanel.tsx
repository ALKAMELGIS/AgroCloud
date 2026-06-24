import type { CropClassificationSettings } from '../../../lib/siCropClassification'
import { CROP_CLASSIFICATION_CLASSES } from '../../../lib/siCropClassification'
import type { RegionalCropTrainingState } from '../../../lib/siRegionalCropTraining'
import { SiRegionalCropTrainingPanel } from './SiRegionalCropTrainingPanel'
import {
  SiCropClassificationAoiToolbar,
  type SiCropClassificationAoiToolbarProps,
} from './SiCropClassificationAoiToolbar'
import './SiCropClassificationPanel.css'
import './SiRegionalCropTrainingPanel.css'
import './SiCropClassificationAoiToolbar.css'

export type SiCropClassificationPanelProps = {
  settings: CropClassificationSettings
  hasAoi: boolean
  mapDate: string
  isRunning: boolean
  onChange: (patch: Partial<CropClassificationSettings>) => void
  onRun: () => void
  onStop: () => void
  regionalTraining: RegionalCropTrainingState
  fieldCount: number
  selectedFieldId: string | null
  selectedFieldName: string | null
  onRegionalChange: (patch: Partial<RegionalCropTrainingState>) => void
  onRegionalAddSampleFromField: () => void
  onRegionalRemoveSample: (id: string) => void
  onRegionalCalibrate: () => void
  onRegionalClearCalibration: () => void
} & Pick<
  SiCropClassificationAoiToolbarProps,
  | 'drawingModeActive'
  | 'onDrawingModeChange'
  | 'activeTool'
  | 'onToolChange'
  | 'hasClearableDrawing'
  | 'onClearDrawing'
>

const STEPS = [
  { id: 1 as const, label: 'AOI', hint: 'Draw a study polygon on the dedicated AOI layer.' },
  { id: 2 as const, label: 'Season', hint: 'Uses map date + growing-season lookback (3 scenes).' },
  { id: 3 as const, label: 'Filter', hint: 'Cloud cover threshold for scene search.' },
  { id: 4 as const, label: 'Run', hint: 'Classify pixels inside AOI and show the layer.' },
]

export function SiCropClassificationPanel({
  settings,
  hasAoi,
  mapDate,
  isRunning,
  onChange,
  onRun,
  onStop,
  regionalTraining,
  fieldCount,
  selectedFieldId,
  selectedFieldName,
  onRegionalChange,
  onRegionalAddSampleFromField,
  onRegionalRemoveSample,
  onRegionalCalibrate,
  onRegionalClearCalibration,
  drawingModeActive,
  onDrawingModeChange,
  activeTool,
  onToolChange,
  hasClearableDrawing,
  onClearDrawing,
}: SiCropClassificationPanelProps) {
  const step = settings.analysisStep
  const toolTab = settings.toolTab

  return (
    <div className="si-crop-class">
      <header className="si-crop-class__header">
        <div>
          <p className="si-crop-class__kicker">Geospatial Analysis</p>
          <h3 className="si-crop-class__title">🌾 Crop Classification</h3>
        </div>
        {toolTab === 'classify' ? (
          <label className="si-crop-class__power">
            <input
              type="checkbox"
              checked={settings.active}
              onChange={e => onChange({ active: e.target.checked })}
              disabled={!settings.lastRunAt}
            />
            Layer
          </label>
        ) : null}
      </header>

      <div className="si-crop-class__modes" role="tablist" aria-label="Crop tool mode">
        <button
          type="button"
          role="tab"
          aria-selected={toolTab === 'classify'}
          className={`si-crop-class__mode${toolTab === 'classify' ? ' is-active' : ''}`}
          onClick={() => onChange({ toolTab: 'classify' })}
        >
          Classify
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={toolTab === 'regional'}
          className={`si-crop-class__mode${toolTab === 'regional' ? ' is-active' : ''}`}
          onClick={() => onChange({ toolTab: 'regional' })}
        >
          Regional train
        </button>
      </div>

      {toolTab === 'regional' ? (
        <SiRegionalCropTrainingPanel
          state={regionalTraining}
          hasAoi={hasAoi}
          fieldCount={fieldCount}
          seasonStart={settings.seasonStart || regionalTraining.calibration?.seasonStart || ''}
          seasonEnd={settings.seasonEnd || mapDate}
          onChange={onRegionalChange}
          onAddSampleFromSelectedField={onRegionalAddSampleFromField}
          onRemoveSample={onRegionalRemoveSample}
          onCalibrate={onRegionalCalibrate}
          onClearCalibration={onRegionalClearCalibration}
          selectedFieldId={selectedFieldId}
          selectedFieldName={selectedFieldName}
        />
      ) : (
        <>
          <div className="si-crop-class__steps" role="tablist" aria-label="Analysis steps">
            {STEPS.map(s => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={step === s.id}
                className={`si-crop-class__step${step === s.id ? ' is-active' : ''}${settings.analysisStep > s.id ? ' is-done' : ''}`}
                onClick={() => onChange({ analysisStep: s.id })}
              >
                <span className="si-crop-class__step-num">{s.id}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </div>

          <div className="si-crop-class__body">
            {step === 1 ? (
              <>
                <p className="si-crop-class__hint">
                  {hasAoi
                    ? 'Study AOI ready on the classification layer — independent from Remote Sensing drawings.'
                    : 'Use the AOI drawing layer below to sketch a rectangle, polygon, or circle on the map.'}
                </p>
                <SiCropClassificationAoiToolbar
                  drawingModeActive={drawingModeActive}
                  onDrawingModeChange={onDrawingModeChange}
                  activeTool={activeTool}
                  onToolChange={onToolChange}
                  hasClearableDrawing={hasClearableDrawing}
                  onClearDrawing={onClearDrawing}
                />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <p className="si-crop-class__hint">
                  End date follows the map timeline. Start date defines the 3-scene growing-season stack.
                </p>
                <div className="si-crop-class__grid">
                  <label className="si-crop-class__field">
                    <span>Season start</span>
                    <input
                      type="date"
                      value={settings.seasonStart}
                      onChange={e => onChange({ seasonStart: e.target.value })}
                    />
                  </label>
                  <label className="si-crop-class__field">
                    <span>Season end (map)</span>
                    <input type="date" value={settings.seasonEnd || mapDate} readOnly />
                  </label>
                </div>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <p className="si-crop-class__hint">Scenes with cloud cover below this threshold are preferred.</p>
                <label className="si-crop-class__field">
                  <span>Max cloud cover (%)</span>
                  <input
                    type="range"
                    min={5}
                    max={30}
                    step={1}
                    value={settings.cloudCoverMax}
                    onChange={e => onChange({ cloudCoverMax: Number(e.target.value) })}
                  />
                  <strong>{settings.cloudCoverMax}%</strong>
                </label>
              </>
            ) : null}

            {step === 4 ? (
              <>
                <p className="si-crop-class__hint">
                  Runs multi-temporal classification inside the study AOI. Does not use Remote Sensing index layers.
                </p>
                <button
                  type="button"
                  className="si-crop-class__btn si-crop-class__btn--primary"
                  onClick={onRun}
                  disabled={!hasAoi || isRunning}
                >
                  <i className={`fa-solid ${isRunning ? 'fa-spinner fa-spin' : 'fa-play'}`} aria-hidden />
                  {isRunning ? 'Classifying…' : 'Run inside AOI'}
                </button>
                {settings.active ? (
                  <button type="button" className="si-crop-class__btn si-crop-class__btn--ghost" onClick={onStop}>
                    <i className="fa-solid fa-eye-slash" aria-hidden />
                    Hide layer
                  </button>
                ) : null}
              </>
            ) : null}

            {settings.statusMessage ? (
              <p className="si-crop-class__status" role="status">
                {settings.statusMessage}
              </p>
            ) : null}

            <div className="si-crop-class__legend">
              <p className="si-crop-class__label">Classes (Prithvi-style)</p>
              <ul>
                {CROP_CLASSIFICATION_CLASSES.map(c => (
                  <li key={c.key}>
                    <span className="si-crop-class__swatch" style={{ background: c.color }} aria-hidden />
                    {c.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
