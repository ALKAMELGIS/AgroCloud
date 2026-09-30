import type {
  SamAoiSource,
  SamClassType,
  SamFeatureMode,
  SamObjectTypeOption,
  SamSegmentPhase,
} from './useSamDetection'
import type { UseSamTrainingSamplesReturn } from './useSamTrainingSamples'
import { SamTrainingSamplesManager } from './SamTrainingSamplesManager'
import './SamDetectionPanel.css'

export type SamPanelTab = 'detect' | 'samples'

export type SamAoiLayerOption = {
  id: string
  label: string
  featureCount: number
}

export type SamDetectionPanelProps = {
  tab: SamPanelTab
  onTabChange: (t: SamPanelTab) => void
  classType: SamClassType
  onClassTypeChange: (t: SamClassType) => void
  featureMode: SamFeatureMode
  onFeatureModeChange: (m: SamFeatureMode) => void
  objectTypeId: string
  onObjectTypeIdChange: (id: string) => void
  customObjectType: string
  onCustomObjectTypeChange: (v: string) => void
  objectTypeOptions: SamObjectTypeOption[]
  objectTypeReady: boolean
  fgCount: number
  bgCount: number
  savedCount: number
  maskOpacity: number
  onMaskOpacityChange: (v: number) => void
  minConfidence: number
  onMinConfidenceChange: (v: number) => void
  /** AOI Source: existing polygon layer or drawn polygon. */
  aoiSource: SamAoiSource
  onAoiSourceChange: (s: SamAoiSource) => void
  aoiLayerOptions: SamAoiLayerOption[]
  aoiLayerId: string
  onAoiLayerIdChange: (id: string) => void
  aoiReady: boolean
  aoiUnitCount?: number
  aoiDrawing: boolean
  onStartDrawAoi: () => void
  onClearDrawAoi: () => void
  phase: SamSegmentPhase
  /** 0–100 while segmenting (async SAM job). */
  progress?: number
  busy: boolean
  error: string | null
  offline: boolean
  score?: number | null
  featureStats?: { point: number; line: number; polygon: number }
  /** Unique detected object instances (masks + centroids share one id). */
  objectCount?: number
  hasResult: boolean
  onSegment: () => void
  onSave: () => void
  onReset: () => void
  onUndo: () => void
  onExport: () => void
  /** Training Samples Manager (ArcGIS Pro–style). */
  train: UseSamTrainingSamplesReturn
  trainDigitizing: boolean
  onTrainDigitizingChange: (active: boolean) => void
  onAddTrainFromSam: (asMask: boolean) => void
}

const PHASE_LABEL: Record<SamSegmentPhase, string> = {
  idle: 'Ready — select object type, AOI, then Segment',
  capturing: 'Capturing high-res AOI imagery…',
  segmenting:
    'Instance segmentation across AOI — generating per-object masks + centroids…',
  done: 'Instances ready (masks + center points)',
  error: 'Segmentation failed',
}

const FEATURE_MODES: Array<{ id: SamFeatureMode; label: string; icon: string; title: string }> = [
  {
    id: 'auto',
    label: 'Auto',
    icon: 'fa-magic',
    title: 'Auto instance segmentation: trees→mask+centroid, roads→line, fields→polygon',
  },
  {
    id: 'point',
    label: 'Point',
    icon: 'fa-location-dot',
    title: 'Discrete objects (Trees/Poles/Vehicles): every instance gets a mask polygon + center point',
  },
  { id: 'line', label: 'Line', icon: 'fa-road', title: 'Force Line features (roads / rivers centreline)' },
  { id: 'polygon', label: 'Polygon', icon: 'fa-draw-polygon', title: 'Force Polygon features (fields / buildings) + centroids' },
]

export function SamDetectionPanel({
  tab,
  onTabChange,
  classType,
  onClassTypeChange,
  featureMode,
  onFeatureModeChange,
  objectTypeId,
  onObjectTypeIdChange,
  customObjectType,
  onCustomObjectTypeChange,
  objectTypeOptions,
  objectTypeReady,
  fgCount,
  bgCount,
  savedCount,
  maskOpacity,
  onMaskOpacityChange,
  minConfidence,
  onMinConfidenceChange,
  aoiSource,
  onAoiSourceChange,
  aoiLayerOptions,
  aoiLayerId,
  onAoiLayerIdChange,
  aoiReady,
  aoiUnitCount = 0,
  aoiDrawing,
  onStartDrawAoi,
  onClearDrawAoi,
  phase,
  progress = 0,
  busy,
  error,
  offline,
  score,
  featureStats,
  objectCount = 0,
  hasResult,
  onSegment,
  onSave,
  onReset,
  onUndo,
  onExport,
  train,
  trainDigitizing,
  onTrainDigitizingChange,
  onAddTrainFromSam,
}: SamDetectionPanelProps) {
  const canSegment = aoiReady && objectTypeReady && !busy
  const totalPoints = fgCount + bgCount
  const stats = featureStats ?? { point: 0, line: 0, polygon: 0 }
  const showObjectType = featureMode !== 'auto'
  const showOtherText = showObjectType && objectTypeId === 'other'
  const showProgress = busy && (phase === 'segmenting' || phase === 'capturing')
  const progressPct = Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div className="si-sam">
      <div className="si-sam__tabs" role="tablist" aria-label="AI SAM Detection">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'detect'}
          className={'si-sam__tab' + (tab === 'detect' ? ' is-active' : '')}
          onClick={() => onTabChange('detect')}
        >
          <i className="fa-solid fa-wand-magic-sparkles" aria-hidden /> Detect
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'samples'}
          className={'si-sam__tab' + (tab === 'samples' ? ' is-active' : '')}
          onClick={() => onTabChange('samples')}
        >
          <i className="fa-solid fa-layer-group" aria-hidden /> Training Samples
          {train.sampleCount > 0 ? <em>{train.sampleCount}</em> : null}
        </button>
      </div>

      {tab === 'samples' ? (
        <SamTrainingSamplesManager
          train={train}
          digitizing={trainDigitizing}
          onDigitizingChange={onTrainDigitizingChange}
          canAddFromSam={hasResult}
          onAddFromSam={onAddTrainFromSam}
        />
      ) : (
        <section className="si-sam__card">
          <div className="si-sam__aoi" role="group" aria-label="AOI Source">
            <div className="si-sam__row si-sam__aoi-source" role="radiogroup" aria-label="AOI source">
              <span className="si-sam__label">AOI Source</span>
              <div className="si-sam__mode-group">
                <button
                  type="button"
                  role="radio"
                  aria-checked={aoiSource === 'layer'}
                  className={`si-sam__mode${aoiSource === 'layer' ? ' is-selected' : ''}`}
                  title="Use an existing polygon layer as the analysis boundary"
                  onClick={() => onAoiSourceChange('layer')}
                >
                  <i className="fa-solid fa-layer-group" aria-hidden /> AOI Layer
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={aoiSource === 'draw'}
                  className={`si-sam__mode${aoiSource === 'draw' ? ' is-selected' : ''}`}
                  title="Draw a polygon AOI with map sketch tools"
                  onClick={() => onAoiSourceChange('draw')}
                >
                  <i className="fa-solid fa-draw-polygon" aria-hidden /> Draw AOI
                </button>
              </div>
            </div>

            {aoiSource === 'layer' ? (
              <label className="si-sam__row si-sam__aoi-layer">
                <span className="si-sam__label">Layer</span>
                <select
                  className="si-sam__select"
                  value={aoiLayerId}
                  onChange={e => onAoiLayerIdChange(e.target.value)}
                  aria-label="AOI polygon layer"
                  disabled={aoiLayerOptions.length === 0}
                >
                  {aoiLayerOptions.length === 0 ? (
                    <option value="">Add a polygon layer from Layers</option>
                  ) : (
                    aoiLayerOptions.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                        {o.featureCount > 0 ? ` (${o.featureCount})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
            ) : (
              <div className="si-sam__row si-sam__aoi-draw">
                <button
                  type="button"
                  className={'si-sam__btn si-sam__btn--aoi' + (aoiDrawing ? ' is-active' : '')}
                  onClick={onStartDrawAoi}
                  disabled={busy}
                  title="Sketch a polygon AOI on the map"
                >
                  <i className={`fa-solid ${aoiDrawing ? 'fa-pen' : 'fa-draw-polygon'}`} aria-hidden />
                  {aoiDrawing ? 'Drawing…' : aoiReady ? 'Redraw AOI' : 'Draw AOI'}
                </button>
                <button
                  type="button"
                  className="si-sam__btn si-sam__btn--ghost"
                  onClick={onClearDrawAoi}
                  disabled={!aoiReady && !aoiDrawing}
                  title="Clear drawn AOI"
                >
                  <i className="fa-solid fa-xmark" aria-hidden /> Clear
                </button>
              </div>
            )}

            <p
              className={'si-sam__aoi-status' + (aoiReady ? ' is-ready' : ' is-missing')}
              role="status"
            >
              {aoiReady ? (
                <>
                  <i className="fa-solid fa-circle-check" aria-hidden /> {aoiUnitCount} AOI unit
                  {aoiUnitCount === 1 ? '' : 's'} — full-AOI instance segmentation (mask + centroid per object)
                </>
              ) : aoiSource === 'layer' ? (
                <>
                  <i className="fa-solid fa-circle-info" aria-hidden /> Pick a polygon layer to use as the analysis
                  AOI
                </>
              ) : (
                <>
                  <i className="fa-solid fa-circle-info" aria-hidden /> Draw a polygon AOI on the map
                </>
              )}
            </p>
          </div>

          <div className="si-sam__row si-sam__classtype" role="radiogroup" aria-label="Class type">
            <span className="si-sam__label">Class type</span>
            <button
              type="button"
              role="radio"
              aria-checked={classType === 'fg'}
              className={`si-sam__pill si-sam__pill--fg${classType === 'fg' ? ' is-selected' : ''}`}
              onClick={() => onClassTypeChange('fg')}
            >
              <span className="si-sam__dot" /> Foreground
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={classType === 'bg'}
              className={`si-sam__pill si-sam__pill--bg${classType === 'bg' ? ' is-selected' : ''}`}
              onClick={() => onClassTypeChange('bg')}
            >
              <span className="si-sam__dot" /> Background
            </button>
          </div>

          <div className="si-sam__row si-sam__featuremode" role="radiogroup" aria-label="GIS feature type">
            <span className="si-sam__label">GIS output</span>
            <div className="si-sam__mode-group">
              {FEATURE_MODES.map(m => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={featureMode === m.id}
                  className={`si-sam__mode${featureMode === m.id ? ' is-selected' : ''}`}
                  title={m.title}
                  onClick={() => onFeatureModeChange(m.id)}
                >
                  <i className={`fa-solid ${m.icon}`} aria-hidden /> {m.label}
                </button>
              ))}
            </div>
          </div>

          {showObjectType ? (
            <div className="si-sam__object-type" role="group" aria-label="Detected object type">
              <label className="si-sam__row si-sam__object-type-row">
                <span className="si-sam__label">Object type</span>
                <select
                  className="si-sam__select"
                  value={objectTypeId}
                  onChange={e => onObjectTypeIdChange(e.target.value)}
                  aria-label="Detected object type"
                >
                  {objectTypeOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                      {o.id === 'other' ? ' (Free Text)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {showOtherText ? (
                <label className="si-sam__row si-sam__object-type-row">
                  <span className="si-sam__label">Custom</span>
                  <input
                    className="si-sam__input"
                    type="text"
                    value={customObjectType}
                    onChange={e => onCustomObjectTypeChange(e.target.value)}
                    placeholder="Enter object type…"
                    aria-label="Custom detected object type"
                  />
                </label>
              ) : null}
            </div>
          ) : null}

          <div className="si-sam__row si-sam__counts">
            <span className="si-sam__count si-sam__count--fg">
              <i className="fa-solid fa-location-dot" aria-hidden /> FG <strong>{fgCount}</strong>
            </span>
            <span className="si-sam__count si-sam__count--bg">
              <i className="fa-solid fa-ban" aria-hidden /> BG <strong>{bgCount}</strong>
            </span>
          </div>

          {hasResult ? (
            <div className="si-sam__row si-sam__stats" aria-label="Extracted feature counts">
              <span className="si-sam__stat si-sam__stat--objects" title="Unique detected objects (instance count)">
                <i className="fa-solid fa-layer-group" aria-hidden /> {objectCount} objects
              </span>
              <span className="si-sam__stat" title="Centroid markers">
                <i className="fa-solid fa-location-dot" aria-hidden /> {stats.point} Pt
              </span>
              <span className="si-sam__stat" title="Line features (roads / rivers)">
                <i className="fa-solid fa-road" aria-hidden /> {stats.line} Ln
              </span>
              <span className="si-sam__stat" title="Instance mask polygons">
                <i className="fa-solid fa-draw-polygon" aria-hidden /> {stats.polygon} Poly
              </span>
            </div>
          ) : null}

          <label className="si-sam__row si-sam__opacity">
            <span className="si-sam__label">Confidence</span>
            <input
              type="range"
              min={0.3}
              max={0.9}
              step={0.05}
              value={minConfidence}
              onChange={e => onMinConfidenceChange(Number(e.target.value))}
              title="Drop GIS features below this confidence"
            />
            <span className="si-sam__opacity-val">{minConfidence.toFixed(2)}</span>
          </label>

          <label className="si-sam__row si-sam__opacity">
            <span className="si-sam__label">Mask opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={maskOpacity}
              onChange={e => onMaskOpacityChange(Number(e.target.value))}
            />
            <span className="si-sam__opacity-val">{maskOpacity.toFixed(2)}</span>
          </label>

          <div className="si-sam__actions">
            <button
              type="button"
              className="si-sam__btn si-sam__btn--primary"
              onClick={onSegment}
              disabled={!canSegment}
              title={
                !aoiReady
                  ? 'Select or draw an AOI first'
                  : !objectTypeReady
                    ? 'Select a Detected Object Type first'
                    : 'Scan the entire AOI and extract GIS-ready features'
              }
            >
              {busy ? (
                <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
              ) : (
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden />
              )}{' '}
              Segment
            </button>
            <button
              type="button"
              className="si-sam__btn"
              onClick={onSave}
              disabled={!hasResult || busy}
              title="Save features to the layer and start a new object"
            >
              <i className="fa-solid fa-floppy-disk" aria-hidden /> Save
            </button>
            <button
              type="button"
              className="si-sam__btn"
              onClick={onReset}
              disabled={busy || (totalPoints === 0 && !hasResult)}
              title="Clear current points and mask"
            >
              <i className="fa-solid fa-rotate-left" aria-hidden /> Reset
            </button>
          </div>
          <div className="si-sam__actions si-sam__actions--secondary">
            <button
              type="button"
              className="si-sam__btn si-sam__btn--ghost"
              onClick={onUndo}
              disabled={totalPoints === 0 || busy}
            >
              <i className="fa-solid fa-arrow-rotate-left" aria-hidden /> Undo point
            </button>
            <button
              type="button"
              className="si-sam__btn si-sam__btn--ghost"
              onClick={onExport}
              disabled={savedCount === 0}
              title="Download GeoJSON for ArcGIS Pro / QGIS (EPSG:4326)"
            >
              <i className="fa-solid fa-download" aria-hidden /> Export ({savedCount})
            </button>
          </div>

          <div className={`si-sam__status is-${phase}`}>
            {phase === 'error' ? (
              <>
                <i className="fa-solid fa-triangle-exclamation" aria-hidden />{' '}
                {error || PHASE_LABEL[phase]}
                {offline ? (
                  <span className="si-sam__status-hint">
                    {' '}
                    Start SAM: <code>C:\samenv\Scripts\python.exe -m uvicorn app:app --port 8090</code>
                  </span>
                ) : null}
              </>
            ) : (
              <>
                {busy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> : null}{' '}
                {PHASE_LABEL[phase]}
                {phase === 'segmenting' && showProgress ? (
                  <span className="si-sam__status-hint"> · {progressPct}%</span>
                ) : null}
                {phase === 'done' && typeof score === 'number' ? (
                  <span className="si-sam__status-hint"> · quality {(score * 100).toFixed(0)}%</span>
                ) : null}
              </>
            )}
            {showProgress && phase === 'segmenting' ? (
              <div className="si-sam__progress" aria-hidden>
                <div className="si-sam__progress-track">
                  <div className="si-sam__progress-fill" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}
    </div>
  )
}
