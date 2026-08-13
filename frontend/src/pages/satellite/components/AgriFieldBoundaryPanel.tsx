import { useEffect, useRef, useState, type RefObject } from 'react'
import type { FieldBoundaryPhase, FieldCaptureImageryId, FieldModelId } from './useAgriFieldBoundary'
import {
  acceptForFieldSource,
  isFieldFileSource,
} from './useAgriFieldBoundary'
import type { FieldImagerySource } from '../../../lib/agriFieldBoundary/fieldBoundaryClient'
import {
  FOOTPRINT_REGULARIZE_METHODS,
  type FootprintRegularizeMethod,
} from '../../../lib/agriFieldBoundary/fieldFootprintRegularize'
import type { Sen2srProductMode, Sen2srStatus } from '../../../lib/agriFieldBoundary/sen2srClient'
import { Sen2srProductControls } from './Sen2srProductControls'
import { AgriFieldBoundaryResultsDashboard } from './AgriFieldBoundaryResultsDashboard'
import './AgriFieldBoundaryPanel.css'

/** How the study AOI is chosen for Detect Fields. */
export type FieldBoundaryAoiMode = 'draw' | 'layers' | 'viewport' | 'select'

export type FieldBoundaryAoiLayerOption = { id: string; label: string; featureCount?: number }

/** Detect + inline Results dashboard tab. */
export type FieldBoundaryPanelTab = 'detect' | 'results'

export const FIELD_BOUNDARY_AOI_MODE_OPTIONS: Array<{ id: FieldBoundaryAoiMode; label: string }> = [
  { id: 'draw', label: 'Drawn AOI (map sketch)' },
  { id: 'layers', label: 'Layer from Layers panel' },
  { id: 'viewport', label: 'Current map extent' },
  { id: 'select', label: 'Select tool (rectangle / polygon / lasso)' },
]

export type AgriFieldBoundaryPanelProps = {
  hasAoi: boolean
  /** How AOI geometry is resolved for Detect Fields. */
  aoiMode?: FieldBoundaryAoiMode
  onAoiModeChange?: (mode: FieldBoundaryAoiMode) => void
  aoiLayerOptions?: FieldBoundaryAoiLayerOption[]
  aoiLayerId?: string
  onAoiLayerIdChange?: (layerId: string) => void
  /** Resolved combined source (model + optional capture imagery). */
  source: FieldImagerySource
  model: FieldModelId
  onModelChange: (m: FieldModelId) => void
  modelOptions: Array<{ id: FieldModelId; label: string }>
  imagery: FieldCaptureImageryId
  onImageryChange: (s: FieldCaptureImageryId) => void
  imageryOptions: Array<{ id: FieldCaptureImageryId; label: string }>
  /** @deprecated Prefer onModelChange / onImageryChange. */
  onSourceChange?: (s: FieldImagerySource) => void
  /** @deprecated Prefer modelOptions. */
  sourceOptions?: Array<{ id: FieldImagerySource; label: string }>
  countryOptions?: Array<{ id: string; label: string }>
  adminIso?: string
  onAdminIsoChange?: (iso: string) => void
  /** Sentinel-2 acquisition day (YYYY-MM-DD) for FTW — From/To are kept identical (latest day). */
  sceneDateFrom: string
  sceneDateTo: string
  onSceneDateFromChange: (isoDate: string) => void
  onSceneDateToChange: (isoDate: string) => void
  /** @deprecated Single-day mode pins to today; kept for call-site compat. */
  onSceneDateAllYear?: () => void
  /** @deprecated Prefer sceneDateFrom/To — mid-window anchor kept for compatibility. */
  sceneDate?: string
  onSceneDateChange?: (isoDate: string) => void
  uploadedFileName?: string | null
  onUploadImageFile: (file: File | null) => void | Promise<void>
  onClearUploadedImage?: () => void
  minConfidence: number
  onMinConfidenceChange: (v: number) => void
  minAreaM2: number
  onMinAreaM2Change: (v: number) => void
  fillOpacity: number
  onFillOpacityChange: (v: number) => void
  regularizeFootprints?: boolean
  onRegularizeFootprintsChange?: (v: boolean) => void
  /** ArcGIS Regularize Building Footprint method. */
  regularizeMethod?: FootprintRegularizeMethod
  onRegularizeMethodChange?: (m: FootprintRegularizeMethod) => void
  /** Merge over-segmented fragments that share a long border. */
  mergeFragments?: boolean
  onMergeFragmentsChange?: (v: boolean) => void
  phase: FieldBoundaryPhase
  progress: number
  /** Backend job stage, shown instead of the generic pipeline label. */
  stage?: string | null
  busy: boolean
  error: string | null
  errorDetail?: string | null
  notice?: string | null
  offline: boolean
  fieldCount: number
  totalAreaHa: number
  engine: string | null
  score?: number | null
  hasResult: boolean
  /** Detected polygons — feeds the Results dashboard charts and accuracy matrix. */
  resultGeojson?: GeoJSON.FeatureCollection | null
  /** Training & AI polygon samples auto-used as validation reference. */
  referenceGeojson?: GeoJSON.FeatureCollection | null
  referenceLabel?: string | null
  /** Status while FoW / FTW dataset reference is loading or unavailable. */
  referenceNotice?: string | null
  referenceBusy?: boolean
  /** Map viewport host for the floating Results Dashboard (`.si-map-container`). */
  mapContainerRef?: RefObject<HTMLElement | null>
  onRun: () => void
  onReset: () => void
  onExportGeojson: () => void
  onExportShapefile: () => void
  onAddToLayers?: () => void
  /** Progress line while the Sentinel-2 attribute table is being filled. */
  attributesStatus?: string | null
  /** SEN2SR Lite product mode (separate from FTW / detect engines). */
  sen2srStatus?: Sen2srStatus | null
  sen2srProductMode?: Sen2srProductMode
  onSen2srProductModeChange?: (mode: Sen2srProductMode) => void
  sen2srDisplay1m?: boolean
  onSen2srDisplay1mChange?: (checked: boolean) => void
  sen2srGeotiffFileName?: string | null
  onSen2srPickGeotiff?: (file: File | null) => void
  onSen2srEnhance?: () => void
  sen2srCanEnhance?: boolean
  sen2srBusy?: boolean
  sen2srError?: string | null
  sen2srNotice?: string | null
}

const PHASE_LABEL: Record<FieldBoundaryPhase, string> = {
  idle: 'Ready — choose Select AOI, then Detect Fields',
  capturing: 'Capturing high-res AOI imagery…',
  detecting: 'High-accuracy field delineation…',
  done: 'Field polygons ready',
  empty: 'No fields found in this AOI',
  error: 'Detection failed',
}

/** Backend job stages — the pipeline step the service is actually on. */
const STAGE_LABEL: Record<string, string> = {
  queued: 'Queued…',
  preparing: 'Preparing AOI…',
  scene_selection: 'Selecting Sentinel-2 scenes…',
  download: 'Downloading Sentinel-2 bands…',
  run: 'Running the field boundary model…',
  polygonize: 'Vectorizing field polygons…',
  normalize: 'Clipping and scoring fields…',
  capture: 'Capturing AOI imagery…',
  detect: 'Detecting fields…',
}

/** Lowest Min area the user may type (m²). */
export const FIELD_MIN_AREA_M2 = 0.05

/** Latest selectable Sentinel-2 day (local calendar today). */
function latestSceneDateIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const AOI_MODE_HINT: Record<FieldBoundaryAoiMode, string> = {
  draw: 'Draw a polygon on the map (toolbox Draw), or reuse the existing sketch.',
  layers: 'Pick a vector layer added under Layers.',
  viewport: 'Uses the current map extent as the study area.',
  select: 'Use the Select rail tool (rectangle / polygon / lasso) on layer features.',
}

export function AgriFieldBoundaryPanel({
  hasAoi,
  aoiMode = 'draw',
  onAoiModeChange,
  aoiLayerOptions = [],
  aoiLayerId = '',
  onAoiLayerIdChange,
  source,
  model,
  onModelChange,
  modelOptions,
  imagery,
  onImageryChange,
  imageryOptions,
  countryOptions = [],
  adminIso = 'AE',
  onAdminIsoChange,
  sceneDateFrom,
  sceneDateTo,
  onSceneDateFromChange,
  onSceneDateToChange,
  uploadedFileName,
  onUploadImageFile,
  onClearUploadedImage,
  minConfidence,
  onMinConfidenceChange,
  minAreaM2,
  onMinAreaM2Change,
  fillOpacity,
  onFillOpacityChange,
  regularizeFootprints = true,
  onRegularizeFootprintsChange,
  regularizeMethod = 'right-angles',
  onRegularizeMethodChange,
  mergeFragments = true,
  onMergeFragmentsChange,
  phase,
  progress,
  stage = null,
  busy,
  error,
  errorDetail,
  offline,
  fieldCount,
  totalAreaHa,
  engine,
  score,
  hasResult,
  resultGeojson = null,
  referenceGeojson = null,
  referenceLabel = null,
  referenceNotice = null,
  referenceBusy = false,
  mapContainerRef,
  onRun,
  onReset,
  onExportGeojson,
  onExportShapefile,
  onAddToLayers,
  attributesStatus = null,
  sen2srStatus = null,
  sen2srProductMode = 'raw',
  onSen2srProductModeChange,
  sen2srDisplay1m = false,
  onSen2srDisplay1mChange,
  sen2srGeotiffFileName = null,
  onSen2srPickGeotiff,
  onSen2srEnhance,
  sen2srCanEnhance = false,
  sen2srBusy = false,
  sen2srError = null,
  sen2srNotice = null,
}: AgriFieldBoundaryPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [minAreaText, setMinAreaText] = useState(() => String(minAreaM2))
  const [activeTab, setActiveTab] = useState<FieldBoundaryPanelTab>('detect')
  const [dashboardOpen, setDashboardOpen] = useState(false)

  useEffect(() => {
    setMinAreaText(String(minAreaM2))
  }, [minAreaM2])

  useEffect(() => {
    if (!hasResult) {
      setDashboardOpen(false)
      setActiveTab('detect')
    }
  }, [hasResult])

  useEffect(() => {
    if (phase === 'done' && hasResult) setActiveTab('results')
  }, [phase, hasResult])

  const openResultsDashboard = () => {
    if (!hasResult) return
    setActiveTab('results')
  }

  const handleReset = () => {
    setDashboardOpen(false)
    setActiveTab('detect')
    onReset()
  }

  const commitMinAreaText = () => {
    const normalized = minAreaText.trim().replace(',', '.')
    const n = Number(normalized)
    if (!Number.isFinite(n)) {
      setMinAreaText(String(minAreaM2))
      return
    }
    const next = Math.max(FIELD_MIN_AREA_M2, n)
    onMinAreaM2Change(next)
    setMinAreaText(String(next))
  }

  const needsUpload = isFieldFileSource(source)
  const showImagery = model === 'delineate-fbis' || model === 'map-rgb'
  const isFtwInfer = source === 'ftw-infer'
  const isFtwLive = source === 'ftw-live'
  const isFow = source === 'fow'
  const isDelineateFbis = source === 'delineate-fbis'
  const isFtwOnDemand = isFtwInfer || isFtwLive
  // Country catalog is FoW-only; FTW live/infer run on any drawn AOI worldwide.
  const showCountry = isFow && countryOptions.length > 0 && Boolean(onAdminIsoChange)
  const canRun = hasAoi && !busy && (!needsUpload || Boolean(uploadedFileName))
  const pct = Math.max(0, Math.min(100, Math.round(progress)))
  const showProgress = busy && (phase === 'detecting' || phase === 'capturing')
  const runTitle = isDelineateFbis
    ? 'Run Delineate Anything on the AOI capture — sharp black instance edges (:8096)'
    : isFtwLive
      ? 'Run FTW live Sentinel-2 on your drawn AOI — works worldwide (may take several minutes)'
      : isFtwInfer
        ? 'Run FTW Sentinel-2 model inference across the AOI (may take several minutes)'
        : 'Run field boundary detection across the AOI'
  const stageLabel = phase === 'detecting' ? STAGE_LABEL[String(stage || '')] : undefined
  const phaseLabel =
    stageLabel ??
    (isDelineateFbis && phase === 'detecting'
      ? 'Delineate Anything (instance parcels)…'
      : isFtwLive && phase === 'detecting'
        ? 'FTW live worldwide (scene select → MPC stack → model → polygonize)…'
        : isFtwInfer && phase === 'detecting'
          ? 'FTW inference (S2 download → model → polygonize)…'
          : PHASE_LABEL[phase])

  useEffect(() => {
    if (!exportOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  useEffect(() => {
    if (!hasResult && exportOpen) setExportOpen(false)
  }, [hasResult, exportOpen])

  const openFilePicker = () => {
    const el = fileInputRef.current
    if (!el) return
    el.value = ''
    el.click()
  }

  const handleModelChange = (next: FieldModelId) => {
    onModelChange(next)
  }

  const handleImageryChange = (next: FieldCaptureImageryId) => {
    onImageryChange(next)
    if (isFieldFileSource(next)) {
      requestAnimationFrame(() => openFilePicker())
    }
  }

  const handleAoiModeChange = (next: FieldBoundaryAoiMode) => {
    onAoiModeChange?.(next)
  }

  return (
    <div className="si-afb">
      <div className="si-afb__tabs" role="tablist" aria-label="Field boundary sections">
        <button
          type="button"
          role="tab"
          id="si-afb-tab-detect"
          aria-selected={activeTab === 'detect'}
          aria-controls="si-afb-pane-detect"
          className={`si-afb__tab${activeTab === 'detect' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('detect')}
        >
          <i className="fa-solid fa-crop-simple" aria-hidden /> Detect
        </button>
        <button
          type="button"
          role="tab"
          id="si-afb-tab-validate"
          aria-selected={activeTab === 'results'}
          aria-controls="si-afb-pane-results"
          className={`si-afb__tab si-afb__tab--icon${activeTab === 'results' ? ' is-active' : ''}${hasResult ? ' is-ready' : ''}`}
          title={
            hasResult
              ? 'Results dashboard — Validation Detection, Epochs Details and training charts'
              : 'Run Detect Fields to open the Results dashboard'
          }
          aria-label="Results dashboard"
          disabled={!hasResult}
          onClick={() => hasResult && setActiveTab('results')}
        >
          <i className="fa-solid fa-chart-line" aria-hidden />
          {hasResult ? <span className="si-afb__tab-badge">{fieldCount}</span> : null}
        </button>
      </div>

      {activeTab === 'detect' ? (
      <section
        className="si-afb__card"
        role="tabpanel"
        id="si-afb-pane-detect"
        aria-labelledby="si-afb-tab-detect"
      >
        <label className="si-afb__row">
          <span className="si-afb__label">Model</span>
          <select
            className="si-afb__select"
            value={model}
            disabled={busy}
            onChange={e => handleModelChange(e.target.value as FieldModelId)}
          >
            {modelOptions.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {showImagery ? (
          <label className="si-afb__row">
            <span className="si-afb__label">Imagery</span>
            <select
              className="si-afb__select"
              value={imagery}
              disabled={busy}
              onChange={e => handleImageryChange(e.target.value as FieldCaptureImageryId)}
            >
              {imageryOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {showCountry ? (
          <label className="si-afb__row">
            <span className="si-afb__label">Country catalog</span>
            <select
              className="si-afb__select"
              value={adminIso}
              disabled={busy}
              onChange={e => onAdminIsoChange?.(e.target.value)}
              title="FoW country partition (ISO-3166). Pick All countries for a slow worldwide scan — prefer FTW live for any AOI."
            >
              {countryOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {isFtwOnDemand ? (
          <div className="si-afb__dates" role="group" aria-label="Sentinel-2 image date">
            <span
              className="si-afb__label"
              title="Latest Sentinel-2 acquisition day used for FTW. Defaults to today."
            >
              Image date
            </span>
            <div className="si-afb__dates-row">
              <label className="si-afb__date-field si-afb__date-field--single">
                <input
                  className="si-afb__select"
                  type="date"
                  min="2017-01-01"
                  max={latestSceneDateIso()}
                  value={sceneDateTo || sceneDateFrom || latestSceneDateIso()}
                  disabled={busy}
                  title="Latest Sentinel-2 acquisition date"
                  aria-label="Sentinel-2 image date"
                  onChange={e => {
                    const v = String(e.target.value || '').trim().slice(0, 10)
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return
                    // Single day only — keep From and To identical (latest scene).
                    onSceneDateFromChange(v)
                    onSceneDateToChange(v)
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          className="si-afb__file-input"
          accept={acceptForFieldSource(source)}
          disabled={busy}
          tabIndex={-1}
          aria-hidden
          onChange={e => {
            const file = e.target.files?.[0] ?? null
            void onUploadImageFile(file)
          }}
        />

        {needsUpload ? (
          <div className="si-afb__upload-row">
            <button
              type="button"
              className="si-afb__btn"
              disabled={busy}
              onClick={openFilePicker}
              title="Browse for a local image"
            >
              <i className="fa-solid fa-folder-open" aria-hidden />{' '}
              {uploadedFileName ? 'Change image' : 'Browse image…'}
            </button>
            {uploadedFileName ? (
              <span className="si-afb__file-name" title={uploadedFileName}>
                <i className="fa-solid fa-image" aria-hidden /> {uploadedFileName}
                {onClearUploadedImage ? (
                  <button
                    type="button"
                    className="si-afb__file-clear"
                    disabled={busy}
                    aria-label="Remove uploaded image"
                    onClick={onClearUploadedImage}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ) : (
              <span className="si-afb__file-hint">Select a local image for this source</span>
            )}
          </div>
        ) : null}

        {!isFtwOnDemand && !isFow ? (
          <label className="si-afb__row">
            <span className="si-afb__label">
              Confidence <em>{Math.round(minConfidence * 100)}%</em>
            </span>
            <input
              type="range"
              min={0.2}
              max={0.9}
              step={0.05}
              value={minConfidence}
              disabled={busy}
              onChange={e => onMinConfidenceChange(Number(e.target.value))}
            />
          </label>
        ) : null}

        <label className="si-afb__row">
          <span className="si-afb__label">Select AOI</span>
          <select
            className="si-afb__select"
            value={aoiMode}
            disabled={busy || !onAoiModeChange}
            aria-label="Select AOI source"
            title={AOI_MODE_HINT[aoiMode]}
            onChange={e => handleAoiModeChange(e.target.value as FieldBoundaryAoiMode)}
          >
            {FIELD_BOUNDARY_AOI_MODE_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {aoiMode === 'layers' && onAoiLayerIdChange ? (
          <label className="si-afb__row">
            <span className="si-afb__label">AOI layer</span>
            <select
              className="si-afb__select"
              value={aoiLayerId}
              disabled={busy || aoiLayerOptions.length === 0}
              aria-label="AOI layer from Layers"
              onChange={e => onAoiLayerIdChange(e.target.value)}
            >
              {aoiLayerOptions.length === 0 ? (
                <option value="">Add a vector layer from Layers</option>
              ) : (
                aoiLayerOptions.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                    {typeof l.featureCount === 'number' && l.featureCount > 0
                      ? ` (${l.featureCount})`
                      : ''}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : null}

        {!hasAoi && onAoiModeChange ? (
          <p className="si-afb__file-hint" role="status">
            {AOI_MODE_HINT[aoiMode]}
          </p>
        ) : null}

        <label className="si-afb__row">
          <span className="si-afb__label">
            Min area
            <span className="si-afb__inline-num">
              <input
                type="number"
                className="si-afb__num"
                min={FIELD_MIN_AREA_M2}
                step="any"
                inputMode="decimal"
                value={minAreaText}
                disabled={busy}
                aria-label="Minimum field area in square meters"
                title={`Type any area ≥ ${FIELD_MIN_AREA_M2} m²`}
                onChange={e => setMinAreaText(e.target.value)}
                onBlur={commitMinAreaText}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitMinAreaText()
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
              />
              <em>m²</em>
            </span>
          </span>
        </label>

        <label className="si-afb__row">
          <span className="si-afb__label">
            Overlay opacity <em>{Math.round(fillOpacity * 100)}%</em>
          </span>
          <input
            type="range"
            min={0}
            max={0.85}
            step={0.05}
            value={fillOpacity}
            onChange={e => onFillOpacityChange(Number(e.target.value))}
          />
        </label>

        {onRegularizeFootprintsChange ? (
          <>
            <label className="si-afb__row si-afb__row--check">
              <span className="si-afb__label">Regularize footprints</span>
              <input
                type="checkbox"
                checked={regularizeFootprints}
                disabled={busy}
                onChange={e => onRegularizeFootprintsChange(e.target.checked)}
                title="Rebuild parcels with Regularize Building Footprint methods, remove stair-steps, and keep every parcel free of overlaps"
              />
            </label>
            {regularizeFootprints && onRegularizeMethodChange ? (
              <label className="si-afb__row">
                <span className="si-afb__label">Regularize method</span>
                <select
                  className="si-afb__select"
                  value={regularizeMethod}
                  disabled={busy}
                  title={
                    FOOTPRINT_REGULARIZE_METHODS.find(m => m.id === regularizeMethod)?.title ||
                    'Regularize Building Footprint method'
                  }
                  onChange={e =>
                    onRegularizeMethodChange(e.target.value as FootprintRegularizeMethod)
                  }
                >
                  {FOOTPRINT_REGULARIZE_METHODS.map(m => (
                    <option key={m.id} value={m.id} title={m.title}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        ) : null}

        {onMergeFragmentsChange ? (
          <label className="si-afb__row si-afb__row--check">
            <span className="si-afb__label">Merge fragments</span>
            <input
              type="checkbox"
              checked={mergeFragments}
              disabled={busy}
              onChange={e => onMergeFragmentsChange(e.target.checked)}
              title="Union over-segmented pieces of the same field that share a long border before Regularize"
            />
          </label>
        ) : null}

        {onSen2srProductModeChange && onSen2srDisplay1mChange ? (
          <Sen2srProductControls
            status={sen2srStatus}
            productMode={sen2srProductMode}
            onProductModeChange={mode => {
              onSen2srProductModeChange(mode)
              if (mode === 'basemap' || mode === 'drone') {
                if (model !== 'map-rgb' && model !== 'delineate-fbis') {
                  onModelChange('map-rgb')
                }
                onImageryChange(mode)
              }
            }}
            display1m={sen2srDisplay1m}
            onDisplay1mChange={onSen2srDisplay1mChange}
            showFilePicker={Boolean(onSen2srPickGeotiff)}
            geotiffFileName={sen2srGeotiffFileName}
            onPickGeotiff={onSen2srPickGeotiff}
            droneFileName={uploadedFileName}
            onPickDroneImage={file => void onUploadImageFile(file)}
            onEnhance={onSen2srEnhance}
            canEnhance={sen2srCanEnhance}
            enhanceBusy={sen2srBusy}
            enhanceError={sen2srError}
            enhanceNotice={sen2srNotice}
            disabled={busy}
            sen2srHint="Upload a Sentinel-2 L2A GeoTIFF to enhance to 2.5 m. Does not alter raw Detect Fields."
            basemapHint="Map RGB from Esri / Google basemap — Detect Fields captures the current map view."
            droneHint="Upload drone RGB / GeoTIFF / PNG / JPEG, then Detect Fields."
          />
        ) : null}

        <div className="si-afb__actions">
          <button
            type="button"
            className="si-afb__btn si-afb__btn--primary"
            disabled={!canRun}
            onClick={onRun}
            title={runTitle}
          >
            <i className="fa-solid fa-crop-simple" aria-hidden />{' '}
            {busy ? 'Detecting…' : 'Detect Fields'}
          </button>
          <button type="button" className="si-afb__btn si-afb__btn--ghost" disabled={busy} onClick={handleReset}>
            Reset
          </button>
        </div>

        {hasResult ? (
          <button
            type="button"
            className="si-afb__stats si-afb__stats--open"
            aria-label="Open field results dashboard"
            title="Open Results dashboard"
            onClick={openResultsDashboard}
          >
            <span>
              <strong>{fieldCount}</strong> fields
            </span>
            <span>
              <strong>{totalAreaHa.toFixed(2)}</strong> ha
            </span>
            {engine ? (
              <span className="si-afb__engine" title="Detection engine">
                {engine}
              </span>
            ) : null}
            <i className="fa-solid fa-arrow-up-right-from-square si-afb__stats-open-icon" aria-hidden />
          </button>
        ) : null}

        {attributesStatus ? (
          <div className="si-afb__hint" role="status">
            <i className="fa-solid fa-table-list" aria-hidden /> {attributesStatus}
          </div>
        ) : null}

        <div className="si-afb__actions si-afb__actions--export">
          <div className={`si-afb__export${exportOpen ? ' is-open' : ''}`} ref={exportRef}>
            <button
              type="button"
              className="si-afb__btn si-afb__export-trigger"
              disabled={!hasResult}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onClick={() => setExportOpen(v => !v)}
              title="Export field polygons"
            >
              <i className="fa-solid fa-download" aria-hidden /> Export
              <i className="fa-solid fa-chevron-up si-afb__export-caret" aria-hidden />
            </button>
            {exportOpen ? (
              <div className="si-afb__export-menu" role="menu">
                <button
                  type="button"
                  className="si-afb__export-item"
                  role="menuitem"
                  onClick={() => {
                    onExportGeojson()
                    setExportOpen(false)
                  }}
                >
                  <i className="fa-solid fa-file-code" aria-hidden /> GeoJSON
                </button>
                <button
                  type="button"
                  className="si-afb__export-item"
                  role="menuitem"
                  onClick={() => {
                    void onExportShapefile()
                    setExportOpen(false)
                  }}
                >
                  <i className="fa-solid fa-file-zipper" aria-hidden /> Shapefile
                </button>
                {onAddToLayers ? (
                  <button
                    type="button"
                    className="si-afb__export-item"
                    role="menuitem"
                    onClick={() => {
                      onAddToLayers()
                      setExportOpen(false)
                    }}
                  >
                    <i className="fa-solid fa-layer-group" aria-hidden /> Add layer
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className={`si-afb__status is-${phase}`}
          title={
            phase === 'error' || phase === 'empty'
              ? errorDetail ||
                (offline
                  ? 'Start: uvicorn app:app --port 8092 in backend/services/agri-field-boundary'
                  : error || undefined)
              : undefined
          }
        >
          {phase === 'error' ? (
            <>
              <i className="fa-solid fa-triangle-exclamation" aria-hidden />{' '}
              {offline
                ? 'Service offline — start agri-field-boundary on :8092'
                : error || phaseLabel}
            </>
          ) : phase === 'empty' ? (
            <>
              <i className="fa-solid fa-circle-info" aria-hidden /> {error || phaseLabel}
            </>
          ) : (
            <>
              {busy ? <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> : null}{' '}
              {phaseLabel}
              {phase === 'detecting' && showProgress ? (
                <span className="si-afb__hint-inline"> · {pct}%</span>
              ) : null}
              {phase === 'done' && typeof score === 'number' ? (
                <span className="si-afb__hint-inline"> · quality {(score * 100).toFixed(0)}%</span>
              ) : null}
            </>
          )}
          {showProgress && phase === 'detecting' ? (
            <div className="si-afb__progress" aria-hidden>
              <div className="si-afb__progress-track">
                <div className="si-afb__progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </section>
      ) : (
      <section
        className="si-afb__card si-afb__card--results"
        role="tabpanel"
        id="si-afb-pane-results"
        aria-labelledby="si-afb-tab-validate"
      >
        <div className="si-afb__results-head">
          <span className="si-afb__results-title">Field Results</span>
          {mapContainerRef ? (
            <button
              type="button"
              className="si-afb__btn si-afb__btn--ghost si-afb__btn--compact"
              onClick={() => setDashboardOpen(true)}
              title="Open floating dashboard on the map"
              aria-label="Open floating dashboard on the map"
            >
              <i className="fa-solid fa-up-right-from-square" aria-hidden /> Pop out
            </button>
          ) : null}
        </div>
        <AgriFieldBoundaryResultsDashboard
          open
          variant="inline"
          onClose={() => setActiveTab('detect')}
          mapContainerRef={mapContainerRef ?? { current: null }}
          geojson={resultGeojson}
          fieldCount={fieldCount}
          totalAreaHa={totalAreaHa}
          engine={engine}
          score={score}
          initialReference={referenceGeojson}
          initialReferenceName={referenceLabel}
          referenceNotice={referenceNotice}
          referenceBusy={referenceBusy}
        />
      </section>
      )}

      {mapContainerRef ? (
        <AgriFieldBoundaryResultsDashboard
          open={dashboardOpen}
          onClose={() => setDashboardOpen(false)}
          mapContainerRef={mapContainerRef}
          geojson={resultGeojson}
          fieldCount={fieldCount}
          totalAreaHa={totalAreaHa}
          engine={engine}
          score={score}
          initialReference={referenceGeojson}
          initialReferenceName={referenceLabel}
          referenceNotice={referenceNotice}
          referenceBusy={referenceBusy}
        />
      ) : null}
    </div>
  )
}
