import { useId, useRef, useState } from 'react'
import type { SegFormerInputMode, SegFormerPhase, SegFormerResultRow } from './useSegFormerDetection'
import {
  isSegFormerBusyPhase,
  normalizeSegFormerPhase,
  SEGFORMER_PIPELINE_LABELS,
  SEGFORMER_PIPELINE_STEPS,
} from './useSegFormerDetection'
import type {
  SegFormerCategoryDef,
  SegFormerCategoryId,
  SegFormerClassDef,
} from '../../../../lib/segformerDetection/segformerCatalog'
import { isSegFormerClassMapped } from '../../../../lib/segformerDetection/segformerCatalog'
import type { SegFormerCaptureImageSource } from '../../../../lib/segformerDetection/segformerS2Capture'
import {
  SEGFORMER_BAND_MODE_OPTIONS,
  SEGFORMER_S2_BANDS,
  type SegFormerBandId,
  type SegFormerBandMode,
  type SegFormerRgbMapping,
} from '../../../../lib/segformerDetection/segformerBandPresets'
import {
  SEGFORMER_TILE_SIZE_OPTIONS,
  type SegFormerModelTypeId,
  type SegFormerTileSize,
} from '../../../../lib/segformerDetection/segformerModelPresets'
import {
  GEO_AI_TARGETS,
  geoAiEngineLabel,
  geoAiModelTypeIdForTarget,
  geoAiTargetIdForModelType,
  resolveGeoAiTargetRoute,
  type GeoAiTargetId,
} from '../../../../lib/segformerDetection/geoAiModelRouter'
import type { ServerRasterLayerConfig } from '../../../../lib/raster/siRasterTileService'
import './SegFormerDetectionPanel.css'

/** Live Remote Sensing session mirror (read-only) from SatelliteIntelligence. */
export type SegFormerRsSessionMirror = {
  providerId: string
  providerLabel: string
  collectionId: string
  collectionLabel: string
  layerId: string
  sceneDate: string | null
  cloudCoverage: number
  resolutionLabel: string | null
  aoiReady: boolean
}

export type SegFormerDetectionPanelProps = {
  hasAoi: boolean
  rsSession?: SegFormerRsSessionMirror | null
  inputMode: SegFormerInputMode
  onInputModeChange: (mode: SegFormerInputMode) => void
  availableRasters: readonly ServerRasterLayerConfig[]
  selectedRasterId: string | null
  onSelectRasterId: (id: string | null) => void
  onAddRasterFiles: (files: File[]) => void
  rasterListBusy: boolean
  rasterUploadBusy: boolean
  onRefreshRasters: () => void
  bandMode: SegFormerBandMode
  onBandModeChange: (mode: SegFormerBandMode) => void
  customRgb: SegFormerRgbMapping
  onCustomRgbChannelChange: (channel: keyof SegFormerRgbMapping, band: SegFormerBandId) => void
  rgbLabel: string
  modelTypeId: SegFormerModelTypeId
  onModelTypeChange: (id: SegFormerModelTypeId) => void
  categories: readonly SegFormerCategoryDef[]
  categoryId: SegFormerCategoryId
  onCategoryChange: (id: SegFormerCategoryId) => void
  classes: readonly SegFormerClassDef[]
  classId: number
  onClassChange: (id: number) => void
  classMapped: boolean
  unsupportedTooltip: string
  minConfidence: number
  onMinConfidenceChange: (v: number) => void
  tileSize: SegFormerTileSize
  onTileSizeChange: (v: SegFormerTileSize) => void
  overlap: number
  onOverlapChange: (v: number) => void
  fillOpacity: number
  onFillOpacityChange: (v: number) => void
  overlayVisible: boolean
  onOverlayVisibleChange: (v: boolean) => void
  phase: SegFormerPhase
  busy: boolean
  error: string | null
  offline: boolean
  routeMissing: boolean
  /** When true, pipeline UI includes SAM2 refine + temporal crop stages. */
  fieldPipeline?: boolean
  /** Optional SAM2 boundary refine (non-field targets). Field pipeline keeps refine on. */
  boundaryRefine?: boolean
  onBoundaryRefineChange?: (v: boolean) => void
  /** Soft morph / min-component cleaning (service-side when supported). */
  objectCleaning?: boolean
  onObjectCleaningChange?: (v: boolean) => void
  imageSource?: SegFormerCaptureImageSource | null
  captureNote?: string | null
  objectCount: number
  totalAreaHa: number
  rows: SegFormerResultRow[]
  hasResult: boolean
  hasMask?: boolean
  onDetect: (classId?: number) => void
  onReset: () => void
  onShowOnMap: () => void
  onExportGeojson: () => void
  onExportShapefile: () => void
  onDownloadMask?: () => void
  onAddToLayers?: () => void
}

function visiblePipelineSteps(
  fieldPipeline: boolean,
  boundaryRefine = false,
): readonly SegFormerPhase[] {
  if (fieldPipeline) return SEGFORMER_PIPELINE_STEPS
  if (boundaryRefine) {
    return SEGFORMER_PIPELINE_STEPS.filter(s => s !== 'cropType')
  }
  return SEGFORMER_PIPELINE_STEPS.filter(s => s !== 'refine' && s !== 'cropType')
}

function pipelineStepIndex(
  phase: SegFormerPhase,
  fieldPipeline: boolean,
  boundaryRefine = false,
): number {
  const p = normalizeSegFormerPhase(phase)
  if (p === 'error' || p === 'unsupported') return -1
  const steps = visiblePipelineSteps(fieldPipeline, boundaryRefine)
  const i = steps.indexOf(p)
  return i >= 0 ? i : 0
}

function formatArea(m2: number, ha: number): string {
  if (ha >= 0.01) return `${ha.toFixed(3)} ha`
  if (m2 >= 1) return `${m2.toFixed(1)} m²`
  return `${m2.toFixed(2)} m²`
}

function formatConfidence(c: number): string {
  const pct = c <= 1 ? c * 100 : c
  return `${Math.round(pct)}%`
}

function meanConfidencePct(rows: readonly SegFormerResultRow[]): number | null {
  if (!rows.length) return null
  let sum = 0
  for (const row of rows) {
    const c = row.confidence
    sum += c <= 1 ? c * 100 : c
  }
  return Math.round(sum / rows.length)
}

export function SegFormerDetectionPanel({
  hasAoi,
  rsSession: _rsSession = null,
  inputMode,
  onInputModeChange,
  availableRasters,
  selectedRasterId,
  onSelectRasterId,
  onAddRasterFiles,
  rasterListBusy,
  rasterUploadBusy,
  onRefreshRasters,
  bandMode,
  onBandModeChange,
  customRgb,
  onCustomRgbChannelChange,
  rgbLabel: _rgbLabel,
  modelTypeId,
  onModelTypeChange,
  categories: _categories,
  categoryId: _categoryId,
  onCategoryChange: _onCategoryChange,
  classes,
  classId,
  onClassChange,
  classMapped,
  unsupportedTooltip: _unsupportedTooltip,
  minConfidence,
  onMinConfidenceChange,
  tileSize,
  onTileSizeChange,
  overlap,
  onOverlapChange,
  fillOpacity,
  onFillOpacityChange,
  overlayVisible,
  onOverlayVisibleChange,
  phase,
  busy,
  error,
  offline,
  routeMissing,
  fieldPipeline = false,
  boundaryRefine: boundaryRefineProp,
  onBoundaryRefineChange,
  objectCleaning: objectCleaningProp,
  onObjectCleaningChange,
  imageSource = null,
  captureNote = null,
  objectCount,
  totalAreaHa,
  rows,
  hasResult,
  hasMask = false,
  onDetect,
  onReset,
  onShowOnMap,
  onExportGeojson,
  onExportShapefile,
  onDownloadMask,
  onAddToLayers,
}: SegFormerDetectionPanelProps) {
  const fileInputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [localBoundaryRefine, setLocalBoundaryRefine] = useState(false)
  const [localObjectCleaning, setLocalObjectCleaning] = useState(true)

  const displayPhase = normalizeSegFormerPhase(phase)
  const rasterBusy = rasterListBusy || rasterUploadBusy
  const canDetect =
    hasAoi &&
    classMapped &&
    !busy &&
    !rasterBusy &&
    (inputMode === 'rs-session' ||
      inputMode === 'esri-basemap' ||
      Boolean(selectedRasterId))
  const emptyDone = displayPhase === 'publishReady' && !hasResult && !busy
  const maskOnly = hasResult && hasMask && objectCount === 0
  const sourceLabel =
    imageSource === 'sentinel-2'
      ? 'Source: Sentinel-2 True Color'
      : imageSource === 'esri-basemap'
        ? 'Source: Esri Basemap Satellite'
        : imageSource === 'basemap'
          ? 'Source: Mapbox basemap (S2 unavailable)'
          : imageSource === 'uploaded'
            ? 'Source: Uploaded raster'
            : null
  const statusLabel =
    emptyDone
      ? 'No objects found in AOI'
      : hasResult && displayPhase === 'publishReady'
        ? 'AI Detection Result on map'
        : SEGFORMER_PIPELINE_LABELS[displayPhase] || SEGFORMER_PIPELINE_LABELS[phase]

  const targetId: GeoAiTargetId =
    geoAiTargetIdForModelType(modelTypeId) ?? (fieldPipeline ? 'field-boundary' : 'crops')
  const route = resolveGeoAiTargetRoute(targetId)
  const engineBadge = geoAiEngineLabel(route.detectEngine)
  const primaryTargets = GEO_AI_TARGETS.filter(t => t.chipTier === 'primary')
  const secondaryTargets = GEO_AI_TARGETS.filter(t => t.chipTier === 'secondary')

  const boundaryRefine =
    fieldPipeline || route.fieldPipeline
      ? true
      : typeof boundaryRefineProp === 'boolean'
        ? boundaryRefineProp
        : localBoundaryRefine
  const objectCleaning =
    typeof objectCleaningProp === 'boolean' ? objectCleaningProp : localObjectCleaning

  const pipelineSteps = visiblePipelineSteps(fieldPipeline, boundaryRefine)
  const stepIdx = pipelineStepIndex(phase, fieldPipeline, boundaryRefine)

  const setBoundaryRefine = (v: boolean) => {
    if (fieldPipeline || route.fieldPipeline) return
    onBoundaryRefineChange?.(v)
    if (typeof boundaryRefineProp !== 'boolean') setLocalBoundaryRefine(v)
  }
  const setObjectCleaning = (v: boolean) => {
    onObjectCleaningChange?.(v)
    if (typeof objectCleaningProp !== 'boolean') setLocalObjectCleaning(v)
  }

  const selectTarget = (id: GeoAiTargetId) => {
    onModelTypeChange(geoAiModelTypeIdForTarget(id))
  }

  const avgConf = meanConfidencePct(rows)
  const validationLabel = error
    ? 'Validation: failed'
    : busy
      ? 'Validation: running…'
      : hasResult
        ? emptyDone
          ? 'Validation: empty result'
          : 'Validation: ready'
        : offline || routeMissing
          ? 'Validation: service issue'
          : 'Validation: idle'

  return (
    <div className="si-env-section-card si-rs-panel si-rs-panel--glass si-rs-panel--flat si-sf">
      <div className="si-rs-panel__body si-rs-panel__body--flat si-sf__body">
        {/* —— 1. Input Data Tool —— */}
        <section className="si-sf__section" aria-labelledby="si-sf-input-title">
          <h3 id="si-sf-input-title" className="si-rs-panel__section-kicker">
            Input Data Tool
          </h3>
          <div className="si-sf__mode-row" role="radiogroup" aria-label="Input mode">
            <button
              type="button"
              role="radio"
              aria-checked={inputMode === 'rs-session'}
              className={'si-sf__mode-btn' + (inputMode === 'rs-session' ? ' is-active' : '')}
              disabled={busy}
              onClick={() => onInputModeChange('rs-session')}
            >
              Active Remote Sensing session
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={inputMode === 'esri-basemap'}
              className={'si-sf__mode-btn' + (inputMode === 'esri-basemap' ? ' is-active' : '')}
              disabled={busy}
              title="Capture Esri World Imagery (Satellite) tiles over the AOI"
              onClick={() => onInputModeChange('esri-basemap')}
            >
              Esri Basemap Satellite
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={inputMode === 'uploaded-raster'}
              className={'si-sf__mode-btn' + (inputMode === 'uploaded-raster' ? ' is-active' : '')}
              disabled={busy}
              onClick={() => onInputModeChange('uploaded-raster')}
            >
              Uploaded raster
            </button>
          </div>

          {inputMode === 'esri-basemap' ? (
            <p className="si-sf__hint" role="note">
              Detect uses Esri World Imagery mosaic over the Active AOI (no RS session required).
            </p>
          ) : null}

          {inputMode === 'uploaded-raster' ? (
            <div className="si-sf__raster-block">
              <div className="si-sf__actions">
                <input
                  ref={fileRef}
                  id={fileInputId}
                  type="file"
                  accept=".tif,.tiff,.jp2,.j2k,.png,.jpg,.jpeg,.webp"
                  className="si-sf__file-input"
                  disabled={busy || rasterBusy}
                  onChange={e => {
                    const files = e.target.files
                    if (files?.length) onAddRasterFiles(Array.from(files))
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  className="si-rs-panel__cta"
                  disabled={busy || rasterBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  <i
                    className={`fa-solid ${rasterUploadBusy ? 'fa-circle-notch fa-spin' : 'fa-plus'}`}
                    aria-hidden
                  />{' '}
                  {rasterUploadBusy ? 'Uploading…' : 'Add Raster'}
                </button>
                <button
                  type="button"
                  className="si-rs-panel__cta si-rs-panel__cta--secondary"
                  disabled={busy || rasterBusy}
                  onClick={onRefreshRasters}
                  title="Refresh raster list"
                >
                  <i className={`fa-solid ${rasterListBusy ? 'fa-circle-notch fa-spin' : 'fa-rotate'}`} aria-hidden />{' '}
                  Refresh
                </button>
              </div>
              <label className="si-rs-panel__stack">
                <span className="si-rs-panel__label">Ready rasters</span>
                <select
                  className="si-sf__select"
                  value={selectedRasterId || ''}
                  disabled={busy || rasterBusy}
                  aria-label="Uploaded raster"
                  onChange={e => onSelectRasterId(e.target.value || null)}
                >
                  <option value="">Select a raster…</option>
                  {availableRasters.map(r => (
                    <option key={r.rasterId} value={r.rasterId}>
                      {r.name}
                      {r.bands ? ` · ${r.bands} band${r.bands === 1 ? '' : 's'}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </section>

        {/* —— 2. Processing Tool —— */}
        <section className="si-sf__section" aria-labelledby="si-sf-proc-title">
          <h3 id="si-sf-proc-title" className="si-rs-panel__section-kicker">
            Processing Tool
          </h3>
          <div className="si-sf__mode-row" role="radiogroup" aria-label="Band mode">
            {SEGFORMER_BAND_MODE_OPTIONS.map(m => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={bandMode === m.id}
                className={'si-sf__mode-btn' + (bandMode === m.id ? ' is-active' : '')}
                disabled={busy}
                title={m.description}
                onClick={() => onBandModeChange(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          {bandMode === 'custom' ? (
            <div className="si-rs-panel__flat-grid si-rs-panel__flat-grid--3">
              {(['r', 'g', 'b'] as const).map(channel => (
                <label key={channel} className="si-rs-panel__stack">
                  <span className="si-rs-panel__label">{channel.toUpperCase()}</span>
                  <select
                    className="si-sf__select"
                    value={customRgb[channel]}
                    disabled={busy}
                    aria-label={`${channel.toUpperCase()} band`}
                    onChange={e =>
                      onCustomRgbChannelChange(channel, e.target.value as SegFormerBandId)
                    }
                  >
                    {SEGFORMER_S2_BANDS.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.id} · {b.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}

          <div className="si-rs-panel__flat-grid si-rs-panel__flat-grid--2">
            <label className="si-rs-panel__stack">
              <span className="si-rs-panel__label">Tile size</span>
              <select
                className="si-sf__select"
                value={tileSize}
                disabled={busy}
                aria-label="Tile size"
                onChange={e => onTileSizeChange(Number(e.target.value) as SegFormerTileSize)}
              >
                {SEGFORMER_TILE_SIZE_OPTIONS.map(s => (
                  <option key={s} value={s}>
                    {s} px
                  </option>
                ))}
              </select>
            </label>
            <label className="si-rs-panel__stack">
              <span className="si-rs-panel__label">
                Overlap <em>{Math.round(overlap * 100)}%</em>
              </span>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.05}
                value={overlap}
                disabled={busy}
                aria-label="Tile overlap"
                onChange={e => onOverlapChange(Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        {/* —— 3. AI Analysis Tool (model router) —— */}
        <section className="si-sf__section" aria-labelledby="si-sf-ai-title">
          <h3 id="si-sf-ai-title" className="si-rs-panel__section-kicker">
            AI Analysis Tool
          </h3>

          <div className="si-sf__router-head">
            <span className="si-rs-panel__label">Detection target</span>
            <span
              className={
                'si-sf__engine-badge' +
                (route.detectEngine === 'yolo11' ? ' si-sf__engine-badge--yolo' : '') +
                (route.detectEngine === 'sam2' ? ' si-sf__engine-badge--sam2' : '')
              }
              title={
                route.detectUsesSegFormerFallback
                  ? 'UI engine YOLO11 — Detect still uses SegFormer vehicles until YOLO ships'
                  : `Resolved engine: ${engineBadge}`
              }
            >
              {engineBadge}
              {route.fieldPipeline || boundaryRefine ? (
                <span className="si-sf__engine-badge__sam2">+ SAM2</span>
              ) : null}
            </span>
          </div>

          <div className="si-sf__target-chips" role="listbox" aria-label="Primary detection targets">
            {primaryTargets.map(t => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={targetId === t.id}
                className={'si-sf__target-chip' + (targetId === t.id ? ' is-active' : '')}
                disabled={busy}
                onClick={() => selectTarget(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            className="si-sf__target-chips si-sf__target-chips--secondary"
            role="listbox"
            aria-label="Secondary detection targets"
          >
            {secondaryTargets.map(t => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={targetId === t.id}
                className={
                  'si-sf__target-chip si-sf__target-chip--secondary' +
                  (targetId === t.id ? ' is-active' : '')
                }
                disabled={busy}
                onClick={() => selectTarget(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {route.detectUsesSegFormerFallback ? (
            <p className="si-sf__meta si-sf__meta--fallback" role="note">
              Cars is labeled YOLO11; Detect v1 still runs SegFormer vehicles classes (60–68) until a
              YOLO service is available.
            </p>
          ) : null}

          <div className="si-rs-panel__stack si-rs-panel__stack--section">
            <span className="si-rs-panel__label">Classes</span>
            <ul className="si-sf__class-list" role="listbox" aria-label="Detection classes">
              {classes.map(cls => {
                const mapped = isSegFormerClassMapped(cls)
                const selected = cls.id === classId
                return (
                  <li key={cls.id} className={'si-sf__class-row' + (selected ? ' is-selected' : '')}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="si-sf__class-pick"
                      disabled={busy}
                      title={cls.name}
                      onClick={() => onClassChange(cls.id)}
                    >
                      <span className="si-sf__class-name">{cls.name}</span>
                    </button>
                    <button
                      type="button"
                      className="si-sf__class-detect"
                      disabled={busy || !hasAoi || !mapped || rasterBusy}
                      title={
                        !hasAoi
                          ? 'Draw or select an AOI polygon first'
                          : `Detect ${cls.name} in the AOI`
                      }
                      onClick={() => onDetect(cls.id)}
                    >
                      {busy && selected ? (
                        <i className="fa-solid fa-circle-notch fa-spin" aria-hidden />
                      ) : (
                        <i className="fa-solid fa-play" aria-hidden />
                      )}{' '}
                      Detect
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="si-sf__actions">
            <button
              type="button"
              className="si-rs-panel__cta"
              disabled={!canDetect}
              onClick={() => onDetect()}
              title={
                !hasAoi
                  ? 'Draw or select an AOI polygon first'
                  : 'Run GeoAI detection for the selected class'
              }
            >
              <i
                className={`fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-wand-magic-sparkles'}`}
                aria-hidden
              />{' '}
              {busy ? 'Detecting…' : 'Detect selected'}
            </button>
            <button
              type="button"
              className="si-rs-panel__cta si-rs-panel__cta--secondary"
              disabled={busy}
              onClick={onReset}
            >
              Reset
            </button>
          </div>
        </section>

        {/* —— 4. Result Processing Tool —— */}
        <section className="si-sf__section" aria-labelledby="si-sf-result-title">
          <h3 id="si-sf-result-title" className="si-rs-panel__section-kicker">
            Result Processing Tool
          </h3>

          <label className="si-rs-panel__stack">
            <span className="si-rs-panel__label">
              Confidence <em>{Math.round(minConfidence * 100)}%</em>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minConfidence}
              disabled={busy}
              aria-label="Minimum confidence"
              onChange={e => onMinConfidenceChange(Number(e.target.value))}
            />
          </label>

          <div className="si-sf__toggle-row">
            <label
              className={
                'si-sf__show-box' +
                (fieldPipeline || route.fieldPipeline ? ' si-sf__show-box--locked' : '')
              }
              title={
                fieldPipeline || route.fieldPipeline
                  ? 'Field pipeline always runs SAM2 refine'
                  : 'Optional SAM2 boundary refine after detect'
              }
            >
              <input
                type="checkbox"
                checked={boundaryRefine}
                disabled={busy || fieldPipeline || route.fieldPipeline}
                onChange={e => setBoundaryRefine(e.target.checked)}
              />
              <span>Boundary refine (SAM2)</span>
            </label>
            <label
              className="si-sf__show-box"
              title="Morphology / min-component cleaning when the service supports it"
            >
              <input
                type="checkbox"
                checked={objectCleaning}
                disabled={busy}
                onChange={e => setObjectCleaning(e.target.checked)}
              />
              <span>Object cleaning</span>
            </label>
          </div>

          <p className="si-sf__meta si-sf__meta--validation" role="status">
            {validationLabel}
          </p>

          <ol className="si-sf__pipeline" aria-label="Pipeline stages">
            {pipelineSteps.filter(s => s !== 'idle').map((step, i) => {
              const absIdx = i + 1
              const active = stepIdx === absIdx
              const done = stepIdx > absIdx || displayPhase === 'publishReady'
              return (
                <li
                  key={step}
                  className={
                    'si-sf__pipeline-step' +
                    (active ? ' is-active' : '') +
                    (done && !active ? ' is-done' : '')
                  }
                  data-step={step}
                >
                  <span className="si-sf__pipeline-dot" aria-hidden />
                  <span>{SEGFORMER_PIPELINE_LABELS[step].replace(/…$/, '')}</span>
                </li>
              )
            })}
          </ol>
          <div
            className={
              'si-sf__status' +
              (offline ? ' is-offline' : '') +
              (emptyDone ? ' is-empty' : '') +
              (isSegFormerBusyPhase(phase) ? ' is-busy' : '')
            }
            data-phase={displayPhase}
            role="status"
          >
            <span className="si-sf__status-dot" aria-hidden />
            <span>{statusLabel}</span>
          </div>

          {sourceLabel || captureNote ? (
            <p
              className={
                'si-sf__capture-source' +
                (imageSource === 'basemap' ? ' si-sf__capture-source--fallback' : '')
              }
              role="status"
            >
              {sourceLabel}
              {sourceLabel && captureNote ? ' — ' : null}
              {captureNote}
            </p>
          ) : null}

          {emptyDone ? (
            <div className="si-sf__empty" role="status">
              <p className="si-sf__empty__title">
                <i className="fa-solid fa-circle-info" aria-hidden /> No map objects to show
              </p>
              <p className="si-sf__empty__body">
                The model finished but found no matching polygons in this AOI. Try lowering
                confidence, picking another class, or drawing a larger AOI with Edit.
              </p>
            </div>
          ) : null}

          {error ? (
            <div
              className={
                'si-sf__error-block' +
                (routeMissing ? ' si-sf__error-block--route-missing' : '') +
                (offline ? ' si-sf__error-block--offline' : '')
              }
              role="alert"
            >
              {routeMissing ? (
                <>
                  <p className="si-sf__error-block__title">
                    <i className="fa-solid fa-plug-circle-xmark" aria-hidden /> SegFormer route not
                    registered
                  </p>
                  <p className="si-sf__error-block__body">
                    The backend server is reachable but does not expose the SegFormer detection
                    endpoints. This usually means the server was started from an old build or a
                    different entry point.
                  </p>
                  <ol className="si-sf__error-block__steps">
                    <li>Stop the current backend process.</li>
                    <li>
                      Restart from the repository root:{' '}
                      <code>node backend/server/index.js</code>
                    </li>
                    <li>Reload this page and try Detect again.</li>
                  </ol>
                </>
              ) : offline ? (
                <>
                  <p className="si-sf__error-block__title">
                    <i className="fa-solid fa-server" aria-hidden /> Detection service offline
                  </p>
                  <p className="si-sf__error-block__body">
                    The backend is not reachable, or a field-pipeline microservice is down
                    (SegFormer-B5 / SAM2 refine). Temporal crop typing can fall back locally.
                  </p>
                  <ol className="si-sf__error-block__steps">
                    <li>
                      Start the Node backend: <code>node backend/server/index.js</code>
                    </li>
                    <li>
                      SegFormer-B5:{' '}
                      <code>cd backend/services/segformer-detection &amp;&amp; docker compose up</code>
                    </li>
                    <li>
                      SAM2 refine (field pipeline):{' '}
                      <code>cd backend/services/sam2-refinement &amp;&amp; docker compose up</code>
                    </li>
                    <li>Reload this page and try Detect again.</li>
                  </ol>
                </>
              ) : (
                <p className="si-sf__error-block__title">
                  <i className="fa-solid fa-triangle-exclamation" aria-hidden /> {error}
                </p>
              )}
            </div>
          ) : null}
        </section>

        {/* —— 5. GIS Output Tool —— */}
        {hasResult ? (
          <section className="si-sf__section" aria-labelledby="si-sf-gis-title">
            <h3 id="si-sf-gis-title" className="si-rs-panel__section-kicker">
              GIS Output Tool
            </h3>

            {maskOnly ? (
              <p className="si-sf__mask-note" role="status">
                Mask overlay shown as <strong>AI Detection Result</strong> (no polygon objects).
              </p>
            ) : null}

            <label className="si-rs-panel__stack">
              <span className="si-rs-panel__label">
                Overlay opacity <em>{Math.round(fillOpacity * 100)}%</em>
              </span>
              <input
                type="range"
                min={0.1}
                max={0.85}
                step={0.05}
                value={fillOpacity}
                onChange={e => onFillOpacityChange(Number(e.target.value))}
              />
            </label>

            <label className="si-sf__show-box">
              <input
                type="checkbox"
                checked={overlayVisible}
                onChange={e => onOverlayVisibleChange(e.target.checked)}
              />
              <span>Show on map</span>
            </label>

            {rows.length > 0 ? (
              <div className="si-sf__table-wrap">
                <table className="si-sf__table">
                  <thead>
                    <tr>
                      <th>Feature ID</th>
                      <th>Class</th>
                      <th>Conf.</th>
                      <th>Area</th>
                      <th>Perimeter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.objectId}>
                        <td title={row.objectId}>{row.objectId}</td>
                        <td title={row.className}>{row.className}</td>
                        <td>{formatConfidence(row.confidence)}</td>
                        <td>{formatArea(row.areaM2, row.areaHa)}</td>
                        <td>{row.perimeterM > 0 ? `${row.perimeterM.toFixed(1)} m` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="si-sf__actions si-sf__actions--export">
              <button
                type="button"
                className="si-rs-panel__cta si-rs-panel__cta--secondary"
                onClick={onShowOnMap}
                title="Show AI Detection Result on the map"
              >
                <i className="fa-solid fa-map-location-dot" aria-hidden /> Map
              </button>
              <button
                type="button"
                className="si-rs-panel__cta si-rs-panel__cta--secondary"
                onClick={onExportGeojson}
                disabled={objectCount === 0}
                title="Export GeoJSON"
              >
                <i className="fa-solid fa-file-code" aria-hidden /> GeoJSON
              </button>
              <button
                type="button"
                className="si-rs-panel__cta si-rs-panel__cta--secondary"
                onClick={() => void onExportShapefile()}
                disabled={objectCount === 0}
                title="Export Shapefile ZIP"
              >
                <i className="fa-solid fa-file-zipper" aria-hidden /> Shapefile
              </button>
              {onDownloadMask ? (
                <button
                  type="button"
                  className="si-rs-panel__cta si-rs-panel__cta--secondary"
                  onClick={onDownloadMask}
                  disabled={!hasMask}
                  title="Download mask PNG"
                >
                  <i className="fa-solid fa-image" aria-hidden /> Mask PNG
                </button>
              ) : null}
              {onAddToLayers ? (
                <button
                  type="button"
                  className="si-rs-panel__cta si-rs-panel__cta--secondary"
                  onClick={onAddToLayers}
                  disabled={objectCount === 0}
                  title="Add detections to Layers"
                >
                  <i className="fa-solid fa-layer-group" aria-hidden /> Add layer
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* —— 6. Intelligence & Reports —— */}
        <section className="si-sf__section" aria-labelledby="si-sf-intel-title">
          <h3 id="si-sf-intel-title" className="si-rs-panel__section-kicker">
            Intelligence &amp; Reports
          </h3>
          <div className="si-sf__stats" aria-label="Detection summary">
            <span>
              <strong>{objectCount}</strong> objects
            </span>
            <span>
              <strong>{totalAreaHa.toFixed(3)}</strong> ha
            </span>
            <span>
              Avg conf.{' '}
              <strong>{avgConf != null ? `${avgConf}%` : '—'}</strong>
            </span>
            {hasMask ? (
              <span className="si-sf__stats-mask" title="Segmentation mask available on map">
                <i className="fa-solid fa-image" aria-hidden /> Mask
              </span>
            ) : null}
          </div>
          <div className="si-sf__intel-links" role="group" aria-label="Report shortcuts">
            <button
              type="button"
              className="si-sf__intel-link"
              disabled={!hasResult}
              onClick={onShowOnMap}
              title="Focus detections on the map"
            >
              <i className="fa-solid fa-map" aria-hidden /> View on map
            </button>
            <button
              type="button"
              className="si-sf__intel-link"
              disabled={objectCount === 0}
              onClick={onExportGeojson}
              title="Export GeoJSON for reporting"
            >
              <i className="fa-solid fa-file-export" aria-hidden /> Export summary
            </button>
            {onAddToLayers ? (
              <button
                type="button"
                className="si-sf__intel-link"
                disabled={objectCount === 0}
                onClick={onAddToLayers}
                title="Publish detections to Layers"
              >
                <i className="fa-solid fa-layer-group" aria-hidden /> Publish layer
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
