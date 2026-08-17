import { useRef } from 'react'

export type TrainingOutputType =
  | 'fields'
  | 'fields_fbis'
  | 'trees'
  | 'segmentation'
  | 'classification'
  | 'object_detection'
  /** @deprecated Prefer `fields` — kept for reading persisted sessions. */
  | 'fields_trees'

/** Engines shown in the Infer Model dropdown. */
export type InferenceEngineChoice = 'delineate-fbis' | 'ftw' | 'yolo-trees' | 'segformer'

/** Map / file RGB sources for Infer (aligned with Agri Field Boundary imagery list). */
export type InferenceImagerySource =
  | 'basemap'
  | 'sentinel2'
  | 'landsat'
  | 'planet'
  | 'airbus'
  | 'drone'
  | 'geotiff'
  | 'png'
  | 'jpeg'

export const INFERENCE_IMAGERY_OPTIONS: Array<{ id: InferenceImagerySource; label: string }> = [
  { id: 'basemap', label: 'Basemap (Esri / Google map RGB)' },
  { id: 'sentinel2', label: 'Sentinel-2 (current map RGB)' },
  { id: 'landsat', label: 'Landsat (current map RGB)' },
  { id: 'planet', label: 'Planet (current map RGB)' },
  { id: 'airbus', label: 'Airbus (current map RGB)' },
  { id: 'drone', label: 'Drone' },
  { id: 'geotiff', label: 'GeoTIFF' },
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
]

export function isInferenceFileImagery(source: InferenceImagerySource): boolean {
  return source === 'drone' || source === 'geotiff' || source === 'png' || source === 'jpeg'
}

export function acceptForInferenceImagery(source: InferenceImagerySource): string {
  switch (source) {
    case 'geotiff':
      return '.tif,.tiff,image/tiff'
    case 'png':
      return '.png,image/png'
    case 'jpeg':
      return '.jpg,.jpeg,.jpe,image/jpeg'
    case 'drone':
    default:
      return '.tif,.tiff,.png,.jpg,.jpeg,.webp,image/tiff,image/png,image/jpeg,image/webp'
  }
}

export type InferencePanelProps = {
  modelId: string | null
  modelLabel: string | null
  confidence: number
  onConfidenceChange: (v: number) => void
  outputType: TrainingOutputType
  onOutputTypeChange: (v: TrainingOutputType) => void
  imagerySource: InferenceImagerySource
  onImagerySourceChange: (v: InferenceImagerySource) => void
  uploadedFileName?: string | null
  onUploadImageryFile?: (file: File | null) => void
  onClearUploadedImagery?: () => void
  busy: boolean
  error: string | null
  progress: number
  stage: string | null
  onRun: () => void
  canRun: boolean
  /** Where inference is clipped (Active AOI / Layers / map). */
  areaLabel?: string
  /** True when a previous map layer exists but the session model was lost. */
  staleResults?: boolean
  onClearStaleResults?: () => void
}

const CONFIDENCE_PRESETS = [0.2, 0.35, 0.5, 0.7] as const

function snapConfidence(v: number): number {
  const clamped = Math.min(0.95, Math.max(0.1, v))
  return Math.round(clamped * 20) / 20 // 0.05 steps without float noise
}

function isFtwFieldsMode(mode: TrainingOutputType): boolean {
  return mode === 'fields' || mode === 'fields_trees' || mode === 'segmentation'
}

function isFbisMode(mode: TrainingOutputType): boolean {
  return mode === 'fields_fbis'
}

function isTreesMode(mode: TrainingOutputType): boolean {
  return mode === 'trees' || mode === 'object_detection'
}

export function engineFromOutputType(mode: TrainingOutputType): InferenceEngineChoice {
  if (mode === 'fields_fbis') return 'delineate-fbis'
  if (mode === 'trees' || mode === 'object_detection') return 'yolo-trees'
  if (mode === 'classification') return 'segformer'
  return 'ftw'
}

export function outputTypeFromEngine(
  engine: InferenceEngineChoice,
  current: TrainingOutputType,
): TrainingOutputType {
  if (engine === 'delineate-fbis') return 'fields_fbis'
  if (engine === 'yolo-trees') {
    return current === 'object_detection' ? 'object_detection' : 'trees'
  }
  if (engine === 'segformer') return 'classification'
  // FTW — keep Segmentation if user was already on it
  if (current === 'segmentation') return 'segmentation'
  return 'fields'
}

export function InferencePanel(props: InferencePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ftw = isFtwFieldsMode(props.outputType)
  const fbis = isFbisMode(props.outputType)
  const trees = isTreesMode(props.outputType)
  const engine = engineFromOutputType(props.outputType)
  const hasSegFormer = Boolean(props.modelId)
  const fileImagery = isInferenceFileImagery(props.imagerySource)

  const runLabel = fbis
    ? 'EXTRACT FIELDS (DELINEATE ANYTHING)'
    : ftw
      ? 'EXTRACT FIELDS (FTW)'
      : trees
        ? 'DETECT TREES (YOLO)'
        : 'RUN INFERENCE'

  const segformerLabel =
    props.modelLabel ||
    (props.modelId ? `SegFormer · ${props.modelId}` : 'SegFormer (train a model first)')

  const onEngineChange = (next: InferenceEngineChoice) => {
    if (next === 'segformer' && !hasSegFormer) return
    props.onOutputTypeChange(outputTypeFromEngine(next, props.outputType))
  }

  const onImageryChange = (next: InferenceImagerySource) => {
    props.onImagerySourceChange(next)
    if (isInferenceFileImagery(next)) {
      requestAnimationFrame(() => {
        const el = fileInputRef.current
        if (!el) return
        el.value = ''
        el.click()
      })
    }
  }

  return (
    <div className="si-tai__section">
      <label className="si-tai__row">
        <span className="si-tai__label">Model</span>
        <select
          className="si-tai__input si-tai__select"
          value={engine === 'segformer' && !hasSegFormer ? 'ftw' : engine}
          disabled={props.busy}
          aria-label="Inference model"
          title={
            engine === 'delineate-fbis'
              ? 'Delineate Anything · v2 (:8096)'
              : engine === 'yolo-trees'
                ? 'YOLO trees'
                : engine === 'segformer'
                  ? props.modelId || undefined
                  : 'FTW field boundaries (:8092)'
          }
          onChange={e => onEngineChange(e.target.value as InferenceEngineChoice)}
        >
          <option value="delineate-fbis">Delineate Anything (v2)</option>
          <option value="ftw">FTW field boundaries (:8092)</option>
          <option value="yolo-trees">Trees — YOLO</option>
          <option value="segformer" disabled={!hasSegFormer}>
            {segformerLabel}
          </option>
        </select>
      </label>
      <label className="si-tai__row">
        <span className="si-tai__label">Input imagery</span>
        <select
          className="si-tai__input si-tai__select"
          value={props.imagerySource}
          disabled={props.busy}
          aria-label="Input imagery source"
          title="RGB source for Infer — same idea as Agri Field Boundary imagery"
          onChange={e => onImageryChange(e.target.value as InferenceImagerySource)}
        >
          {INFERENCE_IMAGERY_OPTIONS.map(o => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <input
        ref={fileInputRef}
        type="file"
        className="si-tai__file-input"
        accept={acceptForInferenceImagery(props.imagerySource)}
        disabled={props.busy}
        tabIndex={-1}
        aria-hidden
        onChange={e => {
          const file = e.target.files?.[0] ?? null
          props.onUploadImageryFile?.(file)
        }}
      />
      {fileImagery ? (
        <div className="si-tai__upload-row">
          <button
            type="button"
            className="si-tai__btn"
            disabled={props.busy}
            onClick={() => {
              const el = fileInputRef.current
              if (!el) return
              el.value = ''
              el.click()
            }}
          >
            {props.uploadedFileName ? 'Change image…' : 'Browse image…'}
          </button>
          {props.uploadedFileName ? (
            <span className="si-tai__file-name" title={props.uploadedFileName}>
              {props.uploadedFileName}
              {props.onClearUploadedImagery ? (
                <button
                  type="button"
                  className="si-tai__file-clear"
                  disabled={props.busy}
                  aria-label="Remove uploaded image"
                  onClick={props.onClearUploadedImagery}
                >
                  ×
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
      <label className="si-tai__row">
        <span className="si-tai__label">Area</span>
        <input
          className="si-tai__input"
          readOnly
          value={props.areaLabel || 'Current map extent'}
          title={props.areaLabel || 'Current map extent'}
        />
      </label>
      <div className="si-tai__radio" role="radiogroup" aria-label="Output type">
        <span className="si-tai__label">Output type</span>
        <label>
          <input
            type="radio"
            name="tai-out"
            checked={props.outputType === 'fields' || props.outputType === 'fields_trees'}
            disabled={props.busy}
            onChange={() => props.onOutputTypeChange('fields')}
          />
          Fields (FTW)
        </label>
        <label>
          <input
            type="radio"
            name="tai-out"
            checked={props.outputType === 'fields_fbis'}
            disabled={props.busy}
            onChange={() => props.onOutputTypeChange('fields_fbis')}
          />
          Delineate Anything (v2)
        </label>
        <label>
          <input
            type="radio"
            name="tai-out"
            checked={props.outputType === 'trees'}
            disabled={props.busy}
            onChange={() => props.onOutputTypeChange('trees')}
          />
          Trees (YOLO)
        </label>
        <label>
          <input
            type="radio"
            name="tai-out"
            checked={props.outputType === 'segmentation'}
            disabled={props.busy}
            onChange={() => props.onOutputTypeChange('segmentation')}
          />
          Segmentation
        </label>
        <label>
          <input
            type="radio"
            name="tai-out"
            checked={props.outputType === 'object_detection'}
            disabled={props.busy}
            onChange={() => props.onOutputTypeChange('object_detection')}
          />
          Object Detection
        </label>
        <label>
          <input
            type="radio"
            name="tai-out"
            checked={props.outputType === 'classification'}
            disabled={props.busy || !hasSegFormer}
            onChange={() => props.onOutputTypeChange('classification')}
          />
          Classification (SegFormer)
        </label>
      </div>

      <div className="si-tai__row">
        <div className="si-tai__label si-tai__label--with-value">
          <span>Confidence threshold</span>
          <em>{props.confidence.toFixed(2)}</em>
        </div>
        <input
          type="range"
          min={0.1}
          max={0.95}
          step={0.05}
          value={props.confidence}
          disabled={props.busy}
          aria-label="Confidence threshold"
          onChange={e => props.onConfidenceChange(snapConfidence(Number(e.target.value)))}
        />
        <div className="si-tai__presets" role="group" aria-label="Confidence presets">
          {CONFIDENCE_PRESETS.map(v => (
            <button
              key={v}
              type="button"
              className={`si-tai__preset${Math.abs(props.confidence - v) < 0.001 ? ' is-on' : ''}`}
              disabled={props.busy}
              onClick={() => props.onConfidenceChange(v)}
            >
              {v.toFixed(2)}
            </button>
          ))}
        </div>
      </div>

      {props.staleResults ? (
        <div className="si-tai__warn-block">
          <p className="si-tai__warn">
            Inference map results are out of date: training samples changed (or no model handle).
            Remove them, then Train / Infer again — Live Results on SAMPLES always mirror your
            samples only.
          </p>
          {props.onClearStaleResults ? (
            <button type="button" className="si-tai__btn si-tai__btn--danger" onClick={props.onClearStaleResults}>
              Remove stale results
            </button>
          ) : null}
        </div>
      ) : null}

      {!props.canRun && !props.busy && !props.staleResults ? (
        <p className="si-tai__warn">
          Choose Delineate Anything / Fields / Trees, or train SegFormer before Infer.
        </p>
      ) : null}

      {props.error ? <p className="si-tai__error">{props.error}</p> : null}

      {props.busy ? (
        <div className="si-tai__progress" role="status" aria-live="polite">
          <div className="si-tai__progress-bar" style={{ width: `${Math.round(props.progress)}%` }} />
          <span>{props.stage || 'Running…'}</span>
        </div>
      ) : null}

      <button
        type="button"
        className="si-tai__btn si-tai__btn--primary"
        disabled={props.busy || !props.canRun}
        onClick={props.onRun}
      >
        {props.busy ? 'Working…' : runLabel}
      </button>
    </div>
  )
}
