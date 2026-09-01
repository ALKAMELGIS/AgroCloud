import { useEffect, useRef, useState, type RefObject } from 'react'
import type { FieldBoundaryPhase, FieldCaptureImageryId, FieldModelId } from './useAgriFieldBoundary'
import {
  acceptForFieldSource,
  isFieldFileSource,
} from './useAgriFieldBoundary'
import type { FieldBoundaryHealth, FieldImagerySource } from '../../../lib/agriFieldBoundary/fieldBoundaryClient'
import {
  FOOTPRINT_REGULARIZE_METHODS,
  type FootprintRegularizeMethod,
} from '../../../lib/agriFieldBoundary/fieldFootprintRegularize'
import type { Sen2srProductMode, Sen2srStatus } from '../../../lib/agriFieldBoundary/sen2srClient'
import { Sen2srProductControls } from './Sen2srProductControls'
import { AgriFieldBoundaryResultsDashboard } from './AgriFieldBoundaryResultsDashboard'
import { AgriFieldBoundaryTrainingSamplesPane } from './AgriFieldBoundaryTrainingSamplesPane'
import { FtwAoiTrainingDashboard } from './FtwAoiTrainingDashboard'
import { FieldAttributesDashboard } from './FieldAttributesDashboard'
import { AfbOperationProgressBar } from './AfbOperationProgressBar'
import { useFtwAoiTraining } from './useFtwAoiTraining'
import type { FieldBoundaryTrainingSamplesApi } from './useFieldBoundaryTrainingSamples'
import type { FtwGlobalYear } from '../../../lib/agriFieldBoundary/ftwGlobalConfig'
import { ftwGlobalAttribution } from '../../../lib/agriFieldBoundary/ftwGlobalConfig'
import type { SiActiveAoi } from '../../../lib/siAoiManager'
import { ftwInferenceMaxCropYear } from '../../../lib/agriFieldBoundary/ftwInferenceSceneDate'
import './AgriFieldBoundaryPanel.css'

/** How the study AOI is chosen for Detect Fields. */
export type FieldBoundaryAoiMode = 'draw' | 'layers' | 'viewport' | 'select'

export type FieldBoundaryAoiLayerOption = { id: string; label: string; featureCount?: number }

/** Detect + Dashboard + Results + Training Samples tabs. */
export type FieldBoundaryPanelTab = 'detect' | 'dashboard' | 'results' | 'training'

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
  /** @deprecated Unused — FoW country catalog removed. */
  countryOptions?: Array<{ id: string; label: string }>
  /** @deprecated Unused — FoW country catalog removed. */
  adminIso?: string
  /** @deprecated Unused — FoW country catalog removed. */
  onAdminIsoChange?: (iso: string) => void
  /** Sentinel-2 acquisition day (YYYY-MM-DD) for AFD — From/To are kept identical (latest day). */
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
  offline: boolean
  health?: FieldBoundaryHealth | null
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
  /** Status while validation reference is loading or unavailable. */
  referenceNotice?: string | null
  referenceBusy?: boolean
  /** Map viewport host for the floating Results Dashboard (`.si-map-container`). */
  mapContainerRef?: RefObject<HTMLElement | null>
  onRun: () => void
  onReset: () => void
  onExportGeojson: () => void | Promise<void>
  onExportShapefile: () => void | Promise<void>
  onExportCsv?: () => void | Promise<void>
  onAddToLayers?: () => void | Promise<void>
  /** Progress line while the Sentinel-2 attribute table is being filled. */
  attributesStatus?: string | null
  attributesBusy?: boolean
  onRefreshAttributes?: () => void | Promise<void>
  /** FTW export / Add layer — non-blocking loading line. */
  exportBusy?: boolean
  exportStatus?: string | null
  exportProgressPct?: number
  attributesProgressPct?: number
  /** SEN2SR Lite product mode (separate from detect engines). */
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
  /** Training Samples curation (Predicted → Draft → Approved → Save). */
  trainingSamples?: FieldBoundaryTrainingSamplesApi | null
  /** FTW global pre-computed PMTiles (Fields of the World v3). */
  ftwYear?: FtwGlobalYear
  onFtwYearChange?: (year: FtwGlobalYear) => void
  ftwThreshold?: number
  onFtwThresholdChange?: (pct: number) => void
  ftwGlobalOpacity?: number
  onFtwGlobalOpacityChange?: (pct: number) => void
  ftwGlobalVisible?: boolean
  /** Active map AOI — scopes FTW training analytics per polygon. */
  activeAoi?: SiActiveAoi
  aoiLabel?: string
}

const PHASE_LABEL: Record<FieldBoundaryPhase, string> = {
  idle: '',
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
  vectorizing: 'Generating field polygons…',
  done: 'Completed',
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

function latestFtwInferenceSceneDateIso(): string {
  const y = ftwInferenceMaxCropYear()
  return `${y}-12-31`
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
  mergeFragments = false,
  onMergeFragmentsChange,
  phase,
  progress,
  stage = null,
  busy,
  error,
  errorDetail,
  offline,
  health = null,
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
  onExportCsv,
  onAddToLayers,
  attributesStatus = null,
  attributesBusy = false,
  onRefreshAttributes,
  exportBusy = false,
  exportStatus = null,
  exportProgressPct = 0,
  attributesProgressPct = 0,
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
  trainingSamples = null,
  ftwYear = 2025,
  onFtwYearChange,
  ftwThreshold = 70,
  onFtwThresholdChange,
  ftwGlobalOpacity = 90,
  onFtwGlobalOpacityChange,
  ftwGlobalVisible = false,
  activeAoi,
  aoiLabel,
}: AgriFieldBoundaryPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [minAreaText, setMinAreaText] = useState(() => String(minAreaM2))
  const [activeTab, setActiveTab] = useState<FieldBoundaryPanelTab>('detect')
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [modelInfoOpen, setModelInfoOpen] = useState(false)

  const trainingCounts = trainingSamples?.counts
  const trainingBadge =
    trainingCounts && trainingCounts.total > 0
      ? trainingCounts.approved > 0
        ? trainingCounts.approved
        : trainingCounts.draft
      : null

  const isFtwGlobal = model === 'ftw'
  const isFtwInferenceS2 = model === 'ftw-inference-s2'
  const isFtwTraining = isFtwGlobal

  const ftwTraining = useFtwAoiTraining({
    activeAoi: activeAoi ?? { geometry: null, key: '', source: null },
    aoiLabel,
    ftwYear,
    enabled: isFtwTraining,
  })

  const analyticsTabReady = isFtwTraining ? ftwTraining.hasAoi : hasResult
  const dashboardTabReady = Boolean(resultGeojson?.features?.length)

  useEffect(() => {
    setMinAreaText(String(minAreaM2))
  }, [minAreaM2])

  useEffect(() => {
    setModelInfoOpen(false)
  }, [model])

  useEffect(() => {
    if (!analyticsTabReady) {
      setDashboardOpen(false)
      if (activeTab === 'results') setActiveTab('detect')
    }
    if (!dashboardTabReady && activeTab === 'dashboard') setActiveTab('detect')
  }, [analyticsTabReady, dashboardTabReady, activeTab])

  const openAttributesDashboard = () => {
    if (!dashboardTabReady) return
    setActiveTab('dashboard')
  }

  const openResultsDashboard = () => {
    if (!analyticsTabReady) return
    setActiveTab('results')
  }

  const handleAddToLayers = () => {
    if (!onAddToLayers) return
    void Promise.resolve(onAddToLayers()).finally(() => {
      setExportOpen(false)
    })
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
  const isAfd = source === 'agricultural-field-delineation' || model === 'agricultural-field-delineation'
  const isDelineateFbis = source === 'delineate-fbis'
  const hasModelInfo = isAfd || isFtwGlobal || isFtwInferenceS2
  // FTW Global v3: overlay works without a prior AOI; Select AOI scopes clip/export.
  const canRun = isFtwGlobal
    ? !busy
    : hasAoi && !busy && (!needsUpload || Boolean(uploadedFileName))
  const pct = Math.max(0, Math.min(100, Math.round(progress)))
  const showProgress = busy && (phase === 'detecting' || phase === 'capturing')
  const runTitle = isFtwGlobal
    ? hasAoi
      ? 'Show FTW global field boundaries clipped to the selected AOI (pre-computed v3 B7, CC-BY)'
      : `Show FTW global fields — then ${AOI_MODE_HINT[aoiMode]}`
    : isFtwInferenceS2
      ? 'Run AgroDetect S2 (PRUE) on Sentinel-2 L2A — live inference via eliteagrocloud.com API'
    : isAfd
    ? 'Run Agricultural Field Delineation on Sentinel-2 L2A (12 bands)'
    : isDelineateFbis
      ? 'Run Delineate Anything on the AOI capture — sharp black instance edges (:8096)'
      : 'Run field boundary detection across the AOI'
  const stageLabel = phase === 'detecting' ? STAGE_LABEL[String(stage || '')] : undefined
  const phaseLabel =
    stageLabel ??
    (isFtwGlobal && phase === 'detecting'
      ? 'Run Processing…'
      : isFtwInferenceS2 && phase === 'detecting'
        ? 'AgroDetect S2 (Sentinel-2 L2A)…'
      : isAfd && phase === 'detecting'
      ? 'Agricultural Field Delineation (Sentinel-2 L2A)…'
      : isDelineateFbis && phase === 'detecting'
        ? 'Delineate Anything (instance parcels)…'
        : PHASE_LABEL[phase])
  const afdInfo = health?.agricultural_field_delineation_status?.info as
    | {
        architecture?: string
        backbone?: string
        bands?: string[]
        resolution_m?: number
        ap_field?: number
        version?: string
      }
    | undefined
  const afdReady = Boolean(health?.agricultural_field_delineation)
  const ftwInferInfo = health?.ftw_inference_s2_status
  const ftwInferReady = Boolean(health?.ftw_inference_s2)

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
          className={`si-afb__tab si-afb__tab--icon${activeTab === 'detect' ? ' is-active' : ''}`}
          title="Detect Fields — model, AOI, and run controls"
          aria-label="Detect Fields"
          onClick={() => setActiveTab('detect')}
        >
          <i className="fa-solid fa-crop-simple" aria-hidden />
        </button>
        <button
          type="button"
          role="tab"
          id="si-afb-tab-dashboard"
          aria-selected={activeTab === 'dashboard'}
          aria-controls="si-afb-pane-dashboard"
          className={`si-afb__tab si-afb__tab--icon${activeTab === 'dashboard' ? ' is-active' : ''}${dashboardTabReady ? ' is-ready' : ''}`}
          title={
            dashboardTabReady
              ? 'Attributes dashboard — static KPIs and charts from Example.xlsx fields'
              : 'Run Detect Fields to open the attributes dashboard'
          }
          aria-label="Attributes dashboard"
          disabled={!dashboardTabReady}
          onClick={() => dashboardTabReady && setActiveTab('dashboard')}
        >
          <i className="fa-solid fa-chart-pie" aria-hidden />
        </button>
        <button
          type="button"
          role="tab"
          id="si-afb-tab-validate"
          aria-selected={activeTab === 'results'}
          aria-controls="si-afb-pane-results"
          className={`si-afb__tab si-afb__tab--icon${activeTab === 'results' ? ' is-active' : ''}${analyticsTabReady ? ' is-ready' : ''}`}
          title={
            analyticsTabReady
              ? 'Optimal Learning Rate Finder — AOI-scoped LR Finder, loss, IoU, F1 and dataset charts'
              : isFtwTraining
                ? 'Draw or select an AOI for FTW training analytics'
                : 'Run Detect Fields to open Optimal Learning Rate Finder'
          }
          aria-label="Optimal Learning Rate Finder"
          disabled={!analyticsTabReady}
          onClick={() => analyticsTabReady && setActiveTab('results')}
        >
          <i className="fa-solid fa-chart-line" aria-hidden />
          {isFtwTraining ? (
            ftwTraining.session.dataset?.total ? (
              <span className="si-afb__tab-badge">{ftwTraining.session.dataset.total}</span>
            ) : analyticsTabReady ? (
              <span className="si-afb__tab-badge">LR</span>
            ) : null
          ) : hasResult ? (
            <span className="si-afb__tab-badge">{fieldCount}</span>
          ) : null}
        </button>
        {trainingSamples ? (
          <button
            type="button"
            role="tab"
            id="si-afb-tab-training"
            aria-selected={activeTab === 'training'}
            aria-controls="si-afb-pane-training"
            className={`si-afb__tab si-afb__tab--icon${activeTab === 'training' ? ' is-active' : ''}${trainingBadge != null ? ' is-ready' : ''}`}
            title="Training Samples — Generate drafts from predictions, Accept, then Save approved only"
            aria-label="Training Samples"
            onClick={() => setActiveTab('training')}
          >
            <i className="fa-solid fa-database" aria-hidden />
            {trainingBadge != null ? (
              <span className="si-afb__tab-badge">{trainingBadge}</span>
            ) : null}
          </button>
        ) : null}
        {!isFtwTraining && analyticsTabReady ? (
          <button
            type="button"
            className="si-afb__tab-popout"
            onClick={() => setDashboardOpen(true)}
            title="Open floating Optimal Learning Rate Finder on the map"
            aria-label="Open floating Optimal Learning Rate Finder on the map"
          >
            <i className="fa-solid fa-up-right-from-square" aria-hidden />
          </button>
        ) : null}
      </div>

      {activeTab === 'detect' ? (
      <section
        className="si-afb__card"
        role="tabpanel"
        id="si-afb-pane-detect"
        aria-labelledby="si-afb-tab-detect"
      >
        <label className="si-afb__row">
          <span className="si-afb__label">
            <span>Model</span>
            {hasModelInfo ? (
              <button
                type="button"
                className={`si-afb__info-btn${modelInfoOpen ? ' is-open' : ''}`}
                aria-expanded={modelInfoOpen}
                aria-controls="si-afb-model-info"
                title="View model information"
                aria-label="View info"
                onClick={() => setModelInfoOpen(open => !open)}
              >
                <i className="fa-solid fa-circle-info" aria-hidden />
              </button>
            ) : null}
          </span>
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

        {!hasAoi ? (
          <p className="si-afb__hint" role="status">
            {aoiMode === 'draw'
              ? 'Draw a polygon on the map, then run Detect (or Show Global Fields).'
              : aoiMode === 'layers'
                ? 'Pick an AOI layer below, or run with the current map extent.'
                : aoiMode === 'select'
                  ? 'Use the Select tool on layer features, then run Detect.'
                  : 'Uses the current map extent as AOI.'}
          </p>
        ) : null}

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

        {modelInfoOpen && isAfd ? (
          <div className="si-afb__model-info" id="si-afb-model-info" role="region" aria-label="Model information">
            <div className="si-afb__model-info-row">
              <span>Architecture</span>
              <strong>
                {afdInfo?.architecture || 'MaskRCNN'}
                {afdInfo?.backbone ? ` (${afdInfo.backbone})` : ''}
              </strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Input</span>
              <strong>12-band Sentinel-2 L2A BOA</strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Bands</span>
              <strong>
                {(afdInfo?.bands || ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'B8A', 'B09', 'B11', 'B12']).join(
                  ', ',
                )}
              </strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Resolution</span>
              <strong>{afdInfo?.resolution_m ?? 10} m</strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Model status</span>
              <strong>{afdReady ? 'Ready' : health?.loading ? 'Loading…' : 'Unavailable'}</strong>
            </div>
            {typeof afdInfo?.ap_field === 'number' ? (
              <div className="si-afb__model-info-row">
                <span>AP (field)</span>
                <strong>{afdInfo.ap_field.toFixed(4)}</strong>
              </div>
            ) : null}
          </div>
        ) : null}

        {modelInfoOpen && isFtwGlobal ? (
          <div className="si-afb__model-info" id="si-afb-model-info" role="region" aria-label="FTW global model">
            <div className="si-afb__model-info-row">
              <span>Source</span>
              <strong>Source Cooperative (global PMTiles)</strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Model</span>
              <strong>FTW v3 CC-BY B7 (PRUE)</strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Attribution</span>
              <strong>{ftwGlobalAttribution()}</strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Visibility</span>
              <strong>Zoom 11+ (individual fields)</strong>
            </div>
          </div>
        ) : null}

        {isFtwGlobal ? (
          <>
            <label className="si-afb__row">
              <span className="si-afb__label">Prediction year</span>
              <select
                className="si-afb__select"
                value={ftwYear}
                disabled={busy}
                onChange={e => onFtwYearChange?.(Number(e.target.value) as FtwGlobalYear)}
              >
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </label>

            <label className="si-afb__row">
              <span className="si-afb__label">
                Confidence threshold <em>{Math.round(ftwThreshold)}%</em>
              </span>
              <input
                type="range"
                className="si-afb__slider"
                min={0}
                max={100}
                step={1}
                value={ftwThreshold}
                disabled={busy}
                onChange={e => onFtwThresholdChange?.(Number(e.target.value))}
              />
            </label>

            <label className="si-afb__row">
              <span className="si-afb__label">
                Overlay opacity <em>{Math.round(ftwGlobalOpacity)}%</em>
              </span>
              <input
                type="range"
                className="si-afb__slider"
                min={10}
                max={100}
                step={5}
                value={ftwGlobalOpacity}
                disabled={busy}
                onChange={e => onFtwGlobalOpacityChange?.(Number(e.target.value))}
              />
            </label>
          </>
        ) : null}

        {modelInfoOpen && isFtwInferenceS2 ? (
          <div className="si-afb__model-info" id="si-afb-model-info" role="region" aria-label="AgroDetect S2 model">
            <div className="si-afb__model-info-row">
              <span>Architecture</span>
              <strong>{ftwInferInfo?.architecture || 'PRUE (FTW v3)'}</strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Input</span>
              <strong>Sentinel-2 L2A (live download)</strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Model</span>
              <strong>{ftwInferInfo?.model || 'ftw-inference-s2'}</strong>
            </div>
            <div className="si-afb__model-info-row">
              <span>Model status</span>
              <strong>{ftwInferReady ? 'Ready' : health?.loading ? 'Loading…' : 'Unavailable'}</strong>
            </div>
          </div>
        ) : null}

        {isAfd || isFtwInferenceS2 ? (
          <label className="si-afb__row">
            <span className="si-afb__label">Scene date</span>
            <input
              type="date"
              className="si-afb__select"
              value={sceneDateTo || sceneDateFrom}
              max={isFtwInferenceS2 ? latestFtwInferenceSceneDateIso() : latestSceneDateIso()}
              disabled={busy}
              onChange={e => {
                const v = e.target.value
                onSceneDateFromChange(v)
                onSceneDateToChange(v)
              }}
              title={
                isFtwInferenceS2
                  ? `FTW crop calendar — use ${ftwInferenceMaxCropYear()} or earlier (prior complete season)`
                  : 'Uses the clearest Sentinel-2 L2A scene near this date (searches ~60 days back — today often has no L2A yet)'
              }
            />
          </label>
        ) : null}

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

        {!isFtwGlobal ? (
        <label className="si-afb__row">
          <span className="si-afb__label">
            Confidence <em>{Math.round(minConfidence * 100)}%</em>
          </span>
          <input
            type="range"
            className="si-afb__slider"
            min={0.2}
            max={0.9}
            step={0.05}
            value={minConfidence}
            disabled={busy}
            onChange={e => onMinConfidenceChange(Number(e.target.value))}
          />
        </label>
        ) : null}

        {!isFtwGlobal ? (
        <>
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
            className="si-afb__slider"
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
        </>
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
            {busy ? 'Detecting…' : isFtwGlobal ? (ftwGlobalVisible ? 'Refresh Global Fields' : 'Show Global Fields') : 'Detect Fields'}
          </button>
          <button type="button" className="si-afb__btn si-afb__btn--ghost" disabled={busy} onClick={handleReset}>
            Reset
          </button>
        </div>

        {dashboardTabReady ? (
          <button
            type="button"
            className="si-afb__stats si-afb__stats--open"
            aria-label="Open layer attributes dashboard"
            title="Open layer attributes dashboard"
            onClick={openAttributesDashboard}
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
          <AfbOperationProgressBar
            label={attributesStatus}
            pct={attributesProgressPct}
            className="si-afb__op-progress--attributes"
          />
        ) : null}

        {exportStatus ? (
          <AfbOperationProgressBar
            label={exportStatus}
            pct={exportProgressPct}
            className="si-afb__op-progress--export"
          />
        ) : null}

        <div className="si-afb__actions si-afb__actions--export">
          <div className={`si-afb__export${exportOpen ? ' is-open' : ''}${exportBusy ? ' is-busy' : ''}`} ref={exportRef}>
            <button
              type="button"
              className="si-afb__btn si-afb__export-trigger"
              disabled={!hasResult || busy || Boolean(attributesStatus) || exportBusy}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              aria-busy={exportBusy}
              onClick={() => setExportOpen(v => !v)}
              title="Export field polygons"
            >
              {exportBusy ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" aria-hidden /> Exporting…
                </>
              ) : (
                <>
                  <i className="fa-solid fa-download" aria-hidden /> Export
                  <i className="fa-solid fa-chevron-up si-afb__export-caret" aria-hidden />
                </>
              )}
            </button>
            {exportOpen && !exportBusy ? (
              <div className="si-afb__export-menu" role="menu">
                <button
                  type="button"
                  className="si-afb__export-item"
                  role="menuitem"
                  disabled={exportBusy}
                  onClick={() => {
                    void Promise.resolve(onExportGeojson()).finally(() => setExportOpen(false))
                  }}
                >
                  <i className="fa-solid fa-file-code" aria-hidden /> GeoJSON
                </button>
                <button
                  type="button"
                  className="si-afb__export-item"
                  role="menuitem"
                  disabled={exportBusy}
                  onClick={() => {
                    void Promise.resolve(onExportShapefile()).finally(() => setExportOpen(false))
                  }}
                >
                  <i className="fa-solid fa-file-zipper" aria-hidden /> Shapefile
                </button>
                {onExportCsv ? (
                  <button
                    type="button"
                    className="si-afb__export-item"
                    role="menuitem"
                    disabled={exportBusy}
                    onClick={() => {
                      void Promise.resolve(onExportCsv()).finally(() => setExportOpen(false))
                    }}
                  >
                    <i className="fa-solid fa-file-csv" aria-hidden /> CSV
                  </button>
                ) : null}
                {onAddToLayers ? (
                  <button
                    type="button"
                    className="si-afb__export-item"
                    role="menuitem"
                    disabled={exportBusy}
                    onClick={handleAddToLayers}
                  >
                    <i className="fa-solid fa-layer-group" aria-hidden /> Add layer
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {phase !== 'idle' || Boolean(health?.loading) ? (
        <div
          className={`si-afb__status ${
            phase === 'error' &&
              !offline &&
              !/Service offline|backend_unavailable|:8092|uvicorn app:app/i.test(String(error || ''))
              ? 'is-error'
              : phase === 'empty'
                ? 'is-empty'
                : health?.loading || offline
                  ? 'is-idle'
                  : `is-${phase}`
          }`}
          title={
            health?.loading
              ? 'Field engines are loading on the API host. Detect Fields still runs from map RGB.'
              : phase === 'error' || phase === 'empty'
              ? errorDetail ||
                (offline
                  ? 'Retry Detect Fields — map RGB delineation runs on the AgroCloud API'
                  : error || undefined)
              : undefined
          }
        >
          {health?.loading && (phase === 'idle' || phase === 'error') ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden /> Loading field model…
            </>
          ) : phase === 'error' ? (
            <>
              <i className="fa-solid fa-triangle-exclamation" aria-hidden />{' '}
              {/Service offline|backend_unavailable|:8092|uvicorn app:app/i.test(String(error || '')) || offline
                ? 'Loading field model… Detect Fields is available on the AgroCloud API.'
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
        ) : null}
      </section>
      ) : activeTab === 'dashboard' ? (
      <section
        className="si-afb__card si-afb__card--dashboard"
        role="tabpanel"
        id="si-afb-pane-dashboard"
        aria-labelledby="si-afb-tab-dashboard"
      >
        <FieldAttributesDashboard
          geojson={resultGeojson}
          engine={engine}
          sceneDate={sceneDateTo || sceneDateFrom || null}
          aoiLabel={aoiLabel || 'AOI'}
          mapContainerRef={mapContainerRef}
          attributesBusy={attributesBusy || exportBusy}
          attributesStatus={exportStatus || attributesStatus}
          operationProgressPct={
            exportStatus ? exportProgressPct : attributesStatus ? attributesProgressPct : 0
          }
          onRefreshAttributes={
            onRefreshAttributes ? () => void onRefreshAttributes() : undefined
          }
          onAddToLayers={onAddToLayers ? handleAddToLayers : undefined}
        />
      </section>
      ) : activeTab === 'training' && trainingSamples ? (
      <section
        className="si-afb__card si-afb__card--training"
        role="tabpanel"
        id="si-afb-pane-training"
        aria-labelledby="si-afb-tab-training"
      >
        <AgriFieldBoundaryTrainingSamplesPane
          training={trainingSamples}
          hasPredictions={Boolean(resultGeojson?.features?.length)}
          predictionCount={resultGeojson?.features?.length ?? 0}
          sceneId={null}
          acquisitionDate={null}
          engine={engine}
          busy={busy}
          onGenerate={() => {
            trainingSamples.generateFromPredictions(resultGeojson, {
              engine: engine || undefined,
              acquisitionDate: sceneDateTo || sceneDateFrom || undefined,
            })
          }}
        />
      </section>
      ) : (
      <section
        className="si-afb__card si-afb__card--results"
        role="tabpanel"
        id="si-afb-pane-results"
        aria-labelledby="si-afb-tab-validate"
      >
        {isFtwGlobal ? (
          <FtwAoiTrainingDashboard
            session={ftwTraining.session}
            busy={ftwTraining.busy}
            error={ftwTraining.error}
            onBuildDataset={() => void ftwTraining.buildDataset()}
            onRunLrFinder={() => void ftwTraining.runLrFinder()}
            onRunTraining={() => void ftwTraining.runTraining()}
            onExportModel={ftwTraining.exportModel}
            onCancel={() => void ftwTraining.cancelTraining()}
          />
        ) : (
        <>
        <div className="si-afb__results-head">
          <span className="si-afb__results-title">Optimal Learning Rate Finder</span>
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
          activeAoiKey={activeAoi?.key || 'current-aoi'}
          aoiLabel={aoiLabel || 'AOI'}
          approvedSamples={trainingSamples?.counts.approved ?? 0}
          draftSamples={trainingSamples?.counts.draft ?? 0}
        />
        </>
        )}
      </section>
      )}

      <AgriFieldBoundaryResultsDashboard
        open={dashboardOpen}
        variant="float"
        onClose={() => setDashboardOpen(false)}
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
        activeAoiKey={activeAoi?.key || 'current-aoi'}
        aoiLabel={aoiLabel || 'AOI'}
        approvedSamples={trainingSamples?.counts.approved ?? 0}
        draftSamples={trainingSamples?.counts.draft ?? 0}
      />
    </div>
  )
}
