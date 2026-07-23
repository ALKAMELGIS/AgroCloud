import { useEffect, useRef, useState } from 'react'
import {
  ICW_STEPS,
  type UseImageClassificationWizardReturn,
} from './useImageClassificationWizard'
import type { ServerRasterLayerConfig } from '../../../../lib/raster/siRasterTileService'
import './ImageClassificationWizardPanel.css'

/** Sample-drawing tools (isolated from the general map drawing tool). */
export type IcwSampleDrawTool = 'polygon' | 'rectangle' | 'circle' | 'point'

type ImageClassificationWizardPanelProps = {
  wizard: UseImageClassificationWizardReturn
  /** Raster layers already loaded on the map (ArcGIS-style "Existing Map Raster" source). */
  existingRasters?: ServerRasterLayerConfig[]
  /** True when a training-sample polygon is currently sketched on the map, enabling capture. */
  hasDrawnGeometry?: boolean
  /** The wizard's own active sample-drawing tool, or null when idle. Decoupled from the map dock. */
  sampleDrawTool?: IcwSampleDrawTool | null
  /** True while the wizard's isolated sample-drawing mode is on. */
  sampleDrawActive?: boolean
  /** Activate one of the wizard's own drawing tools (does not touch the general map drawing tool). */
  onSampleDrawToolChange?: (tool: IcwSampleDrawTool) => void
  /** Turn the wizard's sample-drawing mode off. */
  onSampleDrawStop?: () => void
  /** Discard the current in-progress sample sketch without leaving the tool. */
  onClearSampleSketch?: () => void
  onClose: () => void
}

/** Drawing tools offered by the Training Samples Manager (polygon-family + point). */
const SAMPLE_DRAW_TOOLS: Array<{ id: IcwSampleDrawTool; label: string; icon: string; hint: string }> = [
  { id: 'polygon', label: 'Polygon', icon: 'fa-draw-polygon', hint: 'Draw a polygon around pixels' },
  { id: 'rectangle', label: 'Rectangle', icon: 'fa-vector-square', hint: 'Draw a rectangle around pixels' },
  { id: 'circle', label: 'Circle', icon: 'fa-circle', hint: 'Draw a circle around pixels' },
]

const RASTER_ACCEPT =
  '.tif,.tiff,.geotiff,.jp2,.j2k,.png,.jpg,.jpeg,.xml,.prj,.wld,.pgw,.jgw,.jpgw,.tfw,image/tiff,image/png,image/jpeg'

/** Human-readable label for a record's georeferencing source. */
function describeGeorefSource(source: string): string {
  if (source === 'dimap') return 'Auto-georeferenced from DIMAP metadata (DIM_*.XML)'
  if (source === 'worldfile') return 'Auto-georeferenced from world file'
  if (source === 'embedded') return 'Georeferenced from embedded projection'
  if (source === 'existing-layer') return 'Already georeferenced on the map — ready to classify'
  if (source.startsWith('manual:')) {
    const mode = source.slice('manual:'.length)
    const label =
      mode === 'corners' ? 'corner coordinates' : mode === 'gcps' ? 'ground control points' : 'bounding box'
    return `Placed manually via ${label}`
  }
  return 'Georeferenced'
}

export function ImageClassificationWizardPanel({
  wizard,
  existingRasters = [],
  hasDrawnGeometry = false,
  sampleDrawTool = null,
  sampleDrawActive = false,
  onSampleDrawToolChange,
  onSampleDrawStop,
  onClearSampleSketch,
  onClose,
}: ImageClassificationWizardPanelProps) {
  const {
    method,
    setMethod,
    type,
    setType,
    schemaName,
    setSchemaName,
    projectName,
    setProjectName,
    step,
    goNext,
    goPrev,
    goToStep,
    raster,
    busy,
    error,
    statusMessage,
    serviceOnline,
    serviceConfig,
    uploadRaster,
    selectExistingRaster,
    clearRaster,
    georefPending,
    georefBusy,
    georefSourceDetected,
    segAlgorithm,
    setSegAlgorithm,
    spectralDetail,
    setSpectralDetail,
    spatialDetail,
    setSpatialDetail,
    minSegmentSize,
    setMinSegmentSize,
    segmentation,
    segmentationBusy,
    segmentationError,
    segmentationStatus,
    runSegmentationNow,
    clearSegmentation,
    classes,
    activeClassId,
    setActiveClassId,
    addClass,
    removeClass,
    samples,
    addActiveClassSample,
    clearSamples,
    sampleError,
    classifier,
    setClassifier,
    nEstimators,
    setNEstimators,
    nClusters,
    setNClusters,
    trainResult,
    trainBusy,
    trainError,
    trainStatus,
    runTrainingNow,
    clearTraining,
    classifyResult,
    classifyBusy,
    classifyError,
    classifyStatus,
    runClassificationNow,
    clearClassification,
    clusterAssignments,
    setAssignmentName,
    setAssignmentColor,
    assignBusy,
    assignError,
    applyClassAssignments,
    accMethod,
    setAccMethod,
    accCount,
    setAccCount,
    checkPointsBusy,
    checkPointsCount,
    generateCheckPointsNow,
    referenceCount,
    referenceName,
    loadReferenceFromFile,
    clearReference,
    accuracyReport,
    accuracyBusy,
    accuracyError,
    runAccuracyNow,
    clearAccuracy,
  } = wizard

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const referenceInputRef = useRef<HTMLInputElement | null>(null)
  const [optionalOpen, setOptionalOpen] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  // ArcGIS-style Input Raster source: pick a layer already on the map, or browse files.
  const hasExistingRasters = existingRasters.length > 0
  const [inputSource, setInputSource] = useState<'existing' | 'browse'>(
    hasExistingRasters ? 'existing' : 'browse',
  )
  // If layers appear/disappear while the panel is open, keep the source sensible.
  useEffect(() => {
    if (!hasExistingRasters) setInputSource('browse')
  }, [hasExistingRasters])

  const rasterReady = !!raster
  const objectBased = type === 'object'
  const supervised = method === 'supervised'
  const totalSamples = samples.length
  const activeClassName = classes.find(cls => cls.id === activeClassId)?.name ?? null
  const classifierOptions = supervised
    ? [
        { id: 'random_forest', label: 'Random Forest' },
        { id: 'knn', label: 'K-Nearest Neighbors' },
        { id: 'svm_rbf', label: 'SVM (RBF kernel)' },
        { id: 'gaussian_nb', label: 'Gaussian Naive Bayes' },
      ]
    : [{ id: 'kmeans', label: 'K-Means clustering' }]
  // Step 1 (Segmentation) only applies to object-based; step 2 (samples) to supervised.
  const canAdvance =
    step === 0
      ? rasterReady && !busy && !georefPending && !georefBusy
      : step === 1
        ? !segmentationBusy && (!objectBased || !!segmentation)
        : step === 2
          ? !supervised || totalSamples > 0
          : step === 3
            ? !!trainResult && !trainBusy
            : step === 4
              ? !!classifyResult && !classifyBusy
              : false

  const handleAddClass = () => {
    addClass(newClassName)
    setNewClassName('')
  }

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (files.length) void uploadRaster(files)
  }

  return (
    <div className="si-icw">
      <header className="si-icw__brand">
        <span className="si-icw__brand-mark">
          <i className="fa-solid fa-shapes" aria-hidden />
        </span>
        <span className="si-icw__brand-text">
          <span className="si-icw__brand-title">Image Classification Wizard</span>
          <span className="si-icw__brand-sub">Supervised &amp; unsupervised land-cover</span>
        </span>
        <button
          type="button"
          className="si-icw__close"
          onClick={onClose}
          aria-label="Collapse"
        >
          <i className="fa-solid fa-chevron-up" aria-hidden />
        </button>
      </header>

      <div className="si-icw__stepper" role="tablist" aria-label="Classification steps">
        {ICW_STEPS.map((label, index) => {
          const state = index === step ? 'active' : index < step ? 'done' : 'todo'
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={index === step}
              className="si-icw__dot"
              data-state={state}
              title={label}
              onClick={() => goToStep(index)}
            >
              <span className="si-icw__dot-mark" />
              <span className="si-icw__dot-label">{label}</span>
            </button>
          )
        })}
      </div>

      <div className="si-icw__step-heading">
        <span className="si-icw__step-index">
          Step {step + 1} / {ICW_STEPS.length}
        </span>
        <span className="si-icw__step-name">{ICW_STEPS[step]}</span>
      </div>

      {step === 0 ? (
        <section className="si-icw__card">
          <div className="si-icw__field">
            <label className="si-icw__label">Input raster</label>

            <div className="si-icw__source" role="radiogroup" aria-label="Input raster source">
              <label
                className={
                  'si-icw__source-opt' + (inputSource === 'existing' ? ' si-icw__source-opt--active' : '')
                }
              >
                <input
                  type="radio"
                  name="si-icw-input-source"
                  checked={inputSource === 'existing'}
                  onChange={() => setInputSource('existing')}
                  disabled={!hasExistingRasters}
                />
                <span>
                  <i className="fa-solid fa-layer-group" aria-hidden /> Existing map raster
                </span>
              </label>
              <label
                className={
                  'si-icw__source-opt' + (inputSource === 'browse' ? ' si-icw__source-opt--active' : '')
                }
              >
                <input
                  type="radio"
                  name="si-icw-input-source"
                  checked={inputSource === 'browse'}
                  onChange={() => setInputSource('browse')}
                />
                <span>
                  <i className="fa-solid fa-folder-open" aria-hidden /> Browse raster files
                </span>
              </label>
            </div>

            {inputSource === 'existing' ? (
              hasExistingRasters ? (
                <select
                  className="si-icw__select"
                  aria-label="Select a raster layer on the map"
                  value={raster?.rasterId ?? ''}
                  onChange={event => {
                    const found = existingRasters.find(r => r.rasterId === event.target.value)
                    if (found) selectExistingRaster(found)
                  }}
                >
                  <option value="">Select a raster layer…</option>
                  {existingRasters.map(r => (
                    <option key={r.rasterId} value={r.rasterId}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="si-icw__hint">
                  No raster layers are on the map yet. Add one with the Raster tool or switch to{' '}
                  <strong>Browse raster files</strong>.
                </p>
              )
            ) : (
              <>
                <input
                  id="si-icw-raster"
                  ref={fileInputRef}
                  type="file"
                  accept={RASTER_ACCEPT}
                  multiple
                  className="si-icw__file-input"
                  onChange={handleFilePick}
                />
                <button
                  type="button"
                  className="si-icw__file-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                >
                  {busy ? (
                    <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                  ) : (
                    <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
                  )}
                  <span>{raster ? 'Choose a different image…' : 'Choose imagery to classify…'}</span>
                </button>
                <p className="si-icw__hint">
                  GeoTIFF · COG · JP2 · PNG/JPEG (+ world file) · ECW · MrSID
                </p>
              </>
            )}

            {raster ? (
              <div className="si-icw__raster-chip">
                <i className="fa-solid fa-image" aria-hidden />
                <span className="si-icw__raster-name" title={raster.metadataSummary}>
                  {raster.name}
                </span>
                <button
                  type="button"
                  className="si-icw__raster-clear"
                  onClick={clearRaster}
                  aria-label="Remove raster"
                >
                  <i className="fa-solid fa-xmark" aria-hidden />
                </button>
              </div>
            ) : null}
            {raster ? (
              <>
                <p className="si-icw__raster-meta">{raster.metadataSummary}</p>
                {georefSourceDetected && georefSourceDetected !== 'sidecar' ? (
                  <p className="si-icw__georef-note">
                    <i className="fa-solid fa-circle-check" aria-hidden />
                    <span>{describeGeorefSource(georefSourceDetected)}</span>
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="si-icw__field">
            <label className="si-icw__label" htmlFor="si-icw-method">
              Classification method
            </label>
            <select
              id="si-icw-method"
              className="si-icw__select"
              value={method}
              onChange={event => setMethod(event.target.value as typeof method)}
            >
              <option value="supervised">Supervised</option>
              <option value="unsupervised">Unsupervised</option>
            </select>
          </div>

          <div className="si-icw__field">
            <label className="si-icw__label" htmlFor="si-icw-type">
              Classification type
            </label>
            <select
              id="si-icw-type"
              className="si-icw__select"
              value={type}
              onChange={event => setType(event.target.value as typeof type)}
            >
              <option value="pixel">Pixel based</option>
              <option value="object">Object based</option>
            </select>
          </div>

          <div className="si-icw__field">
            <label className="si-icw__label" htmlFor="si-icw-schema">
              Classification schema
            </label>
            <input
              id="si-icw-schema"
              className="si-icw__input"
              placeholder="e.g. Land cover (water, veg, urban, soil)"
              value={schemaName}
              onChange={event => setSchemaName(event.target.value)}
            />
          </div>

          <div className="si-icw__field">
            <label className="si-icw__label" htmlFor="si-icw-project">
              Output project name
            </label>
            <input
              id="si-icw-project"
              className="si-icw__input"
              placeholder="classification-project"
              value={projectName}
              onChange={event => setProjectName(event.target.value)}
            />
          </div>

          <div className="si-icw__optional">
            <button
              type="button"
              className="si-icw__optional-toggle"
              onClick={() => setOptionalOpen(open => !open)}
              aria-expanded={optionalOpen}
            >
              <i
                className={`fa-solid ${optionalOpen ? 'fa-chevron-down' : 'fa-chevron-right'}`}
                aria-hidden
              />
              Optional inputs
            </button>
            {optionalOpen ? (
              <div className="si-icw__optional-body">
                <div className="si-icw__field">
                  <label className="si-icw__label">Segmented image</label>
                  <select className="si-icw__select" disabled>
                    <option>None selected</option>
                  </select>
                </div>
                <div className="si-icw__field">
                  <label className="si-icw__label">Training samples</label>
                  <select className="si-icw__select" disabled>
                    <option>None selected</option>
                  </select>
                </div>
                <div className="si-icw__field">
                  <label className="si-icw__label">Reference dataset</label>
                  <select className="si-icw__select" disabled>
                    <option>None selected</option>
                  </select>
                </div>
                <p className="si-icw__hint">Populated in later steps (segmentation, samples, accuracy).</p>
              </div>
            ) : null}
          </div>
        </section>
      ) : step === 1 ? (
        <section className="si-icw__card">
          {!objectBased ? (
            <div className="si-icw__placeholder">
              <i className="fa-solid fa-circle-info" aria-hidden />
              <p>
                <strong>Segmentation</strong> applies to <em>object-based</em> classification.
              </p>
              <p className="si-icw__hint">
                Your project is pixel-based — continue to the next step.
              </p>
            </div>
          ) : (
            <>
              <div className="si-icw__field">
                <label className="si-icw__label" htmlFor="si-icw-seg-algo">
                  Segmentation algorithm
                </label>
                <select
                  id="si-icw-seg-algo"
                  className="si-icw__select"
                  value={segAlgorithm}
                  onChange={event => setSegAlgorithm(event.target.value as typeof segAlgorithm)}
                >
                  <option value="slic">SLIC superpixels</option>
                  <option value="felzenszwalb">Felzenszwalb</option>
                </select>
              </div>

              <div className="si-icw__field">
                <label className="si-icw__label">
                  Spectral detail <span className="si-icw__slider-value">{spectralDetail}</span>
                </label>
                <input
                  type="range"
                  className="si-icw__range"
                  min={1}
                  max={20}
                  step={1}
                  value={spectralDetail}
                  onChange={event => setSpectralDetail(Number(event.target.value))}
                />
              </div>

              <div className="si-icw__field">
                <label className="si-icw__label">
                  Spatial detail <span className="si-icw__slider-value">{spatialDetail}</span>
                </label>
                <input
                  type="range"
                  className="si-icw__range"
                  min={1}
                  max={20}
                  step={1}
                  value={spatialDetail}
                  onChange={event => setSpatialDetail(Number(event.target.value))}
                />
              </div>

              <div className="si-icw__field">
                <label className="si-icw__label" htmlFor="si-icw-min-size">
                  Minimum segment size <span className="si-icw__slider-value">{minSegmentSize}px</span>
                </label>
                <input
                  id="si-icw-min-size"
                  type="range"
                  className="si-icw__range"
                  min={1}
                  max={200}
                  step={1}
                  value={minSegmentSize}
                  onChange={event => setMinSegmentSize(Number(event.target.value))}
                />
              </div>

              <button
                type="button"
                className="si-icw__file-btn"
                onClick={() => void runSegmentationNow()}
                disabled={segmentationBusy || !rasterReady}
              >
                {segmentationBusy ? (
                  <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                ) : (
                  <i className="fa-solid fa-object-group" aria-hidden />
                )}
                <span>{segmentation ? 'Re-run segmentation' : 'Run segmentation'}</span>
              </button>

              {segmentation ? (
                <div className="si-icw__raster-chip">
                  <i className="fa-solid fa-border-all" aria-hidden />
                  <span className="si-icw__raster-name">
                    {segmentation.segment_count} segments · {segmentation.algorithm}
                  </span>
                  <button
                    type="button"
                    className="si-icw__raster-clear"
                    onClick={clearSegmentation}
                    aria-label="Clear segmentation preview"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden />
                  </button>
                </div>
              ) : (
                <p className="si-icw__hint">
                  Segment boundaries preview on the map before you commit. Requires the ML service.
                </p>
              )}
            </>
          )}
        </section>
      ) : step === 2 ? (
        <section className="si-icw__card">
          {!supervised ? (
            <div className="si-icw__placeholder">
              <i className="fa-solid fa-circle-info" aria-hidden />
              <p>
                <strong>Training samples</strong> apply to <em>supervised</em> classification.
              </p>
              <p className="si-icw__hint">
                Unsupervised clusters are labelled later (Assign classes).
              </p>
            </div>
          ) : (
            <>
              <div className="si-icw__field">
                <label className="si-icw__label">Class schema</label>
                <div className="si-icw__class-add">
                  <input
                    className="si-icw__input"
                    placeholder="New class name (e.g. Water)"
                    value={newClassName}
                    onChange={event => setNewClassName(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') handleAddClass()
                    }}
                  />
                  <button
                    type="button"
                    className="si-icw__icon-btn"
                    onClick={handleAddClass}
                    aria-label="Add class"
                  >
                    <i className="fa-solid fa-plus" aria-hidden />
                  </button>
                </div>
              </div>

              {classes.length === 0 ? (
                <p className="si-icw__hint">Add at least one class to start collecting samples.</p>
              ) : (
                <ul className="si-icw__class-list">
                  {classes.map(cls => {
                    const count = samples.filter(s => s.classId === cls.id).length
                    const pct = totalSamples ? Math.round((count / totalSamples) * 100) : 0
                    return (
                      <li
                        key={cls.id}
                        className="si-icw__class-row"
                        data-active={cls.id === activeClassId}
                      >
                        <button
                          type="button"
                          className="si-icw__class-pick"
                          onClick={() => setActiveClassId(cls.id)}
                          title="Select as active class"
                        >
                          <span className="si-icw__class-swatch" style={{ background: cls.color }} />
                          <span className="si-icw__class-name">{cls.name}</span>
                          <span className="si-icw__class-count">
                            {count} · {pct}%
                          </span>
                        </button>
                        <button
                          type="button"
                          className="si-icw__raster-clear"
                          onClick={() => removeClass(cls.id)}
                          aria-label={`Delete ${cls.name}`}
                        >
                          <i className="fa-solid fa-trash" aria-hidden />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="si-icw__field">
                <label className="si-icw__label">Sketch a training sample</label>
                <div
                  className="si-icw__sample-tools"
                  role="group"
                  aria-label="Training-sample drawing tools"
                >
                  {SAMPLE_DRAW_TOOLS.map(tool => {
                    const active = sampleDrawActive && sampleDrawTool === tool.id
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        className={
                          'si-icw__sample-tool' +
                          (active ? ' si-icw__sample-tool--active' : '')
                        }
                        aria-pressed={active}
                        onClick={() =>
                          active ? onSampleDrawStop?.() : onSampleDrawToolChange?.(tool.id)
                        }
                        disabled={!activeClassId || !onSampleDrawToolChange}
                        title={tool.hint}
                      >
                        <i className={`fa-solid ${tool.icon}`} aria-hidden />
                        <span>{tool.label}</span>
                      </button>
                    )
                  })}
                </div>
                {sampleDrawActive ? (
                  <div className="si-icw__sample-drawbar">
                    <span className="si-icw__sample-drawbar-note">
                      <i className="fa-solid fa-pen-nib" aria-hidden /> Drawing on the map — finish a
                      shape, then add it.
                    </span>
                    <button
                      type="button"
                      className="si-icw__btn si-icw__btn--ghost"
                      onClick={() => onSampleDrawStop?.()}
                    >
                      Stop
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="si-icw__file-btn"
                onClick={() => addActiveClassSample()}
                disabled={!activeClassId || !hasDrawnGeometry}
              >
                <i className="fa-solid fa-plus" aria-hidden />
                <span>Add drawn sample to “{activeClassName ?? 'class'}”</span>
              </button>
              <p className="si-icw__hint">
                Pick a class, choose a sketch tool above, draw the sample on the map, then add it.
                These tools are independent of the map’s general drawing tool. Collected{' '}
                <strong>{totalSamples}</strong> sample{totalSamples === 1 ? '' : 's'}.
                {hasDrawnGeometry ? (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="si-icw__link-btn"
                      onClick={() => onClearSampleSketch?.()}
                    >
                      Discard current sketch
                    </button>
                  </>
                ) : null}
              </p>
              {totalSamples > 0 ? (
                <button
                  type="button"
                  className="si-icw__btn si-icw__btn--ghost si-icw__clear-samples"
                  onClick={clearSamples}
                >
                  Clear all samples
                </button>
              ) : null}
            </>
          )}
        </section>
      ) : step === 3 ? (
        <section className="si-icw__card">
          <div className="si-icw__field">
            <label className="si-icw__label" htmlFor="si-icw-classifier">
              Classifier
            </label>
            <select
              id="si-icw-classifier"
              className="si-icw__select"
              value={classifier}
              onChange={event => setClassifier(event.target.value as typeof classifier)}
            >
              {classifierOptions.map(opt => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {classifier === 'random_forest' ? (
            <div className="si-icw__field">
              <label className="si-icw__label">
                Trees <span className="si-icw__slider-value">{nEstimators}</span>
              </label>
              <input
                type="range"
                className="si-icw__range"
                min={20}
                max={500}
                step={10}
                value={nEstimators}
                onChange={event => setNEstimators(Number(event.target.value))}
              />
            </div>
          ) : null}

          {classifier === 'kmeans' ? (
            <div className="si-icw__field">
              <label className="si-icw__label">
                Clusters <span className="si-icw__slider-value">{nClusters}</span>
              </label>
              <input
                type="range"
                className="si-icw__range"
                min={2}
                max={20}
                step={1}
                value={nClusters}
                onChange={event => setNClusters(Number(event.target.value))}
              />
            </div>
          ) : null}

          {supervised ? (
            <p className="si-icw__hint">
              Fits on <strong>{totalSamples}</strong> training sample{totalSamples === 1 ? '' : 's'}{' '}
              across <strong>{classes.length}</strong> class{classes.length === 1 ? '' : 'es'}.
            </p>
          ) : (
            <p className="si-icw__hint">Unsupervised — clusters pixels into {nClusters} groups.</p>
          )}

          <button
            type="button"
            className="si-icw__file-btn"
            onClick={() => void runTrainingNow()}
            disabled={trainBusy || (supervised && totalSamples === 0)}
          >
            {trainBusy ? (
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
            ) : (
              <i className="fa-solid fa-brain" aria-hidden />
            )}
            <span>{trainResult ? 'Re-train model' : 'Train model'}</span>
          </button>

          {trainResult ? (
            <div className="si-icw__result">
              <div className="si-icw__result-row">
                <span>Classifier</span>
                <strong>{trainResult.classifier}</strong>
              </div>
              {typeof trainResult.train_accuracy === 'number' ? (
                <div className="si-icw__result-row">
                  <span>Training fit</span>
                  <strong>{(trainResult.train_accuracy * 100).toFixed(1)}%</strong>
                </div>
              ) : null}
              <div className="si-icw__result-row">
                <span>Bands · pixels</span>
                <strong>
                  {trainResult.band_count} · {trainResult.n_training_pixels.toLocaleString()}
                </strong>
              </div>
              <button
                type="button"
                className="si-icw__btn si-icw__btn--ghost si-icw__clear-samples"
                onClick={clearTraining}
              >
                Clear model
              </button>
            </div>
          ) : null}
        </section>
      ) : step === 4 ? (
        <section className="si-icw__card">
          {!trainResult ? (
            <div className="si-icw__placeholder">
              <i className="fa-solid fa-circle-info" aria-hidden />
              <p>
                Train a model in <strong>Step 4</strong> first.
              </p>
            </div>
          ) : (
            <>
              <p className="si-icw__hint">
                Applies the trained model to the whole image and overlays the result on the map.
              </p>
              <button
                type="button"
                className="si-icw__file-btn"
                onClick={() => void runClassificationNow()}
                disabled={classifyBusy}
              >
                {classifyBusy ? (
                  <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                ) : (
                  <i className="fa-solid fa-layer-group" aria-hidden />
                )}
                <span>{classifyResult ? 'Re-run classification' : 'Run classification'}</span>
              </button>

              {classifyResult ? (
                <>
                  {!supervised ? (
                    <>
                      <p className="si-icw__hint">
                        Assign each cluster to a class — give clusters the{' '}
                        <strong>same name to merge</strong> them.
                      </p>
                      <ul className="si-icw__class-list">
                        {classifyResult.class_distribution.map(item => {
                          const draft = clusterAssignments[item.value]
                          return (
                            <li key={item.value} className="si-icw__class-row">
                              <span className="si-icw__assign-row">
                                <input
                                  type="color"
                                  className="si-icw__color"
                                  value={draft?.color ?? item.color}
                                  onChange={event =>
                                    setAssignmentColor(item.value, event.target.value)
                                  }
                                  aria-label={`Color for cluster ${item.value}`}
                                />
                                <input
                                  type="text"
                                  className="si-icw__assign-name"
                                  value={draft?.name ?? item.name}
                                  placeholder={`Cluster ${item.value}`}
                                  onChange={event =>
                                    setAssignmentName(item.value, event.target.value)
                                  }
                                  aria-label={`Class name for cluster ${item.value}`}
                                />
                                <span className="si-icw__class-count">{item.pct}%</span>
                              </span>
                            </li>
                          )
                        })}
                      </ul>
                      <button
                        type="button"
                        className="si-icw__file-btn"
                        onClick={() => void applyClassAssignments()}
                        disabled={assignBusy}
                      >
                        {assignBusy ? (
                          <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                        ) : (
                          <i className="fa-solid fa-object-group" aria-hidden />
                        )}
                        <span>Apply class assignment</span>
                      </button>
                    </>
                  ) : (
                    <ul className="si-icw__class-list">
                      {classifyResult.class_distribution.map(item => (
                        <li key={item.value} className="si-icw__class-row">
                          <span className="si-icw__class-pick" style={{ cursor: 'default' }}>
                            <span
                              className="si-icw__class-swatch"
                              style={{ background: item.color }}
                            />
                            <span className="si-icw__class-name">{item.name}</span>
                            <span className="si-icw__class-count">{item.pct}%</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="si-icw__btn si-icw__btn--ghost si-icw__clear-samples"
                    onClick={clearClassification}
                  >
                    Remove overlay
                  </button>
                </>
              ) : null}
            </>
          )}
        </section>
      ) : step === 5 ? (
        <section className="si-icw__card">
          {!classifyResult ? (
            <div className="si-icw__placeholder">
              <i className="fa-solid fa-circle-info" aria-hidden />
              <p>
                Run the classification in <strong>Step 5</strong> first.
              </p>
            </div>
          ) : (
            <>
              <div className="si-icw__field">
                <label className="si-icw__label">Check points</label>
                <div className="si-icw__acc-controls">
                  <select
                    className="si-icw__select"
                    value={accMethod}
                    onChange={event => setAccMethod(event.target.value as typeof accMethod)}
                  >
                    <option value="stratified">Stratified (by area)</option>
                    <option value="equalized">Equalized (per class)</option>
                  </select>
                  <input
                    type="number"
                    className="si-icw__num"
                    min={10}
                    max={2000}
                    step={10}
                    value={accCount}
                    onChange={event => setAccCount(Number(event.target.value) || 0)}
                    aria-label="Number of check points"
                  />
                </div>
                <button
                  type="button"
                  className="si-icw__btn si-icw__btn--ghost"
                  onClick={() => void generateCheckPointsNow()}
                  disabled={checkPointsBusy}
                >
                  {checkPointsBusy ? (
                    <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                  ) : (
                    <i className="fa-solid fa-map-pin" aria-hidden />
                  )}
                  <span>Generate check points</span>
                </button>
                {checkPointsCount > 0 ? (
                  <p className="si-icw__hint">
                    {checkPointsCount} points overlaid — export &amp; label them as ground truth.
                  </p>
                ) : null}
              </div>

              <div className="si-icw__field">
                <label className="si-icw__label">Reference (ground truth)</label>
                <input
                  ref={referenceInputRef}
                  type="file"
                  accept=".geojson,.json,application/geo+json,application/json"
                  hidden
                  onChange={event => {
                    const file = event.target.files?.[0]
                    if (file) void loadReferenceFromFile(file)
                    event.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="si-icw__file-btn"
                  onClick={() => referenceInputRef.current?.click()}
                >
                  <i className="fa-solid fa-file-import" aria-hidden />
                  <span>{referenceName ?? 'Load reference points (GeoJSON)…'}</span>
                </button>
                {referenceCount > 0 ? (
                  <button
                    type="button"
                    className="si-icw__btn si-icw__btn--ghost si-icw__clear-samples"
                    onClick={clearReference}
                  >
                    Clear reference
                  </button>
                ) : (
                  <p className="si-icw__hint">
                    GeoJSON points/polygons with a numeric class field (e.g. <code>class_value</code>)
                    or a name matching your schema.
                  </p>
                )}
              </div>

              <button
                type="button"
                className="si-icw__file-btn"
                onClick={() => void runAccuracyNow()}
                disabled={accuracyBusy || referenceCount === 0}
              >
                {accuracyBusy ? (
                  <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                ) : (
                  <i className="fa-solid fa-table-cells" aria-hidden />
                )}
                <span>Compute accuracy</span>
              </button>

              {accuracyReport ? (
                <div className="si-icw__result">
                  <div className="si-icw__result-row">
                    <span>Overall accuracy</span>
                    <strong>{(accuracyReport.overall_accuracy * 100).toFixed(1)}%</strong>
                  </div>
                  <div className="si-icw__result-row">
                    <span>Kappa</span>
                    <strong>
                      {accuracyReport.kappa == null ? '—' : accuracyReport.kappa.toFixed(3)}
                    </strong>
                  </div>
                  <div className="si-icw__result-row">
                    <span>Points used</span>
                    <strong>
                      {accuracyReport.n_used} / {accuracyReport.n_points}
                    </strong>
                  </div>

                  <div className="si-icw__cm-wrap" role="table" aria-label="Confusion matrix">
                    <table className="si-icw__cm">
                      <thead>
                        <tr>
                          <th className="si-icw__cm-corner">
                            truth&nbsp;\&nbsp;pred
                          </th>
                          {accuracyReport.labels.map(l => (
                            <th key={`h-${l.value}`} title={l.name}>
                              <span
                                className="si-icw__cm-swatch"
                                style={{ background: l.color }}
                              />
                              {l.value}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {accuracyReport.matrix.map((row, ri) => {
                          const rowTotal = row.reduce((a, b) => a + b, 0)
                          return (
                            <tr key={`r-${accuracyReport.labels[ri]?.value ?? ri}`}>
                              <th title={accuracyReport.labels[ri]?.name}>
                                <span
                                  className="si-icw__cm-swatch"
                                  style={{ background: accuracyReport.labels[ri]?.color }}
                                />
                                {accuracyReport.labels[ri]?.value}
                              </th>
                              {row.map((cell, ci) => {
                                const intensity = rowTotal ? cell / rowTotal : 0
                                const diag = ri === ci
                                return (
                                  <td
                                    key={`c-${ri}-${ci}`}
                                    className={diag ? 'si-icw__cm-diag' : undefined}
                                    style={{
                                      background: diag
                                        ? `rgba(56, 161, 105, ${0.15 + intensity * 0.7})`
                                        : cell > 0
                                          ? `rgba(229, 62, 62, ${0.1 + intensity * 0.55})`
                                          : 'transparent',
                                    }}
                                  >
                                    {cell || ''}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <ul className="si-icw__class-list">
                    {accuracyReport.per_class.map(pc => (
                      <li key={`pc-${pc.value}`} className="si-icw__class-row">
                        <span className="si-icw__class-pick" style={{ cursor: 'default' }}>
                          <span className="si-icw__class-swatch" style={{ background: pc.color }} />
                          <span className="si-icw__class-name">{pc.name}</span>
                          <span className="si-icw__class-count">
                            U {(pc.users_accuracy * 100).toFixed(0)}% · P{' '}
                            {(pc.producers_accuracy * 100).toFixed(0)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className="si-icw__btn si-icw__btn--ghost si-icw__clear-samples"
                    onClick={clearAccuracy}
                  >
                    Clear report
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : (
        <section className="si-icw__card si-icw__placeholder">
          <i className="fa-solid fa-person-digging" aria-hidden />
          <p>
            <strong>{ICW_STEPS[step]}</strong> arrives in a later step of the build.
          </p>
          <p className="si-icw__hint">
            Steps 1–6 (Configure · Segmentation · Samples · Train · Classify · Accuracy) are
            implemented.
          </p>
        </section>
      )}

      {(() => {
        const activeError =
          step === 1
            ? segmentationError
            : step === 2
              ? sampleError
              : step === 3
                ? trainError
                : step === 4
                  ? classifyError || assignError
                  : step === 5
                    ? accuracyError
                    : error
        const activeStatus =
          step === 1
            ? segmentationStatus
            : step === 2
              ? null
              : step === 3
                ? trainStatus
                : step === 4
                  ? classifyStatus
                  : statusMessage
        const activeBusy =
          step === 1
            ? segmentationBusy
            : step === 3
              ? trainBusy
            : step === 4
              ? classifyBusy || assignBusy
              : step === 5
                ? accuracyBusy || checkPointsBusy
                : busy || georefBusy
        if (activeError) {
          return (
            <p className="si-icw__error" role="alert">
              <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {activeError}
            </p>
          )
        }
        if (activeStatus) {
          return (
            <p className="si-icw__status">
              {activeBusy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> : null}
              {activeStatus}
            </p>
          )
        }
        return null
      })()}

      <footer className="si-icw__footer">
        <span
          className="si-icw__service"
          data-state={serviceOnline === null ? 'probing' : serviceOnline ? 'online' : 'offline'}
          title={serviceConfig?.hint ?? undefined}
        >
          <span className="si-icw__service-dot" />
          {serviceOnline === null
            ? 'Checking ML service…'
            : serviceOnline
              ? 'ML service online'
              : 'ML service offline'}
        </span>
        <div className="si-icw__nav">
          <button
            type="button"
            className="si-icw__btn si-icw__btn--ghost"
            onClick={goPrev}
            disabled={step === 0}
          >
            Back
          </button>
          <button
            type="button"
            className="si-icw__btn si-icw__btn--primary"
            onClick={goNext}
            disabled={!canAdvance}
          >
            Next
          </button>
        </div>
      </footer>
    </div>
  )
}
